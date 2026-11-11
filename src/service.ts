import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import {
  CompareInput,
  ComparisonOutput,
  Course,
  HealthInput,
  HealthOutput,
  InspectInput,
  Receipt,
  SearchInput,
  SearchOutput,
  modeLabels,
  modeValues,
  responseSchema,
} from './schemas.js';
import { CATALOGUE, courseUrl, searchUrl, validateCatalogueUrl } from './urls.js';
import {
  RawCourse,
  RawSearch,
  courseTitle,
  normalize,
  parseCourse,
  parseSearch,
  dateRange,
} from './extract.js';
import { BrowserNavigationError, StudyError, checkCancelled, failure } from './errors.js';
import type { WebProvider } from './provider.js';
import { compareCourses } from './compare.js';
import { courseFromFreshHtml } from './fetch-course.js';
export const toolDefinitions = {
  search_courses: {
    input: SearchInput,
    output: responseSchema(SearchOutput),
    description:
      'Search the LIVE Cambridge PACE catalogue with TinyFish Agent and Fetch. Use one broad subject keyword for discovery (for example psychology); the site does literal keyword search, not semantic OR across interests. Zero-based pagination; bounded results are not the whole catalogue. Normally costs one capped Agent run. Explicit resume_agent_run_id continues verified completed work from this build within one hour, keeps its original Agent evidence time and Fetches anew without another Agent run. Inspect courses before deciding.',
  },
  inspect_course: {
    input: InspectInput,
    output: responseSchema(Course),
    description:
      'Read fresh Cambridge course offerings, fees by category, application deadlines, requirements and teaching evidence. TinyFish Fetch reads the page and an isolated TinyFish Browser opens lazy panels. Only exhausted transient course navigation may use complete literal HTML from that same fresh Fetch, with degraded provenance and unknown availability. Missing schedules remain unknown. Costs one bounded Browser session.',
  },
  compare_courses: {
    input: CompareInput,
    output: responseSchema(ComparisonOutput),
    description:
      'Freshly retrieve 2–3 Cambridge courses through TinyFish, then compare offerings deterministically against budget, fee category, modes and optional availability. No currency conversion or admission guarantee. Costs one bounded Browser session per course.',
  },
  health_check: {
    input: HealthInput,
    output: responseSchema(HealthOutput),
    description:
      'Run a LIVE TinyFish Fetch catalogue canary and Browser+Fetch detail canary. Checks actual filter/row/detail contracts and explicit expiry fields. A permitted same-Fetch fallback reports degraded health and failed Browser navigation. Costs one bounded Browser session; does not just ping the provider.',
  },
} as const;
export type ToolName = keyof typeof toolDefinitions;
export class StudyWindow {
  constructor(readonly web: WebProvider) {}
  async search(input: unknown, signal?: AbortSignal) {
    const args = SearchInput.parse(input);
    checkCancelled(signal);
    const start = searchUrl(args.topic, args.study_mode ? modeValues[args.study_mode] : undefined);
    const result = await this.web.agent(
      start,
      `The public GET form parameters have preselected the requested topic and mode. Use the actual Course search form: dismiss cookies with Deny if needed, enter the exact plain-text topic ${JSON.stringify(args.topic)} in Search keyword, submit Search courses. ${args.study_mode ? `Keep the already selected Study mode ${JSON.stringify(modeLabels[args.study_mode])}; verify it stays selected after submitting.` : 'Leave all dropdowns at their default All values.'} Reach source page ${args.page + 1} (zero-based ${args.page}) using pagination if needed. Do not open course pages. Return the final page URL and the actual H1 heading under title (not document.title), search_operated=true only after operating the form and verifying the topic, and blocked=true if access failed. A valid empty search is allowed.`,
      RawSearch,
      signal,
      args.resume_agent_run_id,
    );
    const raw = result.data;
    if (
      /^This (?:page (?:isn['’]t|is not) working|site (?:can['’]t|cannot) be reached)[.!]?$/i.test(
        normalize(raw.title),
      )
    )
      throw new StudyError(
        'PROVIDER_FAILURE',
        'The Agent reached a browser error page before operating the catalogue. No retry was made.',
      );
    if (raw.blocked)
      throw new StudyError('SITE_BLOCKED', 'The Agent reported a blocked catalogue workflow.');
    if (!raw.search_operated)
      throw new StudyError(
        'SITE_CHANGED',
        'The Agent could not confirm the expected course-search form.',
      );
    // The real form can append its in-page content anchor. It identifies no new resource.
    // Other fragments remain rejected, and Fetch below validates the actual H1 and form.
    const u = validateCatalogueUrl(raw.page_url.replace(/#main-content$/, ''));
    if (
      u.searchParams.get('search_api_fulltext') !== args.topic ||
      Number(u.searchParams.get('page') ?? '0') !== args.page ||
      (args.study_mode
        ? u.searchParams.get('field_method') !== modeValues[args.study_mode]
        : !['All', null].includes(u.searchParams.get('field_method'))) ||
      ['field_subject_categories', 'field_course_type'].some(
        (k) => !['All', null].includes(u.searchParams.get(k)),
      )
    )
      throw new StudyError(
        'SITE_CHANGED',
        'The Agent search URL does not match the requested topic, filters or page.',
      );
    const page = await this.web.fetchHtml(u.href, signal);
    const output = parseSearch(page.data, args, u.href, [result.receipt, page.receipt]);
    if (args.resume_agent_run_id)
      output.warnings.unshift(
        'Continued the explicitly selected completed Agent run; its original evidence time is retained. Fetch retrieved the catalogue anew. No new Agent run was started.',
      );
    return output;
  }
  async inspect(input: unknown, signal?: AbortSignal) {
    const { course } = InspectInput.parse(input);
    const url = courseUrl(course);
    checkCancelled(signal);
    const fetchStarted = Date.now();
    const page = await this.web.fetchHtml(url, signal);
    const title = courseTitle(page.data);
    const $ = load(page.data);
    const count = $('.accordion--course-instances .accordion-item').length;
    if (count < 1 || count > 3)
      throw new StudyError(
        'SITE_CHANGED',
        'This course has an unsupported number of offerings (supported: 1–3).',
      );
    const labels = $('.accordion-item__button')
      .toArray()
      .map((el) => normalize($(el).text()));
    const required = labels.filter((s) =>
      /requirements|expected learning hours|teaching and assessment|course schedule|timetable|fees and funding|fees and financial support/i.test(
        s,
      ),
    );
    let expanded;
    try {
      expanded = await this.web.expandCourse(url, required, signal);
    } catch (error) {
      checkCancelled(signal);
      if (!(error instanceof BrowserNavigationError) || error.navigation.source_url !== url)
        throw error;
      const fetched = Receipt.safeParse(page.receipt);
      if (
        !fetched.success ||
        fetched.data.endpoint !== 'fetch' ||
        fetched.data.source_url !== url ||
        fetched.data.run_id !== null ||
        fetched.data.session_id !== null ||
        Date.parse(fetched.data.checked_at) < fetchStarted ||
        Date.parse(fetched.data.checked_at) > Date.now() ||
        fetched.data.sha256 !== createHash('sha256').update(page.data).digest('hex')
      )
        throw new StudyError(
          'SITE_CHANGED',
          'The failed navigation has no matching fresh Fetch observation from this operation.',
        );
      const raw = courseFromFreshHtml(page.data, url, title, required);
      const fallback = parseCourse(raw, title, url, [fetched.data]);
      if (
        fallback.offerings.some(
          (offering) =>
            !offering.deadline_date || !offering.fees.length || offering.conflicts.length > 0,
        )
      )
        throw new StudyError(
          'SITE_CHANGED',
          'Fresh Fetch HTML has incomplete or conflicting supported offering facts.',
        );
      return Course.parse({
        ...fallback,
        checked_at: fetched.data.checked_at,
        retrieval: { mode: 'fresh_fetch_fallback', browser_failure: error.navigation },
        warnings: [
          fallback.warnings[0]!,
          `Browser navigation failed after three same-session attempts (${error.navigation.network_code}). Complete literal course fields and requested panels came from the same fresh TinyFish Fetch HTML; no extra retrieval was started.`,
          'Course panels were not opened in Browser. Current availability was not observed and remains unknown.',
          'The failed Browser session reservation remains counted. Fetch-only evidence does not establish zero Browser usage.',
          'The Fetch receipt records the actual source observation; Browser failure metadata is not a successful Browser receipt or independent certification.',
        ],
      });
    }
    const observed = RawCourse.safeParse(expanded.data);
    if (!observed.success)
      throw new StudyError(
        'SITE_CHANGED',
        'The source no longer matches the structured course observation contract.',
      );
    const result = { data: observed.data, receipt: expanded.receipt };
    if (result.data.blocked)
      throw new StudyError(
        'SITE_BLOCKED',
        'TinyFish could not access the public course through normal catalogue navigation. No workaround was attempted.',
      );
    if (
      required.some(
        (label) =>
          !result.data.panels.some(
            (p) => normalize(p.label).toLowerCase() === label.toLowerCase() && normalize(p.text),
          ),
      )
    )
      throw new StudyError(
        'SITE_CHANGED',
        'A required information panel was not observed after interaction.',
      );
    if (result.data.dates_found !== count || result.data.offerings.length !== count)
      throw new StudyError(
        'SITE_CHANGED',
        'Browser and Fetch disagree on the number of course offerings.',
      );
    const dateLabels = $('.accordion--course-instances .accordion-item__button')
      .toArray()
      .map((el) => normalize($(el).text()));
    for (let i = 0; i < dateLabels.length; i++) {
      const observed = result.data.offerings[i]!;
      if (
        JSON.stringify(dateRange(observed.date_label)) !==
          JSON.stringify(dateRange(dateLabels[i]!)) ||
        (dateRange(dateLabels[i]!)[0] === null && normalize(observed.date_label) !== dateLabels[i])
      )
        throw new StudyError(
          'SITE_CHANGED',
          'Browser and Fetch disagree on the published course dates.',
        );
    }
    const corroborated = {
      ...result.data,
      offerings: result.data.offerings.map((o, i) => ({ ...o, date_label: dateLabels[i]! })),
    };
    return Course.parse({
      ...parseCourse(corroborated, title, url, [page.receipt, result.receipt]),
      retrieval: { mode: 'browser_expanded' },
    });
  }
  async compare(input: unknown, signal?: AbortSignal) {
    const args = CompareInput.parse(input);
    const urls = args.courses.map(courseUrl);
    if (new Set(urls).size !== urls.length)
      throw new StudyError('INVALID_INPUT', 'Choose distinct courses to compare.');
    if (
      args.availability?.earliest_start_date &&
      args.availability.latest_end_date &&
      args.availability.earliest_start_date > args.availability.latest_end_date
    )
      throw new StudyError('INVALID_INPUT', 'The earliest start must not be after the latest end.');
    // Sequential acquisition deliberately bounds concurrency and cost; no partial comparison on failure.
    const courses = [];
    for (const url of urls) {
      checkCancelled(signal);
      courses.push(await this.inspect({ course: url }, signal));
    }
    return compareCourses(courses, args);
  }
  async health(input: unknown, signal?: AbortSignal) {
    HealthInput.parse(input);
    const url = searchUrl('psychology', undefined, 0),
      page = await this.web.fetchHtml(url, signal);
    const search = parseSearch(
      page.data,
      SearchInput.parse({ topic: 'psychology', limit: 15 }),
      url,
      [page.receipt],
    );
    if (search.pagination.total_results < 1)
      throw new StudyError(
        'SITE_CHANGED',
        'The known psychology search canary is unexpectedly empty. Ordinary user searches may still validly return zero.',
      );
    const course = await this.inspect({ course: 'learning-and-memory-brain' }, signal);
    if (
      course.offerings.some(
        (o) =>
          !o.start_date ||
          !o.end_date ||
          !o.deadline_date ||
          !o.fees.length ||
          !o.study_mode.value ||
          o.conflicts.length > 0,
      )
    )
      throw new StudyError(
        'SITE_CHANGED',
        'The known detail canary lost its date, deadline, fee or study-mode contract, or contains unresolved source conflicts.',
      );
    const fallback = course.retrieval?.mode === 'fresh_fetch_fallback';
    return HealthOutput.parse({
      status: fallback ? 'degraded' : 'healthy',
      checked_at: new Date().toISOString(),
      checks: [
        {
          name: 'catalogue',
          passed: true,
          detail:
            'Expected form, supported mode values, count/rows, applied topic and pagination agree.',
        },
        {
          name: 'browser_navigation',
          passed: !fallback,
          detail: fallback
            ? 'Browser course navigation failed. Complete same-page fresh Fetch HTML supplied the detail facts; no successful Browser observation or current availability is established.'
            : 'The isolated Browser navigated to the requested course and completed its detail observation.',
        },
        {
          name: 'course_details',
          passed: true,
          detail: fallback
            ? 'Literal same-page fresh Fetch HTML contains supported offering count, dates, fees, application deadlines, study mode and requested panels. Browser/Fetch agreement was not established.'
            : 'Fetch identity/dates and Browser-expanded offering count, fees, application deadlines and study mode agree with their typed contracts.',
        },
      ],
      evidence: [...search.evidence, ...course.evidence],
      coverage:
        'Canaries validate the supported Cambridge adapter. They detect structural/semantic loss; they do not prove every source field is accurate or every catalogue course is supported.',
    });
  }
  async call(
    name: ToolName,
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      let data: unknown;
      switch (name) {
        case 'search_courses':
          data = await this.search(input, signal);
          break;
        case 'inspect_course':
          data = await this.inspect(input, signal);
          break;
        case 'compare_courses':
          data = await this.compare(input, signal);
          break;
        case 'health_check':
          data = await this.health(input, signal);
          break;
        default:
          throw new StudyError('INVALID_INPUT', 'Unknown StudyWindow tool.');
      }
      return toolDefinitions[name].output.parse({ ok: true, data }) as Record<string, unknown>;
    } catch (error) {
      return failure(error);
    }
  }
}
