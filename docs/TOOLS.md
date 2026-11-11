# Tool contracts

The source of truth is [`src/schemas.ts`](../src/schemas.ts). Inputs are strict Zod schemas; the official MCP SDK advertises and validates input and output schemas. Results use one of these shapes:

```json
{ "ok": true, "data": {} }
```

```json
{
  "ok": false,
  "error": {
    "code": "SITE_CHANGED",
    "message": "A safe explanation of the failure.",
    "retryable": false
  }
}
```

The successful `data` object depends on the tool. The server returns it in MCP structured content and text, with `isError: true` for failures. No live failure falls back to fixtures or saved data. Examples below are illustrative requests, not live receipts or an autonomous conversation.

## `search_courses`

| Input        | Contract                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------- |
| `topic`      | Required plain topic, 3–100 characters; letters, numbers, spaces, and supported punctuation |
| `study_mode` | Optional `online`, `in_person`, `face_to_face`, `hybrid`, or `remote`                       |
| `page`       | Integer 0–16, default 0; zero-based source page                                             |
| `limit`      | Integer 1–15, default 6                                                                     |

```json
{ "topic": "psychology", "study_mode": "online", "page": 0, "limit": 6 }
```

Agent operates the actual form and selected filter. Its final URL must agree with the requested topic, mode, page, and default other filters. Fetch then reads that exact page with `ttl: 0`. The parser requires the expected form, modes, result counts, course rows, and pagination.

The form’s exact `#main-content` anchor is removed before fetching; other fragments remain unsupported. The Agent’s document title is not treated as an H1. Fresh Fetch HTML must independently contain the expected H1, form, selected values and result structure.

Optional `resume_agent_run_id` is a UUID for explicit recovery of an already completed search from this same private build ledger within one hour. It starts no new Agent run. The provider must corroborate the run ID, completed status, known step accounting and original result digest against one matching saved receipt for the same search URL. Unknown, mismatched, expired or altered records fail before new Agent work. Fetch still retrieves the catalogue anew and checks the requested topic, filters and page. The output warns that the Agent receipt keeps its original timestamp. This is neither an automatic fallback nor a newly executed Agent search; repeated receipts must not be counted as additional spending.

Output includes `topic`, `study_mode`, `source_url`, `checked_at`, `courses`, `pagination`, `evidence`, and `warnings`. Each course has `id`, `title`, `url`, observed start/end dates, a literal date label, a mode when established by the selected filter, and course type. Search does not establish fees, deadlines, or teaching commitments.

Pagination reports `page`, source `page_size: 15`, `total_results`, `returned`, `omitted_on_page`, `next_page`, and `catalogue_complete`. Request `limit: 15` to see all rows on the current source page. A next source page does not recover rows omitted by a smaller limit. `catalogue_complete` is true only when page zero includes the entire matching result set. A structurally valid empty search is successful; missing structure is a failure.

## `inspect_course`

```json
{ "course": "learning-and-memory-brain" }
```

`course` accepts a search result’s slug, `node:<numeric-id>`, or an exact supported HTTPS course URL on `www.pace.cam.ac.uk`. Query strings, fragments, credentials, encoded paths, other hosts, and arbitrary resource paths are rejected. Redirects to different course identifiers fail; search again for a current canonical identifier.

Fetch retrieves page identity and the Course Dates structure. An isolated TinyFish Browser session opens every date panel up to three and relevant requirements, teaching, and fee-information panels. It reads literal DOM labels and values; a model does not assign fee categories. Deterministic code parses fees and dates, while the adapter corroborates title, URL, offering count, and date labels against Fetch and requires complete loaded observations for the supported offering set. It does not return partial details after a failed interaction. Inspection uses one bounded Browser session and one Fetch, without an Agent detail fallback. The documented direct Browser connection setting is used; session creation is not retried after a failure.

A course includes:

| Field                                    | Meaning                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`, `title`, `url`, `checked_at`       | Supported identity and local receipt time                                                                                                  |
| `offerings[]`                            | Separate dated offerings, each with course-code id, dates, deadline, status, fees, mode, duration, location, missing fields, and conflicts |
| `fees[]`                                 | Numeric `amount`, `currency: GBP`, `category`, `basis`, literal `quote`, source URL                                                        |
| `requirements`, `teaching`               | Facts with nullable value/quote and source URL                                                                                             |
| `weekly_hours`                           | A parsed explicit total-workload statement, or `null`; classroom equivalence is not substituted                                            |
| `scheduled_weekdays`                     | Weekdays found in teaching evidence; not a complete attendance calendar                                                                    |
| `schedule_complete`                      | Currently always false for this adapter                                                                                                    |
| `missing_fields`, `warnings`, `evidence` | Explicit coverage limits and retrieval provenance                                                                                          |

Fee categories are `home`, `overseas`, `standard`, and `unknown`; basis is `course`, `year`, or `unknown`. Home/overseas eligibility is never inferred. Tentative dates or fees and contradictory values produce visible uncertainty.

## Course retrieval provenance

Current course results include `retrieval.mode`: `browser_expanded` for successful Browser expansion or `fresh_fetch_fallback` for the narrowly supported recovery. Genuine historical records may omit this additive field.

Recovery is allowed only after an exhausted, typed transient navigation failure at `navigate_course`: `ERR_EMPTY_RESPONSE`, `ERR_CONNECTION_CLOSED`, `ERR_CONNECTION_RESET` or `ERR_NETWORK_CHANGED`. The exact same course's fresh Fetch HTML and receipt must already exist in this inspection. Its identity, digest, offerings, required fields and requested panel content must validate. Missing lazy content still fails. No extra provider operation or replacement Browser session is started.

Recovered courses retain the actual Fetch receipt, safe Browser failure stage/code/time/session metadata and an explicit warning. Dynamic availability stays unknown. An authentication, access, TLS, cancellation or structure failure cannot trigger recovery. The UI makes the limitation visible above course details; health shows degraded transport. This recovery branch has offline coverage; all detail calls in the successful 11 November live batch used normal Browser expansion.

## `compare_courses`

```json
{
  "courses": ["learning-and-memory-brain", "neuropsychology-decision-making"],
  "budget": { "amount": 500, "currency": "GBP", "fee_category": "standard" },
  "study_modes": ["online"],
  "availability": {
    "max_hours_per_week": 6,
    "unavailable_weekdays": ["monday"],
    "earliest_start_date": "2027-01-01",
    "latest_end_date": "2027-06-30"
  }
}
```

`courses` contains two or three distinct supported identifiers. Budget amount is finite, nonnegative, and at most 1,000,000. Currency is an uppercase three-letter code; a non-GBP budget produces an unknown affordability result, with no exchange rate invented. Fee category is optional: `home`, `overseas`, or `standard`. Modes default to an empty preference list.

Availability is optional. Weekly hours must be greater than zero and at most 168. Unavailable weekdays use lowercase full English names. Dates use `YYYY-MM-DD`; an earliest start after the latest finish is rejected.

The service retrieves each course afresh, sequentially, then compares validated evidence locally. The normal Browser path and strictly validated same-page Fetch recovery both preserve explicit provenance. A two-course comparison uses two bounded Browser sessions and two Fetch requests; a three-course comparison uses three of each. It does not return a partial comparison if one retrieval fails. Each offering receives findings with a criterion, `match`/`conflict`/`unknown`, explanation, source URLs, and optional quote. Criteria cover budget, source availability, deadline, course dates, supplied availability constraints, preferred modes, and requirements.

Practical outcomes are `potential_fit`, `conflict`, or `needs_information`. A course-level potential fit means at least one offering has no unresolved practical constraint among those assessed. Entry requirements always remain unassessed and are excluded from that practical outcome; potential fit is not admission approval or a recommendation. Known conflicts take precedence over unknowns. Fees retain category and basis; annual or unspecified totals cannot establish a full-course budget match. A standard fee may be used when no category-specific fee is published. Missing schedule evidence never establishes compatibility.

## `health_check`

```json
{}
```

A real TinyFish Fetch retrieves a psychology catalogue canary and checks form/mode/count/row/pagination contracts. A known course canary, `learning-and-memory-brain`, is inspected through fresh Fetch and Browser, checking identity, loaded offerings, fees, deadline, and mode. The health check uses one bounded Browser session and two Fetch requests.

Health returns `status: healthy` or `status: degraded`, `checked_at`, named checks with explicit `passed` booleans, receipts, and a coverage statement. Fresh Fetch recovery reports `degraded` and a failed `browser_navigation` check, preserving the transport failure rather than implying successful Browser retrieval. A known canary unexpectedly becoming empty is a breakage signal; an ordinary user search returning zero can still be valid. The check detects supported structural and semantic contract loss. It does not certify every field or every catalogue course.

## Receipts, errors, cancellation

Live receipts contain a unique id, TinyFish endpoint (`agent`, `fetch`, or `browser`), supported source URL, checked-at timestamp, SHA-256 digest, Agent run id/reported steps or Browser `session_id` where available, reserved USD, and an explicitly estimated USD amount. Agent estimates use reported steps; Browser estimates use elapsed operation time at the observed per-minute rate. Neither estimates nor reservations are provider invoices. Historical failed diagnostics remain cost evidence rather than successful tool evidence. A saved receipt keeps its original timestamp; replay is explicitly labelled. Digests identify observed payloads, not independent truth or proof of authorship.

| Error code            | Meaning / next step                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| `INVALID_INPUT`       | Use the advertised schema and supported identifiers                                  |
| `LIVE_DISABLED`       | Review pricing and explicitly enable live retrieval privately                        |
| `AUTHENTICATION`      | Check the existing API key and beta step-cap capability; no uncapped retry occurs    |
| `ALLOWANCE_EXHAUSTED` | Build run or Fetch cap reached; reconcile usage without resetting it                 |
| `PROVIDER_QUOTA`      | TinyFish wallet, quota, or rate limit; review provider state before retrying         |
| `PROVIDER_TIMEOUT`    | Provider/source deadline reached; no blind billable retry                            |
| `PROVIDER_FAILURE`    | Invalid, unavailable, or unexpected provider response; raw error bodies are withheld |
| `SITE_BLOCKED`        | Source refused normal access or required authentication; no access workaround        |
| `SITE_CHANGED`        | Expected source structure, identity, pagination, or loaded data contract failed      |
| `NOT_FOUND`           | Course or local resource no longer exists                                            |
| `CANCELLED`           | Cancellation requested or confirmed; reservation remains counted                     |
| `BUSY`                | Two provider operations, the local demo request, or the ledger lock is occupied      |
| `STATE_FAILURE`       | Durable usage state cannot be trusted; calls fail closed                             |
| `RESPONSE_TOO_LARGE`  | Provider response exceeded the 2 MB limit                                            |

MCP cancellation signals propagate to the provider. Async Agent runs are cancelled on error/cancellation when a run id is available. Remote cancellation can fail or a queue response can be lost; the duration and step limits remain, and the full reservation stays counted. Billable Agent and Browser creation are not automatically retried. Browser operations have a 120-second local bound, close the remote connection, and attempt session deletion in `finally`; a 30-second provider inactivity timeout is a second guard. Deletion can retry up to three times without creating a new session. There is no automatic Agent/Browser backend fallback after failure; historical failed experiments retain their reservations.

The optional `STUDYWINDOW_FETCH_TIER=hobby|builder` configuration selects only that exact Fetch pricing meter after the operator checks the effective account tier. Omitted configuration requires the generic meter; it never guesses a tier. The existing $0 ceiling rejects any nonzero selected Fetch rate. Configuration does not upgrade or change the account.
