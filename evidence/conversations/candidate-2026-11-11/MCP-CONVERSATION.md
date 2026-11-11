# Genuine MCP conversation, 11 November 2026

A constructed UK learner scenario was sent to Codex CLI 0.167.0-alpha.4.1 with StudyWindow over stdio. The model selected the course identifiers and tool arguments itself. Exactly one search, one standalone inspection and one two-course comparison completed successfully. No replay, fixture, continuation or automatic retry supplied these results. All course details in this run used `browser_expanded`; the new fresh Fetch recovery was not exercised live.

Source snapshot: uncommitted candidate based on `d1e1305c79853796e0a2cc47d6555de34ad7ed0f`, with the exact runtime/test/UI file manifest linked in [candidate evidence](../../readiness-2026-11-11/live-candidate-source-manifest.json). The aggregate hash is `fb3fc5e0b35f10798b159fb432ec6e91555bf88cddf135238eefd747651e417b`. New budget and explicit Hobby pricing controls were active; accounting is recorded separately.

The prompt is a test scenario, not a real learner testimonial. The source supplies course facts; admission, fee eligibility, places and complete schedules remain unestablished. Raw client events remain private; this export includes the actual public-facing messages and structured tool outputs.

### Learner prompt

As of 2026-11-11, I am a working learner in the UK looking for a short online psychology course, especially memory and how people make decisions. I do not want a qualification or executive coaching. My tuition budget is GBP 500 using the Home fee category. I can make at most five hours a week available, and Fridays are unavailable. I want a future offering with an application deadline that has not passed.

Use StudyWindow to discover relevant courses, give me a detailed read of your strongest candidate, and compare it with one other course before giving a small sourced shortlist. Make exactly one broad subject search with online delivery, page 0 and limit 15. Use at most one standalone inspection and one two-course comparison. Choose the course identifiers yourself from the actual results. Do not make another search, health check or retry.

Explain matches, conflicts and unknowns. Keep classroom-equivalent activity and self-study guidance separate; do not present them as a certified total workload. Online delivery does not establish schedule compatibility. Keep dynamic availability unknown when the source does. Explain fresh Fetch recovery if it occurs, retaining the failed Browser observation rather than calling it Browser success. Use only StudyWindow MCP tools, no shell, other web tools or file changes. If a tool fails, explain the blocker and preserve earlier evidence times.

### Assistant

I’ll use one broad StudyWindow search, then inspect the strongest candidate and compare it with one alternative against your budget, time limit and Friday constraint.

### Assistant

The single catalogue search is still running. I’ll keep to the requested call limits and use its returned identifiers for the detailed checks.

### Assistant

StudyWindow has not returned catalogue evidence yet, so I cannot select or assess courses reliably. The original request remains in progress; I have made no additional search or retry.

### Tool: `search_courses`

Input:

```json
{
  "topic": "psychology",
  "study_mode": "online",
  "page": 0,
  "limit": 15
}
```

[Exact structured result](call-1-search_courses.json).

### Assistant

The search returned eight offering rows. “Learning and memory in the brain” is the strongest direct subject match; “Introduction to Cognitive Psychology and Neuropsychology” is the broader alternative. I’ve excluded the qualification courses and executive coaching, and will assess only future offerings.

### Tool: `inspect_course`

Input:

```json
{
  "course": "learning-and-memory-brain"
}
```

[Exact structured result](call-2-inspect_course.json).

### Assistant

The memory course lists two future seven-week offerings at £435 Home tuition, with deadlines still ahead. Its guidance separates 2–3 hours of classroom-equivalent activity from 2–3 hours of self-study each week; that does not confirm a total within your five-hour limit. Recorded seminars and normally flexible timing are encouraging, but the full schedule remains unconfirmed.

### Assistant

The two-course comparison is still retrieving fresh evidence. The remaining decision is whether either course can be confirmed to fit your weekly limit and Friday restriction; the inspection alone leaves both unresolved.

### Assistant

No comparison result has arrived yet. The earlier memory-course inspection remains evidence from 14:35:16 UTC; I won’t treat the pending comparison as an updated confirmation.

### Tool: `compare_courses`

Input:

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
    "earliest_start_date": "2026-11-12",
    "max_hours_per_week": 5,
    "unavailable_weekdays": [
      "friday"
    ]
  }
}
```

[Exact structured result](call-3-compare_courses.json).

### Assistant

**“Learning and memory in the brain” is the strongest candidate, but neither course is a confirmed fit for your five-hour limit and unavailable Fridays.** Both have future online offerings within your £500 Home tuition budget, with deadlines after 11 November 2026.

StudyWindow covers public Cambridge PACE courses only. The single broad **psychology** search used online delivery, page 0 and limit 15, returning eight offering rows—not eight distinct courses. I excluded the undergraduate qualifications and executive coaching. [Catalogue source](https://www.pace.cam.ac.uk/course-search?search_api_fulltext=psychology&field_subject_categories=All&field_course_type=All&field_method=31)

**Detailed read: Learning and memory in the brain**

This is the clearest match to your stated interest in memory. It is listed as a short online course lasting seven weeks. The returned evidence does **not** establish specific coverage of decision-making, so I would not promise that part of your interest is addressed.

- **Tuition:** £435 Home per course, £65 below your budget. Home fee eligibility and additional expenses were not assessed.
- **Future offerings:** 11 January–28 February 2027, application deadline **11 January 2027**; or 12 April–30 May 2027, deadline **12 April 2027**. Both were marked available when checked.
- **Entry:** Open entry, with no prior subject knowledge or experience stated as necessary. Teaching is in English; near-native English is advised. Full entry conditions and your individual eligibility remain unassessed.
- **Classroom-equivalent activity:** About **2–3 hours weekly**.
- **Separate self-study guidance:** About **2–3 hours weekly**, varying by individual.
- **Schedule:** Normally no fixed online day or time is required, and web seminars are recorded. However, the complete timetable is unconfirmed.

Those activity figures are separate guidance, **not a certified total workload**. They do not establish that you can complete the course within five hours each week. Similarly, recorded seminars and online delivery do not confirm that all required participation can avoid Fridays. [Course source](https://www.pace.cam.ac.uk/courses/learning-and-memory-brain)

The two-course comparison produced this small, **conditional shortlist**:

| Candidate | Future offerings and application deadlines | Matches and unresolved points |
|---|---|---|
| **1. [Learning and memory in the brain](https://www.pace.cam.ac.uk/courses/learning-and-memory-brain)** | **11 Jan–28 Feb 2027**, apply by **11 Jan**; **12 Apr–30 May 2027**, apply by **12 Apr** | Strongest direct memory match; seven weeks, online, £435 Home. Five-hour and Friday compatibility unknown; decision-making coverage unconfirmed. |
| **2. [Introduction to Cognitive Psychology and Neuropsychology](https://www.pace.cam.ac.uk/courses/introduction-cognitive-psychology-and-neuropsychology)** | **22 Feb–11 Apr 2027**, apply by **22 Feb**; **24 May–11 Jul 2027**, apply by **24 May** | Broader subject alternative by title; seven weeks, online, £435 Home. Specific memory and decision-making coverage was not established by the returned detail. Same workload and Friday uncertainties. |

For the second course, StudyWindow returned the same separate weekly guidance—2–3 hours of classroom-equivalent activity and 2–3 hours of self-study—and the same incomplete schedule evidence. Its October 2026 offering conflicts with your requirements: it had already started, its deadline had passed, and it was marked no longer available. All four future offerings above were marked available, which does not reserve a place or guarantee admission. [Alternative course source](https://www.pace.cam.ac.uk/courses/introduction-cognitive-psychology-and-neuropsychology)

**My recommendation is to prioritise the January memory course**, subject to Cambridge confirming that required work is manageable within five hours weekly and that no compulsory activity requires Fridays. The comparison classified both courses as **needs information**, rather than confirmed fits.

Evidence receipts, all on **11 November 2026, UTC**: catalogue Agent **14:33:42.043**, Fetch **14:33:46.777**; standalone memory inspection Fetch **14:33:58.175**, Browser **14:35:14.872**; comparison memory Fetch **14:35:29.185**, Browser **14:36:23.919**; alternative Fetch **14:36:33.712**, Browser **14:37:55.231**. Comparison completed **14:37:58.317**. All detail retrievals reported expanded Browser results; no failed Browser observation or fresh-Fetch recovery occurred. Exactly one search, one standalone inspection and one two-course comparison were used, with no health check or retry.
