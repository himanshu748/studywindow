import { mkdir, readFile, writeFile, rename, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { StudyError } from './errors.js';
import { z } from 'zod';
// Original $5 plus approved $0.50, $0.30 and 11 Nov $1 supplements; retain prior reservations.
// The finite 11 Nov batch adds at most two 20-step Agent runs, four Browser sessions and seven Fetch URLs.
export const MAX_USD = 6.8,
  MAX_AGENT_RUNS = 19,
  STEP_CAP = 20,
  RESERVED_PER_RUN = 0.384,
  MAX_FETCH_URLS = 54,
  MAX_BROWSER_SESSIONS = 32,
  BROWSER_RESERVATION = 0.01;
const Ledger = z.object({
  version: z.literal(1),
  build: z.literal('studywindow-drop002'),
  agent_runs: z.number().int().nonnegative(),
  agent_reserved_usd: z.number().nonnegative(),
  fetch_urls: z.number().int().nonnegative(),
  browser_sessions: z.number().int().nonnegative().default(0),
  browser_reserved_usd: z.number().nonnegative().default(0),
  active: z.array(z.string()),
  halted: z.boolean().default(false),
  estimated_usd: z.number().nonnegative(),
  entries: z.array(
    z.object({
      id: z.string(),
      endpoint: z.enum(['agent', 'fetch', 'browser']),
      at: z.string(),
      run_id: z.string().nullable(),
      steps: z.number().nullable(),
      reserved_usd: z.number(),
      estimated_usd: z.number().nullable(),
    }),
  ),
});
export type LedgerData = z.infer<typeof Ledger>;
export class Budget {
  constructor(public readonly dir: string) {}
  private async transaction<T>(fn: (ledger: LedgerData) => T): Promise<T> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const lock = join(this.dir, 'ledger.lock');
    try {
      await mkdir(lock, { mode: 0o700 });
    } catch {
      throw new StudyError(
        'BUSY',
        'Usage ledger is locked by another operation. Try after it finishes.',
        true,
      );
    }
    try {
      let ledger: LedgerData;
      try {
        ledger = Ledger.parse(JSON.parse(await readFile(join(this.dir, 'ledger.json'), 'utf8')));
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT')
          ledger = {
            version: 1,
            build: 'studywindow-drop002',
            agent_runs: 0,
            agent_reserved_usd: 0,
            fetch_urls: 0,
            browser_sessions: 0,
            browser_reserved_usd: 0,
            active: [],
            halted: false,
            estimated_usd: 0,
            entries: [],
          };
        else
          throw new StudyError(
            'STATE_FAILURE',
            'Usage ledger cannot be read. Live calls are blocked until it is reconciled.',
          );
      }
      const result = fn(ledger);
      const temp = join(this.dir, `ledger.${randomUUID()}.tmp`);
      await writeFile(temp, JSON.stringify(ledger, null, 2), { mode: 0o600 });
      await rename(temp, join(this.dir, 'ledger.json'));
      return result;
    } finally {
      await rmdir(lock);
    }
  }
  async reserve(endpoint: 'agent' | 'fetch' | 'browser', count = 1): Promise<string> {
    return this.transaction((l) => {
      if (endpoint !== 'fetch' && l.halted)
        throw new StudyError(
          'ALLOWANCE_EXHAUSTED',
          'Billable StudyWindow calls are halted pending usage reconciliation.',
        );
      if (l.active.length >= 2)
        throw new StudyError('BUSY', 'Two TinyFish operations are already active.', true);
      if (
        endpoint === 'agent' &&
        (l.halted ||
          l.agent_runs >= MAX_AGENT_RUNS ||
          l.agent_reserved_usd + l.browser_reserved_usd + RESERVED_PER_RUN > MAX_USD)
      )
        throw new StudyError(
          'ALLOWANCE_EXHAUSTED',
          'StudyWindow’s durable build allowance is exhausted. No new Agent run was started.',
        );
      if (
        endpoint === 'browser' &&
        (l.browser_sessions >= MAX_BROWSER_SESSIONS ||
          l.agent_reserved_usd + l.browser_reserved_usd + BROWSER_RESERVATION > MAX_USD)
      )
        throw new StudyError(
          'ALLOWANCE_EXHAUSTED',
          'StudyWindow’s durable Browser session or total budget allowance is exhausted.',
        );
      if (endpoint === 'fetch' && l.fetch_urls + count > MAX_FETCH_URLS)
        throw new StudyError(
          'ALLOWANCE_EXHAUSTED',
          'StudyWindow’s Fetch request cap is exhausted.',
        );
      const id = randomUUID();
      if (endpoint === 'agent') {
        l.agent_runs++;
        l.agent_reserved_usd = Math.round((l.agent_reserved_usd + RESERVED_PER_RUN) * 1000) / 1000;
      } else if (endpoint === 'browser') {
        l.browser_sessions++;
        l.browser_reserved_usd =
          Math.round((l.browser_reserved_usd + BROWSER_RESERVATION) * 1000) / 1000;
      } else l.fetch_urls += count;
      l.active.push(id);
      l.entries.push({
        id,
        endpoint,
        at: new Date().toISOString(),
        run_id: null,
        steps: null,
        reserved_usd:
          endpoint === 'agent'
            ? RESERVED_PER_RUN
            : endpoint === 'browser'
              ? BROWSER_RESERVATION
              : 0,
        estimated_usd: endpoint === 'fetch' ? 0 : null,
      });
      return id;
    });
  }
  async halt(): Promise<void> {
    await this.transaction((l) => {
      l.halted = true;
    });
  }
  async started(id: string, runId: string): Promise<void> {
    await this.transaction((l) => {
      const e = l.entries.find((e) => e.id === id);
      if (e) e.run_id = runId;
    });
  }
  async browserFinish(id: string, elapsedSeconds: number): Promise<void> {
    await this.transaction((l) => {
      l.active = l.active.filter((x) => x !== id);
      const e = l.entries.find((e) => e.id === id);
      if (e) {
        e.estimated_usd = Math.ceil((elapsedSeconds / 60) * 0.002 * 1000000) / 1000000;
        l.estimated_usd = l.entries.reduce((s, e) => s + (e.estimated_usd ?? 0), 0);
      }
    });
  }
  async finish(id: string, steps?: number): Promise<void> {
    await this.transaction((l) => {
      l.active = l.active.filter((x) => x !== id);
      const e = l.entries.find((e) => e.id === id);
      if (e && steps !== undefined) {
        e.steps = steps;
        e.estimated_usd = Math.round(steps * 0.016 * 1000) / 1000;
        l.estimated_usd =
          Math.round(l.entries.reduce((s, e) => s + (e.estimated_usd ?? 0), 0) * 1000) / 1000;
        if (steps > 24) l.halted = true;
      }
    });
  }
  async status(): Promise<LedgerData & { max_usd: number; max_agent_runs: number }> {
    return this.transaction((l) => ({ ...l, max_usd: MAX_USD, max_agent_runs: MAX_AGENT_RUNS }));
  }
}
