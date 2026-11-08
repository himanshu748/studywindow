// Offline wallet/pricing contract tests. No real account or network requests are used.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPricingGuard } from '../src/pricing.js';
import { BROWSER_RESERVATION, RESERVED_PER_RUN } from '../src/budget.js';

const key = 'offline-pricing-placeholder-key';
const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code?: string }).code, expected);
  return true;
};
function wallet(balance: string | number = '1.23') {
  return {
    available_balance: balance,
    currency: 'USD',
    rates: {
      as_of: '2026-11-03T12:00:00Z',
      meters: [
        { label: 'TinyFish Agent', unit_amount: '0.016', currency: 'USD', per: 'step' },
        { label: 'TinyFish Browser', unit_amount: '0.002', currency: 'USD', per: 'minute' },
        { label: 'TinyFish Fetch', unit_amount: '0', currency: 'USD', per: 'url' },
        {
          label: 'Unrelated meter',
          unit_amount: 'different unit format',
          currency: 'anything',
          per: 'unknown',
        },
      ],
    },
  };
}
function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('all supported endpoints verify USD rates and return only safe pricing metadata', async () => {
  let calls = 0;
  const guard = createPricingGuard(key, async (input, init) => {
    calls++;
    assert.equal(input, 'https://agent.tinyfish.ai/v1/wallet');
    assert.equal(init?.method, 'GET');
    assert.equal(init?.redirect, 'error');
    assert.equal((init?.headers as Record<string, string>)['X-API-Key'], key);
    assert.ok(init?.signal);
    return response(wallet());
  });
  const agent = await guard.ensure('agent'),
    browser = await guard.ensure('browser'),
    fetch = await guard.ensure('fetch');
  assert.equal(calls, 1);
  assert.equal(agent.unit_amount_usd, 0.016);
  assert.equal(agent.per, 'step');
  assert.equal(browser.unit_amount_usd, 0.002);
  assert.equal(browser.per, 'minute');
  assert.equal(fetch.unit_amount_usd, 0);
  assert.equal(fetch.per, 'url');
  for (const metadata of [agent, browser, fetch]) {
    assert.equal(metadata.currency, 'USD');
    assert.doesNotMatch(
      JSON.stringify(metadata),
      /available_balance|1\.23|offline-pricing-placeholder-key/,
    );
  }
});

test('cache expires at 60 seconds and retains the original check timestamp until refreshed', async (t) => {
  let now = Date.parse('2026-11-03T12:00:00Z'),
    calls = 0;
  t.mock.method(Date, 'now', () => now);
  const guard = createPricingGuard(key, async () => {
    calls++;
    return response(wallet());
  });
  const initial = await guard.ensure('agent');
  now += 59_999;
  const cached = await guard.ensure('browser');
  assert.equal(calls, 1);
  assert.equal(cached.checked_at, initial.checked_at);
  now += 1;
  const fresh = await guard.ensure('agent');
  assert.equal(calls, 2);
  assert.notEqual(fresh.checked_at, initial.checked_at);
});

test('price increases block the affected endpoint; lower rates remain conservative', async () => {
  for (const [endpoint, index, amount] of [
    ['agent', 0, '0.017'],
    ['browser', 1, '0.003'],
    ['fetch', 2, '0.0001'],
  ] as const) {
    const data = wallet();
    data.rates.meters[index]!.unit_amount = amount;
    await assert.rejects(
      createPricingGuard(key, async () => response(data)).ensure(endpoint),
      code('PRICING_CHANGED'),
    );
  }
  const lower = wallet();
  lower.rates.meters[0]!.unit_amount = '0.015';
  assert.equal(
    (await createPricingGuard(key, async () => response(lower)).ensure('agent')).unit_amount_usd,
    0.015,
  );
});

test('free Fetch is allowed with zero balance, while billable endpoints require their full reservation', async () => {
  const guard = createPricingGuard(key, async () => response(wallet(0)));
  assert.equal((await guard.ensure('fetch')).unit_amount_usd, 0);
  await assert.rejects(guard.ensure('agent'), code('PROVIDER_QUOTA'));
  await assert.rejects(guard.ensure('browser'), code('PROVIDER_QUOTA'));
  await createPricingGuard(key, async () => response(wallet(RESERVED_PER_RUN))).ensure('agent');
  await createPricingGuard(key, async () => response(wallet(BROWSER_RESERVATION))).ensure(
    'browser',
  );
});

test('missing, duplicated, malformed and unit-mismatched meters fail closed', async () => {
  const missing = wallet();
  missing.rates.meters.shift();
  const duplicate = wallet();
  duplicate.rates.meters.push({ ...duplicate.rates.meters[0]! });
  const wrongUnit = wallet();
  wrongUnit.rates.meters[0]!.per = 'minute';
  const wrongCurrency = wallet();
  wrongCurrency.rates.meters[0]!.currency = 'GBP';
  const malformed = wallet();
  malformed.rates.meters[0]!.unit_amount = 'NaN';
  for (const data of [missing, duplicate, wrongUnit, wrongCurrency, malformed])
    await assert.rejects(
      createPricingGuard(key, async () => response(data)).ensure('agent'),
      code('PROVIDER_FAILURE'),
    );
  for (const data of [
    { ...wallet(), currency: 'GBP' },
    { ...wallet(), available_balance: 'Infinity' },
    { ...wallet(), available_balance: -1 },
    { ...wallet(), rates: { meters: [], as_of: 'not-a-date' } },
  ])
    await assert.rejects(
      createPricingGuard(key, async () => response(data)).ensure('agent'),
      code('PROVIDER_FAILURE'),
    );
});

test('numeric meter values and wallet values are validated without depending on numeric strings', async () => {
  const data = wallet(2) as unknown as {
    available_balance: number;
    currency: string;
    rates: {
      as_of: string;
      meters: Array<{ label: string; unit_amount: string | number; currency: string; per: string }>;
    };
  };
  data.rates.meters[0]!.unit_amount = 0.016;
  assert.equal(
    (await createPricingGuard(key, async () => response(data)).ensure('agent')).unit_amount_usd,
    0.016,
  );
});

test('authentication and quota responses are sanitized, classified and never retried', async () => {
  for (const status of [401, 403, 402, 429, 500]) {
    let calls = 0;
    const guard = createPricingGuard(key, async () => {
      calls++;
      return response({ secret: 'PRIVATE-PROVIDER-DETAILS' }, status);
    });
    await assert.rejects(guard.ensure('agent'), (error) => {
      assert.equal(
        (error as { code: string }).code,
        status === 401 || status === 403
          ? 'AUTHENTICATION'
          : status === 402 || status === 429
            ? 'PROVIDER_QUOTA'
            : 'PROVIDER_FAILURE',
      );
      assert.doesNotMatch((error as Error).message, /PRIVATE-PROVIDER|offline-pricing/);
      return true;
    });
    assert.equal(calls, 1);
  }
  const brokenErrorBody = createPricingGuard(
    key,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('PRIVATE broken auth-body diagnostic'));
          },
        }),
        { status: 401 },
      ),
  );
  await assert.rejects(brokenErrorBody.ensure('agent'), code('AUTHENTICATION'));
});

test('missing key and pre-cancelled caller reject before any wallet request', async () => {
  let calls = 0;
  const request: typeof fetch = async () => {
    calls++;
    return response(wallet());
  };
  await assert.rejects(createPricingGuard('', request).ensure('agent'), code('AUTHENTICATION'));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    createPricingGuard(key, request).ensure('fetch', controller.signal),
    code('CANCELLED'),
  );
  assert.equal(calls, 0);
});

test('cancellation applies even when a valid snapshot is cached', async () => {
  let calls = 0;
  const guard = createPricingGuard(key, async () => {
    calls++;
    return response(wallet());
  });
  await guard.ensure('agent');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(guard.ensure('browser', controller.signal), code('CANCELLED'));
  assert.equal(calls, 1);
});

test('10-second deadline is enforced and no automatic timeout retry is made', async (t) => {
  t.mock.method(AbortSignal, 'timeout', (ms: number) => {
    assert.equal(ms, 10_000);
    return AbortSignal.abort(new DOMException('Synthetic offline timeout', 'TimeoutError'));
  });
  let calls = 0;
  const guard = createPricingGuard(key, async (_input, init) => {
    calls++;
    assert.equal(init?.signal?.aborted, true);
    throw new DOMException('PRIVATE timeout details', 'AbortError');
  });
  await assert.rejects(guard.ensure('agent'), code('PROVIDER_TIMEOUT'));
  assert.equal(calls, 1);
});

test('oversized bodies are stopped during streaming without a trusted Content-Length', async () => {
  let pulls = 0,
    cancelled = false;
  const guard = createPricingGuard(
    key,
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls++;
            if (pulls <= 30) controller.enqueue(new TextEncoder().encode('x'.repeat(4000)));
            else controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(guard.ensure('agent'), code('RESPONSE_TOO_LARGE'));
  assert.ok(pulls <= 8);
  assert.equal(cancelled, true);
});

test('caller cancellation while streaming cancels the reader and remains distinct from timeout', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const guard = createPricingGuard(
    key,
    async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull() {
            queueMicrotask(() => controller.abort());
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(guard.ensure('agent', controller.signal), code('CANCELLED'));
  assert.equal(cancelled, true);
});

test('invalid JSON, broken streams and transport failures expose no raw diagnostics', async () => {
  const requests: Array<typeof fetch> = [
    async () => new Response('not JSON'),
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('PRIVATE stream diagnostics'));
          },
        }),
      ),
    async () => {
      throw new Error('PRIVATE transport diagnostics');
    },
  ];
  for (const request of requests)
    await assert.rejects(createPricingGuard(key, request).ensure('agent'), (error) => {
      assert.equal((error as { code: string }).code, 'PROVIDER_FAILURE');
      assert.doesNotMatch((error as Error).message, /PRIVATE/);
      return true;
    });
});
