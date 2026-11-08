# StudyWindow verification

Updated 8 November 2026; live verification remains from 5 November. **The local product is implemented and usable. The bounty is claimed, not submitted. A complete successful autonomous search → inspect → compare conversation remains unverified.** Individual successful live calls and conversational failures are separate evidence.

| Check | Observed result | Evidence |
| --- | --- | --- |
| Typed MCP server | Official SDK stdio initialization, four input/output contracts, invalid and disabled-live calls verified | [Protocol](offline-mcp-protocol.json) |
| Offline regressions | 127 tests passed: dates, fees, empty/changed structure, filters, untrusted text, URL scope, pricing, budgets, cancellation, concurrency and explicit continuation integrity | [Tests](offline-tests.txt), [types](typecheck.txt), [build](build.txt), [format](format-check.txt) |
| Clean installation | Locked dependencies installed in an isolated directory; build, tests and protocol checks exercised without live credentials | [Install](clean-install-npm-ci.txt), [tests](clean-install-tests.txt), [build](clean-install-build.txt), [protocol](clean-install-protocol.txt) |
| Different searches | Psychology online, bounded omissions, history page 2, and current autonomous psychology search succeeded | [Psychology](live-search-psychology-corrected.json), [pagination](live-search-history-page1.json), [conversation call](conversations/attempt-before-extra-allowance/conversation/call-1-search_courses.json) |
| Three course pages | Genuine Fetch + Browser detail observations of Memory, Introduction and Neuropsychology of decision making | [Memory](live-ui-inspect-course.json), [Introduction](live-inspect-introduction.json), [decision-making details](live-compare-short-courses.json) |
| MCP comparisons | Two-course comparisons preserved offering-specific matches, conflicts and unknowns | [Memory/decision-making](live-compare-short-courses.json), [UI Memory/Introduction](live-ui-compare-courses.json) |
| Live health | Recorded catalogue Fetch and Fetch/Browser detail canaries passed | [Health](live-health-current.json) |
| Source checks | Selected fees, dates, deadlines, modes and durations matched official pages | [Independent checks](SOURCE-FIELD-CHECKS.md) |
| Redesigned UI | Desktop, 390px and 320px; keyboard tabs, drawer focus return, shortlist synchronization, sorting, attention filter, stale preferences, reduced motion and console checks passed | [Browser QA](redesign-qa.json), [design study](../docs/DESIGN.md) |
| Earlier live UI | Explicit saved search followed by genuine MCP inspection and comparison succeeded before the visual redesign | [Exact calls](ui-live.json). This verifies provider/client behavior, not the later appearance. |

The clean-install test snapshot predates the latest empty-state and search-continuation regressions: it reports 121 tests. The current project run reports 127 tests with the same lockfile.

The earlier [allowance-control browser check](allowance-ui-qa.json) verified its then-current ledger and separately simulated capacity, halted and unknown-status cases. The later [5 November browser readback](retry-preview-qa.json) verified all live actions disabled at the exhausted counts, editable preferences, the newer eight-row recorded search and the recorded Memory inspection. Both checks used saved evidence rather than new provider executions.

The redesigned UI check made **zero paid provider calls** and exercised genuine labelled saved receipts. Live actions still call the same MCP server. Subject links prefill a query without automatically starting a paid search.

## Actual conversation and remaining gates

The [actual Codex CLI MCP conversations](MCP-CONVERSATION.md) are constructed learner scenarios using a real MCP host. Earlier search and inspection succeeded while comparison failed. Historical transcripts and typed failures remain unchanged.

The 4 November extra-$0.50 attempt stopped at a browser error page before operating the form. Read-only inspection of its captured HTML confirmed `ERR_EMPTY_RESPONSE`. TinyFish Support replied on 5 November with reference T-1827: they reported a healthy browser worker and intermittent source-connection failures, without establishing the underlying target-side cause. They recommended retrying ordinary public navigation later.

The user separately authorized $0.30 more for one later retry. Its Agent operated the form, but the original adapter rejected a document-title suffix; the returned `#main-content` anchor was also unsupported. The [original failed conversation](conversations/retry-2026-11-05/MCP-CONVERSATION.md) and [Agent observation](retry-agent-observation.json) are preserved. The adapter now relies on fresh Fetch H1/form contracts and normalizes only that exact in-page anchor. Offline regressions still reject unexpected fragments, wrong topics/filters, changed H1s and missing form structure.

An [explicit continuation conversation](conversations/continued-after-validation-fix/MCP-CONVERSATION.md) corroborated the same completed Agent run against the private build ledger, known accounting and original result digest. It retained the Agent receipt’s 08:23:33 UTC timestamp, then retrieved new catalogue HTML at 08:33:31 UTC. The controller supplied the prior run ID and matching query; the model selected the course identifiers. No second Agent run was started. Search and Memory inspection succeeded. The two-course comparison failed when the final course navigation reached `ERR_EMPTY_RESPONSE`; it returned no partial comparison. [Sanitized Browser diagnosis](retry-browser-failure.json).

**A complete successful autonomous shortlist remains unverified.** The [targeted live Fetch/parser check](live-empty-source-parser.json) passed after correction of the current empty-state variants. A complete successful empty-result `search_courses` MCP call remains unestablished.

Intermittent source/provider connection errors remain a limitation. Browser work makes at most three safe GET attempts inside the same allocated session, with short exponential backoff and jitter. No automatic paid replacement session or saved-data substitution follows failure. One undergraduate route also failed live; coverage of every course is not established.

The remaining live gate is a successful autonomous comparison after ordinary source navigation recovers. The November 5 comparison failure was sent as a follow-up in support conversation T-1827 on November 6; [sender-side dispatch was verified](provider-support-followup-receipt.json), with no new provider web work. No resolution is established by sending it. The latest retry grant has ended and all cumulative operation caps are exhausted; no more live verification is authorized by that grant. Before final submission, review the bounded public-API/source rationale, review the unselected source license and required promotion, verify public links, and recheck current official rules. GitHub publication was authorized on 8 November; deployment and promotion remain separate actions.

## Usage and privacy

[Usage](usage-summary.json) records **17 Agent runs, 28 Browser sessions, 47 Fetch URLs and $5.784 retained reservations** under the **$5.80 ceiling**. The partial known estimate is **$2.84267**, excluding operations without reliable final accounting; it is not an invoice. The latest retry retained $0.414: one Agent reservation and three Browser reservations. Continuation shared the original Agent receipt without a second Agent charge or reservation. All 81 earlier ledger entries are unchanged. $0.016 of aggregate reservation capacity remains, while Agent, Browser and Fetch count caps are exhausted. No further live calls followed the comparison failure. Billing, credit purchase and auto-reload were untouched.

Account balances, API keys and Browser connection credentials are excluded. The Git-specific secret scan could not run because this is not a Git repository. A separate [directory audit](secret-audit.json) checks exact current-key bytes and known patterns; the synthetic provider-error test fixture was reviewed. This does not scan history or prove absence of unknown secrets.

The [claim card](claim-confirmation.png) proves a claim, not submission, approval, placement or payment. Bounded official-site research found no documented public API supplying the required course fields, but an internal status-only AJAX endpoint exists. Owner confirmation and organizer acceptance remain unverified: [source suitability](SOURCE-SUITABILITY.md).

A full filesystem temporarily interrupted a build. Only the generated clean-install dependency copy was removed; the project and evidence were preserved. The build was rerun after space was recovered. Historical raw diagnostics and obsolete screenshots remain outside the publication package.
