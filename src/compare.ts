import { z } from 'zod';
import {
  CompareInput,
  ComparisonOutput,
  Course,
  Finding,
  modeLabels,
  type CompareArgs,
  type CourseData,
} from './schemas.js';
import { StudyError } from './errors.js';

type Result = z.infer<typeof ComparisonOutput>;
type FindingData = z.infer<typeof Finding>;
type Outcome = Result['results'][number]['outcome'];
type OfferingData = CourseData['offerings'][number];

function londonDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (name: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function finding(
  criterion: FindingData['criterion'],
  status: FindingData['status'],
  explanation: string,
  url: string,
  quote: string | null = null,
): FindingData {
  return { criterion, status, explanation, source_urls: [url], quote };
}

function budgetFinding(offering: OfferingData, args: CompareArgs, url: string): FindingData {
  const { amount, currency, fee_category: category } = args.budget;
  if (offering.fees.length === 0)
    return finding(
      'budget',
      'unknown',
      'No validated fee is published for this offering. Affordability is unknown.',
      url,
    );
  if (currency !== 'GBP')
    return finding(
      'budget',
      'unknown',
      `The source publishes GBP fees; the budget is ${currency}. No exchange rate or currency conversion is assumed.`,
      url,
    );

  let fees = offering.fees;
  if (category) {
    const exact = fees.filter((fee) => fee.category === category);
    const standard = fees.filter((fee) => fee.category === 'standard');
    fees = exact.length ? exact : standard;
    if (fees.length === 0)
      return finding(
        'budget',
        'unknown',
        `No validated ${category} or universally applicable standard fee is available. Do not substitute another fee category.`,
        url,
      );
  } else {
    fees = fees.filter((fee) => fee.category === 'standard');
    if (fees.length === 0)
      return finding(
        'budget',
        'unknown',
        'Choose a fee category before assessing home or overseas fees; the learner’s fee status is not inferred.',
        url,
      );
  }

  const quote = fees.map((fee) => fee.quote).join(' | ');
  const distinct = new Set(fees.map((fee) => `${fee.amount}:${fee.category}:${fee.basis}`));
  if (distinct.size > 1)
    return finding(
      'budget',
      'unknown',
      'The source contains multiple applicable fees or fee bases. Resolve the conflicting or alternative charges before assessing affordability.',
      url,
      quote,
    );
  const fee = fees[0]!;
  if (fee.amount > amount)
    return finding(
      'budget',
      'conflict',
      `The published ${fee.category} fee of GBP ${fee.amount} exceeds the GBP ${amount} budget${fee.basis === 'course' ? '.' : '; even this published charge exceeds the budget, and the total course cost is unconfirmed.'}`,
      url,
      quote,
    );
  if (fee.basis !== 'course')
    return finding(
      'budget',
      'unknown',
      `The published fee is GBP ${fee.amount} on a ${fee.basis === 'year' ? 'per-year' : 'not-confirmed'} basis. The total course cost cannot be compared with the full budget.`,
      url,
      quote,
    );
  return finding(
    'budget',
    'match',
    `The published ${fee.category} course fee of GBP ${fee.amount} is within the GBP ${amount} budget. Additional expenses and fee-status eligibility are not assessed.`,
    url,
    quote,
  );
}

function statusFinding(offering: OfferingData, url: string): FindingData {
  const text = offering.status.value?.trim();
  const quote = offering.status.quote;
  if (!text)
    return finding(
      'source',
      'unknown',
      'The source does not establish whether this offering is currently accepting learners. Future course dates do not establish an open application window.',
      url,
      quote,
    );
  // Match explicit status labels rather than interpreting arbitrary prose as an action or instruction.
  const status = text.toLowerCase().replace(/\s+/g, ' ');
  const conflicting =
    /\b(no longer available|applications? closed|enrolments? closed|enrollments? closed|fully booked|sold out|course cancelled|course canceled|waiting list only|waitlist only)\b/.test(
      status,
    ) || /^(closed|unavailable|full|cancelled|canceled)$/.test(status);
  if (conflicting)
    return finding(
      'source',
      'conflict',
      'The published offering status prevents treating it as currently available for a new enrolment.',
      url,
      quote ?? text,
    );
  const open =
    /^(applications? open|open for applications?|places available|available|open|book now|apply now|enrol now|enroll now)$/.test(
      status,
    );
  if (open)
    return finding(
      'source',
      'match',
      'The source currently signals an open or available offering. This does not reserve a place or guarantee admission.',
      url,
      quote ?? text,
    );
  return finding(
    'source',
    'unknown',
    'The published status does not clearly establish immediate availability. Confirm with the provider.',
    url,
    quote ?? text,
  );
}

function deadlineFinding(offering: OfferingData, today: string, url: string): FindingData {
  const date = offering.deadline_date;
  if (!date)
    return finding(
      'deadline',
      'unknown',
      'No unambiguous application deadline was extracted. Course start dates are not substituted for deadlines.',
      url,
      offering.deadline.quote,
    );
  if (date < today)
    return finding(
      'deadline',
      'conflict',
      `The published application deadline (${date}) has passed as of ${today} in Europe/London.`,
      url,
      offering.deadline.quote,
    );
  if (date === today)
    return finding(
      'deadline',
      'unknown',
      'The application deadline is today in Europe/London, but no validated cutoff time is available. Confirm before applying.',
      url,
      offering.deadline.quote,
    );
  return finding(
    'deadline',
    'match',
    `The published deadline (${date}) is after ${today} in Europe/London. The separate offering-status check must also be considered.`,
    url,
    offering.deadline.quote,
  );
}

function dateFindings(
  offering: OfferingData,
  args: CompareArgs,
  today: string,
  url: string,
): FindingData[] {
  const { start_date: start, end_date: end } = offering;
  const findings: FindingData[] = [];
  const quote = offering.date_quote || null;
  if (start && end && start > end)
    return [
      finding(
        'course_dates',
        'unknown',
        'The source dates conflict: the course start is after its end. Resolve this before making a decision.',
        url,
        quote,
      ),
    ];
  if (end && end < today)
    findings.push(
      finding(
        'course_dates',
        'conflict',
        `This offering ended on ${end}; it is not a future course for a new learner.`,
        url,
        quote,
      ),
    );
  else if (start && start < today)
    findings.push(
      finding(
        'course_dates',
        'conflict',
        `This offering started on ${start}; a new learner cannot assume late entry is available.`,
        url,
        quote,
      ),
    );
  else if (start === today)
    findings.push(
      finding(
        'course_dates',
        'unknown',
        'The course starts today; start time and late-entry availability are not established.',
        url,
        quote,
      ),
    );
  else if (!start || !end)
    findings.push(
      finding(
        'course_dates',
        'unknown',
        'The start and end dates are not both established for this offering.',
        url,
        quote,
      ),
    );
  else
    findings.push(
      finding(
        'course_dates',
        'match',
        `The published course runs from ${start} to ${end}. These dates alone do not prove applications are open.`,
        url,
        quote,
      ),
    );

  const earliest = args.availability?.earliest_start_date;
  const latest = args.availability?.latest_end_date;
  if (earliest)
    findings.push(
      !start
        ? finding(
            'course_dates',
            'unknown',
            'An earliest acceptable start was supplied, but the course start is unknown.',
            url,
            quote,
          )
        : finding(
            'course_dates',
            start < earliest ? 'conflict' : 'match',
            start < earliest
              ? `The course starts before the learner’s earliest acceptable start (${earliest}).`
              : `The course starts on or after the learner’s earliest acceptable start (${earliest}).`,
            url,
            quote,
          ),
    );
  if (latest)
    findings.push(
      !end
        ? finding(
            'course_dates',
            'unknown',
            'A latest acceptable end was supplied, but the course end is unknown.',
            url,
            quote,
          )
        : finding(
            'course_dates',
            end > latest ? 'conflict' : 'match',
            end > latest
              ? `The course ends after the learner’s latest acceptable end (${latest}).`
              : `The course ends on or before the learner’s latest acceptable end (${latest}).`,
            url,
            quote,
          ),
    );
  return findings;
}

function availabilityFindings(course: CourseData, args: CompareArgs): FindingData[] {
  const constraint = args.availability;
  if (!constraint) return [];
  const findings: FindingData[] = [];
  if (constraint.max_hours_per_week !== undefined) {
    const hours = course.weekly_hours;
    if (!hours || hours.min > hours.max)
      findings.push(
        finding(
          'availability',
          'unknown',
          'A weekly time budget was supplied, but no valid complete weekly workload range is established. “Online” or “flexible” does not establish a workload.',
          course.url,
          course.teaching.quote,
        ),
      );
    else if (hours.min > constraint.max_hours_per_week)
      findings.push(
        finding(
          'availability',
          'conflict',
          `The published workload of ${hours.min}–${hours.max} hours per week exceeds the available ${constraint.max_hours_per_week} hours even at its minimum.`,
          course.url,
          hours.quote,
        ),
      );
    else if (hours.max > constraint.max_hours_per_week)
      findings.push(
        finding(
          'availability',
          'unknown',
          `The published workload ranges from ${hours.min} to ${hours.max} hours per week; some weeks may exceed the available ${constraint.max_hours_per_week} hours.`,
          course.url,
          hours.quote,
        ),
      );
    else
      findings.push(
        finding(
          'availability',
          'match',
          `The published maximum workload (${hours.max} hours per week) is within the available ${constraint.max_hours_per_week} hours. Session-time compatibility is assessed separately.`,
          course.url,
          hours.quote,
        ),
      );
  }
  if (constraint.unavailable_weekdays.length) {
    const scheduled = new Set(course.scheduled_weekdays.map((day) => day.toLowerCase()));
    const collisions = constraint.unavailable_weekdays.filter((day) => scheduled.has(day));
    if (collisions.length)
      findings.push(
        finding(
          'availability',
          'conflict',
          `Published teaching commitments include unavailable day${collisions.length === 1 ? '' : 's'}: ${collisions.join(', ')}.`,
          course.url,
          course.teaching.quote,
        ),
      );
    else if (!course.schedule_complete)
      findings.push(
        finding(
          'availability',
          'unknown',
          'The complete teaching schedule is not established. The absence of a published weekday cannot establish compatibility with unavailable days.',
          course.url,
          course.teaching.quote,
        ),
      );
    else
      findings.push(
        finding(
          'availability',
          'match',
          'The validated complete teaching schedule does not include the unavailable weekdays. Exact times, travel and independent study still need consideration.',
          course.url,
          course.teaching.quote,
        ),
      );
  }
  return findings;
}

function outcome(findings: FindingData[]): Outcome {
  // Eligibility is explicitly not adjudicated by this tool. Potential fit describes practical constraints only.
  const practical = findings.filter((item) => item.criterion !== 'requirements');
  if (practical.some((item) => item.status === 'conflict')) return 'conflict';
  return practical.some((item) => item.status === 'unknown')
    ? 'needs_information'
    : 'potential_fit';
}

/** Compare validated, freshly retrieved evidence. This function performs no web access or inference. */
export function compareCourses(
  courses: CourseData[],
  input: CompareArgs,
  now = new Date(),
): Result {
  const args = CompareInput.parse(input);
  if (
    args.availability?.earliest_start_date &&
    args.availability.latest_end_date &&
    args.availability.earliest_start_date > args.availability.latest_end_date
  )
    throw new StudyError(
      'INVALID_INPUT',
      'The earliest acceptable start must not be after the latest acceptable end.',
    );
  const today = londonDate(now);
  const results: Result['results'] = courses.map((rawCourse) => {
    const course = Course.parse(rawCourse);
    const offerings = course.offerings.map((offering) => {
      const findings: FindingData[] = [
        budgetFinding(offering, args, course.url),
        statusFinding(offering, course.url),
        deadlineFinding(offering, today, course.url),
        ...dateFindings(offering, args, today, course.url),
        ...availabilityFindings(course, args),
      ];
      if (args.study_modes.length) {
        const label = offering.study_mode.value;
        const known = Object.values(modeLabels).includes(
          label as (typeof modeLabels)[keyof typeof modeLabels],
        );
        const matches = args.study_modes.some((mode) => modeLabels[mode] === label);
        findings.push(
          finding(
            'mode',
            !known ? 'unknown' : matches ? 'match' : 'conflict',
            !known
              ? 'No supported study-mode label was extracted for this offering.'
              : matches
                ? `The published study mode (${label}) matches a preference; it does not establish schedule flexibility.`
                : `The published study mode (${label}) does not match the supplied preferences.`,
            course.url,
            offering.study_mode.quote,
          ),
        );
      }
      if (offering.conflicts.length)
        findings.push(
          finding(
            'source',
            'unknown',
            `The source contains unresolved conflicts: ${offering.conflicts.join('; ')}. Resolve them before relying on this offering.`,
            course.url,
          ),
        );
      findings.push(
        finding(
          'requirements',
          'unknown',
          course.requirements.value
            ? 'Entry requirements are supplied as evidence, but the learner’s eligibility and admission have not been assessed. Confirm them directly with the provider.'
            : 'Entry requirements were not established. Confirm eligibility directly with the provider.',
          course.url,
          course.requirements.quote,
        ),
      );
      return { offering_id: offering.id, outcome: outcome(findings), findings };
    });
    const courseOutcome: Outcome = offerings.some((item) => item.outcome === 'potential_fit')
      ? 'potential_fit'
      : offerings.some((item) => item.outcome === 'needs_information')
        ? 'needs_information'
        : 'conflict';
    return { course, offerings, outcome: courseOutcome };
  });
  return ComparisonOutput.parse({
    checked_at: now.toISOString(),
    budget: args.budget,
    results,
    caveats: [
      'Potential fit describes only the supplied practical constraints and published evidence; it is not a recommendation or admission guarantee. Entry eligibility remains unassessed and is excluded from the practical-fit outcome.',
      'Fees retain their published category and basis. No exchange rates, fee-status eligibility, funding, accommodation, travel or other extra costs are inferred.',
      'Deadlines are evaluated against the current date in Europe/London. A date-only deadline today has an unknown cutoff time.',
      'Online, remote and flexible delivery do not establish compatible teaching hours. Availability findings cover only the constraints supplied and the evidence available.',
      'Each offering is assessed independently. A course-level potential fit means at least one offering has no unresolved practical constraint; it does not mean every offering fits.',
    ],
  });
}
