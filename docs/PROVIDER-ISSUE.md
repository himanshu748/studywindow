# Provider navigation follow-up — sent to TinyFish Support

Sent through TinyFish’s authenticated Support form on 4 November 2026 after explicit user authorization. The form showed **Message sent**; no ticket ID was shown at submission. TinyFish Support replied on 5 November 2026 with reference **T-1827**. The [exact sent message](../evidence/provider-support-message.txt), [submission receipt](../evidence/provider-support-receipt.json) and [cropped confirmation](../evidence/provider-support-confirmation.png) preserve this state.

The 4 November verification run ended before operating the public course-search form. A later retry was explicitly authorized on 5 November under an additional $0.30 ceiling; its outcome will be recorded separately from the earlier failure.

- Agent run: `7c799bb6-24f7-4e12-9e65-fe382750b28c`, 4 November 2026, five reported steps, provider status `COMPLETED`.
- Supported target: `https://www.pace.cam.ac.uk/course-search?search_api_fulltext=psychology&field_method=31`.
- Returned observation: browser error-page title, `search_operated=false`, `blocked=true`. `COMPLETED` describes the provider run lifecycle, not a successful search.
- Existing captured HTML, step `518310b3-0682-443e-bd6f-e961df966557`, confirms Chromium `ERR_EMPTY_RESPONSE` and “www.pace.cam.ac.uk didn’t send any data.” The snapshot was retrieved through a read-only GET of the existing run, without launching new provider web work. Its byte count and SHA-256 digest are in the [sanitized observation](../evidence/final-attempt-observation.json); the raw capture remains private. This does not establish the underlying network cause or a target HTTP status.
- Configuration: documented direct connection (`proxy_config.enabled=false`), beta-enforced `max_steps=20`, 150-second provider cap. Normal TLS and source scope were retained. No login, CAPTCHA solving, stealth settings or access workaround was used.
- Earlier genuine Agent searches and Fetch/Browser course inspections succeeded. Other isolated Browser sessions encountered `ERR_EMPTY_RESPONSE`. The latest recorded health check also succeeded; these observations do not establish a global outage or a Cambridge access prohibition.

The last transcript preserves its original error. The adapter now classifies the observed browser error-page title as `PROVIDER_FAILURE`, verified offline. This does not establish new live success.

A useful provider investigation would determine why ordinary direct browser navigation sometimes produces `ERR_EMPTY_RESPONSE` for this allowed public URL, including whether the failure occurs in the browser worker, provider egress or target connection. The captured error alone cannot distinguish those causes. Existing private run records may help diagnose it. Do not share API keys, Browser connection URLs, wallet balances or raw private traces. The sent report asks for investigation of existing records only. A new billable reproduction requires separate authorization after the one approved extra attempt has been consumed.

## Support response, 5 November 2026

In reference T-1827, TinyFish Support reported that the browser worker started normally, and three navigations reached the network but received no data from the Cambridge host. They reported other requests from their network with intermittent HTTP 502 responses and successful responses around the same period. Their existing records do not establish whether this was a temporary source fault or request limiting. These are the provider’s findings, not an independent determination of the target’s root cause.

Support recommended retrying ordinary public navigation later and providing new run IDs and times if failures persist. That recommendation does not authorize spending or an access workaround. The user separately approved one bounded retry on 5 November: at most one new 20-step Agent run, three Browser sessions and four Fetch URLs, retaining every historical reservation under a $5.80 aggregate ceiling.

## Authorized retry outcome, 5 November 2026

Run `ee16d35f-c920-4039-a091-8297567b4a9d` completed 10 reported steps and operated the search form. A local document-title/content-anchor validation error was repaired. Explicit continuation preserved that Agent receipt and fetched the catalogue anew; search and standalone Memory inspection passed. No second Agent run was started.

The final comparison Browser session, `tf-255f526d-2f24-4753-b086-3e51961c8aef`, then failed at `navigate_course` with `ERR_EMPTY_RESPONSE`. The comparison returned no partial result. The [conversation](../evidence/conversations/continued-after-validation-fix/MCP-CONVERSATION.md) and [sanitized Browser diagnosis](../evidence/retry-browser-failure.json) preserve this outcome. The latest $0.414 reservation remains counted; no further live verification followed.

After explicit user authorization, the November 5 failure follow-up was sent on November 6 as a reply in support conversation T-1827. Gmail readback confirmed the SENT label, reply reference and exact prepared report followed by the quoted earlier response. The [sent follow-up](../evidence/provider-support-followup-message.txt) and [sanitized receipt](../evidence/provider-support-followup-receipt.json) record this action. Private account/message metadata remain outside the package. No new provider web work was launched. Dispatch does not establish that support has read or resolved the report; any new billable reproduction still requires authorization.
