# Lead lifecycle automation audit

## Existing architecture and integration plan

The audit followed Graphify queries and reverse dependencies, then verified the source. Extend the following modules in place; no second lead store, follow-up store, email provider, scheduler, or campaign engine is needed.

| Concern | Existing implementation | Integration |
| --- | --- | --- |
| Call completion | `aiCalling.service.processCallResults`, atomic processing lease, persisted answers, reconciliation sweep | Save calls first; create follow-ups before marking results processed. Reconciliation repairs interrupted writes. |
| Qualification | `questionEngine`, answer validation, ordered `statusRuleEngine` campaign rules | Required/conditional answers and critical confirmations gate qualification. Incomplete/ambiguous/interrupted calls require review. |
| Lead transitions | `_applyOutcomeToLead`, compare-and-set status writes, `LeadCallTransition`, manual override protection | Keep existing lead statuses; expose distinct call and qualification labels in `Lead.latestCall` and pipeline membership in `pipelineStage`. |
| Follow-ups | `LeadFollowUp`, unique `sourceKey`, `leadFollowUp.service` | Use `ai_call:<callRecordId>` for both qualified calls and callbacks, preserving one task for replayed completion events. |
| Email | `LeadOutreachComposer` → messaging campaigns → `existingEmail.provider` → doctpl email service and dispatch job | Open the existing composer from the inbox; retain previews, templates, drafts, scheduling, consent, suppression and duplicate-send controls. Add the existing rich-text editor. |
| History | `leadTimeline.service` | Include lifecycle evaluations and email recipient/provider/failure metadata; mobile consumes the same governed, paginated API. |
| Scheduling | Existing follow-up lifecycle and `leadSla.service.sweep` | Extend tasks with activity type, priority and configurable reminders. Notification dedupe follows the existing scheduler pattern. |
| Access | Existing RBAC, company/team governance middleware, call-owner transcript restrictions, PII masking | Preserve permission checks and governed lead lookups. Email call-summary personalization only reads a call owned by the campaign creator. |

## Behavior after integration

* Technical call state and qualification remain separate. `CALL_COMPLETED` can coexist with `NOT_QUALIFIED`.
* All required, applicable answers must be valid, with critical answers confirmed. Ordered administrator rules determine the verdict. Complete validated answers that fail an explicitly configured qualifying rule become unqualified; absent qualification criteria, completion only records contact.
* A qualified real campaign call creates an open email follow-up, assigned to the lead owner or campaign creator, then sets `pipelineStage=FOLLOW_UP`. No email is sent by call completion.
* A valid answer to an explicitly configured email contact question fills an empty lead email field before follow-up creation. Existing addresses are never overwritten.
* The task retains call, campaign and agent references, qualification and recommended action. Answers, call notes, transcript and recording stay in the authoritative call record, retaining existing access and retention rules.
* Callbacks retain their exact ISO timestamp or the lead's original words. An ambiguous requested time creates a task due now for scheduling; no callback time is fabricated.
* Partial answers stay in review and do not enter qualified follow-ups. Lost audio/human takeover prevents automatic qualification. Cancellation is terminal and does not schedule a retry.
* A refusal or negative verdict closes earlier automatic AI-call tasks while preserving their history and any manually created tasks. Existing DNC suppression remains authoritative. Explicit conversation control takes precedence over a subsequent carrier error.
* A failed follow-up write leaves the call saved and unprocessed; its expired processing lease is retried by the existing reconciler. Email processing is independent of calling progression.
* Follow-up metrics count distinct visible leads, pending activities and actual email timestamps/statuses. Provider acceptance never creates a delivered count. Existing `undelivered` is counted as failure; no conflicting bounced/delivery enum is introduced.
* The inbox supports contact details, separate lifecycle indicators, ownership, last-call time, search, qualification/channel/owner filters, due-date sorting, cursor pagination, confirmed bulk completion/cancellation, scheduling and direct email composition.
* Task reminders use the existing background sweep and in-app notifications. Each due time has a dedupe key; snoozing re-arms the reminder.

## Compatibility and operational limits

* Existing lowercase call/qualification/lead enums remain the storage contracts. Uppercase lead lifecycle labels are a presentation projection, not replacements for historical values.
* New schema fields are additive. Existing records are not replayed or requalified and historical transcripts/recordings are not copied into new stores. Previously processed calls are not silently replayed into new outreach tasks.
* The lead-campaign messaging contract explicitly rejects attachments and does not expose CC/BCC. Those options remain unavailable in this composer; adding them requires extending that existing contract and attachment authorization. No second send path was introduced.
* `companyName` retains the existing sender-company meaning. `businessName` represents the target business. `qualificationStatus` and owner-authorized `callSummary` are available; generic `customField` requires an explicit value/fallback rather than guessing a customer field. Missing lifecycle placeholders block eligibility.
* List scheduling is integrated. A separate calendar view, automatic email-sending rules and an organization tenancy migration are not included.
* The user clarified the current CRM serves one organization; organization creation and shared-database multi-tenancy are future work. Preserve current company/team access and the existing startup guard (`server/src/config/tenancyGuard.js`), which refuses `MULTI_TENANT_MODE=true`. Current user ownership and governance are not a multi-tenant boundary.
* Required workers remain the existing calling reconciler, messaging/email workers and lead SLA sweep. No live call or customer email is sent during automated validation.

## Validation

Regression coverage includes qualified/partial/negative qualification, callback time handling, no-answer retries, cancellation, interrupted audio, protected converted leads, duplicate completions, failed handoff recovery, campaign progression, reminders and snooze dedupe, distinct-lead/email metrics, search/filter/sort pagination, unified history, email failure/retry/idempotency and governed access. Website tests exercise suppression checks before opening the existing email composer and confirmation before bulk actions. Mobile tests exercise the shared call/email timeline and follow-up screens.

The test providers are mocked; production telephony, outbound email delivery webhooks and organization deployment isolation require deployment-level verification. Automated regression results and type/lint results are reported with the implementation handoff.

## Future organization support (explicitly deferred)

Before a tenant cutover, obtain the authoritative user-to-organization and lead-to-organization mappings, identify provider accounts that are shared, and reconcile records with conflicting ownership. Then add server-resolved tenant context to authentication and worker credentials; migrate indexed tenant IDs and tenant-scoped uniqueness across records, roles, files, counters and settings; scope every query, lookup, assignment, event, webhook, queue payload, socket room and storage key. Unmapped or conflicting records must remain inaccessible until resolved. Retain the existing startup guard until negative cross-tenant HTTP, background-job, provider-event and storage tests pass. The user explicitly deferred this work; it is outside the current lifecycle upgrade.

Verified regression results: 267 backend checks across 10 suites (the final calling-suite rerun adds two collected-email preservation cases); 26 website checks across 3 suites; 10 mobile checks across 4 suites. Ten Playwright desktop/mobile scenarios passed across the initial run and targeted reruns: one initial check was interrupted by development hot reload, and another failed during artifact cleanup when two Playwright processes shared an output directory. Both passed separately. Website and mobile type checks pass; changed backend files and mobile lint pass, with one pre-existing website effect warning. The bounded Graphify update is run after source changes.
