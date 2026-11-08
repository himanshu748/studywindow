# Actual MCP client conversation

Recorded 4 November 2026 with Codex CLI and StudyWindow over the official stdio MCP transport. This is a constructed learner scenario. The model chose its tool calls, arguments and course identifiers; calls were not manually scripted.

**Outcome: partial success.** Search and course inspection succeeded. An expanded search failed explicitly, and the two-course comparison failed at Browser navigation. This demonstrates genuine multi-step client use and honest failure handling; it is not a complete successful autonomous shortlist.

A later resume attempt could not find the ephemeral session. It made no MCP calls and did not spend TinyFish credits.

The assistant makes a qualified arithmetic estimate from classroom-equivalent and self-study guidance. That estimate is its interpretation; the typed tools retain unknown total workload.

## Scenario prompt

> As of 4 November 2026, I am a working learner in the UK looking for a short online psychology course, especially memory and how people make decisions. I do not want a qualification or executive coaching. My tuition budget is GBP 500 using the Home fee category. I can make at most five hours a week available, and Fridays are unavailable. I want a future offering with an application deadline that has not passed.
> 
> Please use StudyWindow to discover relevant options, give me a detailed read of your most promising candidate, and compare it with another before presenting a small sourced shortlist. Keep retrievals small: start with one broad subject search. Explain which constraints fit, which conflict, and what I still need to confirm. Online does not establish schedule compatibility.
> 
> Use only the StudyWindow MCP tools. Do not use shell, other web tools, or modify files. Do not automatically retry a failed tool call. Report any blocker and retain the retrieval times of earlier evidence.

## Visible conversation

**Assistant**

I’ll start with one broad psychology search in StudyWindow, then examine the strongest match and a comparison option against your budget, workload, dates and Friday restriction.


**Assistant**

StudyWindow’s search is still running. Its coverage is limited to Cambridge PACE, so the shortlist will reflect that catalogue rather than all UK providers.


**MCP call 1: `search_courses` — success**

```json
{
  "topic": "psychology",
  "limit": 5,
  "page": 0
}
```

[Exact typed result and call record](conversation/call-1-search_courses.json)

**MCP call 2: `inspect_course` — success**

```json
{
  "course": "learning-and-memory-brain"
}
```

[Exact typed result and call record](conversation/call-2-inspect_course.json)

**Assistant**

“Learning and memory in the brain” has future offerings at £435 Home tuition. The main concern is workload: the guidance gives 2–3 hours of classroom-equivalent activity plus 2–3 hours of self-study, potentially exceeding your five-hour limit. Friday compatibility remains unconfirmed. I’ll retrieve the three omitted catalogue results to identify the best comparison.


**MCP call 3: `search_courses` — explicit failure**

```json
{
  "topic": "psychology",
  "limit": 8,
  "page": 0
}
```

[Exact typed result and call record](conversation/call-3-search_courses.json)

**Assistant**

The expanded search failed with `SITE_CHANGED`: StudyWindow could not confirm the expected search form. I won’t retry it. The earlier search and memory-course evidence remain available with their original retrieval times. I’ll compare the memory course with the already-discovered cognitive psychology introduction, checking whether its detail page lists a future offering.


**MCP call 4: `compare_courses` — explicit failure**

```json
{
  "courses": [
    "learning-and-memory-brain",
    "introduction-cognitive-psychology-and-neuropsychology"
  ],
  "budget": {
    "amount": 500,
    "currency": "GBP",
    "fee_category": "home"
  },
  "study_modes": [
    "online"
  ],
  "availability": {
    "earliest_start_date": "2026-11-05",
    "max_hours_per_week": 5,
    "unavailable_weekdays": [
      "friday"
    ]
  }
}
```

[Exact typed result and call record](conversation/call-4-compare_courses.json)

**Assistant**

**“Learning and memory in the brain” is the strongest evidenced candidate, but I cannot confirm a course that meets all your constraints.** StudyWindow failed during further discovery and comparison; I did not retry either failed call.

StudyWindow covers Cambridge PACE only. These findings use **4 November 2026** as your reference date.

### Most promising: Learning and memory in the brain

The [course page](https://www.pace.cam.ac.uk/courses/learning-and-memory-brain) lists two available online offerings:

| Offering | Application deadline | Home tuition |
|---|---|---:|
| 11 January–28 February 2027 | 11 January 2027 | £435 |
| 12 April–30 May 2027 | 12 April 2027 | £435 |

Both are seven weeks long, start in the future and have deadlines that had not passed on your reference date. Tuition is **£65 below budget**.

It is the strongest subject match because it explicitly concerns learning and memory. The retrieved evidence does **not** establish how much decision-making content it includes. The catalogue classifies it as a short online course, rather than an undergraduate qualification or executive-coaching course.

The main limitation is time commitment. Teaching guidance describes approximately **2–3 hours of classroom-equivalent activity plus 2–3 hours of self-study weekly**. That suggests roughly **4–6 hours**, rather than a confirmed total workload. Your strict five-hour ceiling therefore cannot be assured.

Friday compatibility is also **unconfirmed**. The evidence says there is normally no fixed online day or time and web seminars are recorded, but the full schedule was not established. An empty list of scheduled weekdays is missing information, not proof that Fridays are free.

Entry is described as open to everyone, with no prior subject knowledge stated as necessary. Teaching is in English and near-native English is advised; full entry conditions and individual eligibility were not assessed.

Before booking, confirm:

- Whether all required activity can be completed within five hours every week.
- Whether any compulsory attendance, participation or submission is required on Fridays, and whether recordings fully replace live attendance.
- Whether the syllabus covers decision-making sufficiently for your interests.
- Your Home-fee eligibility, any required extra costs, and the non-qualification nature of participation.

### Small shortlist and comparison

| Candidate | Why consider it | Fit and unresolved issues |
|---|---|---|
| **[Learning and memory in the brain](https://www.pace.cam.ac.uk/courses/learning-and-memory-brain)** | Direct memory focus; two future offerings | £435 Home and online confirmed. Workload may exceed five hours; Fridays and decision-making coverage unresolved. **Conditional first choice.** |
| **[Introduction to Cognitive Psychology and Neuropsychology](https://www.pace.cam.ac.uk/courses/introduction-cognitive-psychology-and-neuropsychology)** | Broader cognitive subject area worth comparing | Catalogue lists a short online course running **26 October–13 December 2026**, already underway on your reference date. No future offering, fee, deadline or schedule was verified. **Reserve lead only.** |

The memory course has substantially stronger evidence for your requirements. The introduction cannot presently satisfy your future-start requirement on the evidence retrieved. Neither is a confirmed all-constraints match.

The initial [psychology catalogue search](https://www.pace.cam.ac.uk/course-search?search_api_fulltext=psychology&field_subject_categories=All&field_course_type=All&field_method=All) returned five of eight results. I excluded the two undergraduate certificates and executive-coaching course in line with your preferences. The three omitted results remain unknown.

### Evidence times and blockers

All times below are **UTC on 4 November 2026**:

- **Initial search:** receipt `15:39:25.117`; underlying Agent evidence `15:39:11.911`, Fetch evidence `15:39:25.085`.
- **Memory-course inspection:** receipt `15:40:26.285`; page Fetch `15:39:41.567`, panel Browser evidence `15:40:24.756`.

The expanded search failed with **`SITE_CHANGED`** because the expected search form could not be confirmed. The two-course comparison then failed with **`PROVIDER_FAILURE`** during public-page interaction. Neither failure returned a retrieval timestamp or usable new evidence. The times above remain the original evidence times; the failed comparison did not refresh them.

[Machine-readable visible events](conversation/events.json). The raw event stream is retained privately outside the deliverable; its SHA-256 is included for provenance, not independent certification.
