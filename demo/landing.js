'use strict';
const $ = (id) => document.getElementById(id);
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let example = null;
let currentTour = 'discover';
const date = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || '')
    ? new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(new Date(value + 'T12:00:00Z'))
    : 'Not published';
function safeSource(value) {
  try {
    const u = new URL(value);
    return u.origin === 'https://www.pace.cam.ac.uk' &&
      /^\/courses\/[a-z0-9-]+$/.test(u.pathname) &&
      !u.search &&
      !u.hash &&
      !u.username &&
      !u.password
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function settle(el) {
  if (!reduced.matches && el.animate)
    el.animate(
      [
        { opacity: 0.45, transform: 'translateY(7px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 240, easing: 'cubic-bezier(.2,0,0,1)' },
    );
}
function tabs(selector, onChange) {
  const buttons = [...document.querySelectorAll(selector + ' [role=tab]')];
  function select(button, focus = false) {
    buttons.forEach((b) => {
      b.setAttribute('aria-selected', String(b === button));
      b.tabIndex = b === button ? 0 : -1;
    });
    if (focus) button.focus();
    onChange(button);
  }
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button));
    button.addEventListener('keydown', (event) => {
      let next;
      if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % buttons.length;
      if (['ArrowLeft', 'ArrowUp'].includes(event.key))
        next = (index + buttons.length - 1) % buttons.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = buttons.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        select(buttons[next], true);
      }
    });
  });
}
tabs('.lp-preview-tabs', (button) => {
  for (const name of ['week', 'facts']) $(name + '-panel').hidden = button.id !== name + '-tab';
  settle($(button.getAttribute('aria-controls')));
});
const days = [...document.querySelectorAll('.lp-week button')];
days.forEach((button) =>
  button.addEventListener('click', () => {
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    const count = days.filter((b) => b.getAttribute('aria-pressed') === 'true').length;
    $('week-note').textContent =
      `${count} possible ${count === 1 ? 'day' : 'days'}. Teaching times still need confirmation.`;
  }),
);
function updateBudget() {
  const amount = Number($('preview-budget').value);
  $('budget-value').textContent = `£${amount.toLocaleString('en-GB')}`;
  if (!example) return;
  const fee = example.fee.amount,
    conflict = fee > amount;
  $('budget-feedback').classList.toggle('is-conflict', conflict);
  $('budget-result').textContent = conflict
    ? `£${(fee - amount).toLocaleString('en-GB')} above this budget`
    : 'The published Home fee fits this budget';
  $('budget-hint').textContent = conflict
    ? 'Compare another course or adjust the tuition budget.'
    : `£${(amount - fee).toLocaleString('en-GB')} below your limit. Confirm fee eligibility and total study time.`;
}
$('preview-budget').addEventListener('input', updateBudget);
// Templates contain only authored markup. Source text is assigned through textContent below.
const tourTemplates = {
  discover: `<p class="tour-eyebrow">FOLLOW YOUR CURIOSITY</p><h3>Start with a subject.</h3><div class="tour-search"><span>⌕ Psychology</span><span>Online learning ▾</span></div><div class="tour-row"><span>◇</span><div><strong data-bind="title"></strong><small>Cambridge PACE · recorded example</small></div><b>↗</b></div><div class="tour-row"><span>✳</span><div><strong data-bind="other"></strong><small>Cambridge PACE · recorded example</small></div><b>↗</b></div><p class="tour-note">↗ Select a small shortlist. Inspect the details before deciding.</p>`,
  inspect: `<p class="tour-eyebrow">LOOK BEYOND THE TITLE</p><h3 data-bind="title"></h3><div class="tour-fact-grid"><div class="tour-fact"><span>Published Home fee</span><strong data-bind="fee"></strong><small>GBP · per course</small></div><div class="tour-fact"><span>Duration</span><strong data-bind="duration"></strong></div><div class="tour-fact"><span>Application deadline</span><strong data-bind="deadline"></strong></div><div class="tour-fact"><span>Start date</span><strong data-bind="start"></strong></div></div><p class="tour-note">? A complete teaching schedule is still not established.</p>`,
  compare: `<p class="tour-eyebrow">MAKE THE QUESTIONS VISIBLE</p><h3>Interesting. Now check the fit.</h3><div class="tour-compare"><div><span>Home fee against £500</span><span class="tour-status" data-bind="budget"></span></div><div><span>Total weekly workload</span><span class="tour-status unknown">Needs confirmation</span></div><div><span>Friday commitments</span><span class="tour-status unknown">Needs confirmation</span></div></div><p class="tour-note">Matches describe individual facts. They do not guarantee admission or a suitable schedule.</p>`,
};
function renderTour(name, animate = false) {
  currentTour = name;
  const content = $('tour-content');
  $('tour-panel').setAttribute('aria-labelledby', name + '-tab');
  if (!example) {
    content.textContent =
      'Recorded evidence is loading. Live retrieval starts only with an explicit action in the workspace.';
    return;
  }
  content.innerHTML = tourTemplates[name];
  const { course, offering, fee, other } = example;
  const values = {
    title: course.title,
    other: other?.title || 'Explore another course in the workspace',
    fee: `£${fee.amount}`,
    duration: offering.duration.value || 'Not stated',
    deadline: date(offering.deadline_date),
    start: date(offering.start_date),
    budget: fee.amount <= 500 ? 'Within budget' : 'Over budget',
  };
  content
    .querySelectorAll('[data-bind]')
    .forEach((el) => (el.textContent = values[el.dataset.bind]));
  if (fee.amount > 500) content.querySelector('[data-bind=budget]')?.classList.add('unknown');
  if (animate) settle(content);
}
tabs('.lp-tour-tabs', (button) => renderTour(button.dataset.tour, true));
renderTour('discover');
async function loadExample() {
  try {
    const response = await fetch('/api/saved', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const saved = await response.json();
    if (saved.kind !== 'saved_live_receipts' || !Array.isArray(saved.items)) throw new Error();
    const courses = saved.items
      .filter((i) => i.result?.ok)
      .flatMap((i) =>
        i.tool === 'inspect_course'
          ? [i.result.data]
          : i.tool === 'compare_courses'
            ? i.result.data.results.map((r) => r.course)
            : [],
      );
    const course = courses.filter((c) => c.id === 'learning-and-memory-brain').at(-1),
      offering = course?.offerings?.[0],
      fee = offering?.fees?.find(
        (f) => f.category === 'home' && f.currency === 'GBP' && f.basis === 'course',
      );
    if (
      !course ||
      !offering ||
      !fee ||
      !safeSource(course.url) ||
      !Number.isFinite(fee.amount) ||
      !Number.isFinite(Date.parse(course.checked_at))
    )
      throw new Error();
    example = {
      course,
      offering,
      fee,
      other: courses.find((c) => c.id === 'introduction-cognitive-psychology-and-neuropsychology'),
    };
    $('preview-title').textContent = course.title;
    $('preview-course-meta').textContent =
      `£${fee.amount} Home fee · ${offering.duration.value || 'Duration not stated'}`;
    $('preview-mode').textContent = offering.study_mode.value || 'Not published';
    $('preview-dates').textContent = date(offering.start_date) + ' – ' + date(offering.end_date);
    $('preview-deadline').textContent = date(offering.deadline_date);
    const link = document.createElement('a');
    link.textContent = 'Cambridge source ↗';
    link.href = safeSource(course.url);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const checked = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(course.checked_at));
    $('preview-source').replaceChildren(
      link,
      document.createTextNode(` · Recorded ${checked}. Fees and availability can change.`),
    );
    updateBudget();
    renderTour(currentTour);
  } catch {
    $('preview-title').textContent = 'Recorded preview unavailable';
    $('preview-course-meta').textContent = 'Open the workspace to retrieve course evidence.';
    $('budget-result').textContent = 'Set your preferences to get started';
    $('budget-hint').textContent =
      'No course fit has been established. This preview makes no live call.';
    $('tour-content').textContent =
      'Recorded evidence could not be opened. No substitute course data was loaded.';
  }
}
void loadExample();
let observer;
if (!reduced.matches && 'IntersectionObserver' in window) {
  document.body.classList.add('motion-ready');
  observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      }),
    { threshold: 0.08 },
  );
  document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
}
reduced.addEventListener('change', () => {
  if (reduced.matches) {
    observer?.disconnect();
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'));
    document.getAnimations().forEach((a) => a.cancel());
  }
});
