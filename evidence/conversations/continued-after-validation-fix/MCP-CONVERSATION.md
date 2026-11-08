# MCP conversation continuing a completed search after validation repair

Constructed learner scenario, 5 November 2026. Actual Codex CLI stdio MCP host; model-selected arguments and course identifiers. This explicitly continues the already completed search run ee16d35f-c920-4039-a091-8297567b4a9d after a local validation repair. The Agent receipt keeps its original time; Fetch, inspection and comparison perform fresh web work. The controller supplied the prior run ID and matching query; the model selected the course identifiers. No second Agent run was started.

**Outcome: a complete successful search → inspect → compare journey was not established.**

2 successful calls out of 3 completed calls. Earlier failed conversations remain unchanged.

## Scenario prompt

> This continues the constructed UK learner scenario from the same authorized paid Agent search on 5 November 2026. The learner wants a short online psychology course related to memory and decision-making, no qualification or executive coaching, GBP 500 using Home fees, at most five hours per week, Fridays unavailable, and future offerings whose application deadlines have not passed.
> 
> The original search Agent successfully operated the public form, but the adapter rejected a normal document-title suffix and in-page anchor. Those validation checks have been repaired and regression-tested. The original failed call remains recorded. Do not start another Agent run.
> 
> First call search_courses for topic psychology, study_mode online, page 0, limit 15, explicitly setting resume_agent_run_id to ee16d35f-c920-4039-a091-8297567b4a9d. This corroborates the existing build-local Agent result and retrieves new catalogue HTML through TinyFish Fetch. Explain that the Agent timestamp is retained from the earlier search; do not describe this as a newly executed Agent run.
> 
> Choose two suitable course identifiers yourself from the returned results. Inspect your strongest candidate once, then make one two-course comparison before giving a small sourced shortlist. Do not run another search, health check or retry. If any tool fails, stop and explain the blocker while retaining original evidence times. Use only StudyWindow MCP tools, no shell, other web tools, or file changes. Keep classroom-equivalent activity and self-study separate; do not assert a certified total or schedule compatibility from online delivery. Preserve matches, conflicts, unknowns, fee eligibility and admission limits.

## Visible conversation

**Assistant**

I’ll resume the recorded search result, inspect the strongest candidate, then compare two courses. I’ll retain the earlier Agent timestamp and distinguish it from the new catalogue fetch.


**MCP call 1: `search_courses`**

```json
{
  "topic": "psychology",
  "study_mode": "online",
  "page": 0,
  "limit": 15,
  "resume_agent_run_id": "ee16d35f-c920-4039-a091-8297567b4a9d"
}
```

[Exact typed result](conversation/call-1-search_courses.json)

**MCP call 2: `inspect_course`**

```json
{
  "course": "learning-and-memory-brain"
}
```

[Exact typed result](conversation/call-2-inspect_course.json)

**Assistant**

The memory course has future offerings at £435 Home fees. Its guidance separates 2–3 hours of classroom-equivalent activity from 2–3 hours of self-study each week, so the five-hour cap remains uncertain. I’m comparing it with the introductory cognitive psychology course; Friday compatibility also remains unconfirmed.


**MCP call 3: `compare_courses`**

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
    "earliest_start_date": "2026-11-06",
    "max_hours_per_week": 5,
    "unavailable_weekdays": [
      "friday"
    ]
  }
}
```

[Exact typed result](conversation/call-3-compare_courses.json)

**Assistant**

The two-course comparison failed with `PROVIDER_FAILURE`: the isolated Browser could not complete the public course interaction. I stopped as requested—no retry, further search or new Agent run.

The retained Agent evidence is from **5 November 2026, 08:23:33.866 UTC**. The resumed call corroborated that result and fetched new catalogue HTML at **08:33:31.017 UTC**; it did not rerun the Agent.

Only one candidate was successfully inspected, so this is a provisional finding rather than a completed shortlist:

- **[Learning and memory in the brain](https://www.pace.cam.ac.uk/courses/learning-and-memory-brain)** — strongest memory match; a seven-week short online course. Available offerings: **11 January–28 February 2027**, application deadline **11 January**; and **12 April–30 May 2027**, deadline **12 April**. Both deadlines remain future in this scenario. **£435 Home per course**, within budget if Home eligibility is confirmed.
- **Workload and Fridays remain unresolved:** guidance gives **2–3 hours weekly classroom-equivalent activity**, separately **2–3 hours self-study**. This does not certify a total within five hours. Normally no fixed online time is required and seminars are recorded, but the complete schedule is unconfirmed.
- Published entry is open, with no prior subject knowledge stated as necessary; near-native English is advised. Full admission conditions and individual eligibility remain unassessed. Decision-making coverage was not established.

Inspection receipts: Fetch **08:33:47.822 UTC**, Browser **08:34:26.483 UTC**, both on 5 November 2026.

The selected second candidate, **[Introduction to Cognitive Psychology and Neuropsychology](https://www.pace.cam.ac.uk/courses/introduction-cognitive-psychology-and-neuropsychology)**, has future catalogue dates, but the failed comparison leaves its fees, deadlines and commitments unverified. I cannot recommend it as meeting the constraints.

[Visible event record](conversation/events.json). [Machine-readable outcome and identifier checks](summary.json).

Provider success is separate from a guaranteed course fit, admission or a complete schedule. Missing facts and original evidence times remain visible. No deployment or bounty submission is established by this conversation.
