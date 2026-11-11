import { z } from 'zod';

export const Mode = z.enum(['online', 'in_person', 'face_to_face', 'hybrid', 'remote']);
export const modeLabels = {
  online: 'Online learning',
  in_person: 'In person teaching',
  face_to_face: 'Face to face teaching',
  hybrid: 'Hybrid (in person and online)',
  remote: 'Remote delivery',
} as const;
export const modeValues = {
  online: '31',
  in_person: '454',
  face_to_face: '16',
  hybrid: '455',
  remote: '25',
} as const;
export const SearchInput = z
  .object({
    topic: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[\p{L}\p{N} ,&'’()\-]+$/u, 'Use a plain course topic, not instructions or a URL.'),
    study_mode: Mode.optional(),
    page: z
      .number()
      .int()
      .min(0)
      .max(16)
      .default(0)
      .describe('Zero-based source page; each source page holds up to 15 courses.'),
    limit: z.number().int().min(1).max(15).default(6),
    resume_agent_run_id: z
      .uuid()
      .optional()
      .describe(
        'Explicitly continue a completed Agent search from this build within one hour. Preserves its receipt time, verifies the original result, and Fetches the catalogue anew without starting another Agent run.',
      ),
  })
  .strict();
export const InspectInput = z
  .object({
    course: z
      .string()
      .min(1)
      .max(300)
      .describe(
        'Course id from search, e.g. learning-and-memory-brain; or a supported Cambridge course URL.',
      ),
  })
  .strict();
export const CompareInput = z
  .object({
    courses: z.array(z.string().min(1).max(300)).min(2).max(3),
    budget: z
      .object({
        amount: z.number().finite().min(0).max(1000000),
        currency: z.string().regex(/^[A-Z]{3}$/),
        fee_category: z.enum(['home', 'overseas', 'standard']).optional(),
      })
      .strict(),
    study_modes: z.array(Mode).max(5).default([]),
    availability: z
      .object({
        max_hours_per_week: z.number().positive().max(168).optional(),
        unavailable_weekdays: z
          .array(
            z.enum(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']),
          )
          .max(7)
          .default([]),
        earliest_start_date: z.iso.date().optional(),
        latest_end_date: z.iso.date().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const HealthInput = z.object({}).strict();
export const Receipt = z.object({
  id: z.uuid(),
  endpoint: z.enum(['fetch', 'agent', 'browser']),
  source_url: z.url(),
  checked_at: z.iso.datetime(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  run_id: z.string().nullable(),
  session_id: z.string().nullable().default(null),
  steps: z.number().int().nonnegative().nullable(),
  reserved_usd: z.number().nonnegative(),
  estimated_usd: z.number().nonnegative().nullable(),
  fresh: z.literal(true),
});
export const Fact = z.object({
  value: z.string().nullable(),
  quote: z.string().nullable(),
  source_url: z.url(),
});
export const Fee = z.object({
  amount: z.number().nonnegative(),
  currency: z.literal('GBP'),
  category: z.enum(['home', 'overseas', 'standard', 'unknown']),
  basis: z.enum(['course', 'year', 'unknown']),
  quote: z.string(),
  source_url: z.url(),
});
export const Offering = z.object({
  id: z.string(),
  start_date: z.iso.date().nullable(),
  end_date: z.iso.date().nullable(),
  date_quote: z.string(),
  deadline: Fact,
  deadline_date: z.iso.date().nullable(),
  status: Fact,
  fees: z.array(Fee).max(8),
  study_mode: Fact,
  duration: Fact,
  location: Fact,
  missing_fields: z.array(z.string()),
  conflicts: z.array(z.string()),
});
export const BrowserNavigationFailure = z
  .object({
    stage: z.literal('navigate_course'),
    source_url: z.url(),
    network_code: z.enum([
      'ERR_EMPTY_RESPONSE',
      'ERR_CONNECTION_CLOSED',
      'ERR_CONNECTION_RESET',
      'ERR_NETWORK_CHANGED',
    ]),
    checked_at: z.iso.datetime(),
    session_id: z
      .string()
      .regex(/^(?:br|tf)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/)
      .nullable(),
    attempts: z.literal(3),
  })
  .strict();
export const CourseRetrieval = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('browser_expanded') }),
  z.object({
    mode: z.literal('fresh_fetch_fallback'),
    browser_failure: BrowserNavigationFailure,
  }),
]);
export const Course = z.object({
  id: z.string(),
  title: z.string().min(1),
  url: z.url(),
  checked_at: z.iso.datetime(),
  offerings: z.array(Offering).min(1).max(3),
  requirements: Fact,
  teaching: Fact,
  weekly_hours: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative(), quote: z.string() })
    .nullable(),
  scheduled_weekdays: z.array(z.string()),
  schedule_complete: z.boolean(),
  missing_fields: z.array(z.string()),
  warnings: z.array(z.string()),
  evidence: z.array(Receipt).min(1),
  // Optional so genuine historical observations retain their original schema and evidence.
  retrieval: CourseRetrieval.optional(),
});
export const SearchOutput = z.object({
  topic: z.string(),
  study_mode: Mode.nullable(),
  source_url: z.url(),
  checked_at: z.iso.datetime(),
  courses: z
    .array(
      z.object({
        id: z.string(),
        title: z.string(),
        url: z.url(),
        start_date: z.iso.date().nullable(),
        end_date: z.iso.date().nullable(),
        date_quote: z.string(),
        study_mode: z.string().nullable(),
        course_type: z.string().nullable(),
      }),
    )
    .max(15),
  pagination: z.object({
    page: z.number().int(),
    page_size: z.number().int(),
    total_results: z.number().int(),
    returned: z.number().int(),
    omitted_on_page: z.number().int(),
    next_page: z.number().int().nullable(),
    catalogue_complete: z.boolean(),
  }),
  evidence: z.array(Receipt).min(1),
  warnings: z.array(z.string()),
});
export const Finding = z.object({
  criterion: z.enum([
    'budget',
    'mode',
    'deadline',
    'course_dates',
    'availability',
    'requirements',
    'source',
  ]),
  status: z.enum(['match', 'conflict', 'unknown']),
  explanation: z.string(),
  source_urls: z.array(z.url()),
  quote: z.string().nullable(),
});
export const ComparisonOutput = z.object({
  checked_at: z.iso.datetime(),
  budget: CompareInput.shape.budget,
  results: z.array(
    z.object({
      course: Course,
      offerings: z.array(
        z.object({
          offering_id: z.string(),
          outcome: z.enum(['potential_fit', 'conflict', 'needs_information']),
          findings: z.array(Finding),
        }),
      ),
      outcome: z.enum(['potential_fit', 'conflict', 'needs_information']),
    }),
  ),
  caveats: z.array(z.string()),
});
export const HealthOutput = z.object({
  status: z.enum(['healthy', 'degraded']),
  checked_at: z.iso.datetime(),
  checks: z.array(z.object({ name: z.string(), passed: z.boolean(), detail: z.string() })),
  evidence: z.array(Receipt),
  coverage: z.string(),
});
export const ErrorCode = z.enum([
  'INVALID_INPUT',
  'LIVE_DISABLED',
  'AUTHENTICATION',
  'ALLOWANCE_EXHAUSTED',
  'PROVIDER_QUOTA',
  'PROVIDER_TIMEOUT',
  'PROVIDER_FAILURE',
  'PRICING_CHANGED',
  'SITE_BLOCKED',
  'SITE_CHANGED',
  'NOT_FOUND',
  'CANCELLED',
  'BUSY',
  'STATE_FAILURE',
  'RESPONSE_TOO_LARGE',
]);
export const Failure = z.object({
  ok: z.literal(false),
  error: z.object({ code: ErrorCode, message: z.string(), retryable: z.boolean() }),
});
export const responseSchema = <T extends z.ZodType>(data: T) =>
  z.union([z.object({ ok: z.literal(true), data }), Failure]);
export type CourseData = z.infer<typeof Course>;
export type ReceiptData = z.infer<typeof Receipt>;
export type CompareArgs = z.infer<typeof CompareInput>;
export type SearchArgs = z.infer<typeof SearchInput>;
