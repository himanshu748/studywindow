// Synthetic offline recovery tests. No live Browser, Fetch, wallet or source is contacted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { BrowserNavigationError, StudyError } from '../src/errors.js';
import { courseFromFreshHtml } from '../src/fetch-course.js';
import { StudyWindow, toolDefinitions } from '../src/service.js';
import type { WebProvider } from '../src/provider.js';
import type { ReceiptData } from '../src/schemas.js';
import { CATALOGUE, ORIGIN } from '../src/urls.js';

const url = `${ORIGIN}/courses/offline-fallback`;
const title = 'Offline fallback course';
const sessionId = 'br-11111111-1111-4111-8111-111111111111';
const requiredPanels = ['Requirements', 'Teaching and assessment'];
function html() {
  return `<main><h1>${title}</h1>
    <section class="accordion--course-instances"><div class="accordion-item">
      <h2><button class="accordion-item__button">11 Jan 2027 to 28 Feb 2027</button></h2>
      <div class="accordion-item__content"><div class="course-details">
      ${[
        ['Course fee', '£300'],
        ['Study mode', 'Online learning'],
        ['Application Deadline', '4 Jan 2027'],
        ['Duration', '7 weeks'],
        ['Course code', 'TEST001'],
        ['Location', 'Online'],
      ]
        .map(
          ([label, value]) =>
            `<div class="course-details__item"><span class="course-details__item-label">${label}</span>${value}</div>`,
        )
        .join('')}
      </div><span class="course-status">Places available</span></div>
    </div></section>
    <div class="accordion-item"><h2><button class="accordion-item__button">Requirements</button></h2>
      <div class="accordion-item__content">Open entry. English proficiency required.</div></div>
    <div class="accordion-item"><h2><button class="accordion-item__button">Teaching and assessment</button></h2>
      <div class="accordion-item__content">Expect to spend 5 hours per week.</div></div>
    </main>`;
}
function navigation(source = url) {
  return new BrowserNavigationError({
    stage: 'navigate_course',
    source_url: source,
    network_code: 'ERR_EMPTY_RESPONSE',
    checked_at: new Date().toISOString(),
    session_id: sessionId,
    attempts: 3,
  });
}
function provider(
  sourceHtml: string | ((url: string) => string) = html(),
  browserFailure: unknown = navigation(),
  changeReceipt: (receipt: ReceiptData) => ReceiptData = (receipt) => receipt,
  onBrowser?: () => void,
  expectedUrl = url,
) {
  const calls: string[] = [];
  let fetched: ReceiptData | undefined;
  const web: WebProvider = {
    async fetchHtml(target) {
      calls.push('fetch');
      const actualHtml = typeof sourceHtml === 'string' ? sourceHtml : sourceHtml(target);
      fetched = changeReceipt({
        id: '22222222-2222-4222-8222-222222222222',
        endpoint: 'fetch',
        source_url: target,
        checked_at: new Date().toISOString(),
        sha256: createHash('sha256').update(actualHtml).digest('hex'),
        run_id: null,
        session_id: null,
        steps: null,
        reserved_usd: 0,
        estimated_usd: 0,
        fresh: true,
      });
      return { data: actualHtml, receipt: fetched };
    },
    async expandCourse(target, panels) {
      calls.push('browser');
      assert.equal(target, expectedUrl);
      assert.deepEqual(panels, requiredPanels);
      onBrowser?.();
      throw browserFailure;
    },
    async agent() {
      assert.fail('Recovery must never start an Agent');
    },
  };
  return { web, calls, receipt: () => fetched };
}
const code = (result: Record<string, unknown>) => (result.error as { code: string })?.code;

test('exhausted transient navigation uses only literal current Fetch facts and its actual receipt', async () => {
  const f = provider();
  const result = toolDefinitions.inspect_course.output.parse(
    await new StudyWindow(f.web).call('inspect_course', { course: url }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail('Expected supported literal HTML recovery');
  assert.deepEqual(f.calls, ['fetch', 'browser']);
  assert.deepEqual(result.data.evidence, [f.receipt()]);
  assert.equal(result.data.checked_at, f.receipt()!.checked_at);
  assert.equal(result.data.retrieval?.mode, 'fresh_fetch_fallback');
  if (result.data.retrieval?.mode !== 'fresh_fetch_fallback') assert.fail('Missing provenance');
  assert.deepEqual(result.data.retrieval.browser_failure, {
    stage: 'navigate_course',
    source_url: url,
    network_code: 'ERR_EMPTY_RESPONSE',
    checked_at: result.data.retrieval.browser_failure.checked_at,
    session_id: sessionId,
    attempts: 3,
  });
  assert.equal(result.data.offerings[0]!.fees[0]!.amount, 300);
  assert.equal(result.data.offerings[0]!.deadline_date, '2027-01-04');
  assert.equal(result.data.offerings[0]!.status.value, null);
  assert.equal(result.data.offerings[0]!.status.quote, null);
  assert.ok(result.data.offerings[0]!.missing_fields.includes('availability_status'));
  assert.match(result.data.teaching.quote!, /5 hours per week/);
  assert.match(result.data.warnings.join(' '), /not opened in Browser/);
  assert.doesNotMatch(result.data.warnings.join(' '), /panels were opened through TinyFish/);
  assert.equal(
    result.data.evidence.some((receipt) => receipt.endpoint === 'browser'),
    false,
  );
});

test('health marks same-Fetch recovery degraded with a failed Browser check and no Browser receipt', async () => {
  const canary = `${ORIGIN}/courses/learning-and-memory-brain`;
  const catalogue = `<main><h1>Course search</h1><form action="/course-search">
    <input name="search_api_fulltext" value="psychology">
    <select name="field_method"><option selected value="All">All</option>${['16', '455', '454', '31', '25'].map((value) => `<option value="${value}">${value}</option>`).join('')}</select>
    <select name="field_subject_categories"><option selected value="All">All</option></select>
    <select name="field_course_type"><option selected value="All">All</option></select></form>
    <div class="search-listing__result-count">Showing 1 of 1 Results</div>
    <article class="card--listing"><h3><a href="/courses/learning-and-memory-brain">${title}</a></h3>
    <span class="card__date--start">11 Jan 2027</span><span class="card__date--end">28 Feb 2027</span></article></main>`;
  const f = provider(
    (target) => (target.startsWith(CATALOGUE) ? catalogue : html()),
    navigation(canary),
    undefined,
    undefined,
    canary,
  );
  const result = toolDefinitions.health_check.output.parse(
    await new StudyWindow(f.web).call('health_check', {}),
  );
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail('Expected typed degraded health');
  assert.equal(result.data.status, 'degraded');
  assert.equal(
    result.data.checks.find((check) => check.name === 'browser_navigation')!.passed,
    false,
  );
  assert.equal(result.data.checks.find((check) => check.name === 'course_details')!.passed, true);
  assert.match(
    result.data.checks.find((check) => check.name === 'course_details')!.detail,
    /agreement was not established/,
  );
  assert.deepEqual(
    result.data.evidence.map((receipt) => receipt.endpoint),
    ['fetch', 'fetch'],
  );
  assert.deepEqual(f.calls, ['fetch', 'fetch', 'browser']);
});

test('ordinary provider, auth, access, TLS, robots, timeout, structure and cancellation errors never recover', async () => {
  const failures = [
    new StudyError('PROVIDER_FAILURE', 'net::ERR_EMPTY_RESPONSE'),
    new StudyError('AUTHENTICATION', 'Authentication failed'),
    new StudyError('SITE_BLOCKED', 'Access refused'),
    new StudyError('PROVIDER_FAILURE', 'net::ERR_CERT_AUTHORITY_INVALID'),
    new StudyError('SITE_BLOCKED', 'Robots disallows this page'),
    new StudyError('PROVIDER_TIMEOUT', 'Timed out'),
    new StudyError('SITE_CHANGED', 'Missing expanded panel'),
    new StudyError('CANCELLED', 'Cancelled'),
    new Error('net::ERR_EMPTY_RESPONSE'),
    navigation(`${ORIGIN}/courses/different-course`),
  ];
  for (const failure of failures) {
    const f = provider(html(), failure);
    const result = await new StudyWindow(f.web).call('inspect_course', { course: url });
    assert.equal(result.ok, false);
    assert.equal(result.data, undefined);
    assert.equal(code(result), failure instanceof StudyError ? failure.code : 'PROVIDER_FAILURE');
    assert.deepEqual(f.calls, ['fetch', 'browser']);
  }
});

test('cancellation after the Browser failure prevents even otherwise permitted HTML recovery', async () => {
  const controller = new AbortController();
  const f = provider(html(), navigation(), undefined, () => controller.abort());
  const result = await new StudyWindow(f.web).call(
    'inspect_course',
    { course: url },
    controller.signal,
  );
  assert.equal(code(result), 'CANCELLED');
  assert.equal(result.data, undefined);
  assert.deepEqual(f.calls, ['fetch', 'browser']);
});

test('recovery refuses stale, mismatched, non-Fetch, altered and otherwise invalid receipts', async () => {
  const changes: Array<(receipt: ReceiptData) => ReceiptData> = [
    (receipt) => ({ ...receipt, checked_at: '2026-01-01T00:00:00Z' }),
    (receipt) => ({ ...receipt, checked_at: '2099-01-01T00:00:00Z' }),
    (receipt) => ({ ...receipt, source_url: `${ORIGIN}/courses/wrong-course` }),
    (receipt) => ({ ...receipt, endpoint: 'browser', session_id: sessionId }),
    (receipt) => ({ ...receipt, sha256: 'a'.repeat(64) }),
    (receipt) => ({ ...receipt, fresh: false }) as unknown as ReceiptData,
  ];
  for (const change of changes) {
    const f = provider(html(), navigation(), change);
    const result = await new StudyWindow(f.web).call('inspect_course', { course: url });
    assert.equal(code(result), 'SITE_CHANGED');
    assert.equal(result.data, undefined);
    assert.deepEqual(f.calls, ['fetch', 'browser']);
  }
});

test('literal extraction rejects wrong identity, headings, incomplete fields and absent requested content', () => {
  const source = html();
  const changes = [
    source.replace('<main>', `<link rel="canonical" href="${ORIGIN}/courses/wrong-course"><main>`),
    source.replace(`<h1>${title}</h1>`, '<h1>Another course</h1>'),
    source.replace(`<h1>${title}</h1>`, `<h1>${title}</h1><h1>Another course</h1>`),
    source.replace('<main>', '<main></main><main>'),
    source.replace('11 Jan 2027 to 28 Feb 2027', 'Dates to be announced'),
    source.replace('28 Feb 2027', '28 Feb 2026'),
    source.replace('Application Deadline</span>4 Jan 2027', 'Application Deadline</span>'),
    source.replace('Course fee</span>£300', 'Course fee</span>'),
    source.replace('Study mode</span>Online learning', 'Study mode</span>'),
    source.replace('Duration</span>7 weeks', 'Duration</span>'),
    source.replace('Course code</span>TEST001', 'Course code</span>'),
    source.replace('Duration</span>', 'Unexpected field</span>'),
    source.replace('Duration</span>', 'Course fee</span>'),
    source.replace('Open entry. English proficiency required.', ''),
    source.replace(
      'Expect to spend 5 hours per week.',
      '<script>Expect to spend 5 hours per week.</script>',
    ),
    source.replace(
      'Expect to spend 5 hours per week.',
      '<template>Expect to spend 5 hours per week.</template>',
    ),
  ];
  for (const changed of changes)
    assert.throws(
      () => courseFromFreshHtml(changed, url, title, requiredPanels),
      (error) => error instanceof StudyError && error.code === 'SITE_CHANGED',
    );
  assert.throws(
    () => courseFromFreshHtml(source, url, title, [...requiredPanels, 'Course schedule']),
    (error) => error instanceof StudyError && error.code === 'SITE_CHANGED',
  );
});

test('nonempty HTML with unsupported numeric facts still fails recovery instead of returning partial detail', async () => {
  for (const changed of [
    html().replace('£300', 'Fee to be confirmed'),
    html().replace('4 Jan 2027', 'Deadline to be confirmed'),
    html().replace('4 Jan 2027', '4 March 2027'),
  ]) {
    const f = provider(changed);
    const result = await new StudyWindow(f.web).call('inspect_course', { course: url });
    assert.equal(code(result), 'SITE_CHANGED');
    assert.equal(result.data, undefined);
    assert.deepEqual(f.calls, ['fetch', 'browser']);
  }
});

test('matching optional identity metadata is accepted, while login pages remain excluded', () => {
  const source = `<link rel="canonical" href="${url}">${html()}`;
  assert.equal(courseFromFreshHtml(source, url, title, requiredPanels).title, title);
  for (const changed of [
    html().replace(`<h1>${title}</h1>`, '<h1>Access denied</h1>'),
    html().replace('</main>', '<input type="password"></main>'),
  ])
    assert.throws(
      () =>
        courseFromFreshHtml(
          changed,
          url,
          changed.includes('Access denied') ? 'Access denied' : title,
          requiredPanels,
        ),
      (error) => error instanceof StudyError && error.code === 'SITE_BLOCKED',
    );
});

test('literal extraction retains all supported offerings and rejects a fourth instead of truncating', () => {
  const source = html();
  const section = source.match(
    /<section class="accordion--course-instances">([\s\S]*?)<\/section>/,
  )!;
  for (const count of [2, 3, 4]) {
    const changed = source.replace(
      section[0],
      `<section class="accordion--course-instances">${Array.from({ length: count }, (_, index) =>
        section[1]!.replace('TEST001', `TEST00${index + 1}`),
      ).join('')}</section>`,
    );
    if (count === 4)
      assert.throws(
        () => courseFromFreshHtml(changed, url, title, requiredPanels),
        (error) => error instanceof StudyError && error.code === 'SITE_CHANGED',
      );
    else {
      const raw = courseFromFreshHtml(changed, url, title, requiredPanels);
      assert.equal(raw.dates_found, count);
      assert.equal(raw.offerings.length, count);
      assert.equal(
        raw.offerings.at(-1)!.fields.find((field) => field.label === 'Course code')!.value,
        `TEST00${count}`,
      );
      assert.ok(raw.offerings.every((offering) => offering.status === ''));
    }
  }
});

test('comparison preserves per-course fallback provenance and unknown source availability', async () => {
  const secondUrl = `${ORIGIN}/courses/offline-fallback-two`;
  const first = provider();
  const second = provider(html(), navigation(secondUrl), undefined, undefined, secondUrl);
  const web: WebProvider = {
    fetchHtml: (target, signal) => (target === url ? first : second).web.fetchHtml(target, signal),
    expandCourse: (target, panels, signal) =>
      (target === url ? first : second).web.expandCourse(target, panels, signal),
    agent: () => assert.fail('Comparison recovery must not start an Agent'),
  };
  const result = toolDefinitions.compare_courses.output.parse(
    await new StudyWindow(web).call('compare_courses', {
      courses: [url, secondUrl],
      budget: { amount: 400, currency: 'GBP' },
    }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) assert.fail('Expected typed comparison');
  for (const row of result.data.results) {
    assert.equal(row.course.retrieval?.mode, 'fresh_fetch_fallback');
    assert.deepEqual(
      row.course.evidence.map((receipt) => receipt.endpoint),
      ['fetch'],
    );
    assert.equal(
      row.offerings[0]!.findings.find((finding) => finding.criterion === 'source')!.status,
      'unknown',
    );
    assert.equal(row.outcome, 'needs_information');
  }
  assert.deepEqual(first.calls, ['fetch', 'browser']);
  assert.deepEqual(second.calls, ['fetch', 'browser']);
});
