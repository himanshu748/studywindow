# MCP conversation retry after provider support

Constructed learner scenario, 5 November 2026. Actual Codex CLI stdio MCP host; model-selected arguments and course identifiers. One capped search, at most one inspection and one two-course comparison were authorized. No automatic repeat.

**Outcome: a complete successful search → inspect → compare journey was not established.**

0 successful calls out of 1 completed calls. Earlier failed conversations remain unchanged.

## Scenario prompt

> As of 5 November 2026, I am a working learner in the UK looking for a short online psychology course, especially memory and how people make decisions. I do not want a qualification or executive coaching. My tuition budget is GBP 500 using the Home fee category. I can make at most five hours a week available, and Fridays are unavailable. I want a future offering with an application deadline that has not passed.
> 
> Please use StudyWindow to discover relevant courses, give me a detailed read of your strongest candidate, and compare it with one other course before giving a small sourced shortlist. For this cost-bounded conversation, make exactly one broad subject search with online delivery and a limit of 15 to cover the first source page. Do not run another search. Use at most one standalone inspection and one two-course comparison. Do not run health checks or retries. Choose the course identifiers yourself from the results.
> 
> Explain matches, conflicts and unknowns. Keep classroom-equivalent activity and self-study guidance separate; do not present them as a certified total workload. Online does not establish schedule compatibility. Use only StudyWindow MCP tools, no shell, other web tools, or file changes. If any tool fails, stop, explain the blocker, and preserve the original retrieval times of earlier evidence. Do not fill a failed live call with saved or invented data.

## Visible conversation

**Assistant**

I’ll use one broad StudyWindow search, inspect the strongest candidate, and compare it with one alternative. I’ll assess fees, deadlines and schedule fit separately, keeping classroom-equivalent activity distinct from self-study guidance.

**Assistant**

The catalogue search is still running. I’ll wait for its result without issuing another search or a retry.

**MCP call 1: `search_courses`**

```json
{
  "topic": "psychology",
  "study_mode": "online",
  "limit": 15,
  "page": 0
}
```

[Exact typed result](conversation/call-1-search_courses.json)

**Assistant**

StudyWindow’s live search failed, so I stopped as you instructed.

The single search used **psychology**, **online delivery**, **page 0**, and **limit 15**. StudyWindow returned `SITE_CHANGED`: “The Agent could not confirm the expected course-search form.”

No course results or retrieval timestamps were returned. There is therefore no earlier course evidence to preserve, and I cannot provide a sourced shortlist or assess fees, deadlines, workload or Friday compatibility.

I made no retries, health checks, standalone inspections or comparisons. Completing the request requires StudyWindow’s search-form integration to be restored before a newly authorized attempt.

[Visible event record](conversation/events.json). [Machine-readable outcome and identifier checks](summary.json).

Provider success is separate from a guaranteed course fit, admission or a complete schedule. Missing facts and original evidence times remain visible. No deployment or bounty submission is established by this conversation.
