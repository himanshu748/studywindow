import { z } from 'zod';
import { BROWSER_RESERVATION, RESERVED_PER_RUN } from './budget.js';
import { checkCancelled, StudyError } from './errors.js';
import { parseFetchTier, type FetchPricingTier } from './config.js';

export type PricingEndpoint = 'agent' | 'browser' | 'fetch';
export type PricingMetadata = {
  endpoint: PricingEndpoint;
  currency: 'USD';
  unit_amount_usd: number;
  per: 'step' | 'minute' | 'url';
  checked_at: string;
  rates_as_of: string;
  meter_label: string;
  fetch_tier?: FetchPricingTier;
};
export interface PricingGuard {
  ensure(endpoint: PricingEndpoint, signal?: AbortSignal): Promise<PricingMetadata>;
}

const WALLET_URL = 'https://agent.tinyfish.ai/v1/wallet';
const MAX_BODY_BYTES = 20_000;
const CACHE_MS = 60_000;
const NumericAmount = z.union([
  z.number().finite().nonnegative(),
  z
    .string()
    .max(100)
    .regex(/^\d+(?:\.\d+)?$/)
    .transform(Number)
    .pipe(z.number().finite().nonnegative()),
]);
const Wallet = z.object({
  available_balance: NumericAmount,
  currency: z.literal('USD'),
  rates: z.object({ meters: z.array(z.unknown()).max(100), as_of: z.iso.datetime() }),
});
const Meter = z.object({
  label: z.string(),
  unit_amount: NumericAmount,
  currency: z.literal('USD'),
  per: z.enum(['step', 'minute', 'url']),
});
const contracts = {
  agent: { label: 'TinyFish Agent', per: 'step', ceiling: 0.016, reservation: RESERVED_PER_RUN },
  browser: {
    label: 'TinyFish Browser',
    per: 'minute',
    ceiling: 0.002,
    reservation: BROWSER_RESERVATION,
  },
  fetch: { label: 'TinyFish Fetch', per: 'url', ceiling: 0, reservation: 0 },
} as const;
type Snapshot = { wallet: z.infer<typeof Wallet>; checkedAt: number };

function stopped(caller?: AbortSignal): StudyError {
  return caller?.aborted
    ? new StudyError(
        'CANCELLED',
        'Pricing verification was cancelled. No provider operation was authorized.',
      )
    : new StudyError(
        'PROVIDER_TIMEOUT',
        'TinyFish pricing verification exceeded its 10-second timeout. No retry was attempted.',
      );
}

async function boundedBody(
  response: Response,
  signal: AbortSignal,
  caller?: AbortSignal,
): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new StudyError(
      'PROVIDER_FAILURE',
      'TinyFish pricing verification returned an empty envelope.',
    );
  let size = 0;
  const chunks: Uint8Array[] = [];
  const cancel = () => {
    void reader.cancel().catch(() => undefined);
  };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw stopped(caller);
      const part = await reader.read();
      if (signal.aborted) throw stopped(caller);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new StudyError(
          'RESPONSE_TOO_LARGE',
          'TinyFish pricing verification exceeded the 20 KB response limit.',
        );
      }
      chunks.push(part.value);
    }
    return Buffer.concat(chunks).toString('utf8');
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

/** Verifies current provider prices before billable work; the cached wallet balance stays private. */
export function createPricingGuard(
  key: string,
  request: typeof fetch = fetch,
  configuredFetchTier?: FetchPricingTier,
): PricingGuard {
  // Account tier is explicit operator configuration; wallet prices never choose it for us.
  const fetchTier = parseFetchTier(configuredFetchTier);
  let cached: Snapshot | undefined;

  async function snapshot(caller?: AbortSignal): Promise<Snapshot> {
    checkCancelled(caller);
    if (!key.trim())
      throw new StudyError(
        'AUTHENTICATION',
        'TINYFISH_API_KEY is missing for pricing verification.',
      );
    const age = cached ? Date.now() - cached.checkedAt : Infinity;
    if (cached && age >= 0 && age < CACHE_MS) return cached;
    const signal = AbortSignal.any([...(caller ? [caller] : []), AbortSignal.timeout(10_000)]);
    let response: Response;
    try {
      response = await request(WALLET_URL, {
        method: 'GET',
        headers: { 'X-API-Key': key, Accept: 'application/json' },
        redirect: 'error',
        signal,
      });
    } catch {
      if (signal.aborted) throw stopped(caller);
      throw new StudyError(
        'PROVIDER_FAILURE',
        'TinyFish pricing verification could not be reached. No retry was attempted.',
      );
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      if (response.status === 401 || response.status === 403)
        throw new StudyError(
          'AUTHENTICATION',
          'TinyFish rejected pricing-verification authentication.',
        );
      if (response.status === 402 || response.status === 429)
        throw new StudyError(
          'PROVIDER_QUOTA',
          'TinyFish wallet or quota prevented pricing verification.',
          response.status === 429,
        );
      if (response.status === 408 || response.status === 504)
        throw new StudyError(
          'PROVIDER_TIMEOUT',
          'TinyFish pricing verification timed out. No retry was attempted.',
        );
      throw new StudyError(
        'PROVIDER_FAILURE',
        'TinyFish pricing verification was unavailable. No raw provider error was exposed.',
      );
    }
    if (Number(response.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      await response.body?.cancel().catch(() => undefined);
      throw new StudyError(
        'RESPONSE_TOO_LARGE',
        'TinyFish pricing verification exceeded the 20 KB response limit.',
      );
    }
    let text: string;
    try {
      text = await boundedBody(response, signal, caller);
    } catch (error) {
      if (error instanceof StudyError) throw error;
      if (signal.aborted) throw stopped(caller);
      throw new StudyError(
        'PROVIDER_FAILURE',
        'TinyFish pricing verification returned an incomplete envelope.',
      );
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text) as unknown;
    } catch {
      throw new StudyError(
        'PROVIDER_FAILURE',
        'TinyFish pricing verification returned invalid JSON.',
      );
    }
    const parsed = Wallet.safeParse(raw);
    if (!parsed.success)
      throw new StudyError(
        'PROVIDER_FAILURE',
        'TinyFish wallet pricing no longer matches its supported contract.',
      );
    checkCancelled(caller);
    cached = { wallet: parsed.data, checkedAt: Date.now() };
    return cached;
  }

  return {
    async ensure(endpoint, signal) {
      const current = await snapshot(signal);
      checkCancelled(signal);
      const contract = contracts[endpoint];
      const label =
        endpoint === 'fetch' && fetchTier !== undefined
          ? fetchTier === 'hobby'
            ? 'TinyFish Fetch (Hobby)'
            : 'TinyFish Fetch (Builder)'
          : contract.label;
      const meters = current.wallet.rates.meters.filter(
        (meter) =>
          typeof meter === 'object' && meter !== null && 'label' in meter && meter.label === label,
      );
      if (meters.length !== 1)
        throw new StudyError(
          'PROVIDER_FAILURE',
          'The required TinyFish pricing meter is missing or ambiguous.',
        );
      const parsed = Meter.safeParse(meters[0]);
      if (!parsed.success || parsed.data.per !== contract.per)
        throw new StudyError(
          'PROVIDER_FAILURE',
          'The required TinyFish pricing meter has an unsupported rate or unit contract.',
        );
      if (parsed.data.unit_amount > contract.ceiling)
        throw new StudyError(
          'PRICING_CHANGED',
          'TinyFish pricing exceeds the reviewed rate. Provider work is blocked pending a new budget review.',
        );
      if (current.wallet.available_balance < contract.reservation)
        throw new StudyError(
          'PROVIDER_QUOTA',
          'The TinyFish wallet does not cover this operation’s conservative reservation.',
        );
      return {
        endpoint,
        currency: 'USD',
        unit_amount_usd: parsed.data.unit_amount,
        per: contract.per,
        checked_at: new Date(current.checkedAt).toISOString(),
        rates_as_of: current.wallet.rates.as_of,
        meter_label: label,
        ...(endpoint === 'fetch' && fetchTier !== undefined ? { fetch_tier: fetchTier } : {}),
      };
    },
  };
}
