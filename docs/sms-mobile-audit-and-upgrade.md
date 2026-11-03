# SMS mobile and website audit and upgrade

Audit date: 2026-11-03. This document distinguishes source and automated-test evidence from deployment and carrier acceptance. This is not a production acceptance certificate.

## Architecture findings

- Mobile is Expo SDK 57 / React Native with React Navigation, React Query, Zod, NativeWind, session refresh, secure token storage, and a shared design system. Preserve its installed navigation rather than migrating the application to a new router as part of SMS work.
- Website is Next.js and uses the existing `/messaging` API through the lead messaging service.
- Provider campaigns already have `MessageCampaign`, `MessageRecipient`, immutable `ProviderAttempt`, `DeliveryEvent`, consent, suppression, frequency and quota ledgers. BullMQ dispatch and recovery jobs already implement the provider boundary. These remain the provider source of truth.
- TextBee and Twilio are the implemented SMS adapters. Meta and Twilio WhatsApp are different transports. Neither SMS adapter submits MMS or RCS payloads. The ESP32 paired-phone gateway routes reviewed here handle calls and audio, not campaign SMS; do not advertise that gateway as an SMS sender.
- The private Android SIM AI agent already has campaign, conversation and message records, per-device leases, native attempting/result/delivery reporting, heartbeat, and a foreground service. These remain its source of truth. The manual/direct SIM queue also has its established communication operation/outbox path.
- Provider campaign and history access is scoped to `createdBy`. CRM lead selection is deliberately company-shared in the current implementation. There is no new organization boundary introduced here. Do not describe existing creator scope as a newly verified organization/tenant model.
- Existing provider callbacks verify TextBee raw-body HMAC and Twilio signatures. Provider acceptance is distinct from sending and delivery. Ambiguous submissions are quarantined, not automatically retried.

## Mobile UI inventory

Source audit covered these screen families and their shared layout/UI dependencies:

| Family | Existing strengths | Upgrade approach |
| --- | --- | --- |
| Login, password reset, session restoration/error | Keyboard forms, credential handling, validation, status alerts | Reuse established forms and session behavior |
| Dashboard | Brand hero, KPI cards, loading states, action tiles | Preserve visual and navigation hierarchy |
| Leads, lead form and detail | Paginated directory, search, qualification, communication history | Add shared campaign and SIM message evidence to lead detail |
| Call Agent, campaign lists/details/runs | Readiness, explicit actions, progress, native transport | Add discoverable SMS campaign workspace; keep SIM/call controls |
| Direct SMS composer and SMS queue | Native SIM selection, GSM/Unicode meter, local outbox | Preserve native implementation and route to it from service selection |
| AI SMS launch, campaigns and conversations | Draft/start review, device health, callbacks, qualification | Reuse records in unified lead history without copying |
| Follow-ups and notifications | Virtualized lists, skeleton/error/empty states, refresh | Retain existing component system |
| Settings, readiness, paired phones | Theme, permissions, device health and setup | Add SMS entry without altering setup flows |
| Shared chrome, inputs, buttons, chips, cards | Geist type, navy brand, dark/light tokens, reduced-motion-aware interactions | Increase chip targets to at least 48dp and let screen titles wrap |

This is a source audit. Android screen-size, font-scale, keyboard, TalkBack, contrast under real display conditions, and animation acceptance still need device/emulator review. No visual screenshots were fabricated.

## Implemented changes

### Shared backend

- Credential-safe `GET /messaging/sms-services` is available with existing lead-read permission. Provider adapters expose capabilities of their implemented SMS transport; the response includes enabled/configured/available state, public sender metadata, failure reason, media/subject support, and configured callback support. Provider settings and credentials are not returned.
- Optional actor-scoped campaign creation idempotency keys have a partial unique database index and payload hash. Replaying completed creation returns the original campaign. Reusing a key with changed content is rejected. Incomplete creation cannot start. A simultaneous creation receives a conflict and can retry the same key.
- Recipient rendering order follows explicit selection order, making duplicate-destination selection deterministic.
- Backend segment estimation now accounts for GSM extension septets, non-GSM ASCII, and UTF-16 units for emoji. New recipients persist encoding, characters, units and segments. These remain estimates; the sending carrier/OS performs segmentation.
- Campaign summaries expose eligible estimated segments. Analytics supports a channel filter and reports stored segments for provider-attributed attempted outcomes. This is not carrier billing or a sum of every retry attempt.
- Campaigns accept message-language metadata without changing or translating text. Blank SMS bodies (including text emptied by personalization) and unsupported attachment/media fields are rejected (including when global sanitization strips unknown inputs). Malformed personalization tokens remain eligibility blockers.
- Campaign listing supports provider and creation-date filters in addition to existing search/status/channel/pagination.
- Lead history merges provider records and existing AI SIM message records at read time. It preserves creator scope, filters and pagination. `pending/leased` SIM states appear as queued, `attempting` as submitting, and delivered requires `deliveredAt`. No duplicated provider records are created for SIM messages.

### Mobile

- Dedicated SMS workspace reachable from Call Agent and Settings, with campaign search/status/provider filters, persisted analytics, paginated campaign history and links to existing SIM workflows.
- Provider-first wizard with internal title/description, language metadata, body, personalization chips, company context, URL validation, GSM/Unicode meter and accurate SMS media limitations.
- Existing CRM lead API for paginated individual/multiple selection, search, status and location filters. An all-matching mode uses the existing backend filter selection and recipient safety cap; it does not download the entire CRM.
- Creating a draft never starts sending. Review displays server-rendered per-recipient text, eligibility reasons, counts, estimated eligible segments, sender route and status. Confirm & Send explicitly starts the existing backend queue.
- Returning to edit keeps the form state. Submitting a revised draft cancels its prior unsent draft and creates a new reviewed revision. Started campaigns cannot be revised through that flow.
- Campaign detail polls existing server records, shows dispatch progress and individual delivery evidence, and supports pause/resume/cancel and conservative definite-failure retries. Sending continues on the backend after leaving the screen.
- Lead SMS history reads the same provider/AI SIM timeline as the website and routes back to the correct campaign type.

### Website

- Campaign recipient rows expand to show actual personalized SMS, destination, provider message ID and separate sent/delivered timestamps.
- Lead history expands to complete message text and separate sending/delivery evidence. Android SIM is a history provider filter.
- Existing website campaign creation, queue operations, history polling and provider webhook machinery remain in place.

## Migration and operation

`042_messaging_campaign_idempotency` creates the campaign creation index and backfills segment metadata in batches of 500. It also refreshes eligible campaign segment totals. Apply with the existing migration runner before releasing the updated clients. No migration was run against the user's development or production database during this task.

The existing outbound queue workers, recovery jobs, callback URLs, provider credentials, consent records, provider enable switches, quotas, frequency rules, and regional routing must be correctly configured for the deployment. No live provider settings were changed.

If a process fails after reserving a creation key but before initialization, the partial draft remains blocked from sending; inspect and cancel it rather than generating a second send. Creation is duplicate-safe but is not an automatic transactional repair of partial drafts.

## Verification evidence

- Database integration tests use an ephemeral MongoDB; provider HTTP calls are mocked. Tests cover creation replay, changed-payload rejection, incomplete-draft start protection, capability metadata, explicit queue boundary, duplicate/missing/opted-out recipients, personalized body persistence, acceptance without delivery, receipt updates, shared lead history and creator isolation.
- Additional database test reads existing AI SIM messages in place and checks that sent remains sent until a delivery timestamp exists.
- Existing provider, webhook, personalization, SMS safety, retry, recovery, quota and frequency tests are retained.
- Mobile interaction tests exercise provider choice, invalid URLs, draft-only creation, explicit send confirmation and ambiguous retry blocking. Existing SIM queue, agent, communication, navigation and theme regressions are run.
- Website messaging tests and outreach type checking are run.
- No real SMS has been sent. The user will perform live carrier and physical-device acceptance manually. Only automated integration and unit tests are in scope for this run.

## Remaining acceptance work

- Execute the live carrier test for every configured transport with a confirmed test recipient, then inspect the actual mobile and website records and signed delivery callback.
- Perform physical Android SIM tests for process death, network loss/reconnect, background sending, permission denial, dual SIM and delivery callbacks. Automated native mocks do not establish carrier behavior.
- Review the complete UI on small/large Android screens, dark mode, large fonts and TalkBack.
- The provider wizard does not turn the existing native SIM queue into a provider-backed campaign. Its native selection/composition/recovery path is preserved and separately reachable. SIM campaign dashboards/analytics remain their existing views; unified lead evidence does not imply a merged campaign data model.
- Arbitrary custom-field definitions, CRM-list membership and campaign-linked lead filters are not present in the audited mobile lead contract. They are not simulated. Tag search uses existing directory search; there is no new exact-tag filter UI.
- Cloud-provider campaign date filtering is supported by the backend; mobile currently offers search/status/provider filters. Price estimates are not shown when this route lacks reliable rate data. No unsupported attachment picker, MMS or RCS send controls are advertised.
- New campaign UI copy currently uses English; full translations into the app's other languages remain localization work.

The broad requested Definition of Done remains open until these acceptance and remaining product items are resolved.

## Final automated check results

- Full mobile Jest suite: **61 suites / 471 tests passed**. The runner reported an open-handle warning after assertions, then exited successfully.
- SMS backend checks: **122 unique tests passed** across workflow/database, personalization, provider, webhook, SMS safety and readiness suites (including the added migration backfill test).
- Website messaging and history-filter checks: **26 tests passed**.
- Android profile/prebuild configuration: **4 tests passed**.
- Mobile type check and lint passed. Website outreach type check passed. Server lint returned zero errors and 68 existing warnings across the repository.
- `git diff --check` passed. The bounded AST-only Graphify update was run after the source changes.

Mobile application configuration is incremented to **0.1.8 / versionCode 9** for the requested APK. Native Android telephony/SMS release unit tests: **12 passed**. The shared APK uses the existing production API URL and signing identity. New SMS endpoints and website views require deployment of the backend/website changes and migration 042; installing the APK does not deploy server code.

Incremental shared/play-to-private Android prebuild now removes stale permission-blocking markers for permissions explicitly allowed by the selected profile. A regression test verifies SEND_SMS/RECEIVE_SMS while retaining the READ_SMS block. The shared APK remains send-only and is checked against its final manifest.

## Delivered APK artifacts

Both release APKs are version 0.1.8 / build 9, package `ai.updata.crm`, signed with the existing Updata release identity (certificate SHA-256 `1ecf1bde520788a894331d89673704f1e9279458c10f5ec15fc4f58a71dc72fe`). Signatures and 16KB ZIP alignment passed. Desktop copies were checked against the workspace artifacts.

| Desktop filename | Variant | Size | APK SHA-256 |
| --- | --- | --- | --- |
| `Updata-0.1.8-SMS.apk` | Shared/send-only SIM, four ABIs | 99,830,485 bytes | `08fc898bf0c9087740cfd70d8c0d35cc82b7419605550f5628039c710382a42b` |
| `Updata-0.1.8-PRIVATE-SIM.apk` | Private background SIM agent, ARM64/ARMv7 | 53,374,477 bytes | `66fac6d89ced024e1203ffd2d02142d2867001ac886850da2888cf022efc173c` |

The shared artifact passed the repository's final APK permission/signature/alignment verifier with the send-only option. The private artifact includes SEND_SMS, RECEIVE_SMS, the inbound/result receivers and agent service; it excludes READ_SMS and call-log permissions and is not debuggable. `Updata-0.1.8-Testing.txt` and checksum files are also on the Desktop. No APK was installed onto a device during this task.
