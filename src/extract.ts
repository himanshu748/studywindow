import { load } from 'cheerio';
import { z } from 'zod';
import { StudyError } from './errors.js';
import { courseUrl, courseId, ORIGIN } from './urls.js';
import {
  Course,
  SearchOutput,
  modeLabels,
  modeValues,
  type SearchArgs,
  type ReceiptData,
  type CourseData,
} from './schemas.js';
import {
  summarizeRequirements,
  summarizeTeaching,
  totalWeeklyHours,
  scheduledWeekdaysFromTeaching,
} from './text-facts.js';
export const RawSearch = z
  .object({
    page_url: z.string().max(600),
    title: z.string().max(300),
    search_operated: z.boolean(),
    blocked: z.boolean(),
  })
  .strict();
export const RawCourse = z
  .object({
    page_url: z.string().max(500),
    title: z.string().max(300),
    blocked: z.boolean(),
    offerings: z
      .array(
        z.object({
          date_label: z.string().max(200),
          fields: z
            .array(
              z.object({
                label: z.enum([
                  'Course fee',
                  'Study mode',
                  'Application Deadline',
                  'Duration',
                  'Course code',
                  'Location',
                  'Credits',
                  'Course type',
                ]),
                value: z.string().max(1500),
              }),
            )
            .min(3)
            .max(20),
          status: z.string().max(200),
        }),
      )
      .max(3),
    panels: z.array(z.object({ label: z.string().max(100), text: z.string().max(12000) })).max(15),
    dates_found: z.number().int().min(0).max(3),
    all_details_loaded: z.boolean(),
  })
  .strict();
export function normalize(s: string): string {
  return s
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
export function parseDate(text: string): string | null {
  const m =
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(20\d{2})\b/i.exec(
      text,
    );
  if (!m) return null;
  const month =
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      m[2]!.slice(0, 3).toLowerCase(),
    ) + 1;
  const date = `${m[3]}-${String(month).padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  const d = new Date(date + 'T12:00:00Z');
  return !Number.isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === date ? date : null;
}
function dateTokens(text: string): string[] {
  return (
    text.match(
      /\b\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}\b/gi,
    ) ?? []
  );
}
export function dateRange(text: string): [string | null, string | null] {
  const dates = dateTokens(text);
  if (dates.length > 2) return [null, null];
  return [dates[0] ? parseDate(dates[0]) : null, dates[1] ? parseDate(dates[1]) : null];
}
export function parseSearch(html: string, args: SearchArgs, url: string, evidence: ReceiptData[]) {
  const $ = load(html);
  if (
    normalize($('h1').text()) !== 'Course search' ||
    !$('form[action="/course-search"]').length ||
    !$('select[name="field_method"]').length
  )
    throw new StudyError('SITE_CHANGED', 'The catalogue heading or filter structure changed.');
  if (normalize($('input[name="search_api_fulltext"]').attr('value') ?? '') !== args.topic)
    throw new StudyError('SITE_CHANGED', 'The source did not apply the requested search topic.');
  for (const value of Object.values(modeValues)) {
    if (!$(`select[name="field_method"] option[value="${value}"]`).length)
      throw new StudyError('SITE_CHANGED', 'Supported study-mode filters changed.');
  }
  const selectedValue = (name: string) => {
    const field = $(`select[name="${name}"]`);
    if (field.length !== 1)
      throw new StudyError('SITE_CHANGED', 'The catalogue filter structure changed.');
    return field.find('option[selected]').attr('value') ?? field.val();
  };
  const expectedMode = args.study_mode ? modeValues[args.study_mode] : 'All';
  if (selectedValue('field_method') !== expectedMode)
    throw new StudyError('SITE_CHANGED', 'The requested study-mode filter was not applied.');
  if (
    ['field_subject_categories', 'field_course_type'].some((name) => selectedValue(name) !== 'All')
  )
    throw new StudyError(
      'SITE_CHANGED',
      'An unrequested subject or course-type filter was applied.',
    );
  const count = normalize($('.search-listing__result-count').text());
  const match = /Showing (\d+) of (\d+) Results/i.exec(count);
  let total: number, shown: number;
  if (match) {
    shown = Number(match[1]);
    total = Number(match[2]);
  } else {
    const status = normalize($('[role="status"]').text());
    const srStatus = normalize($('.search-listing__sr-status[role="status"]').text());
    const emptyHeading = $('.search-no-results__heading');
    const currentEmpty =
      emptyHeading.length === 1 &&
      normalize(emptyHeading.text()) ===
        `Sorry, we couldn't find any results for "${args.topic}"` &&
      $('h2').filter((_, heading) => normalize($(heading).text()) === 'Course listing').length ===
        1 &&
      (!srStatus || /(?:^|\s)0 results found\.?$/i.test(srStatus));
    if (/^0 results found\.?$/i.test(status) || currentEmpty) {
      total = 0;
      shown = 0;
    } else
      throw new StudyError(
        'SITE_CHANGED',
        'The catalogue result-count contract changed; empty results cannot be established.',
      );
  }
  const cards = $('.card--listing').toArray();
  if (
    cards.length !== shown ||
    shown > 15 ||
    shown > total ||
    (total > 0 && shown === 0 && args.page === 0)
  )
    throw new StudyError('SITE_CHANGED', 'The result count disagrees with the course rows.');
  const rows = cards.map((el) => {
    const card = $(el);
    const a = card.find('h3 a');
    const title = normalize(a.text());
    const href = a.attr('href');
    if (!title || !href)
      throw new StudyError('SITE_CHANGED', 'A course row has no title or supported link.');
    const canonical = courseUrl(new URL(href, ORIGIN).href);
    const aDate = normalize(card.find('.card__date--start').text()),
      bDate = normalize(card.find('.card__date--end').text());
    return {
      id: courseId(canonical),
      title,
      url: canonical,
      start_date: parseDate(aDate),
      end_date: parseDate(bDate),
      date_quote: [aDate, bDate].filter(Boolean).join(' to '),
      study_mode: args.study_mode ? modeLabels[args.study_mode] : null,
      course_type: normalize(card.find('.card__label').text()) || null,
    };
  });
  const next = $('a')
    .filter((_, el) => normalize($(el).text()) === 'Next')
    .attr('href');
  let nextPage: number | null = null;
  if (next) {
    const u = new URL(next, url),
      p = Number(u.searchParams.get('page'));
    if (
      u.origin !== ORIGIN ||
      u.pathname !== '/course-search' ||
      !Number.isInteger(p) ||
      p !== args.page + 1
    )
      throw new StudyError('SITE_CHANGED', 'The catalogue pagination contract changed.');
    nextPage = p;
  }
  if (total > (args.page + 1) * 15 && nextPage === null)
    throw new StudyError('SITE_CHANGED', 'The catalogue has more results but no next-page link.');
  return SearchOutput.parse({
    topic: args.topic,
    study_mode: args.study_mode ?? null,
    source_url: url,
    checked_at: new Date().toISOString(),
    courses: rows.slice(0, args.limit),
    pagination: {
      page: args.page,
      page_size: 15,
      total_results: total,
      returned: Math.min(rows.length, args.limit),
      omitted_on_page: Math.max(0, rows.length - args.limit),
      next_page: nextPage,
      catalogue_complete: args.page === 0 && total <= args.limit,
    },
    evidence,
    warnings: [
      'Catalogue rows can represent different offerings of the same course; repeated ids refer to the same course page.',
      'Search returns a bounded source page. Inspect each course before relying on fees, application windows or teaching commitments.',
      ...(rows.length > args.limit
        ? [
            'Some rows on this page were omitted by the requested limit; raise limit to 15 to see them.',
          ]
        : []),
    ],
  });
}
export function courseTitle(html: string): string {
  const $ = load(html);
  const h1 = normalize($('h1').text());
  if (!h1 || !$('.accordion--course-instances').length)
    throw new StudyError('SITE_CHANGED', 'The course title or Course Dates structure is missing.');
  return h1;
}
export function parseFees(text: string, url: string): CourseData['offerings'][number]['fees'] {
  const result: CourseData['offerings'][number]['fees'] = [];
  const parts = text.split(/(?=\bHome\s*:|\bOverseas\s*:|\bInternational\s*:)/i);
  for (const part of parts) {
    for (const m of part.matchAll(/£\s*([0-9][0-9.,]*)/g)) {
      if (!/^(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]{1,2})?$/.test(m[1]!))
        throw new StudyError('SITE_CHANGED', 'A published fee has an invalid numeric format.');
      const amount = Number(m[1]!.replaceAll(',', ''));
      if (!Number.isFinite(amount))
        throw new StudyError('SITE_CHANGED', 'A published fee is not a finite amount.');
      const home = /\bhome\b/i.test(part),
        overseas = /\b(overseas|international)\b/i.test(part);
      const category =
        home && !overseas
          ? 'home'
          : overseas && !home
            ? 'overseas'
            : !home && !overseas && /^\s*£/.test(part)
              ? 'standard'
              : 'unknown';
      const basis = /\b(per year|a year|annual|year [12]|year one|year two|each year)\b/i.test(part)
        ? 'year'
        : /\b(deposit|instalment|installment|per term|per module)\b/i.test(part)
          ? 'unknown'
          : 'course';
      result.push({
        amount,
        currency: 'GBP',
        category,
        basis,
        quote: normalize(part),
        source_url: url,
      });
    }
  }
  return result;
}
export function parseCourse(
  rawInput: unknown,
  title: string,
  url: string,
  evidence: ReceiptData[],
): CourseData {
  const raw = RawCourse.parse(rawInput);
  if (raw.blocked)
    throw new StudyError(
      'SITE_BLOCKED',
      'The public course required authentication or refused access.',
    );
  if (courseUrl(raw.page_url) !== url || normalize(raw.title) !== normalize(title))
    throw new StudyError('SITE_CHANGED', 'Agent and Fetch disagree on course identity.');
  if (!raw.all_details_loaded || raw.dates_found !== raw.offerings.length)
    throw new StudyError(
      'SITE_CHANGED',
      'Not every course offering loaded; partial details cannot be treated as complete.',
    );
  const offerings = raw.offerings.map((o, index) => {
    const fields = o.fields.map((f) => ({
      label: normalize(f.label).toLowerCase().replace(/:$/, ''),
      value: normalize(f.value),
    }));
    if (
      !fields.some((f) => f.label === 'course fee') ||
      !fields.some((f) => f.label === 'study mode') ||
      !fields.some((f) => f.label === 'course code')
    )
      throw new StudyError('SITE_CHANGED', 'Expected course-detail labels are missing.');
    const conflicts: string[] = [];
    const fact = (label: string) => {
      const entries = fields.filter((f) => f.label === label);
      const values = [...new Set(entries.map((e) => e.value).filter(Boolean))];
      if (values.length > 1) conflicts.push(`Conflicting ${label}: ${values.join(' / ')}`);
      return {
        value: values.length === 1 ? values[0]! : null,
        quote: entries.length ? entries.map((e) => `${e.label}: ${e.value}`).join(' | ') : null,
        source_url: url,
      };
    };
    const [start, end] = dateRange(o.date_label);
    if (dateTokens(o.date_label).length > 2)
      conflicts.push(
        'The course dates contain multiple possible ranges; confirm the intended offering.',
      );
    if (start && end && start > end) conflicts.push('Course start is after course end.');
    const deadline = fact('application deadline'),
      feeFact = fact('course fee'),
      mode = fact('study mode'),
      duration = fact('duration'),
      location = fact('location');
    const deadlineTokens = deadline.value?.match(/\b\d{1,2}\s+[A-Za-z]+\s+20\d{2}\b/g) ?? [];
    const deadlineDates = [
      ...new Set(deadlineTokens.map(parseDate).filter((d): d is string => d !== null)),
    ];
    const deadlineDate = deadlineDates.length === 1 ? deadlineDates[0]! : null;
    if (deadlineDates.length > 1) conflicts.push('Conflicting application deadline dates.');
    if (deadlineDate && end && deadlineDate > end)
      conflicts.push('Application deadline is after course end.');
    const missing_fields: string[] = [];
    if (!start) missing_fields.push('start_date');
    if (!end) missing_fields.push('end_date');
    if (!deadlineDate) missing_fields.push('application_deadline');
    if (!feeFact.value) missing_fields.push('fees');
    if (!mode.value) missing_fields.push('study_mode');
    if (!duration.value) missing_fields.push('duration');
    if (!location.value) missing_fields.push('location');
    if (!normalize(o.status)) missing_fields.push('availability_status');
    const fees = parseFees(feeFact.value ?? '', url);
    const longCourse =
      (start && end && Date.parse(end) - Date.parse(start) > 367 * 86400000) ||
      /\b(?:[2-9]|[1-9][0-9]+)\s*years?\b/i.test(duration.value ?? '');
    if (longCourse) {
      for (const fee of fees) if (fee.basis === 'course') fee.basis = 'unknown';
      if (fees.some((f) => f.basis === 'unknown')) missing_fields.push('total_course_fee_basis');
    }
    if (!fees.length && !missing_fields.includes('fees')) missing_fields.push('fees');
    if (fees.some((f) => /\b(tentative|provisional|subject to change)\b/i.test(f.quote)))
      conflicts.push('The fee is provisional; confirm the final amount.');
    if (/\b(tentative|provisional|subject to change)\b/i.test(o.date_label))
      conflicts.push('The course dates are provisional.');
    return {
      id: fact('course code').value ?? String(index + 1),
      start_date: start,
      end_date: end,
      date_quote: normalize(o.date_label),
      deadline,
      deadline_date: deadlineDate,
      status: {
        value: normalize(o.status) || null,
        quote: normalize(o.status) || null,
        source_url: url,
      },
      fees,
      study_mode: mode,
      duration,
      location,
      missing_fields,
      conflicts,
    };
  });
  const panelText = (pattern: RegExp) =>
    normalize(
      raw.panels
        .filter((p) => pattern.test(p.label))
        .map((p) => p.text)
        .filter(Boolean)
        .join(' '),
    );
  const full = panelText(/teaching|expected learning hours|timetable|delivery|course schedule/i);
  const requirementFacts = summarizeRequirements(panelText(/requirements?/i)),
    teachingFacts = summarizeTeaching(full);
  const requirements = {
      value: requirementFacts.value,
      quote: requirementFacts.quote,
      source_url: url,
    },
    teaching = { value: teachingFacts.value, quote: teachingFacts.quote, source_url: url };
  const weekly = totalWeeklyHours(full);
  const weekdays = scheduledWeekdaysFromTeaching(full);
  const missing_fields = [
    ...new Set([
      ...requirementFacts.missingFields,
      ...teachingFacts.missingFields,
      ...(!weekly ? ['total_weekly_study_hours'] : []),
    ]),
  ];
  return Course.parse({
    id: courseId(url),
    title,
    url,
    checked_at: new Date().toISOString(),
    offerings,
    requirements,
    teaching,
    weekly_hours: weekly,
    scheduled_weekdays: weekdays,
    schedule_complete: false,
    missing_fields,
    warnings: [
      'Teaching evidence does not establish a complete schedule. Online delivery does not imply compatible hours.',
      'Course panels were opened through TinyFish; the public page identity and dates were separately retrieved by TinyFish Fetch.',
      'Interaction observations are validated structurally; receipts record provider observations, not independent certification.',
    ],
    evidence,
  });
}
