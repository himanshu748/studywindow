# Final authorized MCP conversation attempt

Constructed learner scenario, 4 November 2026. Actual Codex CLI stdio MCP host; model-selected topic and course identifiers, no manually scripted tool calls. The controller limited this attempt to one full-page search, at most one inspection and one comparison.

Outcome: 0 successful calls out of 1. The search failed, so no inspection or comparison followed. No retry, shell or other browser tool was used.

## Scenario prompt

> As of 4 November 2026, I am a working learner in the UK looking for a short online psychology course, especially memory and how people make decisions. I do not want a qualification or executive coaching. My tuition budget is GBP 500 using the Home fee category. I can make at most five hours a week available, and Fridays are unavailable. I want a future offering with an application deadline that has not passed.
> 
> Please use StudyWindow to discover relevant courses, give me a detailed read of your strongest candidate, and compare it with one other course before giving a small sourced shortlist. For this cost-bounded conversation, make exactly one broad subject search with online delivery and a limit of 15 to cover the first source page. Do not run another search. Use at most one standalone inspection and one two-course comparison. Do not run health checks or retries. Choose the course identifiers yourself from the results.
> 
> Explain matches, conflicts and unknowns. Keep classroom-equivalent activity and self-study guidance separate; do not present them as a certified total workload. Online does not establish schedule compatibility. Use only StudyWindow MCP tools, no shell, other web tools, or file changes. If a tool fails, explain the blocker and preserve the original retrieval times of earlier evidence.

## Visible conversation

**Assistant**

I’ll use one broad online psychology search, inspect the strongest candidate, then compare it with one alternative. I’ll check fees, deadlines and scheduling separately, and flag where workload evidence is incomplete.


**MCP call 1: `search_courses`**

```json
{
  "limit": 15,
  "page": 0,
  "study_mode": "online",
  "topic": "psychology"
}
```

[Exact original typed result](conversation/call-1-search_courses.json)

**Assistant**

StudyWindow’s single search failed with **`SITE_BLOCKED`**: “The source blocked the live catalogue workflow.”

I used the requested broad search—**psychology**, **online**, **page 0**, **limit 15**. No course results, source links or retrieval timestamps were returned. There is therefore no earlier course evidence to preserve.

Without results, I cannot choose course identifiers, inspect a strongest candidate, run a grounded two-course comparison or provide a sourced shortlist. I made **no retries, additional searches or health checks**, and used no other sources.

Your criteria remain unverified: a future short course with an unpassed application deadline, Home tuition of **£500 or less**, no qualification or executive coaching, and compatibility with **five hours weekly and no Fridays**. Classroom-equivalent activity and self-study guidance would need separate assessment; online delivery alone would not establish schedule compatibility.

[Visible event record](conversation/events.json). Original failure code is preserved. Later run inspection identified a browser error-page title; the adapter now classifies that title as `PROVIDER_FAILURE`, verified with an offline replay. This does not establish successful new site access.
