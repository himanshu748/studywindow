// Offline orchestration tests. Synthetic provider observations never leave this process.
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { StudyWindow, toolDefinitions, type ToolName } from '../src/service.js';
import { StudyError } from '../src/errors.js';
import type { Retrieved, WebProvider } from '../src/provider.js';
import { type ReceiptData } from '../src/schemas.js';
import { CATALOGUE, ORIGIN, searchUrl } from '../src/urls.js';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { createServer } from '../src/mcp.js';
import { callTool } from '../src/client.js';

const dateLabel = '11 Jan 2027 to 28 Feb 2027';
const courseUrl = `${ORIGIN}/courses/offline-one`;
const title = 'Offline course';
function receipt(endpoint: 'fetch' | 'agent' | 'browser', source: string): ReceiptData {
  return {
    id:
      endpoint === 'fetch'
        ? '11111111-1111-4111-8111-111111111111'
        : '22222222-2222-4222-8222-222222222222',
    endpoint,
    source_url: source,
    checked_at: '2026-11-03T12:00:00Z',
    sha256: 'a'.repeat(64),
    run_id: endpoint === 'agent' ? '33333333-3333-4333-8333-333333333333' : null,
    session_id: endpoint === 'browser' ? 'br-44444444-4444-4444-8444-444444444444' : null,
    steps: endpoint === 'agent' ? 5 : null,
    reserved_usd: endpoint === 'agent' ? 0.384 : endpoint === 'browser' ? 0.01 : 0,
    estimated_usd: endpoint === 'agent' ? 0.08 : endpoint === 'browser' ? 0.002 : 0,
    fresh: true,
  };
}
function detailsHtml(label = dateLabel, count = 1) {
  return `<main><h1>${title}</h1><section class="accordion--course-instances">${Array.from({ length: count }, () => `<div class="accordion-item"><button class="accordion-item__button">${label}</button></div>`).join('')}</section><div class="accordion-item"><button class="accordion-item__button">Requirements</button></div><div class="accordion-item"><button class="accordion-item__button">Teaching and assessment</button></div></main>`;
}
function observation(url = courseUrl) {
  return {
    page_url: url,
    title,
    blocked: false,
    dates_found: 1,
    all_details_loaded: true,
    offerings: [
      {
        date_label: dateLabel,
        status: 'Places available',
        fields: [
          { label: 'Course fee', value: '£300' },
          { label: 'Application Deadline', value: '4 Jan 2027' },
          { label: 'Study mode', value: 'Online learning' },
          { label: 'Duration', value: '7 weeks' },
          { label: 'Course code', value: 'TEST001' },
        ],
      },
    ],
    panels: [
      { label: 'Requirements', text: 'Open entry' },
      { label: 'Teaching and assessment', text: 'Expect to spend 5 hours per week.' },
    ],
  };
}
function catalogueHtml(topic = 'psychology', empty = false) {
  return `<main><h1>Course search</h1><form action="/course-search"><input name="search_api_fulltext" value="${topic}"><select name="field_method"><option selected value="All">All</option>${['16', '455', '454', '31', '25'].map((value) => `<option value="${value}">${value}</option>`).join('')}</select><select name="field_subject_categories"><option selected value="All">All</option></select><select name="field_course_type"><option selected value="All">All</option></select></form><div class="search-listing__result-count">Showing ${empty ? 0 : 1} of ${empty ? 0 : 1} Results</div>${empty ? '' : `<article class="card--listing"><h3><a href="/courses/offline-one">Offline course</a></h3><span class="card__date--start">11 Jan 2027</span><span class="card__date--end">28 Feb 2027</span></article>`}</main>`;
}
class OfflineProvider implements WebProvider {
  calls: Array<{ endpoint: 'fetch' | 'agent' | 'browser'; url: string; signal?: AbortSignal }> = [];
  constructor(
    public fetchResult: (url: string) => string | Promise<string>,
    public agentResult: (url: string, goal: string) => unknown | Promise<unknown> = () => {
      throw new Error('Unexpected offline Agent invocation');
    },
    public browserResult: (url: string, panels: string[]) => unknown | Promise<unknown> = (url) =>
      observation(url),
  ) {}
  async fetchHtml(url: string, signal?: AbortSignal): Promise<Retrieved<string>> {
    this.calls.push({ endpoint: 'fetch', url, ...(signal ? { signal } : {}) });
    return { data: await this.fetchResult(url), receipt: receipt('fetch', url) };
  }
  async agent<T>(
    url: string,
    goal: string,
    schema: z.ZodType<T>,
    signal?: AbortSignal,
  ): Promise<Retrieved<T>> {
    this.calls.push({ endpoint: 'agent', url, ...(signal ? { signal } : {}) });
    return {
      data: schema.parse(await this.agentResult(url, goal)),
      receipt: receipt('agent', url),
    };
  }
  async expandCourse(
    url: string,
    panels: string[],
    signal?: AbortSignal,
  ): Promise<Retrieved<unknown>> {
    this.calls.push({ endpoint: 'browser', url, ...(signal ? { signal } : {}) });
    return { data: await this.browserResult(url, panels), receipt: receipt('browser', url) };
  }
}
function errorCode(value: Record<string, unknown>) {
  return (value.error as { code: string } | undefined)?.code;
}

test('invalid topic, duplicate canonical courses and off-domain courses reject before provider work', async () => {
  const web = new OfflineProvider(
    () => {
      throw new Error('must not fetch');
    },
    () => {
      throw new Error('must not run Agent');
    },
  );
  const service = new StudyWindow(web);
  const cases: Array<[ToolName, unknown]> = [
    ['search_courses', { topic: 'https://evil.example' }],
    ['inspect_course', { course: 'https://127.0.0.1/private' }],
    [
      'compare_courses',
      { courses: ['offline-one', courseUrl], budget: { amount: 400, currency: 'GBP' } },
    ],
  ];
  for (const [tool, input] of cases)
    assert.equal(errorCode(await service.call(tool, input)), 'INVALID_INPUT');
  assert.equal(web.calls.length, 0);
});

test('search requires genuine Agent-operated workflow before fresh Fetch and emits both receipts', async () => {
  const source = searchUrl('psychology');
  const web = new OfflineProvider(
    (url) => {
      assert.equal(url, source);
      return catalogueHtml();
    },
    (url, goal) => {
      assert.equal(url, source);
      assert.match(goal, /actual Course search form/);
      return { page_url: source, title: 'Course search', search_operated: true, blocked: false };
    },
  );
  const result = await new StudyWindow(web).call('search_courses', { topic: 'psychology' });
  assert.equal(result.ok, true);
  assert.deepEqual(
    web.calls.map((call) => call.endpoint),
    ['agent', 'fetch'],
  );
  const output = toolDefinitions.search_courses.output.parse(result);
  if (!output.ok) assert.fail('Expected typed success');
  assert.deepEqual(
    output.data.evidence.map((row) => row.endpoint),
    ['agent', 'fetch'],
  );
});

test('Agent navigation must match requested topic, mode, page and default category filters', async () => {
  const mismatchUrls = [
    searchUrl('history'),
    searchUrl('psychology', '16'),
    searchUrl('psychology', undefined, 1),
    `${searchUrl('psychology')}&field_course_type=404`,
    'https://evil.example/course-search?search_api_fulltext=psychology',
  ];
  for (const page_url of mismatchUrls) {
    const web = new OfflineProvider(
      () => {
        throw new Error('must not fetch mismatched navigation');
      },
      () => ({ page_url, title: 'Course search', search_operated: true, blocked: false }),
    );
    const result = await new StudyWindow(web).call('search_courses', { topic: 'psychology' });
    assert.equal(errorCode(result), 'SITE_CHANGED');
    assert.deepEqual(
      web.calls.map((call) => call.endpoint),
      ['agent'],
    );
  }
});

test('real form title suffix and content anchor defer to fresh HTML identity and form checks', async () => {
  const source = searchUrl('psychology');
  const web = new OfflineProvider(
    (url) => {
      assert.equal(url, source);
      return catalogueHtml();
    },
    () => ({
      page_url: source + '#main-content',
      title: 'Course search | Professional and Continuing Education',
      search_operated: true,
      blocked: false,
    }),
  );
  assert.equal(
    (await new StudyWindow(web).call('search_courses', { topic: 'psychology' })).ok,
    true,
  );
  web.fetchResult = () =>
    catalogueHtml().replace('<h1>Course search</h1>', '<h1>Different page</h1>');
  assert.equal(
    errorCode(await new StudyWindow(web).call('search_courses', { topic: 'psychology' })),
    'SITE_CHANGED',
  );
  web.agentResult = () => ({
    page_url: source + '#unrecognized-fragment',
    title: 'Course search',
    search_operated: true,
    blocked: false,
  });
  const count = web.calls.length;
  assert.equal(
    errorCode(await new StudyWindow(web).call('search_courses', { topic: 'psychology' })),
    'SITE_CHANGED',
  );
  assert.equal(web.calls.length, count + 1);
});

test('explicit search continuation retains original Agent evidence and still requires fresh Fetch', async () => {
  const source = searchUrl('psychology');
  const resumeRunId = '33333333-3333-4333-8333-333333333333';
  const web = new OfflineProvider(() => catalogueHtml());
  web.agent = async <T>(
    url: string,
    _goal: string,
    schema: z.ZodType<T>,
    _signal?: AbortSignal,
    selectedRunId?: string,
  ): Promise<Retrieved<T>> => {
    assert.equal(selectedRunId, resumeRunId);
    return {
      data: schema.parse({
        page_url: source,
        title: 'Course search',
        search_operated: true,
        blocked: false,
      }),
      receipt: receipt('agent', url),
    };
  };
  const output = toolDefinitions.search_courses.output.parse(
    await new StudyWindow(web).call('search_courses', {
      topic: 'psychology',
      resume_agent_run_id: resumeRunId,
    }),
  );
  assert.equal(output.ok, true);
  if (!output.ok) assert.fail('Expected typed resumed search');
  assert.equal(output.data.evidence[0]!.checked_at, '2026-11-03T12:00:00Z');
  assert.match(output.data.warnings[0]!, /original evidence time is retained/);
  assert.deepEqual(
    web.calls.map((call) => call.endpoint),
    ['fetch'],
  );
});

test('valid empty user search succeeds while blocked or unoperated search cannot fall back', async () => {
  const source = searchUrl('no matching topic');
  const web = new OfflineProvider(
    () => catalogueHtml('no matching topic', true),
    () => ({ page_url: source, title: 'Course search', search_operated: true, blocked: false }),
  );
  const result = toolDefinitions.search_courses.output.parse(
    await new StudyWindow(web).call('search_courses', { topic: 'no matching topic' }),
  );
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data.courses, []);
  for (const blocked of [true, false]) {
    const failed = new OfflineProvider(
      () => catalogueHtml(),
      () => ({
        page_url: searchUrl('psychology'),
        title: 'Course search',
        search_operated: false,
        blocked,
      }),
    );
    const answer = await new StudyWindow(failed).call('search_courses', { topic: 'psychology' });
    assert.equal(errorCode(answer), blocked ? 'SITE_BLOCKED' : 'SITE_CHANGED');
    assert.equal(failed.calls.length, 1);
  }
});

test('inspection retrieves Fetch identity first and requires all requested detail panels', async () => {
  const web = new OfflineProvider(
    () => detailsHtml(),
    undefined,
    (url, panels) => {
      assert.equal(url, courseUrl);
      assert.deepEqual(panels, ['Requirements', 'Teaching and assessment']);
      return observation(url);
    },
  );
  const result = await new StudyWindow(web).call('inspect_course', { course: 'offline-one' });
  assert.equal(result.ok, true);
  assert.deepEqual(
    web.calls.map((call) => [call.endpoint, call.url]),
    [
      ['fetch', courseUrl],
      ['browser', courseUrl],
    ],
  );
  const missing = new OfflineProvider(
    () => detailsHtml(),
    undefined,
    () => ({ ...observation(courseUrl), panels: [{ label: 'Requirements', text: 'Open entry' }] }),
  );
  assert.equal(
    errorCode(await new StudyWindow(missing).call('inspect_course', { course: 'offline-one' })),
    'SITE_CHANGED',
  );
});

test('required Browser expansion supplies detail provenance and never starts an Agent fallback', async () => {
  const web: WebProvider = {
    async fetchHtml(target) {
      assert.equal(target, courseUrl);
      return { data: detailsHtml(), receipt: receipt('fetch', target) };
    },
    async expandCourse(target, panels) {
      assert.equal(target, courseUrl);
      assert.deepEqual(panels, ['Requirements', 'Teaching and assessment']);
      return { data: observation(target), receipt: receipt('browser', target) };
    },
    async agent() {
      assert.fail('Detail expansion must not start a billable Agent fallback');
    },
  };
  const result = toolDefinitions.inspect_course.output.parse(
    await new StudyWindow(web).call('inspect_course', { course: 'offline-one' }),
  );
  assert.equal(result.ok, true);
  if (result.ok)
    assert.deepEqual(
      result.data.evidence.map((row) => row.endpoint),
      ['fetch', 'browser'],
    );
});

test('Browser failure is returned directly without a second provider path or substitute data', async () => {
  let browsers = 0,
    agents = 0;
  const web: WebProvider = {
    async fetchHtml(target) {
      return { data: detailsHtml(), receipt: receipt('fetch', target) };
    },
    async expandCourse() {
      browsers++;
      throw new StudyError('SITE_BLOCKED', 'Synthetic Browser refusal');
    },
    async agent() {
      agents++;
      assert.fail('No Agent fallback after Browser failure');
    },
  };
  const result = await new StudyWindow(web).call('inspect_course', { course: 'offline-one' });
  assert.equal(errorCode(result), 'SITE_BLOCKED');
  assert.equal(result.data, undefined);
  assert.equal(browsers, 1);
  assert.equal(agents, 0);
});

test('unsupported number of offerings rejects before any billable Browser request', async () => {
  const web = new OfflineProvider(() => detailsHtml(dateLabel, 4));
  assert.equal(
    errorCode(await new StudyWindow(web).call('inspect_course', { course: 'offline-one' })),
    'SITE_CHANGED',
  );
  assert.deepEqual(
    web.calls.map((call) => call.endpoint),
    ['fetch'],
  );
});

test('Browser course dates must agree with the independently fetched offering labels', async () => {
  const web = new OfflineProvider(
    () => detailsHtml(),
    undefined,
    () => {
      const raw = observation(courseUrl);
      raw.offerings[0]!.date_label = '12 Jan 2027 to 1 Mar 2027';
      return raw;
    },
  );
  assert.equal(
    errorCode(await new StudyWindow(web).call('inspect_course', { course: 'offline-one' })),
    'SITE_CHANGED',
  );
});

test('Browser identity and structured observations must agree with the fetched course', async () => {
  for (const raw of [
    { ...observation(), page_url: `${ORIGIN}/courses/another-course` },
    { ...observation(), title: 'Another course' },
    { ...observation(), all_details_loaded: false },
    { ...observation(), dates_found: 2 },
    { page_url: courseUrl, title },
  ]) {
    const web = new OfflineProvider(
      () => detailsHtml(),
      undefined,
      () => raw,
    );
    const result = await new StudyWindow(web).call('inspect_course', { course: 'offline-one' });
    assert.equal(errorCode(result), 'SITE_CHANGED');
    assert.equal(result.data, undefined);
    assert.deepEqual(
      web.calls.map((call) => call.endpoint),
      ['fetch', 'browser'],
    );
  }
});

test('blocked navigation may return empty observations and maps to SITE_BLOCKED before completeness checks', async () => {
  const web = new OfflineProvider(
    () => detailsHtml(),
    undefined,
    () => ({
      page_url: courseUrl,
      title: '',
      blocked: true,
      offerings: [],
      panels: [],
      dates_found: 0,
      all_details_loaded: false,
    }),
  );
  const result = await new StudyWindow(web).call('inspect_course', { course: 'offline-one' });
  assert.equal(errorCode(result), 'SITE_BLOCKED');
  assert.equal(result.data, undefined);
  assert.deepEqual(
    web.calls.map((call) => [call.endpoint, call.url]),
    [
      ['fetch', courseUrl],
      ['browser', courseUrl],
    ],
  );
  const emptyUnblocked = new OfflineProvider(
    () => detailsHtml(),
    undefined,
    () => ({
      page_url: courseUrl,
      title,
      blocked: false,
      offerings: [],
      panels: [],
      dates_found: 0,
      all_details_loaded: false,
    }),
  );
  assert.equal(
    errorCode(
      await new StudyWindow(emptyUnblocked).call('inspect_course', { course: 'offline-one' }),
    ),
    'SITE_CHANGED',
  );
});

test('comparison freshly reacquires each course and stops without partial results on failure', async () => {
  const web = new OfflineProvider((url) => {
    if (url.endsWith('offline-two'))
      throw new StudyError('PROVIDER_QUOTA', 'Synthetic offline quota failure');
    return detailsHtml();
  });
  const result = await new StudyWindow(web).call('compare_courses', {
    courses: ['offline-one', 'offline-two', 'offline-three'],
    budget: { amount: 400, currency: 'GBP' },
  });
  assert.equal(errorCode(result), 'PROVIDER_QUOTA');
  assert.equal(result.data, undefined);
  assert.deepEqual(
    web.calls.map((call) => [call.endpoint, call.url]),
    [
      ['fetch', courseUrl],
      ['browser', courseUrl],
      ['fetch', `${ORIGIN}/courses/offline-two`],
    ],
  );
});

test('cancellation passes through to provider and prevents starting the next comparison course', async () => {
  const controller = new AbortController();
  const web = new OfflineProvider(
    () => detailsHtml(),
    undefined,
    () => {
      controller.abort();
      return observation(courseUrl);
    },
  );
  const result = await new StudyWindow(web).call(
    'compare_courses',
    { courses: ['offline-one', 'offline-two'], budget: { amount: 400, currency: 'GBP' } },
    controller.signal,
  );
  assert.equal(errorCode(result), 'CANCELLED');
  assert.equal(result.data, undefined);
  assert.equal(web.calls.length, 2);
  assert.ok(web.calls.every((call) => call.signal === controller.signal));
});

test('health performs live-provider canary operations and labels its supported coverage', async () => {
  const web = new OfflineProvider((url) =>
    url.startsWith(CATALOGUE) ? catalogueHtml() : detailsHtml(),
  );
  const result = toolDefinitions.health_check.output.parse(
    await new StudyWindow(web).call('health_check', {}),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(
    web.calls.map((call) => call.endpoint),
    ['fetch', 'fetch', 'browser'],
  );
  if (result.ok) {
    assert.equal(result.data.status, 'healthy');
    assert.equal(result.data.evidence.length, 3);
    assert.match(result.data.coverage, /do not prove every source field/);
  }
});

test('empty canary and loss of deadline evidence produce unhealthy errors, not healthy success', async () => {
  const empty = new OfflineProvider(
    () => catalogueHtml('psychology', true),
    (url) => observation(url),
  );
  assert.equal(errorCode(await new StudyWindow(empty).call('health_check', {})), 'SITE_CHANGED');
  assert.equal(empty.calls.length, 1);
  const missingDeadline = new OfflineProvider(
    (url) => (url.startsWith(CATALOGUE) ? catalogueHtml() : detailsHtml()),
    undefined,
    (url) => {
      const raw = observation(url);
      raw.offerings[0]!.fields = raw.offerings[0]!.fields.filter(
        (field) => field.label !== 'Application Deadline',
      );
      return raw;
    },
  );
  assert.equal(
    errorCode(await new StudyWindow(missingDeadline).call('health_check', {})),
    'SITE_CHANGED',
  );
});

test('health rejects missing or ambiguous offering dates and contradictory deadlines', async () => {
  for (const label of [
    'Dates to be announced',
    '11 Jan 2027 to 28 Feb 2027 OR 11 Jan 2028 to 28 Feb 2028',
    dateLabel,
  ]) {
    const web = new OfflineProvider(
      (url) => (url.startsWith(CATALOGUE) ? catalogueHtml() : detailsHtml(label)),
      undefined,
      (url) => {
        const raw = observation(url);
        raw.offerings[0]!.date_label = label;
        if (label === dateLabel)
          raw.offerings[0]!.fields = raw.offerings[0]!.fields.map((field) =>
            field.label === 'Application Deadline' ? { ...field, value: '4 March 2027' } : field,
          );
        return raw;
      },
    );
    assert.equal(errorCode(await new StudyWindow(web).call('health_check', {})), 'SITE_CHANGED');
  }
});

test('health rejects an unexpectedly filtered catalogue before inspecting the canary course', async () => {
  const web = new OfflineProvider(() =>
    catalogueHtml().replace('selected value="All">All', 'selected value="31">Online learning'),
  );
  assert.equal(errorCode(await new StudyWindow(web).call('health_check', {})), 'SITE_CHANGED');
  assert.deepEqual(
    web.calls.map((call) => call.endpoint),
    ['fetch'],
  );
});

test('safe structured failures preserve provider categories and reject unknown tools', async () => {
  const web = new OfflineProvider(
    () => {
      throw new Error('SECRET-PRIVATE-DIAGNOSTIC');
    },
    () => {
      throw new StudyError('AUTHENTICATION', 'TinyFish rejected authentication.');
    },
  );
  const service = new StudyWindow(web);
  const failed = await service.call('search_courses', { topic: 'psychology' });
  assert.equal(errorCode(failed), 'AUTHENTICATION');
  assert.equal(errorCode(await service.call('constructor' as ToolName, {})), 'INVALID_INPUT');
  const generic = await service.call('inspect_course', { course: 'offline-one' });
  assert.equal(generic.ok, false);
  assert.doesNotMatch(JSON.stringify(generic), /SECRET-PRIVATE/);
});

test('official SDK connection advertises typed tools, rejects invalid calls and returns structured success', async (t) => {
  const source = searchUrl('psychology');
  const web = new OfflineProvider(
    () => catalogueHtml(),
    () => ({ page_url: source, title: 'Course search', search_operated: true, blocked: false }),
  );
  const server = createServer(new StudyWindow(web));
  const client = new Client({ name: 'studywindow-offline-protocol-test', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name).sort(),
    Object.keys(toolDefinitions).sort(),
  );
  assert.ok(listed.tools.every((tool) => tool.inputSchema && tool.outputSchema));
  const invalid = await client.callTool({
    name: 'search_courses',
    arguments: { topic: 'psychology', limit: 1000 },
  });
  assert.equal((invalid as { isError?: boolean }).isError, true);
  assert.equal(web.calls.length, 0);
  const result = await callTool(client, 'search_courses', { topic: 'psychology' });
  assert.equal(result.ok, true);
  if (result.ok && 'courses' in result.data) assert.equal(result.data.courses.length, 1);
  assert.deepEqual(
    web.calls.map((call) => call.endpoint),
    ['agent', 'fetch'],
  );
});

test('official MCP cancellation reaches the server provider AbortSignal', async (t) => {
  let entered!: () => void, cancelled!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const stopped = new Promise<void>((resolve) => {
    cancelled = resolve;
  });
  const web: WebProvider = {
    async fetchHtml() {
      throw new Error('Search must not reach Fetch after cancellation');
    },
    async expandCourse() {
      throw new Error('Search must not start Browser expansion');
    },
    async agent<T>(
      _url: string,
      _goal: string,
      _schema: z.ZodType<T>,
      signal?: AbortSignal,
    ): Promise<Retrieved<T>> {
      assert.ok(signal);
      entered();
      return await new Promise<Retrieved<T>>((_resolve, reject) => {
        const abort = () => {
          cancelled();
          reject(new StudyError('CANCELLED', 'Offline MCP cancellation observed.'));
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      });
    },
  };
  const server = createServer(new StudyWindow(web));
  const client = new Client({ name: 'studywindow-offline-cancellation-test', version: '0.1.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  t.after(async () => {
    await client.close();
    await server.close();
  });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const controller = new AbortController();
  const request = client.callTool(
    { name: 'search_courses', arguments: { topic: 'psychology' } },
    { signal: controller.signal, timeout: 5000 },
  );
  await started;
  controller.abort();
  await assert.rejects(request);
  await Promise.race([
    stopped,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error('MCP did not propagate cancellation')), 1000);
      timer.unref();
    }),
  ]);
});

// Offline replay of the final live Agent observation, not a new provider execution.
test('browser error-page titles are provider failures rather than proof of source access denial', async () => {
  for (const title of ["This page isn't working", 'This site can’t be reached']) {
    const web = new OfflineProvider(
      () => {
        throw new Error('must not fetch or substitute evidence');
      },
      () => ({ page_url: searchUrl('psychology'), title, search_operated: false, blocked: true }),
    );
    const result = await new StudyWindow(web).call('search_courses', { topic: 'psychology' });
    assert.equal(errorCode(result), 'PROVIDER_FAILURE');
    assert.deepEqual(
      web.calls.map((call) => call.endpoint),
      ['agent'],
    );
  }
});
