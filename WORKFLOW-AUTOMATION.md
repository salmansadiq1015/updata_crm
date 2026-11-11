# Workflow Automation — Audit, Architecture & Runbook

Status: in development (2026-11-10). This document is the Phase-1 audit deliverable and the
architecture reference for the `workflowAutomation` module. The implementation report is at the end.

## 1. Audit (verified against source, 2026-11-10)

| Feature | Existing status | Evidence | Required action |
|---|---|---|---|
| AI outbound calling | Working | `aiCalling/aiCalling.service.js` `createCampaign` :287, `startCampaign` :663, `processCallResults` :1824 | Preserve. Workflow AI-call node creates a single-lead `CallCampaign{kind:'workflow'}` with `launchKey` (same pattern as follow-ups) |
| Incoming AI calls | Working | `inboundCalling/inboundCall.service.js` `finalize` :937 | Preserve. Publish one domain event after finalize |
| AI agent management | Working, questionnaire-only | `callingAgent.model.js`; prompt `engine/leadContext.js` `buildSystemPrompt` | Extend: optional goal-driven **mission** mode (default off = unchanged prompt) |
| Follow-up / callback calling | Working | `followUpCalling.service.js`, `crm/leadFollowUp.service.js upsertFromSource` | Reuse for callback node (idempotent `sourceKey`) |
| Lead management | Working (`Lead`, status `new/contacted/qualified/unqualified/converted`) | `crm/lead.service.js update` :217, `leadQualification.service.js mergeAnswers` :170 | Reuse. No parallel lead model |
| Lead timeline | Working; LeadEvent closed enum | `crm/leadEvent.model.js recordLeadEvent`, timeline type `workflow` | Extend enum with `automation.*` types so runs appear in the existing timeline |
| Contact policy / consent / DNC / quiet hours | Working | `contactPolicy.service.js check` :125 | Reuse: re-checked immediately before every outbound action (in addition to the downstream gates) |
| Lead-level call lock | Working | `aiCalling/leadCallLock.js` | Reused implicitly by the dial pipeline |
| SMS / WhatsApp / Email (provider) | Working, campaign-based | `messaging/messaging.service.js createCampaign` :345 (idempotencyKey), `startCampaign` :677 | Reuse: message node = single-lead messaging campaign with idempotency key |
| Delivery status / inbound replies | Working, no events | `applyProviderEvent` :1924, `suppressInbound` :1983 | Publish domain events (delivery, inbound reply) |
| Email opens | Not available | — | Not exposed as trigger (no pixel tracking exists) |
| Tracked links / click tracking | **Missing** | only `linkAssistant` tokens | **New**: `TrackedLink` + public redirect with scanner filtering |
| Notifications / tasks | Working | `notification.service.js create` :97, `tasks/task.service.js create` :21 | Reuse |
| Domain event bus | Exists, unused by calling/messaging | `shared/events/EventBus.js` (+DLQ) | Reuse; add minimal `publish` calls at existing hook points |
| Queue | BullMQ via `QueueManager` (same process as API) | `shared/queue/QueueManager.js` | Reuse: one new queue `workflow-automation` + 1-min sweep |
| Workflow builder | **Missing** | no `@xyflow`, no automation module | **New** frontend module |
| Workflow engine / branching / delays / versions | **Missing** (`ai/workflows` is the LLM assistant's internal graph, unrelated) | — | **New** backend module |
| Execution history / analytics | **Missing** for automation | — | **New** |
| Tenancy | Single-tenant (no orgId anywhere); `MULTI_TENANT_MODE=true` refuses startup | memory/arch notes | Scope by RBAC + `createdBy`, consistent with every other module. No tenant layer invented |
| WhatsApp received / Email received triggers | WhatsApp inbound webhook exists (Meta/Twilio); mailbox module separate | | WhatsApp/SMS inbound → `message.received` trigger. Email-received trigger not exposed (no lead-linked inbound mail event) |

### Compatibility risks found
1. `callingAgent.service.js:258` blocks agent launch when any non-`follow_up` campaign is active, and `listCampaigns` hides only `follow_up`. A new `workflow` kind must be excluded in both places (done via shared `AUXILIARY_CAMPAIGN_KINDS`).
2. `assertQuestionnaire` requires ≥1 question; mission mode therefore still uses questionnaire fields as its "information to collect" (required/optional) — this keeps structured output, validation, disposition and lead mapping identical.
3. EventBus is in-process fire-and-forget. Durability must not depend on it: waiting AI-call steps are also resolved by the sweep reading `CampaignRecipient`/`CallRecord` state.
4. All API instances run BullMQ workers ⇒ every run advance uses a Mongo CAS lease (`lockUntil`) so two processes never advance the same run.

## 2. Architecture

```
            ┌──────────── existing modules (unchanged behaviour) ────────────┐
 aiCalling ─┤ processCallResults ─┐   inboundCalling.finalize ─┐            │
 messaging ─┤ applyProviderEvent ─┼─► eventBus.publish(...)  ◄─┘  lead.service create/update
            └─────────────────────┼──────────────────────────────────────────┘
                                  ▼
                   workflowAutomation/workflow.events.js  (subscribe)
                     ├─ resume WAITING runs whose wait matches
                     └─ start runs for PUBLISHED workflows whose trigger matches
                                  ▼
          WorkflowRun (Mongo, persistent state machine) ◄── sweep job (every minute):
                                  │                          due timers, expired leases,
             engine/runner.js  advance(runId) under lease     AI-call wait fallback
                                  ▼
          node registry (engine/nodes/*) ── each: schema · validate · execute
             ai_call → aiCalling.createCampaign/startCampaign (launchKey)
             send_sms/whatsapp/email → messaging.createCampaign/startCampaign (idempotencyKey)
             schedule_callback → leadFollowUp.upsertFromSource (sourceKey)
             update_lead/add_tag/assign → lead.service.update
             notify → notification.service.create (idempotencyKey) ; create_task → task.service.create
             condition → pure evaluator (AND/OR, nested groups)
             delay / wait_for_event → WAITING with nextRunAt / event match + timeout
```

### Data model (collections)
- `workflows` — name, status (`draft|published|archived`), `draft{nodes,edges}`, `publishedVersion`, trigger index fields, stats.
- `workflowversions` — immutable published graph snapshots `{workflowId, version}` unique.
- `workflowruns` — one per (workflow, lead, enrollment key) — unique `enrollmentKey`. Holds version pin, status, `currentNodeId`, `wait`, `context`, `steps[]`, `visits`, lease, `nextRunAt`.
- `workflowevents` — unified, append-only timeline (`dedupeKey` unique, TTL-free; retention via sweep option).
- `workflowcampaigns` — enrollment batches (leads + workflow version) with pause/resume/stop.
- `workflowlinks` — tracked links (token, target, run, clicks, scanner hits).

### Execution guarantees
- **Version pinning**: a run stores `versionId` and executes that immutable snapshot.
- **Idempotency**: every side-effect uses a deterministic key `wf:<runId>:<nodeId>:<visit>` passed to the downstream service's own idempotency mechanism (`launchKey`, `idempotencyKey`, `sourceKey`, notification `idempotencyKey`, LeadEvent `dedupeKey`). A step is persisted as `running` with its key *before* the side-effect, so a crash replays with the same key.
- **Leases**: `advance` acquires `lockUntil` via `findOneAndUpdate`; expired leases are recovered by the sweep.
- **Loop safety**: publish-time validation rejects cycles that do not pass through a delay/wait node; runtime caps per-node visits (`maxVisits`, default 5) and total steps per run (200).
- **Eligibility**: `contactPolicy.check` immediately before each external communication; a lead that opted out mid-run is skipped (`skipped` step, `blocked` branch) rather than contacted.

### Permissions
`workflow:read`, `workflow:write`, `workflow:publish`, `workflow:execute` (seeded; Admin inherits all; `workflow:write` ⇒ read, `workflow:publish`/`execute` ⇒ read).

## 3. Implementation report (2026-11-10)

### 3.1 What was built
| Area | Status | Notes |
|---|---|---|
| Visual builder (`/automation/workflows/:id`) | Implemented + browser-tested | @xyflow/react canvas, palette (drag or click), per-node config forms, nested AND/OR condition builder, undo/redo, copy/paste/duplicate, multi-select, keyboard shortcuts, auto-layout, minimap, zoom, live server validation, dry-run test with path overlay, publish dialog, version history + rollback, optimistic-concurrency saves, read-only mode, responsive sheets |
| Node catalog (28 types) | Implemented + tested | 11 triggers, 3 AI, 5 communication/notify/task, 5 CRM, 3 logic, End (10 outcomes) |
| Execution engine | Implemented + tested | Persistent runs, version pinning, leases, crash replay with same idempotency key, retries, waits, loop limits, manual retry/skip/pause/resume/stop |
| Goal-driven AI conversation (mission mode) | Implemented + tested (prompt level) | Opt-in per agent; default prompt byte-identical to before (verified on 8 configs) |
| Event tracking / unified history | Implemented + tested | WorkflowEvent log + existing lead timeline (LeadEvent `automation.*`) |
| Tracked links | Implemented + tested | `/t/:token`, scanner filtering, first-human-click event, no open redirect |
| Campaigns | Implemented + tested | Explicit leads or filters (≤5000), pause/resume/stop, skip reasons, progress |
| Templates | Implemented + tested | 6 built-in; user workflows can be flagged as templates / duplicated |
| Monitoring & analytics | Implemented + browser-tested | Overview, lists, inspector, event history, analytics |
| i18n (de/en/fr/ar, RTL) | Implemented + tested | ~760 keys across 4 files; completeness tests; RTL verified in browser |

### 3.2 Reused (not duplicated)
AI calls → `aiCalling.createCampaign/startCampaign` (single-lead `kind:'workflow'`, `launchKey`); call results → `processCallResults`; callbacks → `leadFollowUp.upsertFromSource` + `followUpCalling.assignAgent`; SMS/WhatsApp/email → `messaging.createCampaign/startCampaign` (`idempotencyKey`), consent/suppression/frequency gates intact; contact eligibility → `checkContactSuppression` immediately before every call/message; CRM → `lead.service.update`, `leadQualification.mergeAnswers`, `recordLeadEvent`; notifications → `notification.service.create`; tasks → `task.service.create`; queue → `QueueManager`/`BaseWorker`; events → `EventBus` (+DLQ); calling windows → `engine/callWindow.js`; knowledge → existing per-agent knowledge base.

### 3.3 Changes to existing files (all additive / backward compatible)
- `aiCalling`: `kind` enum + `workflowRunId` on CallCampaign; `AUXILIARY_CAMPAIGN_KINDS` used in campaign list + agent launch check (workflow calls never block a normal launch); one `eventBus.publish` after call processing; optional `conversationMode`/`mission` on agentConfig (model + Joi + prompt).
- `inboundCalling`, `messaging`, `crm/lead.service`, `crm/leadQuality.hooks`: one fire-and-forget publish each (wrapped in try/catch).
- Enum extensions: LeadEvent `automation.*`, LeadFollowUp source `workflow`, Task source `WORKFLOW`.
- Wiring: `app.js` (3 mounts), `jobs/index.js`, `runtime.js`, `eventTypes.js`, `seed.js` + implication maps (server + client mirror).
- Client: nav section, breadcrumbs, translations merge, agent editor "Conversation mode" tab.

### 3.4 API
`/api/v1/workflows` — catalog, templates, CRUD, `/:id/validate|test|duplicate|publish|status`, `/:id/versions[/:v[/rollback]]`, `/campaigns[...]` (+`preview|start|pause|resume|stop`), `/runs[/:id[/:action]]`, `/events`, `/analytics`, `/leads/:leadId/history`.
Public: `GET|HEAD /t/:token` (tracked link), `POST /api/v1/workflow-hooks/:workflowId/:token` (webhook trigger, rate-limited).
Permissions: `workflow:read|write|publish|execute` (Admin gets all via boot seed; other roles via role management).

### 3.5 Data, queue, dependencies
- Collections: `workflows`, `workflowversions`, `workflowruns`, `workflowevents`, `workflowcampaigns`, `workflowlinks`. Migration **050** (indexes + permissions; no existing documents modified).
- Queue `workflow-automation` (concurrency `WORKFLOW_QUEUE_CONCURRENCY`, default 5) + 1-minute sweep; runs inside the existing API process like every other job.
- New dependency: `@xyflow/react@12.12.0` (client, MIT, pinned). No server dependencies added.
- Optional env: `WORKFLOW_LINK_BASE_URL` (falls back to `PUBLIC_API_BASE_URL`).

### 3.6 Tests executed (actual results)
- Server new: engine 37/37, integration 16/16 (real calling + messaging pipelines on in-memory Mongo; telephony mocked), mission 3/3.
- Server full regression: 2,687 passed / 3 failed / 1 skipped — the 3 failures (`aiCalling.followUpCalling` ×2, `pairedPhone.adversarial` ×1) fail identically on an untouched `HEAD` checkout.
- Client: full suite 1,198 passed / 1 failed — the failure (`leads/lead-contact.test.tsx`) fails identically on `HEAD`. Workflow module 24/24, translation tests 9/9, typecheck 0 errors, eslint 0 problems on new/changed files.
- Live stack (isolated in-memory DB + local Redis, real BullMQ worker): HTTP end-to-end 32/32 checks; headless-browser UI run 14/14 checks with 0 console errors (builder create/save/publish, inspector, dark mode, 390 px phone width with no horizontal scroll, Arabic RTL, German).

### 3.7 Known limitations / not verified
- No real phone call, SMS, WhatsApp or email was sent: telephony was mocked and no messaging provider was configured. Messages were verified up to "queued in messaging".
- Triggers not available because the source events don't exist yet: **email received**, **email opened**; SIM-SMS (own phone) replies are not wired as "message received" (provider SMS/WhatsApp only).
- Not covered by an automated test: the schedule trigger's firing in the sweep (its time maths is unit-tested), the in-process fallback when Redis is down, and opt-out via email unsubscribe (SMS STOP is tested).
- No retention/TTL for `workflowevents` yet.
- Single-tenant by design (the app has no organization model; `MULTI_TENANT_MODE=true` refuses startup) — access is RBAC-scoped.
- Android app untouched; not regression-tested on a device.

### 3.8 Deployment
1. ⚠️ `deploy/deploy.sh` runs **all pending migrations**. Per the ops notes, production still has 025–044 pending — deploying will run those too, not just 050. Decide/back up first (`mongodump`).
2. `cd server && npm run migrate` (or let deploy.sh), restart `updata-api`; the boot seed grants `workflow:*` to Admin.
3. `cd client && npm ci && npm run build`, restart `updata-client`.
4. Verify: `/automation` loads for an admin; `GET /api/v1/workflows/catalog` → 28 types; publish a manual-trigger workflow with an End step and run a 1-lead campaign.
5. Rollback: revert the code; migration 050 `down()` is a no-op by design (collections are inert without the module; existing data untouched).

---

## 4. Workflow Builder 2.0 — audit (2026-11-10, before changes)

Verified against source and the builder screenshot (dark mode, "Aria Customer Support" agent). Lifecycle checked per node: UI → config → validation → saved definition → execution → result → next node.

| # | Finding | Type | Action |
|---|---|---|---|
| A1 | **"Failed" branches never fire.** `ai.call`, `ai.callback`, `msg.*` expose a `failed` port, but refusals (`call_launch_refused`, `message_refused`, `agent_unavailable`, …) return `status:'failed'` and the runner fails the whole run even when the branch is connected | Engine bug | Runner routes a failure to the node's `failed` port when it is connected (error kept on the step) |
| A2 | Branch labels truncated on cards ("Answe…", "No ans…", "Not all…"); subtitle truncated | UI bug | Wider cards, full-width branch rows that wrap, tooltips |
| A3 | Dead-end warning "Nothing follows this step; the run ends here." is not actionable | UX | Explanation + fix + quick actions (add End step, mark as intentional end) |
| A4 | Internal node IDs shown by default in the inspector | UX | Moved to an Advanced section (with raw config) |
| A5 | No validation panel with severity / explanation / fix / go-to | Missing | New panel; info-level suggestions; publish blocks only on errors |
| A6 | Toolbar lacks minimap toggle and a "Validate" action | Missing | Added |
| A7 | Palette: no recently used / favorites; "Conditions & timing" mixed; no Integrations group | Missing | Recents + favorites (per user, local), categories split, Integrations group |
| A8 | No per-node test; no explicit live test | Missing | "Test this step" (dry run from the node); live test = 1-lead campaign, separate permission + confirmation |
| A9 | No autosave | Missing | Debounced draft autosave (never publishes) |
| A10 | End states missing: not qualified, interested | Missing | Added with CRM mapping |
| A11 | CRM "Create follow-up" (human task in the follow-up inbox) missing; outgoing integration (webhook) missing | Missing | `crm.follow_up`; `integration.webhook` (HTTPS only, SSRF-guarded, HMAC-signed, idempotency header) |
| A12 | AI call card does not show the agent language | UI | Summary shows agent · language · attempts |
| A13 | 6 of 10 requested templates | Missing | SMS, WhatsApp, Email follow-up and multi-channel qualification added |
| A14 | **AI Workflow Copilot does not exist** | Missing | New: server tool-calling loop over the existing OpenAI factory (`shared/ai/llmFactory.js`), schema-validated graph operations streamed (SSE) and applied live to the real editor state; undo per AI turn |
| A15 | "Email received" trigger | Not possible yet | No lead-linked inbound-email event exists in the CRM; not exposed (unchanged) |
| A16 | "Update custom fields" | Not possible | Leads have no custom-field model; not exposed (documented) |

Works end-to-end (verified by the existing integration tests + live QA): all triggers listed in §3, ai.call / ai.analyze / ai.callback happy paths, messages up to provider queue, CRM nodes, condition, delay, wait_event, end, versions, campaigns, tracked links, webhooks, manual controls.

## 5. Workflow Builder 2.0 — implementation report (2026-11-10)

### 5.1 Fixed / added (status per audit item)
| # | Item | Status |
|---|---|---|
| A1 | Failures route to a connected **Failed** branch (error kept on the step) | Fixed + tested |
| A2 | Node cards: full branch labels (wrap, tooltip), clear title, type tag, multi-line summary (AI call: agent · language · attempts), run state pill, AI highlight | Done + browser-verified (no truncated labels) |
| A3 | Actionable dead-end / open-branch messages with **Add End step** and **Mark as intentional end** quick actions (`config.intentionalEnd`) | Done + tested |
| A4 | IDs and raw config moved to an **Advanced** section | Done |
| A5 | **Check** panel: errors / warnings / suggestions, explanation + recommended fix per code, go-to-step, quick fixes; publish blocks only on errors | Done + tested |
| A6 | Toolbar: Build with AI, Check (count), Test, minimap toggle, autosave toggle | Done |
| A7 | Palette: favorites + recently used (per browser), categories Triggers · AI · Communication · CRM · Conditions · Delays & scheduling · Integrations · End | Done |
| A8 | **Test this step** (dry run of one step) + **Live test** (published version, 1 lead, `workflow:execute`, explicit confirmation) | Done + tested |
| A9 | Draft **autosave** (4 s debounce, paused while the copilot works, never publishes) | Done + browser-verified |
| A10 | End states **not qualified**, **interested** (+ CRM consequence text for every outcome) | Done |
| A11 | `crm.follow_up` (human follow-up in the inbox) and `integration.webhook` (HTTPS-only, DNS-resolved private-address block, no redirects, timeout, HMAC `X-Updata-Signature` with `WORKFLOW_WEBHOOK_SECRET`, idempotency header, retries → Failed branch) | Done + tested |
| A13 | Templates: SMS / WhatsApp / Email follow-up, multi-channel qualification (10 total) | Done + tested |
| A14 | **AI Workflow Copilot** | Done + tested (scripted + real model + browser) |

### 5.2 AI Workflow Copilot
- **Server** `modules/workflowAutomation/copilot/`: `graphOps.js` (pure, schema-validated operations: add / update / connect / disconnect / remove / tidy layout), `spec.js` (node spec for the model; test keeps it in sync with the catalog), `copilot.service.js` (OpenAI tool loop via `shared/ai/llmFactory.js`, model = `OPENAI_MODEL`).
- **Endpoint** `POST /api/v1/workflows/:id/copilot` → Server-Sent Events (`status`, `op` with the graph after each operation, `op_error`, `question`, `rename`, `message`, `done`, `error`). `workflow:write`, 20 requests/min/user, aborts the model call when the browser disconnects, each turn audited (`workflow.copilot.turn`, counts only).
- **Safety**: the model only edits a copy of the editor graph; the server never saves, publishes or starts campaigns. Agent / template / user ids are checked against the CRM (invented ids are rejected and the model is told the real options). Pre-existing steps can only be removed when the user's own words (≥ 10 chars, explicit removal verb in de/en/fr/ar) are quoted; steps the copilot added in the same turn may be cleaned up. If the model stops with blocking errors, a repair round asks it to fix them (max 2).
- **Quality aids**: proven recipes in the prompt (bounded retry loop with delay, analysis branches → end states, consent-aware messaging), `start_from_template` for empty canvases, questions must offer concrete options.
- **Client**: right-column tabs (Settings · AI Copilot · Check); copilot panel with live step checklist, questions with real agent cards, safe Markdown, stop, new conversation, **Undo these changes** per AI turn (plus normal undo/redo), "Help me configure this step" from the inspector; conversation kept per workflow in session storage.

### 5.3 Evidence
- Server: workflow suites 75/75 (incl. copilot 13: graph ops, spec coverage, scripted model build, resource + removal guards, questions, failed-branch routing, follow-up, webhook SSRF/signature/retry, single-step test, new templates).
- Client: workflow + i18n suites incl. copilot panel / SSE / validation panel tests; typecheck 0, eslint 0 errors.
- **Real model** (isolated in-memory DB, synthetic data, `gpt-4o`): the brief's lead-qualification request → template + customisation streamed as 14 operations in ~34 s, 0 blocking errors, bounded retry loop, every analysis branch ended; "change the retry delay to 48 hours" changed only the delay step (all 14 steps preserved); "explain" changed nothing; an unknown agent ("Zorro") was refused with the real agents offered.
- **Browser** (headless Chromium on the isolated stack): build from the empty canvas visibly live (12 steps after 4.4 s while still streaming), 15 steps, server validation clean after save, undo/redo of the AI turn, node help, Check panel quick fix, no truncated labels, dark mode, German UI, 0 console errors.

### 5.4 Limitations (honest)
- Real phone calls / SMS / WhatsApp / email were **not** sent: no telephony or messaging provider is reachable from this environment; execution was verified up to the provider queue (as in §3).
- ~~"Email received" and "update custom fields" remain unavailable~~ — done in §6.
- Copilot output quality depends on the model; it is constrained (validated ops, guards, repair rounds) but should still be reviewed — publishing stays a human action.
- Pre-existing issue found (**fixed in §6**): `shared/middleware/rateLimiter.js` calls express-rate-limit v8's `ipKeyGenerator(req, res)`, but v8's signature is `ipKeyGenerator(ip)`; anonymous requests therefore share one bucket key (`[object Object]`), including the login limiter. Fix = `ipKeyGenerator(req.ip)`.

### 5.5 Deployment additions
- Optional env: `WORKFLOW_WEBHOOK_SECRET` (HMAC for outgoing webhooks), `WORKFLOW_COPILOT_PACE_MS` (visual pacing, default 160 ms). The copilot uses the existing `OPENAI_API_KEY` / `OPENAI_MODEL` / `OPENAI_BASE_URL`.
- No new migration (new fields are additive; the new node types and outcomes need no data change).

## 6. Completion pass (2026-11-10)

### 6.1 Added / fixed
| Area | What | Where |
|---|---|---|
| Rate limiting (shared, pre-existing bug) | `ipKeyGenerator(req.ip)` (express-rate-limit v8 takes an IP string). Anonymous clients previously all shared one bucket, so one client could lock out every other login. | `shared/middleware/rateLimiter.js`, `extension.routes.js`, `governance.routes.js`; test `rateLimiter.keys.test.js` |
| Email received trigger | Inbox sync publishes `email.inbound.received` (new inbox mail only; lead = thread lead or case-insensitive sender match). Starts "Message received" (channel **Email**, keyword on subject + text) and resumes "wait for reply". | `email/email.service.js` (`publishInboundEmail`), `workflow.events.js` |
| Email opens | Optional open pixel (`trackOpens`, default on) → `GET /t/o/<token>.gif` (always a 1×1 GIF). Mail proxies (Gmail/Yahoo) count; scanners and loads within 5 s don't. New: wait event `message.opened`, trigger status `opened`, condition `message.opened`, analytics `opens`. Apple Mail preloads images, so an open is a signal, not proof. | `workflowLink.service.js`, `workflow.public.routes.js`, handlers / conditions / context |
| Opt-out everywhere | `crm.lead.opted_out` published by the email unsubscribe link and by consent revocation; all active runs of the lead are cancelled (`stopOnOptOut`). | `messaging.service.js`, `workflow.events.js` |
| Lead custom fields | `Lead.customFields` (Map, ≤ 50 keys, `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`, values ≤ 500 chars; accepted on create / PATCH). New node **Set custom fields** (`crm.custom_fields`: set with `{{templates}}` + remove, merged, audited on the lead timeline). Condition `lead.customFields.<key>`. Shown read-only in the lead drawer (Notes tab). | `lead.model.js`, `lead.validation.js`, handlers, node form, `lead-detail-drawer.tsx` |
| Copilot direct apply | A question option can carry `apply: { node, config }`. Choosing it sends `apply`; the server applies it through the same validated `update_node` (resource checks) **before** the model continues, and tells the model it is done. An invented id is refused with an `op_error`. | `copilot.service.js`, `workflow.validation.js`, `copilot-panel.tsx` |
| Copilot review mode | Eye toggle (saved in builder prefs): operations are staged in the chat with **Apply to canvas** / **Discard**; nothing touches the canvas before Apply. Apply keeps per-turn undo working; the input is locked until the proposal is resolved; stopped or failed turns propose nothing. | `copilot-panel.tsx` |
| Resizable right panel | Drag handle 320–720 px, keyboard (←/→ ±16 px, Home/End), double-click resets; works in RTL; width saved in `updata.wf-builder.prefs`. | `panel-resizer.tsx`, `workflow-builder.tsx` |
| Event retention | Daily 03:17 job `periodic-workflow-retention` deletes `WorkflowEvent`s older than `WORKFLOW_EVENT_RETENTION_DAYS` (default 365, minimum 30, `0` = off). Events of still-active runs are kept. Runs, versions and the lead timeline are never touched. | `workflow.runner.js` (`purgeOldEvents`), `jobs/workflowAutomation.job.js` |
| Translations | All new strings in en/de/fr/ar; the i18n test was extended to cover them. | `lib/i18n/*` |
| Stale test (pre-existing) | `lead-contact.test.tsx` expected one element; the reply now renders as a summary plus the full body. Test-only fix. | client leads tests |

### 6.2 New tests (all against real Mongo, real services)
Custom fields (templated set, merge, remove, branch on the value, invalid key rejected); schedule trigger (segment filter, once per occurrence, CAS); Redis down → in-process fallback completes the run; email unsubscribe cancels active runs; inbound email starts the email trigger (keyword filter, unknown sender ignored) and resumes "wait for reply"; open pixel (GIF always served, scanner and instant loads ignored, proxy open resumes once, `/t/<token>` refuses an open token); retention (old events purged, active-run events kept, floor and off switch); copilot direct apply (valid + invented id); client review mode, direct apply, resizer (keyboard + drag), custom-fields form, `trackOpens` switch.

### 6.3 Real-integration runbook (needs your go-ahead — nothing here was executed)
Do this on a staging deployment, or on production with **your own phone number / mailbox only**:
1. Create a lead for yourself (your mobile + email) and record consent for voice/SMS/email (or use purpose *transactional*).
2. Builder → Templates → *AI lead qualification* (or your own) → pick a real agent → **Test** (dry run) with your lead → fix anything the Check panel reports.
3. Publish → Automation → Campaigns → new campaign → *explicit selection* → only your lead → Start.
4. Expected: one call from the agent's number (SIP trunk must be live, see the AI-calling memo: PSTN was still blocked on the trunk) → after hang-up the run continues on the analysis branch; the execution inspector shows each step, the call record links back to the run.
5. SMS / email: same with the SMS-follow-up / email-follow-up templates; click the tracked link on your phone (> 5 s after receipt) and open the email in Gmail to see `link.clicked` / `message.opened`.
6. Opt-out: reply STOP (SMS) or click the email unsubscribe link → the run is cancelled (`opted_out_*`).

### 6.4 Still open (honest)
- **No real call, SMS, WhatsApp or email was sent** from this environment (no reachable provider; PSTN needs the SIP trunk). Everything up to the provider queue is tested.
- Pre-existing, unrelated, unchanged: server `pairedPhone.adversarial` "takeover never downgrades a call the AI completed" (after a takeover the hang-up marks the call `interrupted/review`; this is paired-phone calling engine behaviour and needs a product decision). It fails the same way on HEAD.
- Lead custom fields are editable only by workflows and the API (PATCH `customFields`); the lead form has no editor yet (read-only display).
- Org isolation: N/A (single-tenant by design; data is scoped by owner / permissions).
- Deployment: optional `WORKFLOW_EVENT_RETENTION_DAYS`. No migration needed (`customFields` is optional; Map fields need no backfill).

## 7. Copilot assist: timeline, voice, predefined prompts, interactive demo (2026-11-11)
- **Live timeline** of every copilot turn (`copilot-timeline.tsx`): understanding → resources → thinking rounds (with the model's plan text) → each tool call → check → answer, with client-measured durations; a stall watchdog (45 s) and an error when a stream ends without `done`.
- **Voice**: mic in the composer → `POST /workflows/:id/copilot/transcribe` (`workflow:write`, 30/min/user, multipart `audio` ≤ 10 MB, kept in memory only, `sttGateway`). Pausing ~2 s after speaking sends automatically; ✓ puts the text in the box instead; ✕ discards. Optional read-aloud of replies (browser speech synthesis, UI language).
- **Predefined prompts**: context-aware chips above the composer (empty canvas / selected step / problems / general) and a categorised prompt library (build, improve, channels, explain & check).
- **Interactive demo** (`workflow-demo.tsx`; from the palette “Demo”, the empty canvas and the copilot): 3 scenarios built from real node cards; blocks glide in and link step by step with an explanation + “Do it right” tip; autoplay or click the glowing block; final checklist; “Use as my starting point” (empty canvas only) or “Build this with AI”. Every demo graph passes the server validator except the agent choice, which is left to the user on purpose.
- Edges: several branches of one step into the same target now show one combined label.

## 8. Test → Full check (2026-11-11)
- **Endpoint** `POST /workflows/:id/analyze { graph?, leadId? }` (`workflow:write`, 30/min/user, read-only) → `workflow.analysis.js`:
  1. settings & references (`validate()`: required fields, agents, templates, users, loops, dead ends),
  2. every step executed in **dry mode** on a sample lead (or a real one) — catches steps that would fail at run time,
  3. **every path** from the trigger (bounded, ≤ 200): ends with an outcome / open (no End step) / bounded repeat / intentional stop,
  4. **channels**: AI calling via the same launch preflight a real campaign uses (per agent: cloud line or paired phone), SMS / WhatsApp / email via `messaging.channelReadiness()` (enabled + configured + last recorded provider health; no network calls, no writes).
- **UI**: the Test button opens **Full check** first (Simulation and Live test stay as tabs). Verdict (Ready / Needs attention / Not ready), stats, channel cards with the manual fix, steps with problems first (problem + how to fix + dry-run result) with **Show on canvas** and **Fix with AI**, all paths with **Show path** (drawn on the canvas) and **Fix with AI** for open paths, **Fix everything with AI** and **Check again**.
- AI prompts contain only what the copilot can change in the workflow; missing phone lines / providers are shown as set-up tasks for a person.
