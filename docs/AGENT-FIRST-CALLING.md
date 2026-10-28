# Agent-first calling implementation

## Verified architecture

The Next/React client uses React Query and the existing AI Calling API. Express/Joi validates requests; Mongoose stores owner-scoped campaigns and recipients. CRM leads are shared within this single-company installation; calling agents, campaigns, paired devices and avatar files are scoped to the authenticated owner. There is no organization model to invent a tenant key from.

Before this change, reusable identity and default assignments were missing because agent configuration lived inside campaigns. The immediate run mode also skipped both campaign windows and recipient quiet hours.

The existing execution path is `createCampaign → CampaignRecipient eligibility → startCampaign → outbound-calling tick → recipient lease → pre-dial restrictions → telephonyRouter → LiveKit SIP or pairedPhone → signed webhook/agent tools → processCallResults → CRM outcome mapping`. BullMQ delayed ticks and the reconciliation watchdog already support restart recovery. Browser tests and simulation remain isolated from production lead updates. The existing optional fallback remains unchanged.

## Implementation checklist

- [x] Add reusable owner-scoped agents using the existing questionnaire, voice, rules and schedule schemas.
- [x] Add a private image gallery through existing file metadata and S3 storage.
- [x] Persist default lead assignments independently of campaign recipients.
- [x] Launch immutable campaign snapshots through the existing engine, with durable request deduplication.
- [x] Enforce campaign and recipient hours for immediate and scheduled runs.
- [x] Support explicit future launch, continuation and end conditions through delayed ticks and watchdog recovery.
- [x] Replace the landing page with agents and separate history, calls, analytics, testing and connection tabs.
- [x] Provide agent Overview, Questions, Leads, Settings and Campaign History tabs.
- [x] Preserve legacy campaign operations, simulation, browser tests and exports.
- [x] Verify backend, UI, migration, permissions, scheduling, snapshots and concurrency behavior; document external verification limits.

## Compatibility

Migration 031 is additive. Historical campaigns keep their IDs, recipients and results. Campaigns without `agentId` remain accessible in Campaign History as legacy campaigns. No historical agent identities are invented. New agent campaigns snapshot the existing execution fields and the agent identity; editing an agent does not change earlier runs.

Deployment and test evidence are recorded below.

## Delivered workflows and implementation files

The main screen is an agent gallery with search, availability/readiness/activity filters, sorting, pagination and database-derived metrics. Agent creation has Identity & Avatar, Voice & Instructions, Questions & Behavior, and Review steps; incomplete question rows can be saved as a draft. Agent workspaces separate Overview, Questions, Leads, Settings and Campaign History. Questions and settings have their own subtabs. Unsaved workspace changes are guarded when leaving a tab.

Agent questions reuse the existing campaign question/rule editors. Reordering preserves field keys and CRM answer mappings. Guidance, required/optional answers, choice options, validation, conditions and conversation preview are available. Active configuration validation rejects forward/circular question dependencies; drafts can be completed later.

Lead selection reuses CRM search, status/source filters, detail views, pagination and bulk selection, capped at 500 assigned leads. Eligibility previews identify missing phones, consent problems, suppressions and duplicate numbers. Ineligible defaults may be retained for review; assignment never grants consent or bypasses eligibility. Removing assignments never deletes CRM leads or changes existing campaign recipients.

The launch dialog offers Start Now and Schedule Campaign. Date/time inputs are converted using the selected IANA timezone, with nonexistent or ambiguous DST times rejected. Immediate activation requires no future launch input. Both modes enforce campaign windows, recipient quiet hours, consent and limits before dispatch. One-window runs stop initiating calls at the end of their first permitted window. Continuing across future permitted days is explicit, with an optional absolute end. Active calls finish through the existing processing path.

Every new run stores agent identity/version and the existing questionnaire, voice, rules, schedule and selected lead snapshots. Configuration edits to agent campaigns are rejected by the old campaign update API. Removing queue recipients retains the original agent-campaign lead-selection snapshot, and an emptied run finishes without dialing. Operational pause/resume/cancel/retry remains available; resume preserves snapshotted concurrency and a future scheduled activation. The Configuration tab exposes the original settings and execution dates. The UI distinguishes queued/waiting work from actual calls in progress.

Launch requests use an owner/agent/key unique index, a request fingerprint and a bounded launch lease. The same request returns the same campaign. A changed request cannot reuse the key. Queue acknowledgement failure retains a retryable draft; interrupted recipient initialization is repaired using insert-only upserts. Existing tick tokens, leases, reconciliation and provider ambiguity handling remain the calling engine. A partial launch cannot bypass preparation through the legacy Start endpoint.

Avatar uploads use existing file metadata, storage and signing services. Uploads are decoded, bounded to 5 MB / 25 million pixels, normalized to a maximum 512×512 WebP, and referenced by owner-checked file IDs. Signed URLs are generated on reads. Removing an image retires it from the gallery while preserving existing agent and historical references; it does not prematurely delete referenced storage objects. Agent deletion is limited to agents without campaign history; archive preserves records and prevents future launches.

Primary new files:

- `server/src/modules/aiCalling/callingAgent.{model,validation,service,routes}.js`
- `server/src/migrations/031_calling_agents.js`
- `client/src/modules/aiCalling/services/calling-agent-api.ts`
- `client/src/modules/aiCalling/hooks/use-calling-agents.ts`
- `client/src/modules/aiCalling/schedule-time.ts`
- `client/src/modules/aiCalling/ui/calling-agent-{platform,workspace,editor,primitives}.tsx`
- `client/src/modules/aiCalling/ui/agent-{image-gallery,launch-dialog,settings-fields}.tsx`
- `client/src/modules/aiCalling/ui/question-configuration.tsx`
- `client/src/modules/aiCalling/ui/campaign-overview.tsx`

Existing campaign model/service/validation/routes, types, API hooks, realtime refresh, campaign drawer/wizard and lead picker were extended. `ai-calling-workspace.tsx` delegates to the agent platform. The existing campaign table and connection banner were extracted, not removed. `client/next.config.mjs` accepts `UPDATA_NEXT_DIST_DIR` to isolate QA builds from the running developer server. Existing unrelated workspace changes were retained.

## APIs and indexes

All paths below are relative to `/api/v1/ai-calling` and use the existing authentication, permission and response-envelope conventions:

| Method | Path | Purpose |
| --- | --- | --- |
| GET / POST | `/agents` | List/filter agents and create profiles |
| GET / PATCH / DELETE | `/agents/:id` | Owner-scoped profile, versioned edits, history-safe deletion |
| POST | `/agents/:id/duplicate` | Copy configuration into a draft, without copying lead assignments |
| PUT | `/agents/:id/leads` | Versioned replacement of default lead assignments |
| POST | `/agents/:id/launch` | Idempotent immediate or scheduled execution through existing engine |
| GET / POST | `/agent-images` | Private paginated gallery and bounded multipart upload |
| DELETE | `/agent-images/:id` | Retire an authorized gallery image |

`GET /campaigns` additionally accepts `agentId`. Existing control, simulation, live-test, reporting, webhook and agent-tool URLs remain in use. Agent settings do not accept provider secrets.

Migration 031 adds the agent owner/availability/update index, campaign owner/agent/history index, and partial unique `agent_launch_idempotency` index. The uniqueness applies only to agent launches with a real string key; legacy campaigns are excluded. Down migration removes the new campaign indexes and retains all records. No historical campaign is assigned an invented agent.

## Deployment and rollback

1. Back up the database and deploy the updated API and outbound-calling worker code together. Do not reseed or delete existing collections.
2. From `server`, run `npm run migrate` and verify migration 031 with `npm run migrate:status`. The migration was tested on temporary databases; it has not been applied to the user's live database during this task.
3. Keep the existing Redis/BullMQ outbound-calling worker and AI call reconciliation job running. Schedules live in MongoDB; delayed ticks drive activation and the reconciliation watchdog recovers lost chains. There is no new competing scheduler to deploy.
4. Retain the existing LiveKit/OpenAI agent worker and SIP or verified paired-phone configuration. A configured browser voice route alone does not provide an outbound SIP trunk.
5. Retain the existing S3/MinIO credentials and bucket. The image gallery reuses that storage; no new storage account or public bucket policy is required.
6. From `client`, run `npm run typecheck`, `npm run build`, then deploy the client normally. The default build directory is unchanged. For isolated QA, use `UPDATA_NEXT_DIST_DIR=.next/agent-production`.
7. Verify an authorized test recipient, connection/audio readiness and actual calling outcomes before enabling production outbound traffic.

Rollback: pause/cancel new outbound work first. `npm run migrate:rollback` reverses only the most recent migration, so verify migration status before invoking it. Migration 031 retains agents, campaigns, images and results. Keep the calling-window safety fix when rolling back UI changes; older immediate-mode execution code bypassed the windows and must not be reintroduced into active runs.

## Verification and practical limits

The backend tests use real temporary MongoDB databases, HTTP routing/validation, stored configurations and the existing execution/reconciliation code. Only external provider and queue boundaries are mocked. Browser tests intercept API responses and verify rendering, navigation, forms and control requests; they are not proof of live phone calls.

The real storage smoke test used a new random `ai-calling/qa/…` object key: upload, signed download, byte comparison and deletion all passed. No existing object or CRM record was altered by that smoke test.

A read-only configuration check confirmed that LiveKit credentials are present but cloud SIP is **not configured** (`no_sip_trunk`). No real phone calls were placed. A live call test additionally requires an approved recipient and a verified SIP route or paired phone/audio bridge. Browser voice connectivity and real phone audio remain external verification steps.

This remains the existing single-company CRM: agents/campaigns/images are owner-scoped; CRM leads and consent are company-wide. No independent organization/tenant model was added. Recipient country-to-timezone inference retains the existing limitation for multi-timezone countries; operators must configure appropriate campaign hours for those recipients. The existing engine does not implement recording capture. New agents therefore cannot enable recording: the checkbox explains its unavailability, activation rejects an unsupported recording request, and a draft can retain or clear a legacy preference. No captured recording is promised.

## Delivery verification — 28 October 2026

| Status | Check | Actual evidence |
| --- | --- | --- |
| PASS | Existing backend regression suite | 237 suites, 1,953 tests passed. Real temporary MongoDB; separate Redis test database/key prefix. |
| PASS | Final calling-agent backend checks | 19 agent tests passed; the final combined agent/legacy-workflow run passed all 50 tests, including original selection retention and empty-run completion. |
| PASS | Calling engine/scheduling/workflow checks | 108 tests passed across agent launch, reliability, call-window and workflow suites. Earlier complete AI Calling/provider regression run: 176 passed. |
| PASS | Existing frontend regression suite | 141 files, 738 tests passed. One earlier lead-editor timeout passed in isolation and the complete rerun passed. No unrelated lead-editor code was changed. |
| PASS | Final AI Calling frontend checks | 15 files, 88 tests passed, including stale-assignment cleanup, unavailable recording, agent creation, persistence requests, idempotent launch, image preview, question ordering and DST conversion. |
| PASS | Browser regressions | All 26 distinct desktop/mobile cases passed across agent, legacy campaign and paired-phone suites. Runs were split after updating obsolete single-page layout assertions for the new Connections tab. |
| PASS | Real UI → API → database smoke | Production Next client plus real calling/CRM routes and temporary MongoDB: upload/select avatar, create active agent, save voice/questions, assign leads, reload, launch, invoke existing tick/answer/result processing, then schedule a second run. One full-stack browser test passed. External voice/storage/queue boundaries and the test identity were isolated adapters. |
| PASS | Live avatar storage | Actual configured storage: temporary WebP upload, private signed download, exact byte verification and cleanup all passed. |
| PASS | Migration safety | Migration 031 applied repeatedly and rolled back in tests; agent/campaign records survived. |
| PASS | TypeScript | `npm run typecheck` passed separately; the existing Next config skips type validation during build. |
| PASS | Client production build | Optimized webpack build passed using an isolated output directory. |
| PASS | Module lint | No errors. Client has three native-image performance advisories for already-normalized private avatar URLs. |
| BLOCKED | Real outbound telephone test | Configuration reports `no_sip_trunk`. Requires an outbound SIP route or verified paired phone/audio bridge, plus an approved recipient. No real phone calls were made. |
| PARTIAL | Live voice/audio acceptance | Conversation configuration, dispatch, answers and CRM/result flow are verified through isolated providers; microphone, carrier and hardware sound require the controlled live environment above. |

The implementation is complete for locally verifiable workflows. Production telephone/audio acceptance remains blocked by the external calling setup. This report does not claim a successful real phone call or 100% production acceptance.

Reproduce the principal checks:

```bash
cd server
REDIS_DB=15 REDIS_KEY_PREFIX=updata-agent-qa: npm test -- --runInBand --watchman=false

cd ../client
npm test -- --maxWorkers=2
npm run typecheck
UPDATA_NEXT_DIST_DIR=.next/agent-production npm run build
UPDATA_NEXT_DIST_DIR=.next/agent-e2e PLAYWRIGHT_PORT=3107 npm run test:e2e -- e2e/calling-agents.spec.ts e2e/campaign-calling.spec.ts e2e/paired-phone-status.spec.ts
```

The opt-in full-stack browser check is skipped in a normal backend run. To run it, start the isolated production client and then run the test in another terminal:

```bash
# client/
UPDATA_NEXT_DIST_DIR=.next/agent-production npm run start -- --hostname 127.0.0.1 --port 3117

# server/
AGENT_BROWSER_URL=http://127.0.0.1:3117 REDIS_DB=15 REDIS_KEY_PREFIX=updata-agent-qa: npm test -- --runInBand --watchman=false --runTestsByPath tests/e2e/agent-first-browser.test.js
```

Use a dedicated Redis test database for these commands. The full-stack check creates only temporary database records and mocked phone attempts. Screenshot evidence is available at `/tmp/updata-agent-full-stack.png`, `/tmp/updata-agent-gallery-desktop-chromium.png`, and `/tmp/updata-agent-gallery-mobile-chromium.png` in this workspace session.


## Premium avatar library and requested support profiles

The gallery opens on **Premium avatars**, with People and AI companion filters. **My uploads** retains private image upload/removal. Sixteen original images were generated individually using the built-in image generator, then visually inspected and optimized with Sharp. No image-provider request runs when someone opens the gallery.

- Versioned project assets: `client/public/avatars/agents/`, 512px WebP portraits and 256px gallery thumbnails.
- All 32 image files total 399,102 bytes (about 390 KiB), compared with 34,655,751 bytes of generated PNG originals. The ten added avatars and their thumbnails contribute only 244,710 bytes (about 239 KiB).
- Default collection: ten professional portraits and six AI companions, including Maya, Zara, Elena, Theo, Owen, Ravi, Aster, Echo, Vega, and Sol added to the original six.
- Prompt and optimization manifest: `client/assets/agent-avatars/generation-prompts.json`.
- Authenticated catalog endpoint: `GET /api/v1/ai-calling/agent-avatar-presets`. The trusted catalog is `agentAvatarPresets.js`.
- Agents save a validated `avatarPresetId` or an owner-validated `avatarFileId`. The service rejects simultaneous selections. Duplication and campaign identity snapshots retain preset IDs. Existing agents require no backfill or data migration.
- Deploy the client assets and API together so the new preset URLs and catalog are available together.

The requested profiles are **Aria Customer Support** (customer information) and **Atlas Service Support** (support-service intake). Each has exactly six questions, an AI disclosure, friendly voice instructions, optional nonessential fields, and a premium avatar. They have no lead assignments and profile creation never starts a campaign.

Their definitions are in `server/scripts/data/support-agent-profiles.json`. The explicit-owner helper `node scripts/create-support-agents.mjs --owner-id <User ObjectId>` validates and previews the setup. Adding `--apply` saves missing profiles using the existing service. It never overwrites existing profiles, assigns leads, or launches campaigns. It is an operator command, not an automatic seed on application startup.

Avatar/support-profile validation: 21 backend agent tests, 11 frontend agent tests, and two Playwright cases (desktop and mobile) passed. Typecheck and scoped lint completed with no errors; the gallery retains three native-image optimization advisories because its WebP assets are already optimized. The two requested profiles were saved under the verified Salman Admin account and confirmed through a fresh database connection.

The expanded 16-avatar collection passed the 21 existing backend agent tests and the desktop/mobile gallery browser checks. The browser checks select the newly added Maya preset and confirm its image after saving and reloading. Every catalog URL, file size and prompt entry was also checked against the saved assets.


## Assigning leads during setup and from CRM

- **Create Agent → Assign leads** is the fourth setup tab. Search the real CRM lead list, filter by status/source/type/business type/country/city/area, select individual leads or all matching results (up to 500), and save with the agent. The review tab includes the selected count. Drafts may be saved with assignments before voice/questions are complete.
- Agent cards include **Assign leads**, and the assigned-lead count opens the agent's Leads tab directly. Existing Leads-tab assignment remains a reviewed replacement of the defaults.
- On **Leads**, use a row's **Assign to calling agent** menu item for one lead. Select multiple rows and use **Assign to agent** in Bulk actions for a batch. Search and filter the available agents, choose one, review new/already assigned counts, then confirm.
- CRM additions preserve existing agent assignments and deduplicate IDs. Leads without phone numbers may be assigned for later completion; calling eligibility remains enforced by the calling engine. Assignment does not launch calls or alter a running campaign's recipients.
- `POST /agents` accepts optional `assignedLeadIds` and validates availability before saving the agent. Configuration PATCH cannot replace lead assignments.
- `PUT /agents/:id/leads` accepts optional `mode: add | replace` (default `replace`), along with `leadIds` and `version`. Add mode validates incoming leads, retains existing IDs, checks the combined 500-lead limit, and uses the same owner/version/launch-lease guards. Concurrent edits return a conflict for the user to retry. Archived agents reject new additions.

Lead-assignment verification: 24 backend agent API/service tests, 56 targeted client tests, and 14 desktop/mobile browser cases passed. The browser cases cover saving assignments with a new draft, the direct agent-card action, single-lead assignment, bulk assignment, and preserving existing assignments. No production lead assignments or calls were made by these tests.


## Conversation transcripts, live speakers, and unanswered questions

Live call cards retain up to 30 recent turns, with the full retained transcript available in Call details. Both sides are labeled with the snapshotted agent name and CRM lead name. Transcript uploads preserve worker speech timestamps, retain ordered turns across temporary upload failures, use stable IDs for deduplication, and reconcile the recent SDK speech history before call completion and worker shutdown. Transcription detects the spoken language independently of the agent's response language, supporting language switches; `OPENAI_REALTIME_TRANSCRIBE_LANGUAGE` can explicitly force an ISO language hint when required. Call details retry after initial network failures as well as during an active call.

**Listen to both voices** joins the call's LiveKit room with an owner-scoped, two-minute receive-only token. It subscribes to both the agent and phone/browser audio tracks; the token denies microphone and data publishing. Users can stop listening, change speaker volume, or explicitly enable playback when the browser blocks autoplay. Opening a second listening view stops the first. Closing the view or ending the call disconnects the listener and detaches all audio tracks. Paired gateways must advertise `gateway.monitorSafe: true` in a fresh heartbeat before the API issues a listening token; older/reverted gateways remain blocked until updated and reconnected. Listener identities are excluded from gateway agent-presence checks and are never selected as the voice worker's caller. This is live listening, not a recording or synthetic transcript playback; audio from previously unrecorded calls cannot be recovered.

A voice question gets its initial ask plus **three repeats**. Silence is handled by a per-question watchdog instead of ending the whole call after two quiet periods. Speech and model-processing time do not count as silence. Unrelated or unintelligible replies use the constrained `no_response` tool; invalid answers and missing responses share the bounded repeat budget. After exhaustion, the question remains unanswered/invalid, the next applicable question is asked, and required gaps go to human review. Explicit unknown/skip, refusal, do-not-contact, callback, and human requests retain their separate control paths. No affirmative confirmation is assumed from silence, and the model cannot call its ordinary finish tool before the backend reaches finish/end. Disconnects, maximum duration, voicemail, and hardware failures remain independent termination paths.

The authenticated worker endpoint `POST /api/v1/ai-calling/agent/:callId/no-response` accepts the current field, a UUID request ID, and `silence | unrelated | unintelligible`; duplicate events cannot consume another repeat. The public owner endpoint `POST /api/v1/ai-calling/calls/:id/monitor` returns only receive-only room credentials and rejects ended calls and unavailable/taken-over audio. No lead or campaign is created or launched by listening.

Protocol review used the installed LiveKit SDK and the [official OpenAI Realtime conversation guide](https://developers.openai.com/api/docs/guides/realtime-conversations). No model migration was introduced. Roll out the API, agent worker, client, and phone gateway changes together; restart worker/gateway processes only after active calls finish. Optional call-record fields are additive and need no data backfill.

Verification completed with 113 unique backend conversation/provider/paired-phone workflow tests, 41 worker tests, 19 gateway tests, 29 targeted client tests, and two desktop/mobile browser cases. Typecheck and scoped lint passed. Audio track playback was tested using simulated remote tracks; no real phone call was placed. The downloadable gateway package is rebuilt as version 0.3.2 with passive-listener support.
