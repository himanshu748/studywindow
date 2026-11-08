// Offline TinyFish Browser contract tests. HTTP and CDP are fully mocked.
import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, type Browser } from 'playwright-core';
import { allowedBrowserRequest, validateCdpUrl, expandCourseWithBrowser } from '../src/browser.js';
import {
  Budget,
  BROWSER_RESERVATION,
  MAX_BROWSER_SESSIONS,
  MAX_AGENT_RUNS,
  MAX_USD,
  RESERVED_PER_RUN,
} from '../src/budget.js';
import { ORIGIN, searchUrl } from '../src/urls.js';

const url = `${ORIGIN}/courses/offline-browser-course`;
const api = 'https://api.browser.tinyfish.ai';
const walletUrl = 'https://agent.tinyfish.ai/v1/wallet';
function wallet() {
  return {
    available_balance: '20',
    currency: 'USD',
    rates: {
      as_of: '2026-11-03T12:00:00Z',
      meters: [
        { label: 'TinyFish Agent', unit_amount: '0.016', currency: 'USD', per: 'step' },
        { label: 'TinyFish Browser', unit_amount: '0.002', currency: 'USD', per: 'minute' },
        { label: 'TinyFish Fetch', unit_amount: '0', currency: 'USD', per: 'url' },
      ],
    },
  };
}
const sessionId = 'br-11111111-1111-4111-8111-111111111111';
const code = (expected: string) => (error: unknown) => {
  assert.equal((error as { code?: string }).code, expected);
  return true;
};
async function directory(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), 'studywindow-browser-offline-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
function rawCourse() {
  return {
    page_url: url,
    title: 'Offline Browser course',
    blocked: false,
    offerings: [
      {
        date_label: '11 Jan 2027 to 28 Feb 2027',
        status: 'Places available',
        fields: [
          { label: 'Course fee', value: '£300' },
          { label: 'Course code', value: 'TEST001' },
          { label: 'Study mode', value: 'Online learning' },
        ],
      },
    ],
    panels: [{ label: 'Requirements', text: 'Open entry' }],
    dates_found: 1,
    all_details_loaded: true,
  };
}
function fakeBrowser(
  options: {
    status?: number;
    pageUrl?: string;
    count?: number;
    data?: unknown;
    missingPanel?: boolean;
    navigationError?: boolean;
  } = {},
) {
  const calls: string[] = [];
  let routeHandler: ((route: unknown) => Promise<void>) | undefined;
  const expanded = new Map<string, boolean>();
  const content = {
    async waitFor() {
      calls.push('content-visible');
    },
    async count() {
      return 1;
    },
  };
  const makeButton = (name: string) => ({
    async getAttribute() {
      return expanded.get(name) ? 'true' : 'false';
    },
    async click() {
      expanded.set(name, true);
      calls.push(`expand:${name}`);
    },
    async count() {
      return options.missingPanel ? 0 : 1;
    },
    locator() {
      return {
        locator() {
          return content;
        },
      };
    },
  });
  const item = {
    locator(selector: string) {
      return selector === '.accordion-item__button' ? makeButton('date') : content;
    },
  };
  const page = {
    on(event: string) {
      calls.push(`listen:${event}`);
    },
    setDefaultTimeout(timeout: number) {
      assert.equal(timeout, 10000);
    },
    async goto(target: string) {
      calls.push(`navigate:${target}`);
      if (options.navigationError) throw new Error('PRIVATE-CDP-DIAGNOSTIC');
      return {
        status() {
          return options.status ?? 200;
        },
      };
    },
    url() {
      return options.pageUrl ?? url;
    },
    getByRole(_role: string, options: { name: string }) {
      return options.name === 'Deny'
        ? {
            async isVisible() {
              return false;
            },
          }
        : makeButton(options.name);
    },
    locator(selector: string) {
      if (selector === 'main h1')
        return {
          async waitFor() {
            calls.push('title-visible');
          },
        };
      if (selector === 'main')
        return {
          async evaluate() {
            calls.push('extract-dom');
            return options.data ?? rawCourse();
          },
        };
      return {
        async count() {
          return options.count ?? 1;
        },
        nth() {
          return item;
        },
      };
    },
    async title() {
      return 'Offline Browser course';
    },
  };
  const context = {
    async route(_pattern: string, handler: typeof routeHandler) {
      calls.push('route-installed');
      routeHandler = handler;
    },
    async routeWebSocket(
      pattern: string,
      handler: (socket: { close: (options: unknown) => void }) => void,
    ) {
      assert.equal(pattern, '**/*');
      handler({
        close(options) {
          assert.deepEqual(options, { code: 1008, reason: 'Read-only source adapter' });
          calls.push('websocket-denied');
        },
      });
    },
    pages() {
      return [page];
    },
    async newPage() {
      return page;
    },
  };
  const browser = {
    async newContext(options: unknown) {
      assert.deepEqual(options, { serviceWorkers: 'block', acceptDownloads: false });
      calls.push('isolated-context');
      return context;
    },
    contexts() {
      assert.fail('Never reuse an existing Browser context');
    },
    async close() {
      calls.push('close');
    },
  } as unknown as Browser;
  return { browser, calls, getRoute: () => routeHandler };
}
async function setup(
  t: TestContext,
  options: Parameters<typeof fakeBrowser>[0] = {},
  response?: (target: string, init?: RequestInit) => Response | Promise<Response>,
  walletResponse?: () => Response | Promise<Response>,
) {
  const stateDir = await directory(t),
    budget = new Budget(stateDir),
    fake = fakeBrowser(options),
    requests: Array<{ url: string; method: string | undefined }> = [];
  t.mock.method(chromium, 'connectOverCDP', async (target: string) => {
    assert.equal(target, 'wss://browser.tinyfish.io/cdp?session=offline');
    return fake.browser;
  });
  t.mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const target = String(input);
    requests.push({ url: target, method: init?.method });
    if (target === walletUrl) {
      assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'error');
      assert.ok(init?.signal);
      return walletResponse
        ? walletResponse()
        : new Response(JSON.stringify(wallet()), {
            headers: { 'Content-Type': 'application/json' },
          });
    }
    assert.ok(target === api || target === `${api}/${sessionId}`);
    if (response) return response(target, init);
    if (target === api) {
      assert.deepEqual(JSON.parse(String(init?.body)), {
        timeout_seconds: 30,
        proxy_config: { enabled: false },
      });
      return new Response(
        JSON.stringify({
          session_id: sessionId,
          cdp_url: 'wss://browser.tinyfish.io/cdp?session=offline',
        }),
      );
    }
    return new Response(null, { status: 204 });
  });
  const config = { key: 'offline-placeholder-key', live: true, stateDir };
  return { ...fake, config, budget, requests };
}

test('Browser request policy restricts origin, methods, navigation paths and private networks', () => {
  assert.equal(allowedBrowserRequest(url, 'GET', true), true);
  assert.equal(allowedBrowserRequest(searchUrl('psychology'), 'GET', true), true);
  assert.equal(allowedBrowserRequest(`${ORIGIN}/themes/custom/site.css`, 'GET', false), true);
  for (const [target, method, document] of [
    [url, 'POST', true],
    [`${ORIGIN}/user/login`, 'GET', true],
    ['https://127.0.0.1/private', 'GET', false],
    ['http://169.254.169.254/latest', 'GET', false],
    ['https://evil.example/script.js', 'GET', false],
    [`${ORIGIN}/courses/test?redirect=http://localhost`, 'GET', true],
  ] as const)
    assert.equal(allowedBrowserRequest(target, method, document), false);
});

test('Browser catalogue navigation rejects unsupported query keys', () => {
  assert.equal(
    allowedBrowserRequest(`${ORIGIN}/course-search?url=http://127.0.0.1/private`, 'GET', true),
    false,
  );
});

test('only the verified course-status POST may load read-only availability', () => {
  const status = `${ORIGIN}/api/course-status/4013`;
  assert.equal(allowedBrowserRequest(status, 'POST', false, 'nodeId=4013'), true);
  assert.equal(
    allowedBrowserRequest(
      `${status}?_wrapper_format=drupal_ajax`,
      'POST',
      false,
      new URLSearchParams({ nodeId: '4013' }).toString(),
    ),
    true,
  );
  assert.equal(
    allowedBrowserRequest(
      `${status}?_wrapper_format=drupal_ajax`,
      'POST',
      false,
      new URLSearchParams({
        nodeId: '4013',
        _drupal_ajax: '1',
        'ajax_page_state[theme]': 'ice',
        'ajax_page_state[theme_token]': '',
        'ajax_page_state[libraries]': 'course-status',
      }).toString(),
    ),
    true,
  );
  for (const [target, method, document, body] of [
    [status, 'POST', false, 'nodeId=4014'],
    [status, 'POST', false, null],
    [status, 'POST', false, JSON.stringify({ nodeId: '4013' })],
    [status, 'POST', false, 'nodeId=4013&nodeId=4014'],
    [status, 'POST', false, 'nodeId=4013&action=apply'],
    [status, 'POST', false, 'nodeId=4013&_drupal_ajax=1&_drupal_ajax=1'],
    [`${status}#unexpected`, 'POST', false, 'nodeId=4013'],
    [status, 'POST', true, 'nodeId=4013'],
    [status, 'PUT', false, 'nodeId=4013'],
    [`${ORIGIN}/api/course-status/0`, 'POST', false, 'nodeId=0'],
    [`${ORIGIN}/api/course-status/04013`, 'POST', false, 'nodeId=04013'],
    [`${ORIGIN}/api/course-status/not-an-id`, 'POST', false, 'nodeId=not-an-id'],
    [`${ORIGIN}/api/course-status/4013/other`, 'POST', false, 'nodeId=4013'],
    [`${ORIGIN}/api/submit-application/4013`, 'POST', false, 'nodeId=4013'],
    [`${ORIGIN}/courses/offline-browser-course`, 'POST', false, 'nodeId=4013'],
    ['https://evil.example/api/course-status/4013', 'POST', false, 'nodeId=4013'],
    [`${status}?_wrapper_format=json`, 'POST', false, 'nodeId=4013'],
    [`${status}?redirect=http://127.0.0.1`, 'POST', false, 'nodeId=4013'],
    [`${status}?_wrapper_format=drupal_ajax&action=apply`, 'POST', false, 'nodeId=4013'],
  ] as const)
    assert.equal(
      allowedBrowserRequest(target, method, document, body),
      false,
      `${method} ${target}`,
    );
});

test('CDP URL validation accepts vendor WSS only and excludes credentials or fragment', () => {
  assert.equal(
    validateCdpUrl('wss://browser.tinyfish.io/cdp?session=offline'),
    'wss://browser.tinyfish.io/cdp?session=offline',
  );
  for (const target of [
    'ws://browser.tinyfish.io/cdp',
    'wss://127.0.0.1/cdp',
    'wss://tinyfish.io.evil.example/cdp',
    'wss://user:password@browser.tinyfish.ai/cdp',
    'wss://browser.tinyfish.ai/cdp#secret',
  ])
    assert.throws(() => validateCdpUrl(target), code('PROVIDER_FAILURE'));
});

test('isolated Browser opens bounded controls, returns DOM observations and terminates its session', async (t) => {
  const f = await setup(t);
  const result = await expandCourseWithBrowser(f.config, f.budget, url, ['Requirements']);
  assert.deepEqual(result.data, rawCourse());
  assert.equal(result.receipt.endpoint, 'browser');
  assert.equal(result.receipt.session_id, sessionId);
  assert.equal(result.receipt.reserved_usd, BROWSER_RESERVATION);
  assert.ok(f.calls.indexOf('route-installed') < f.calls.indexOf(`navigate:${url}`));
  assert.ok(f.calls.includes('isolated-context'));
  assert.ok(f.calls.includes('websocket-denied'));
  assert.ok(f.calls.includes('expand:date'));
  assert.ok(f.calls.includes('expand:Requirements'));
  assert.ok(f.calls.includes('extract-dom'));
  assert.ok(f.calls.includes('close'));
  assert.deepEqual(f.requests, [
    { url: walletUrl, method: 'GET' },
    { url: api, method: 'POST' },
    { url: `${api}/${sessionId}`, method: 'DELETE' },
  ]);
  const saved = await readFile(
    join(f.config.stateDir, 'receipts', `${result.receipt.id}.json`),
    'utf8',
  );
  assert.doesNotMatch(saved, /offline-placeholder-key|wss:|X-API-Key/);
  const state = await f.budget.status();
  assert.equal(state.browser_sessions, 1);
  assert.equal(state.browser_reserved_usd, BROWSER_RESERVATION);
  assert.deepEqual(state.active, []);
});

test('installed route guard checks POST data before allowing course-status requests', async (t) => {
  const f = await setup(t);
  await expandCourseWithBrowser(f.config, f.budget, url, ['Requirements']);
  const route = f.getRoute();
  assert.ok(route);
  const outcomes: string[] = [];
  for (const body of ['nodeId=4013', 'nodeId=4014']) {
    await route({
      request() {
        return {
          url() {
            return `${ORIGIN}/api/course-status/4013`;
          },
          method() {
            return 'POST';
          },
          isNavigationRequest() {
            return false;
          },
          postData() {
            return body;
          },
        };
      },
      async abort(reason: string) {
        assert.equal(reason, 'blockedbyclient');
        outcomes.push('blocked');
      },
      async continue() {
        outcomes.push('allowed');
      },
    });
  }
  assert.deepEqual(outcomes, ['allowed', 'blocked']);
});

test('blocked, missing and changed course structure do not return success and still delete the session', async (t) => {
  for (const [options, expected] of [
    [{ status: 403 }, 'SITE_BLOCKED'],
    [{ status: 404 }, 'NOT_FOUND'],
    [{ count: 4 }, 'SITE_CHANGED'],
    [{ missingPanel: true }, 'SITE_CHANGED'],
  ] as const) {
    const f = await setup(t, options);
    await assert.rejects(
      expandCourseWithBrowser(f.config, f.budget, url, ['Requirements']),
      code(expected),
    );
    assert.equal(f.requests.filter((r) => r.method === 'POST').length, 1);
    assert.equal(f.requests.filter((r) => r.method === 'DELETE').length, 1);
    assert.deepEqual((await f.budget.status()).active, []);
    t.mock.restoreAll();
  }
});

test('invalid expanded DOM and unexpected navigation do not trigger an Agent or new Browser session', async (t) => {
  for (const options of [
    { data: { page_url: url, title: 'Broken' } },
    { pageUrl: `${ORIGIN}/courses/wrong-course` },
    { navigationError: true },
  ]) {
    const f = await setup(t, options);
    await assert.rejects(
      expandCourseWithBrowser(f.config, f.budget, url, ['Requirements']),
      (error) => {
        assert.doesNotMatch((error as Error).message, /PRIVATE-CDP/);
        return true;
      },
    );
    assert.equal(f.requests.filter((r) => r.method === 'POST').length, 1);
    assert.equal(f.requests.filter((r) => r.method === 'DELETE').length, 1);
    t.mock.restoreAll();
  }
});

test('after successful pricing verification, Browser start failures are classified without retries or refunds', async (t) => {
  for (const status of [401, 403, 402, 429, 500]) {
    const f = await setup(t, {}, () => new Response('PRIVATE-PROVIDER-DIAGNOSTIC', { status }));
    await assert.rejects(expandCourseWithBrowser(f.config, f.budget, url, []), (error) => {
      assert.equal(
        (error as { code: string }).code,
        status === 401 || status === 403
          ? 'AUTHENTICATION'
          : status === 402 || status === 429
            ? 'PROVIDER_QUOTA'
            : 'PROVIDER_FAILURE',
      );
      assert.doesNotMatch((error as Error).message, /PRIVATE-PROVIDER/);
      return true;
    });
    assert.deepEqual(f.requests, [
      { url: walletUrl, method: 'GET' },
      { url: api, method: 'POST' },
    ]);
    assert.equal((await f.budget.status()).browser_reserved_usd, BROWSER_RESERVATION);
    t.mock.restoreAll();
  }
});

test('failed Browser pricing preflight creates no session and spends no reservation', async (t) => {
  const higherPrice = wallet();
  higherPrice.rates.meters[1]!.unit_amount = '0.003';
  for (const [response, expected] of [
    [() => new Response('PRIVATE-WALLET-DIAGNOSTIC', { status: 401 }), 'AUTHENTICATION'],
    [() => new Response(JSON.stringify({ ...wallet(), available_balance: '0' })), 'PROVIDER_QUOTA'],
    [() => new Response(JSON.stringify(higherPrice)), 'PRICING_CHANGED'],
    [() => new Response(JSON.stringify({ rates: { meters: [] } })), 'PROVIDER_FAILURE'],
  ] as const) {
    const f = await setup(t, {}, undefined, response);
    await assert.rejects(expandCourseWithBrowser(f.config, f.budget, url, []), (error) => {
      assert.equal((error as { code: string }).code, expected);
      assert.doesNotMatch((error as Error).message, /PRIVATE-WALLET/);
      return true;
    });
    assert.deepEqual(f.requests, [{ url: walletUrl, method: 'GET' }]);
    assert.deepEqual(f.calls, []);
    const state = await f.budget.status();
    assert.equal(state.browser_sessions, 0);
    assert.equal(state.browser_reserved_usd, 0);
    assert.deepEqual(state.entries, []);
    t.mock.restoreAll();
  }
});

test('client cancellation before Browser start performs no network request or reservation', async (t) => {
  const f = await setup(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    expandCourseWithBrowser(f.config, f.budget, url, [], controller.signal),
    code('CANCELLED'),
  );
  assert.equal(f.requests.length, 0);
  assert.equal((await f.budget.status()).browser_sessions, 0);
});

test('cancellation of an allocated session closes CDP, deletes remotely and preserves its reservation', async (t) => {
  const f = await setup(t),
    controller = new AbortController();
  t.mock.method(chromium, 'connectOverCDP', async () => {
    controller.abort();
    return f.browser;
  });
  await assert.rejects(
    expandCourseWithBrowser(f.config, f.budget, url, [], controller.signal),
    code('CANCELLED'),
  );
  assert.deepEqual(f.requests, [
    { url: walletUrl, method: 'GET' },
    { url: api, method: 'POST' },
    { url: `${api}/${sessionId}`, method: 'DELETE' },
  ]);
  assert.ok(f.calls.includes('close'));
  assert.ok(!f.calls.includes('extract-dom'));
  const state = await f.budget.status();
  assert.equal(state.browser_reserved_usd, BROWSER_RESERVATION);
  assert.deepEqual(state.active, []);
});

test('Browser session cap and aggregate Agent/Browser reservation remain durable', async (t) => {
  const budget = new Budget(await directory(t));
  for (let i = 0; i < MAX_BROWSER_SESSIONS; i++) {
    const id = await budget.reserve('browser');
    await budget.browserFinish(id, 20);
  }
  await assert.rejects(budget.reserve('browser'), code('ALLOWANCE_EXHAUSTED'));
  const affordableAgentRuns = Math.min(
    MAX_AGENT_RUNS,
    Math.floor((MAX_USD - MAX_BROWSER_SESSIONS * BROWSER_RESERVATION) / RESERVED_PER_RUN),
  );
  for (let i = 0; i < affordableAgentRuns; i++) {
    const id = await budget.reserve('agent');
    await budget.finish(id);
  }
  await assert.rejects(budget.reserve('agent'), code('ALLOWANCE_EXHAUSTED'));
  const state = await new Budget(budget.dir).status();
  assert.equal(state.browser_sessions, MAX_BROWSER_SESSIONS);
  assert.ok(state.agent_reserved_usd + state.browser_reserved_usd <= MAX_USD);
});

test('an accounting halt blocks all new billable Browser sessions', async (t) => {
  const budget = new Budget(await directory(t));
  await budget.halt();
  await assert.rejects(budget.reserve('browser'), code('ALLOWANCE_EXHAUSTED'));
});

test('session envelope is bounded while streaming even when Content-Length is absent', async (t) => {
  let pulls = 0,
    cancelled = false;
  const f = await setup(
    t,
    {},
    () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            pulls++;
            if (pulls <= 20) controller.enqueue(new TextEncoder().encode('x'.repeat(2000)));
            else controller.close();
          },
          cancel() {
            cancelled = true;
          },
        }),
      ),
  );
  await assert.rejects(
    expandCourseWithBrowser(f.config, f.budget, url, []),
    code('RESPONSE_TOO_LARGE'),
  );
  assert.ok(
    pulls <= 8,
    'The size limit must stop reading near 10KB, not buffer the entire provider response',
  );
  assert.equal(cancelled, true);
});
