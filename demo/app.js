'use strict';

const $ = (id) => document.getElementById(id);
const state = {
  status: null,
  selected: new Map(),
  search: null,
  searchInput: null,
  controller: null,
  loadingSaved: false,
  saved: false,
  savedItems: [],
  recorded: {},
  savedCourses: new Map(),
  view: 'grid',
  searchSaved: false,
  comparisonFingerprint: null,
  inspectorTrigger: null,
};
const modeLabels = {
  online: 'Online learning',
  in_person: 'In person teaching',
  face_to_face: 'Face to face teaching',
  hybrid: 'Hybrid (in person and online)',
  remote: 'Remote delivery',
};
const outcomeLabels = {
  potential_fit: 'Potential fit',
  conflict: 'Conflicts with your brief',
  needs_information: 'Needs information',
};
const criterionLabels = {
  budget: 'Tuition budget',
  mode: 'Study mode',
  deadline: 'Application deadline',
  course_dates: 'Course dates',
  availability: 'Your availability',
  requirements: 'Entry requirements',
  source: 'Source evidence',
};
const statusLabels = { match: 'Match', conflict: 'Conflict', unknown: 'Unknown' };
const errorMessages = {
  LIVE_DISABLED:
    'Live retrieval is disabled in this server. Enable it privately after reviewing the cost limit, or open saved evidence.',
  AUTHENTICATION:
    'TinyFish authentication needs attention. Credentials belong in the private server configuration.',
  ALLOWANCE_EXHAUSTED: 'The build allowance has been reached. No new Agent run will be started.',
  PROVIDER_QUOTA:
    'TinyFish reported a quota limit. The tool has not replaced the result with saved data.',
  PROVIDER_TIMEOUT:
    'TinyFish did not complete within the request limit. No substitute result was returned.',
  SITE_CHANGED:
    'The source no longer matches the expected contract. This needs inspection before the data can be trusted.',
  SITE_BLOCKED: 'The source could not be accessed normally. The request stopped.',
  BUSY: 'Another bounded operation is running. Wait for it to finish before retrying.',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function clear(node) {
  node.replaceChildren();
}
function date(value) {
  if (!value) return 'Not stated';
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? String(value)
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(parsed);
}
function timestamp(value) {
  if (!value) return 'Time not recorded';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? 'Time not recorded'
    : new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      }).format(parsed);
}
function safeSource(value) {
  try {
    const url = new URL(value);
    if (
      url.origin !== 'https://www.pace.cam.ac.uk' ||
      url.username ||
      url.password ||
      !/^\/(?:courses\/[a-z0-9-]+|node\/\d+|course-search)$/.test(url.pathname)
    )
      return null;
    return url.href;
  } catch {
    return null;
  }
}
function sourceLink(value, text = 'View original source ↗') {
  const url = safeSource(value);
  if (!url) return el('span', 'small-meta', 'Source link unavailable');
  const link = el('a', 'source-link', text);
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}
function money(amount, currency) {
  try {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
}
function showMessage(text, isError = false, title) {
  const box = $('message');
  clear(box);
  box.classList.toggle('is-error', isError);
  box.setAttribute('role', isError ? 'alert' : 'status');
  if (title) box.append(el('strong', null, title));
  box.append(el('span', null, text));
  box.hidden = false;
}
function hideMessage() {
  $('message').hidden = true;
}
function markSource(saved) {
  state.saved = saved;
  $('saved-notice').hidden = !Object.values(state.recorded).some(Boolean);
}
function markSectionSource(section, saved) {
  state.recorded[section] = saved;
  markSource(saved);
}
function animateIn(node) {
  if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  node.animate(
    [
      { opacity: 0.3, transform: 'translateY(9px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ],
    { duration: 240, easing: 'cubic-bezier(.2,0,0,1)' },
  );
}
let tabSequence = 0;
function offeringTabs(items, label, render) {
  const wrapper = el('div', 'offering-switcher');
  const tabs = el('div', 'offering-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', label);
  const panel = el('div', 'offering-tab-panel');
  panel.setAttribute('role', 'tabpanel');
  panel.tabIndex = 0;
  const id = `offering-tabs-${++tabSequence}`;
  panel.id = id;
  const buttons = items.map((item, index) => {
    const b = el('button', null, item.label);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.id = `${id}-${index}`;
    b.setAttribute('aria-controls', id);
    b.addEventListener('click', () => select(index));
    b.addEventListener('keydown', (event) => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % items.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = items.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        select(next);
        buttons[next].focus();
      }
    });
    tabs.append(b);
    return b;
  });
  function select(index) {
    buttons.forEach((b, i) => {
      b.setAttribute('aria-selected', String(i === index));
      b.tabIndex = i === index ? 0 : -1;
    });
    panel.setAttribute('aria-labelledby', buttons[index].id);
    panel.replaceChildren(render(items[index].value));
    animateIn(panel);
  }
  wrapper.append(tabs, panel);
  if (items.length) select(0);
  return wrapper;
}
function markComparisonDirty() {
  if (!$('comparison-section').hidden && state.comparisonFingerprint !== null)
    $('comparison-stale').hidden =
      JSON.stringify(comparisonInput()) === state.comparisonFingerprint;
}
function closeDrawer() {
  const dialog = $('detail-dialog');
  if (!dialog.open) return;
  dialog.close();
  const trigger = state.inspectorTrigger;
  if (trigger?.isConnected) trigger.focus();
  else $('results-title').focus();
}

function badge(status, label) {
  return el('span', `badge badge-${status}`, label || statusLabels[status] || status);
}
function focusResult(id) {
  const node = $(id);
  node.focus({ preventScroll: true });
  node.scrollIntoView({ block: 'nearest', behavior: 'auto' });
}

function canRetrieve(tool, count = 1) {
  const u = state.status?.usage;
  if (!state.status?.live_enabled || !u || u.halted !== false) return false;
  const values = [
    'max_usd',
    'total_reserved_usd',
    'agent_runs',
    'max_agent_runs',
    'browser_sessions',
    'max_browser_sessions',
    'fetch_urls',
    'max_fetch_urls',
    'agent_reservation_usd',
    'browser_reservation_usd',
  ];
  if (values.some((key) => typeof u[key] !== 'number' || !Number.isFinite(u[key]) || u[key] < 0))
    return false;
  const agents = tool === 'search_courses' ? 1 : 0;
  const browsers = tool === 'compare_courses' ? count : tool === 'search_courses' ? 0 : 1;
  const fetches = tool === 'health_check' ? 2 : tool === 'compare_courses' ? count : 1;
  const available = Math.round(u.max_usd * 1000) - Math.round(u.total_reserved_usd * 1000);
  const required = Math.round(
    (agents * u.agent_reservation_usd + browsers * u.browser_reservation_usd) * 1000,
  );
  return (
    required <= available &&
    u.agent_runs + agents <= u.max_agent_runs &&
    u.browser_sessions + browsers <= u.max_browser_sessions &&
    u.fetch_urls + fetches <= u.max_fetch_urls
  );
}
function refreshControls() {
  const busy = Boolean(state.controller || state.loadingSaved);
  document
    .querySelectorAll(
      '#search-form input, #search-form select, #compare-form input, #compare-form select',
    )
    .forEach((node) => {
      node.disabled = busy;
    });
  const search = canRetrieve('search_courses');
  document.querySelectorAll('#search-form button').forEach((node) => {
    node.disabled = busy || !search;
    node.title = search
      ? ''
      : 'The current live search allowance is unavailable. Explore the recorded example.';
  });
  document.querySelectorAll('.live-action').forEach((node) => {
    node.disabled = busy || !canRetrieve('inspect_course');
  });
  $('compare-button').disabled =
    busy || state.selected.size < 2 || !canRetrieve('compare_courses', state.selected.size);
  $('health-button').disabled = busy || !canRetrieve('health_check');
  $('saved-button').disabled = busy;
  $('previous-page').disabled =
    busy || !search || !state.search || state.search.pagination.page <= 0;
  $('next-page').disabled =
    busy || !search || !state.search || state.search.pagination.next_page === null;
  $('cancel-button').disabled = !state.controller;
  document
    .querySelectorAll('[data-topic], .recorded-inspect, .remove-selection')
    .forEach((node) => {
      node.disabled = busy;
    });
  $('allowance-hint').hidden = search;
  $('allowance-hint').textContent = state.status?.live_enabled
    ? 'Live search allowance reached. The recorded example remains interactive.'
    : 'Live search is unavailable. You can explore the recorded example.';
}

function setBusy(controller, text) {
  state.controller = controller;
  $('request-progress').hidden = !controller;
  $('request-label').textContent = text || '';
  $('results-section').setAttribute('aria-busy', String(Boolean(controller)));
  refreshControls();
}
async function refreshStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error('Status unavailable');
    const data = await response.json();
    state.status = data;
    const live = Boolean(data.live_enabled);
    const limited = live && !canRetrieve('search_courses');
    $('connection-label').textContent = live
      ? limited
        ? 'Limited live allowance · recorded examples available'
        : 'Live source checks ready'
      : 'Live source checks are off';
    $('connection-dot').className =
      `status-dot ${live ? 'is-live' : 'is-off'}${limited ? ' is-limited' : ''}`;
    if (data.usage) {
      const totalReserved =
        data.usage.total_reserved_usd ??
        Number(data.usage.agent_reserved_usd || 0) + Number(data.usage.browser_reserved_usd || 0);
      $('usage-label').textContent =
        `${Number(data.usage.agent_runs || 0)} Agent · ${Number(data.usage.browser_sessions || 0)} Browser sessions · $${Number(totalReserved).toFixed(3)} / $${Number(data.usage.max_usd || 0).toFixed(2)} reserved`;
    } else $('usage-label').textContent = 'Usage unavailable';
  } catch {
    state.status = { live_enabled: false };
    $('connection-label').textContent = 'Local server unavailable';
    $('connection-dot').className = 'status-dot is-off';
    $('usage-label').textContent = 'Usage unavailable';
  }
  refreshControls();
}
async function callTool(tool, input, label) {
  if (state.controller) return null;
  hideMessage();
  const controller = new AbortController();
  setBusy(controller, label);
  try {
    const response = await fetch('/api/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, input }),
      signal: controller.signal,
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      const code = result.error?.code || `HTTP_${response.status}`;
      showMessage(
        errorMessages[code] ||
          result.error?.message ||
          'The request did not return a valid result. No substitute data was shown.',
        true,
        code.replaceAll('_', ' '),
      );
      return null;
    }
    return result.data;
  } catch (error) {
    if (error.name === 'AbortError')
      showMessage(
        'Cancellation requested. The server stops its provider work where supported; any Agent reservation remains counted.',
        false,
        'Request cancelled',
      );
    else
      showMessage(
        'The local MCP request could not be completed. Check the server, then try again. Existing results retain their original timestamps.',
        true,
        'Connection interrupted',
      );
    return null;
  } finally {
    setBusy(null);
    await refreshStatus();
  }
}

function receiptsInto(container, receipts, saved = state.saved) {
  clear(container);
  for (const receipt of receipts || []) {
    const item = el('div', 'receipt');
    const top = el('div', 'receipt-topline');
    top.append(
      el('span', 'endpoint-label', `TinyFish ${receipt.endpoint}`),
      el(
        'span',
        null,
        `${saved ? 'Recorded retrieval' : 'Retrieved'} ${timestamp(receipt.checked_at)}`,
      ),
    );
    item.append(top);
    if (receipt.run_id)
      item.append(
        el(
          'div',
          null,
          `Run ${receipt.run_id}${receipt.steps !== null ? ` · ${receipt.steps} steps` : ''}`,
        ),
      );
    if (receipt.session_id) item.append(el('div', null, `Browser session ${receipt.session_id}`));
    item.append(sourceLink(receipt.source_url, 'Cambridge page ↗'));
    if (receipt.sha256) {
      const digest = el('div');
      digest.append(el('span', null, 'SHA-256 '), el('code', null, receipt.sha256));
      item.append(digest);
    }
    const hasEstimate = receipt.estimated_usd !== null && receipt.estimated_usd !== undefined;
    const cost =
      receipt.endpoint === 'agent'
        ? `Reserved $${Number(receipt.reserved_usd || 0).toFixed(3)}${hasEstimate ? ` · step-based estimate $${Number(receipt.estimated_usd).toFixed(3)}` : ' · final cost not recorded'}`
        : receipt.endpoint === 'browser'
          ? `Reserved $${Number(receipt.reserved_usd || 0).toFixed(3)}${hasEstimate ? ` · elapsed-time estimate $${Number(receipt.estimated_usd).toFixed(6)}` : ' · final cost not recorded'}`
          : receipt.endpoint === 'fetch'
            ? 'Fetch · $0 at the recorded pricing'
            : 'Endpoint cost not recorded';
    item.append(el('div', null, cost));
    container.append(item);
  }
  if (!receipts?.length) container.append(el('p', null, 'No retrieval receipt was provided.'));
}
function evidenceDetails(receipts, saved = state.saved) {
  const details = el('details', 'evidence-details');
  details.append(el('summary', null, 'Retrieval receipts'));
  const inner = el('div');
  receiptsInto(inner, receipts, saved);
  details.append(inner);
  return details;
}
function notices(items, heading) {
  if (!items?.length) return null;
  const box = el('div', 'notice-list');
  if (heading) box.append(el('strong', null, heading));
  for (const text of items) box.append(el('p', null, text));
  return box;
}

function renderSelection() {
  $('selection-count').textContent = `${state.selected.size} / 3`;
  $('nav-selection-count').textContent = String(state.selected.size);
  const container = $('selected-courses');
  clear(container);
  if (!state.selected.size)
    container.append(el('p', 'selection-empty', 'Select two or three courses to compare.'));
  for (const [id, course] of state.selected) {
    const row = el('div', 'selected-item');
    row.append(el('span', null, course.title));
    const remove = el('button', 'remove-selection', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${course.title} from shortlist`);
    remove.addEventListener('click', () => {
      state.selected.delete(id);
      renderSelection();
      syncSelectionChecks();
    });
    row.append(remove);
    container.append(row);
  }
  refreshControls();
  markComparisonDirty();
  animateIn(container);
}
function syncSelectionChecks() {
  document.querySelectorAll('input[data-course-id]').forEach((input) => {
    input.checked = state.selected.has(input.dataset.courseId);
    input.closest('.course-card')?.classList.toggle('is-selected', input.checked);
  });
}
function selectCourse(course, checked, checkbox) {
  if (checked && !state.selected.has(course.id) && state.selected.size >= 3) {
    checkbox.checked = false;
    showMessage(
      'Keep your comparison focused: select up to three courses. Remove one from the shortlist to add another.',
    );
    return;
  }
  if (checked) state.selected.set(course.id, course);
  else state.selected.delete(course.id);
  renderSelection();
  syncSelectionChecks();
}
function renderSearch(data, saved = false) {
  state.search = data;
  state.searchSaved = saved;
  markSectionSource('search', saved);
  const container = $('search-results');
  clear(container);
  $('results-title').textContent = `Courses for “${data.topic}”`;
  const page = data.pagination;
  $('results-meta').textContent =
    `${page.returned} shown · ${page.total_results} catalogue results${saved ? ' · recorded' : ''}`;
  $('search-time').hidden = false;
  $('search-time').textContent =
    `${saved ? 'Recorded search' : 'Fresh search'} · ${timestamp(data.checked_at)} · Sort and view apply to this page only.`;
  if (!data.courses.length) {
    const empty = el('div', 'empty-state');
    empty.append(
      el('h3', null, 'No courses in this window.'),
      el(
        'p',
        null,
        'The source returned a valid empty search. Try one broader subject or a different study mode.',
      ),
    );
    container.append(empty);
  } else {
    const list = el('div', `course-list${state.view === 'list' ? ' is-list' : ''}`);
    const rows = [...data.courses];
    const sort = $('sort-results').value;
    if (sort === 'title') rows.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'start')
      rows.sort((a, b) => (a.start_date || '9999').localeCompare(b.start_date || '9999'));
    for (const [index, course] of rows.entries()) {
      const card = el(
        'article',
        `course-card${state.selected.has(course.id) ? ' is-selected' : ''}`,
      );
      const art = el('div', `card-art art-${index % 4}`);
      art.append(el('span', 'course-type', course.course_type || 'Continuing education'));
      const glyph = el('i', 'subject-glyph', ['⌑', '◌', '↗', '✳'][index % 4]);
      glyph.setAttribute('aria-hidden', 'true');
      art.append(glyph);
      const label = el('label', 'select-course');
      const check = el('input');
      check.type = 'checkbox';
      check.dataset.courseId = course.id;
      check.checked = state.selected.has(course.id);
      check.setAttribute('aria-label', `Shortlist ${course.title}`);
      check.addEventListener('change', () => selectCourse(course, check.checked, check));
      const plus = el('span', null, '+');
      plus.setAttribute('aria-hidden', 'true');
      label.append(check, plus);
      card.append(art, label);
      const body = el('div', 'card-body');
      body.append(el('h3', null, course.title));
      const meta = el('div', 'course-meta');
      meta.append(
        el('span', null, `${date(course.start_date)} — ${date(course.end_date)}`),
        el('span', null, course.study_mode || 'Study mode not inspected'),
      );
      body.append(meta);
      card.append(body);
      const foot = el('div', 'course-card-footer');
      const inspect = el('button', 'text-button live-action', 'Inspect details ↗');
      inspect.type = 'button';
      inspect.addEventListener('click', async () => {
        state.inspectorTrigger = inspect;
        const detail = await callTool(
          'inspect_course',
          { course: course.id },
          `Reading dates and fees for ${course.title}…`,
        );
        if (detail) renderCourse(detail, false);
      });
      foot.append(inspect, sourceLink(course.url, 'Source ↗'));
      const recorded = state.savedCourses.get(course.id);
      if (recorded) {
        const replay = el('button', 'recorded-inspect', 'Recorded inspection');
        replay.type = 'button';
        replay.addEventListener('click', () => {
          state.inspectorTrigger = replay;
          renderCourse(recorded, true);
        });
        foot.append(replay);
      }
      card.append(foot);
      list.append(card);
    }
    container.append(list);
    animateIn(list);
  }
  $('pagination').hidden = !data.courses.length || (page.page === 0 && page.next_page === null);
  $('page-label').textContent =
    `Source page ${page.page + 1}${page.omitted_on_page ? ` · ${page.omitted_on_page} more on this page` : ''}`;
  $('search-evidence').hidden = false;
  receiptsInto($('search-receipts'), data.evidence, saved);
  if (data.warnings?.length) {
    const warning = notices(data.warnings, 'Coverage note');
    if (warning) container.append(warning);
  }
  refreshControls();
}
async function search(page = 0, keepQuery = false) {
  const input =
    keepQuery && state.searchInput
      ? { ...state.searchInput, page }
      : { topic: $('topic').value.trim(), page, limit: Number($('limit').value) };
  if (!keepQuery && $('search-mode').value) input.study_mode = $('search-mode').value;
  const data = await callTool(
    'search_courses',
    input,
    `Searching the live catalogue for ${input.topic}…`,
  );
  if (data) {
    state.searchInput = input;
    renderSearch(data);
    focusResult('results-title');
  }
}
function factBlock(title, fact, missing = 'Not stated in the retrieved source.') {
  const block = el('div', 'detail-fact');
  block.append(
    el('h4', null, title),
    el('p', fact?.value ? null : 'unknown-copy', fact?.value || missing),
  );
  if (fact?.source_url) block.append(sourceLink(fact.source_url));
  return block;
}
function addOfferingFact(container, title, value) {
  const pair = el('div');
  pair.append(el('dt', null, title), el('dd', null, value || 'Not stated'));
  container.append(pair);
}
function offeringCard(offering) {
  const card = el('article', 'offering-card');
  card.append(
    el('h4', null, 'Course dates'),
    el('div', 'date-range', `${date(offering.start_date)} — ${date(offering.end_date)}`),
  );
  const facts = el('dl', 'offering-facts');
  addOfferingFact(
    facts,
    'Application deadline',
    offering.deadline_date ? date(offering.deadline_date) : offering.deadline?.value,
  );
  addOfferingFact(facts, 'Source availability', offering.status?.value);
  addOfferingFact(facts, 'Study mode', offering.study_mode?.value);
  addOfferingFact(facts, 'Duration', offering.duration?.value);
  addOfferingFact(facts, 'Location', offering.location?.value);
  const fees = el('div');
  fees.append(el('dt', null, 'Tuition fees'));
  const dd = el('dd');
  const list = el('ul', 'fee-list');
  for (const fee of offering.fees || []) {
    const item = el('li', null, `${money(fee.amount, fee.currency)} · ${fee.category}`);
    item.append(
      el(
        'small',
        null,
        fee.basis === 'course'
          ? 'Per course'
          : fee.basis === 'year'
            ? 'Per year; total cost not established'
            : 'Fee basis not established',
      ),
    );
    list.append(item);
  }
  if (!offering.fees?.length) list.append(el('li', null, 'Not stated'));
  dd.append(list);
  fees.append(dd);
  facts.append(fees);
  card.append(facts);
  const missing = notices(
    offering.missing_fields?.map((field) => `Not established: ${field.replaceAll('_', ' ')}`),
  );
  if (missing) card.append(missing);
  const conflicts = notices(offering.conflicts, 'Conflicting source evidence');
  if (conflicts) card.append(conflicts);
  return card;
}
function courseRetrievalNotice(course) {
  if (course.retrieval?.mode !== 'fresh_fetch_fallback') return null;
  const notice = el('aside', 'retrieval-notice');
  notice.setAttribute('aria-label', 'Retrieval limitation');
  notice.append(
    el('strong', null, 'Read from fresh page HTML'),
    el(
      'p',
      null,
      'Browser navigation failed. These details came from a fresh Fetch of this same course page. Live availability could not be checked.',
    ),
    el(
      'p',
      'small-meta',
      `Browser failure: ${course.retrieval.browser_failure.network_code} · ${timestamp(course.retrieval.browser_failure.checked_at)}`,
    ),
  );
  return notice;
}
function renderCourse(course, saved = false) {
  markSectionSource('detail', saved);
  $('detail-section').hidden = false;
  $('detail-title').textContent = course.title;
  const container = $('course-detail');
  clear(container);
  const overview = el('div', 'detail-overview');
  const time = el('div');
  time.append(
    el(
      'span',
      null,
      `${saved ? 'Recorded inspection' : 'Fresh inspection'} · ${timestamp(course.checked_at)}`,
    ),
  );
  overview.append(time, sourceLink(course.url, 'Open Cambridge course page ↗'));
  container.append(overview);
  const retrievalNotice = courseRetrievalNotice(course);
  if (retrievalNotice) container.append(retrievalNotice);
  container.append(
    offeringTabs(
      course.offerings.map((o) => ({ label: date(o.start_date), value: o })),
      'Course date offerings',
      offeringCard,
    ),
  );
  const facts = el('div', 'detail-facts');
  facts.append(
    factBlock('Entry requirements', course.requirements),
    factBlock('Teaching commitments', course.teaching),
  );
  const hours = course.weekly_hours
    ? `${course.weekly_hours.min === course.weekly_hours.max ? course.weekly_hours.max : `${course.weekly_hours.min}–${course.weekly_hours.max}`} hours per week, as stated in the source.`
    : 'Total weekly study hours are not established.';
  facts.append(
    factBlock('What still needs confirming', {
      value: `${hours} ${course.schedule_complete ? 'The source provides the supported schedule fields.' : 'The complete teaching schedule is not established. Online or flexible delivery alone does not establish compatibility.'}`,
      source_url: course.url,
    }),
  );
  const extra = el('details', 'detail-questions');
  extra.append(el('summary', null, 'Missing fields & source cautions'));
  const missing = notices(
    course.missing_fields?.map((f) => `Not established: ${f.replaceAll('_', ' ')}`),
  );
  if (missing) extra.append(missing);
  const warnings = notices(course.warnings, 'Read before deciding');
  if (warnings) extra.append(warnings);
  facts.append(extra);
  container.append(facts, evidenceDetails(course.evidence, saved));
  const dialog = $('detail-dialog');
  if (!dialog.open) dialog.showModal();
  $('detail-title').focus({ preventScroll: true });
  dialog.scrollTop = 0;
}
function findingBlock(finding) {
  const block = el('div', 'finding');
  const head = el('div', 'finding-heading');
  head.append(
    el('strong', null, criterionLabels[finding.criterion] || finding.criterion),
    badge(finding.status),
  );
  block.append(head, el('p', null, finding.explanation));
  if (finding.quote || finding.source_urls?.length) {
    const details = el('details');
    details.append(el('summary', null, 'See evidence'));
    if (finding.quote) details.append(el('blockquote', null, finding.quote));
    for (const url of finding.source_urls || []) details.append(sourceLink(url));
    block.append(details);
  }
  return block;
}
function renderComparison(data, saved = false, input = null) {
  markSectionSource('comparison', saved);
  $('comparison-section').hidden = false;
  $('comparison-time').textContent =
    `${saved ? 'RECORDED COMPARISON' : 'FRESH COMPARISON'} · ${timestamp(data.checked_at)}`;
  state.comparisonFingerprint = input ? JSON.stringify(input) : null;
  $('comparison-stale').hidden = true;
  const container = $('comparison-results');
  clear(container);
  const grid = el('div', 'comparison-grid');
  const outcomeStatus = (outcome) =>
    outcome === 'conflict' ? 'conflict' : outcome === 'potential_fit' ? 'match' : 'unknown';
  for (const result of data.results || []) {
    const card = el('article', 'comparison-card');
    const course = result.course;
    card.append(
      badge(outcomeStatus(result.outcome), outcomeLabels[result.outcome] || result.outcome),
      el('h3', null, course.title),
      sourceLink(course.url, 'Cambridge source ↗'),
    );
    const retrievalNotice = courseRetrievalNotice(course);
    if (retrievalNotice) card.append(retrievalNotice);
    const offerings = result.offerings.map((offering) => {
      const detail = course.offerings.find((o) => o.id === offering.offering_id);
      return {
        label: detail ? date(detail.start_date) : offering.offering_id,
        value: { offering, detail },
      };
    });
    card.append(
      offeringTabs(offerings, `${course.title} offerings`, ({ offering, detail }) => {
        const section = el('div', 'comparison-offering');
        const head = el('div', 'offering-outcome');
        head.append(
          el(
            'span',
            null,
            detail ? `${date(detail.start_date)} to ${date(detail.end_date)}` : 'Course offering',
          ),
          badge(outcomeStatus(offering.outcome), outcomeLabels[offering.outcome]),
        );
        section.append(head);
        const grouped = new Map();
        for (const finding of offering.findings || []) {
          if (!grouped.has(finding.criterion)) grouped.set(finding.criterion, []);
          grouped.get(finding.criterion).push(finding);
        }
        for (const [criterion, findings] of grouped) {
          const group = el('details', 'criterion-group');
          const status = findings.some((f) => f.status === 'conflict')
            ? 'conflict'
            : findings.some((f) => f.status === 'unknown')
              ? 'unknown'
              : 'match';
          group.dataset.status = status;
          const summary = el('summary');
          summary.append(
            el('strong', null, criterionLabels[criterion] || criterion),
            badge(status),
          );
          group.append(summary);
          for (const finding of findings) group.append(findingBlock(finding));
          section.append(group);
        }
        if ([...grouped.values()].every((fs) => fs.every((f) => f.status === 'match'))) {
          const note = el(
            'p',
            'no-attention',
            'No conflicts or questions in the published findings for this offering. Admission and availability still need confirmation.',
          );
          section.append(note);
        }
        return section;
      }),
    );
    card.append(evidenceDetails(course.evidence, saved));
    grid.append(card);
  }
  container.append(grid);
  container.classList.toggle('attention-filter', $('attention-only').checked);
  animateIn(grid);
  const caveats = $('comparison-caveats');
  clear(caveats);
  caveats.append(
    el(
      'p',
      null,
      `Compared with a tuition budget of ${money(data.budget.amount, data.budget.currency)}${data.budget.fee_category ? ` using the ${data.budget.fee_category} fee category` : '; fee category was not specified'}.`,
    ),
  );
  for (const text of data.caveats || []) caveats.append(el('p', null, text));
}
function comparisonInput() {
  const budget = {
    amount: Number($('budget').value),
    currency: $('currency').value.trim().toUpperCase(),
  };
  if ($('fee-category').value) budget.fee_category = $('fee-category').value;
  const input = {
    courses: [...state.selected.keys()],
    budget,
    study_modes: $('preferred-mode').value ? [$('preferred-mode').value] : [],
  };
  const availability = {
    unavailable_weekdays: [...document.querySelectorAll('input[name="unavailable"]:checked')].map(
      (node) => node.value,
    ),
  };
  if ($('hours').value) availability.max_hours_per_week = Number($('hours').value);
  if ($('earliest-date').value) availability.earliest_start_date = $('earliest-date').value;
  if ($('latest-date').value) availability.latest_end_date = $('latest-date').value;
  if (availability.unavailable_weekdays.length || Object.keys(availability).length > 1)
    input.availability = availability;
  return input;
}
function renderHealth(data, saved = false) {
  markSectionSource('health', saved);
  $('health-section').hidden = false;
  const container = $('health-results');
  clear(container);
  container.append(
    el(
      'p',
      'small-meta',
      `${saved ? 'RECORDED CHECK' : 'LIVE CHECK'} · ${timestamp(data.checked_at)}`,
    ),
  );
  if (data.status === 'degraded') {
    const notice = el('aside', 'retrieval-notice');
    notice.append(
      el('strong', null, 'Source check needs attention'),
      el(
        'p',
        null,
        'Some source checks failed. Fresh page HTML may still be readable, but browser access and dynamic availability have not been confirmed.',
      ),
    );
    container.append(notice);
  }
  const checks = el('ul', 'health-checks');
  for (const check of data.checks || []) {
    const row = el('li');
    const passed = check.passed === true;
    const label = passed ? 'Passed' : check.passed === false ? 'Failed' : 'Not verified';
    row.className = passed ? 'check-passed' : 'check-failed';
    row.append(
      el('strong', null, `${label}: ${check.name.replaceAll('_', ' ')}`),
      el('p', null, check.detail),
    );
    checks.append(row);
  }
  container.append(
    checks,
    el('p', 'caveats', data.coverage),
    evidenceDetails(data.evidence, saved),
  );
}
async function openSaved() {
  if (state.controller || state.loadingSaved) return;
  state.loadingSaved = true;
  refreshControls();
  hideMessage();
  $('saved-button').disabled = true;
  try {
    const response = await fetch('/api/saved', { cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const data = await response.json();
    if (data.kind !== 'saved_live_receipts' || !Array.isArray(data.items))
      throw new Error('Unrecognized saved evidence');
    const items = data.items.filter((i) => i.result?.ok);
    if (!items.length) {
      showMessage('No recorded live results are available yet. No fixture has been substituted.');
      return;
    }
    resetWorkspace();
    state.savedItems = items;
    state.savedCourses.clear();
    for (const item of items) {
      const courses =
        item.tool === 'inspect_course'
          ? [item.result.data]
          : item.tool === 'compare_courses'
            ? item.result.data.results.map((r) => r.course)
            : [];
      for (const course of courses) {
        const old = state.savedCourses.get(course.id);
        if (!old || old.checked_at < course.checked_at) state.savedCourses.set(course.id, course);
      }
    }
    const lastSearch = items.filter((i) => i.tool === 'search_courses').at(-1);
    if (lastSearch) {
      $('topic').value = lastSearch.input?.topic || lastSearch.result.data.topic;
      $('search-mode').value = lastSearch.input?.study_mode || '';
      state.searchInput = {
        topic: lastSearch.result.data.topic,
        page: lastSearch.result.data.pagination.page,
        limit: lastSearch.input?.limit || 6,
      };
      if (lastSearch.result.data.study_mode)
        state.searchInput.study_mode = lastSearch.result.data.study_mode;
      renderSearch(lastSearch.result.data, true);
    }
    const comparison = items.filter((i) => i.tool === 'compare_courses').at(-1);
    if (comparison) {
      const input = comparison.input;
      for (const result of comparison.result.data.results)
        state.selected.set(result.course.id, result.course);
      $('budget').value = input.budget.amount;
      $('currency').value = input.budget.currency;
      $('fee-category').value = input.budget.fee_category || '';
      $('preferred-mode').value = input.study_modes?.[0] || '';
      $('hours').value = input.availability?.max_hours_per_week || '';
      $('earliest-date').value = input.availability?.earliest_start_date || '';
      $('latest-date').value = input.availability?.latest_end_date || '';
      document.querySelectorAll('input[name="unavailable"]').forEach((n) => {
        n.checked = Boolean(input.availability?.unavailable_weekdays?.includes(n.value));
      });
      renderSelection();
      syncSelectionChecks();
      renderComparison(comparison.result.data, true, comparisonInput());
    }
    const health = items.filter((i) => i.tool === 'health_check').at(-1);
    if (health) renderHealth(health.result.data, true);
    showMessage(
      'Explore this recorded psychology shortlist. Open a recorded inspection or search for your own subject.',
      false,
      'Recorded example',
    );
    focusResult(lastSearch ? 'results-title' : 'comparison-title');
  } catch {
    showMessage(
      'Recorded evidence could not be opened. No live request was made and no fixture was substituted.',
      true,
      'Recorded example unavailable',
    );
  } finally {
    state.loadingSaved = false;
    await refreshStatus();
  }
}
function resetWorkspace() {
  closeDrawer();
  state.recorded = {};
  state.comparisonFingerprint = null;
  markSource(false);
  state.search = null;
  state.searchInput = null;
  state.searchSaved = false;
  state.savedCourses.clear();
  $('search-time').hidden = true;
  state.selected.clear();
  renderSelection();
  $('detail-section').hidden = true;
  $('comparison-section').hidden = true;
  $('health-section').hidden = true;
  $('pagination').hidden = true;
  $('search-evidence').hidden = true;
  $('results-title').textContent = 'Your possibilities';
  $('results-meta').textContent = 'Start with a subject';
  const empty = el('div', 'empty-state');
  empty.append(
    el('h3', null, 'What would you like to make room for?'),
    el('p', null, 'Search a subject to retrieve a fresh slice of the Cambridge catalogue.'),
  );
  $('search-results').replaceChildren(empty);
}

$('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (event.currentTarget.reportValidity()) void search(0);
});
$('compare-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const input = comparisonInput();
  const data = await callTool(
    'compare_courses',
    input,
    `Retrieving fresh details for ${input.courses.length} shortlisted courses…`,
  );
  if (data) {
    renderComparison(data, false, input);
    focusResult('comparison-title');
  }
});
$('previous-page').addEventListener('click', () => {
  if (state.search) void search(Math.max(0, state.search.pagination.page - 1), true);
});
$('next-page').addEventListener('click', () => {
  if (state.search && state.search.pagination.next_page !== null)
    void search(state.search.pagination.next_page, true);
});
$('health-button').addEventListener('click', async () => {
  const data = await callTool('health_check', {}, 'Checking live catalogue and course contracts…');
  if (data) {
    renderHealth(data);
    focusResult('health-title');
  }
});
$('cancel-button').addEventListener('click', () => state.controller?.abort());
$('saved-button').addEventListener('click', () => void openSaved());
$('leave-saved').addEventListener('click', () => {
  resetWorkspace();
  markSource(false);
  hideMessage();
  $('topic').focus();
});
$('close-details').addEventListener('click', closeDrawer);
$('detail-dialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  closeDrawer();
});
$('currency').addEventListener('input', () => {
  $('currency').value = $('currency')
    .value.toUpperCase()
    .replace(/[^A-Z]/g, '');
});
document.querySelectorAll('[data-topic]').forEach((button) =>
  button.addEventListener('click', () => {
    $('topic').value = button.dataset.topic;
    $('topic').focus();
    animateIn($('search-form'));
  }),
);
$('empty-example').addEventListener('click', () => void openSaved());
$('sort-results').addEventListener('change', () => {
  if (state.search) renderSearch(state.search, state.searchSaved);
});
for (const view of ['grid', 'list'])
  $(view + '-view').addEventListener('click', () => {
    state.view = view;
    $('grid-view').setAttribute('aria-pressed', String(view === 'grid'));
    $('list-view').setAttribute('aria-pressed', String(view === 'list'));
    if (state.search) renderSearch(state.search, state.searchSaved);
  });
$('attention-only').addEventListener('change', () => {
  $('comparison-results').classList.toggle('attention-filter', $('attention-only').checked);
});
$('compare-form').addEventListener('input', markComparisonDirty);
$('compare-form').addEventListener('change', markComparisonDirty);
const params = new URLSearchParams(location.search);
const topic = params.get('topic');
if (topic && topic.length <= 100) $('topic').value = topic;
animateIn(document.querySelector('.workspace-heading'));
void refreshStatus().then(() => {
  if (params.get('recorded') === '1') return openSaved();
});
