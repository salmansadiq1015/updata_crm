# AI Follow-up Calling

AI calling agents can now take a follow-up from an earlier call and carry it out. They schedule the next call, place it within the permitted hours, pick up the conversation where it stopped, and record the result. The feature extends the existing modules. It adds no new dialer, lead model or follow-up system.

## What already existed (and is reused)

| Capability | Where |
|---|---|
| Calling agents (identity, voice, questionnaire, rules, schedule, transport, leads, knowledge, transfer) | `server/src/modules/aiCalling/callingAgent.*` |
| Campaign dial pipeline: tick tokens, leases, ambiguous-dial parking, retry policy, reconciler | `aiCalling.service.js` (`_runTick`, `_dispatchCall`, `processCallResults`) |
| Pre-dial gates: call window, recipient quiet hours, DNC, consent, contact policy, paired-phone lock | `_dispatchCall`, `contactPolicy/` |
| Organisation voice kill switch | `AiCallingSettings.voicePaused` |
| Follow-up inbox: buckets, scope, actions, SLA/overdue sweep, mobile agenda | `crm/leadFollowUp.*`, `crm/leadSla.service.js` |
| AI calls creating follow-ups (`fromAiCall`), unified lead timeline, provenance-tracked answers | `crm/leadFollowUp.service.js`, `crm/leadTimeline.service.js`, `crm/leadQualification.service.js` |
| Natural-language callback parser | `simSms/engine/smsInsights.js` `parseCallbackTime` |

## The gaps this closes

1. A callback request became a human task due **now**: the requested time was never parsed, and nobody was re-called. `AI_CALL` follow-ups were only a label.
2. Calls had no memory of earlier calls, so they repeated questions that were already answered.
3. Nothing stopped two campaigns or agents from calling the same lead at the same time.
4. Agents had no type or template and no free-text conversation instructions.
5. There was no follow-up automation switch, either for the organisation or per agent.

## How it works

```
call ends ─► processCallResults ─► _applyOutcomeToLead (callback → follow-up with a RESOLVED due time)
                                 └► _finalizeRecipient
                                 └► followUpCalling.afterCallProcessed
                                       classifyOutcome  → CALLBACK_REQUESTED / TEMPORARILY_UNAVAILABLE / …
                                       decideFollowUp   → schedule (ai|human) / escalate / stop / complete / none
                                       → LeadFollowUp.automation { mode:'ai', agentId, state:'scheduled', reason, round }

every minute: jobs/followUpCalling.job.js → followUpCalling.sweep()
   reconcile stale active follow-ups → claim due ones (CAS lease) → gates → single-lead CallCampaign
   (kind 'follow_up', launch key `follow-up-<id>-<n>`) → startCampaign → normal tick/dial pipeline
   → markCalling → follow-up call (prefilled known answers + previous-call context) → afterCallProcessed (next round …)
```

- **A follow-up is a `LeadFollowUp`.** The new `automation` block records who is calling, the state, the reason, and the round. Because of that, the existing inbox, mobile agenda, SLA sweep and lead timeline show it with no extra work.
- **A follow-up call is a `CallCampaign` with `kind: 'follow_up'`.** Each one covers a single lead, so every existing reliability and compliance guarantee applies unchanged. Its launch key makes a crash or a duplicate dispatcher run idempotent.
- **Nothing is kept in memory.** Due work is found by a persisted query and claimed with a compare-and-set lease (`automation.claimUntil`). `reconcile()` repairs any follow-up whose hook was missed. A restart loses nothing.

### Lifecycle (`engine/followUpDecision.js`)

`scheduled → queued → calling → completed`, with `retry_scheduled` (handled by the campaign retry policy), `paused`, and the terminal states `no_answer`, `busy`, `failed`, `cancelled`, `skipped` and `requires_human`. Every transition is validated by `canTransition` and written to `automation.history`. The detailed call states (ringing, connected, processing) stay on the `CallRecord` and are shown next to the follow-up state; they are not duplicated.

A completed call does not mean a qualified lead. The follow-up outcome (`COMPLETED`, `CALLBACK_REQUESTED`, `DO_NOT_CONTACT` and so on) is kept separate from the lead status. Lead status continues to come only from the existing status-rule engine and `PROTECTED_LEAD_STATUSES`.

### Decision engine

Outcomes are decided only from server-validated evidence: the disposition, the rule outcome, the explicit control flags (`callbackRequestedAt`, `humanRequested`), required-answer gaps, and the recipient's retry state.

- **Hard stops:** do-not-contact, not interested, a converted lead, or one of the configured stop statuses. Any of these cancels every open automatic follow-up for the lead.
- **Automation off is not data loss:** with the organisation or agent automation off, an explicit callback request still becomes a human follow-up, with a real due time.
- **Limits:** the agent's triggers decide which outcomes start another call. `maxRounds` escalates to a person once reached. `minHoursBetweenRounds` sets the minimum gap. Outside callbacks, only one automatic follow-up per lead is active at a time.
- **Sequential workflows:** `followUp.routes` maps an outcome to the agent that takes the next conversation. `QUALIFIED` hands the lead over after success, for example Qualification → Sales → Appointment. A target agent that doesn't have follow-up calling on is skipped.

### Callback time (`engine/callbackTime.js`)

| Input | Result |
|---|---|
| ISO time with an offset (the agent is now given the lead's local time to compute it) | exact |
| "in 10 minutes" / "in 2 hours" | relative, exact |
| "tomorrow at 15:00", "Friday at 3" | exact, in the lead's or agent's timezone |
| "tomorrow morning", "morgen früh", "demain soir", "بكرة الصبح" | part of day (approximate; the lead's words are kept) |
| "call me later" / nothing usable | the agent's default delay (approximate) |

The result is then moved into the follow-up calling window when it falls outside it. A move is recorded in `shiftedFrom` and never hidden.

### Context-aware follow-up calls (`engine/followUpContext.js`)

- **Prompt section:** a bounded block (under 3 KB) appended to the system prompt. It contains the reason for the call, the lead's own words about timing, short recaps of the last 3 calls (newest first, with the agent's name and open points), what is already known, what is still missing, and the follow-up instructions. It ends with "never restart the interview". No transcripts are sent.
- **Known answers:** taken from earlier calls' validated answers (and confirmed answers, where the question requires confirmation) or from verified lead qualification fields. A human correction always wins. These are **prefilled** into the new call's conversation state, so the question engine skips them.
- **Provenance:** prefilled answers are stored with `source: previous_call` / `lead_record`. They don't count as "the lead answered on this call", and they are never written back to the lead as new evidence.

### Lead-level lock (outbound and inbound)

`aiCalling/leadCallLock.js` (`leadActiveCall`) is the single rule for "is this lead already on a call?":
- **Outbound:** a recipient in **any** campaign is `dialing`, `in_progress` or `processing`. Follow-up calls are included.
- **Inbound:** an `InboundCall` for the lead is still active (`ACTIVE_STATUSES`, not yet processed).

It is used in three places:
- `_dispatchCall` defers for 30–60 s (jittered) when the lead is busy. A deferral never uses up an attempt. Each competing outbound claim is already in `dialing` before it checks, so two concurrent claims always see each other and neither dials.
- The follow-up dispatcher (`leadBusy`) waits while the lead is on any call.
- The inbound decision (`inboundCall.service._decide`): when an AI agent is already calling the caller from another line, the receptionist AI does not answer. The call rings for a person, with reason `lead_on_outbound_call`.

### Routing rules (`engine/followUpRouting.js`)

`followUp.routingRules` is an ordered list, and the first enabled rule whose every non-empty condition matches picks the agent. Conditions:
- outcome
- lead source
- lead status
- lead type
- conversation language (prefix match, so `ar` matches `ar-MA`)
- country (ISO code)
- city (case- and accent-insensitive)
- business type (substring)

Precedence: a routing rule, then the per-outcome route, then the calling agent. Handing a lead over after success needs an explicit `QUALIFIED` outcome in the rule. The name of the matching rule is stored on the follow-up as `automation.routingRule`.

### Escalation recipients

- **Agent level:** `followUp.escalation = { userIds, assignTo: owner|first_recipient, email }`.
- **Organisation default:** `AiCallingSettings.followUpAutomation.escalationUserIds`, settable with `PUT /ai-calling/settings/follow-up`.
- **Order:** the agent's recipients, then the organisation default, then the follow-up owner. Only active users are used.

Notifications go out on `IN_APP` (the global header bell, visible on every page) and `PUSH` (the Android app), plus `EMAIL` when the agent asks for it. Each user's own channel preferences still apply. Every recipient's Follow-ups page also refreshes live.

### Contact limits

The contact policy's frequency and quiet-hours limits (for example, at most one contact per 60 minutes) do not apply to two kinds of follow-up call:
- one the **lead asked for** (`CALLBACK_REQUESTED`, `INTERESTED_NEEDS_MORE_TIME`, `APPOINTMENT_PENDING`);
- a person's deliberate **"Call now"**.

This is the same exemption SIM callbacks already have. Hard blocks (DNC, suppression, revoked consent) always apply, and automatic retries stay rate-limited.

## Controls

| Level | Control |
|---|---|
| Organisation | `AiCallingSettings.followUpAutomation.enabled`, **off by default**. `PUT /ai-calling/settings/follow-up` (requires `ai-calling:admin`). Env `AI_FOLLOW_UP_AUTOMATION_ENABLED=false` forces it off. The voice kill switch still overrides everything. |
| Agent | `followUp.enabled`, `autoCall`, `manualCall`, triggers, schedule, limits, eligibility, routes |
| Follow-up | assign/change agent, per-follow-up instructions, Call now, pause/resume, assign to a person. Done and cancel in the inbox also stop the automation. |
| Lead | `POST /ai-calling/leads/:leadId/follow-ups/pause` and `/resume` |

"Call now" is a deliberate human action. It works while the organisation automation is off, but still respects the kill switch, DNC, consent and the lead lock. The AI never claims to have transferred a call; a request for a human becomes an escalation (`requires_human`) with a notification.

## API

| Method | Path | Permission |
|---|---|---|
| GET | `/api/v1/ai-calling/agent-types` | ai-calling:read |
| GET / PUT | `/api/v1/ai-calling/settings/follow-up` | read / **admin** |
| GET | `/api/v1/ai-calling/follow-ups/summary?agentId&from&to` | ai-calling:read |
| GET | `/api/v1/ai-calling/agents/:id/follow-ups?state` and `/agents/:id/follow-ups/summary` | ai-calling:read |
| POST | `/api/v1/ai-calling/follow-ups/:id/{assign-agent,call-now,pause,resume,assign-human}` | ai-calling:write + owner / agent owner / supervisor |
| POST | `/api/v1/ai-calling/leads/:leadId/follow-ups/{pause,resume}` | ai-calling:write |
| GET | `/api/v1/crm/follow-ups?management=ai\|human\|ai_scheduled\|ai_active\|ai_completed\|ai_failed\|attention&agentId=` | lead:read (existing) |
| GET | `/api/v1/ai-calling/campaigns?kind=standard\|follow_up\|all` (default `standard`: follow-up calls are kept out of campaign history) | ai-calling:read |
| GET | `/api/v1/ai-calling/campaigns/:id/follow-ups/summary` — campaign-level follow-up analytics (every round the campaign produced; origin tracked in `automation.originCampaignId`) | ai-calling:read |
| GET | `/api/v1/ai-calling/campaigns/:id/follow-ups/export`, `/api/v1/ai-calling/follow-ups/export?agentId&from&to` (CSV, one row per follow-up) | ai-calling:read |

Follow-up rows and `GET /crm/follow-ups/summary` now include `automation` (agent, state, live call) and the AI counters. The legacy mobile endpoint `GET /crm/leads/follow-ups` adds `followUpId` and `automation` **only on AI rows**, so ordinary rows keep their exact legacy shape.

## Data and migration

All new fields are additive schema defaults, so existing documents read as "standard campaign / human follow-up / automation off" without a backfill:

- `CallingAgent.agentType` and `CallingAgent.followUp`
- `agentConfig.instructions`
- `LeadFollowUp.automation`
- `CallCampaign.kind` and `CallCampaign.followUpId`
- `CallRecord.followUpId` and `CallRecord.previousCallId`
- `AiCallingSettings.followUpAutomation`

**Migration `046_ai_follow_up_calling`** creates three partial indexes (`follow_up_ai_due`, `follow_up_ai_agent`, `campaign_follow_up`) and nothing else. It has **not** been applied to any shared database.

The migration runner only runs all pending migrations. On `boiler` (which is also production), 029–044 are still pending, so either apply 046 alone (the same way 045 was applied, with a one-off script plus a ledger row) or review and run all the pending migrations deliberately.

Deployment order:
1. Deploy the API.
2. Apply 046.
3. Restart the API so the `ai-follow-up-calling` job registers.
4. Configure an agent's Follow-up Automation.
5. An admin turns on the organisation switch.

## UI

- **Agent page:**
  - A new **Follow-up Automation** tab: an honest status line covering the organisation, the agent, automatic calls and "Call now"; KPIs from persisted data; the agent's follow-up queue with Call now / Pause / Resume; and the full configuration (triggers, template instructions, follow-up-only questions, schedule, timing, eligibility, specialised-agent routing).
  - An **Agent type** selector in Identity. Choosing a type fills only an empty objective and empty instructions.
  - **Conversation instructions** under Voice & instructions.
- **Connections:** an organisation switch next to the voice kill switch.
- **Follow-ups page:** AI filters, AI counters, row badges, a follow-up detail panel with every action, and AI agent assignment when creating a follow-up.
- **Mobile:** follow-up rows show the AI agent, its state, the last summary and any error, with Call now / Pause / Resume.
- **Languages:** all new strings are in en, de, fr and ar, covered by the parity test.

## Tests

- `server/tests/unit/aiCalling.followUpEngines.test.js` (27 tests): time resolution, decision engine, lifecycle, context and known answers, templates.
- `server/tests/unit/aiCalling.followUpCalling.test.js` (12 tests): end to end over the real pipeline, with telephony, queue, audit and notifications mocked.
  - A callback "in 10 minutes" is routed to a follow-up agent and dispatched at the right time; concurrent dispatchers launch it only once. The call is linked, the previous call is in context, the known answer is not asked again, the lead is qualified and the follow-up closes.
  - Inbox, summary and mobile shapes.
  - Automation off still records a human callback and never dials.
  - DNC before the call, and DNC said during the call.
  - The no-answer retry policy, followed by the next round.
  - The cross-agent lead lock.
  - Human controls and authorization.
  - Closing a follow-up from the inbox.
  - Lead-level pause.
  - Restart recovery.
  - Real agent metrics.
- `client/src/modules/aiCalling/__tests__/follow-up-automation.test.tsx` (10 tests): the agent tab and the organisation switch.
- `client/src/modules/leads/__tests__/follow-up-ai.test.tsx` (21 tests): the Follow-ups page. Covers parsing, the state → allowed-controls rules, the next-action wording, badges, the agent picker, the `management` filter, and the drawer actions hitting `/ai-calling/follow-ups/:id/*`.
- `mobile/src/features/followUps/__tests__/FollowUpsScreen.test.tsx` (2 new tests).

## Known limitations / not verified here

- **No real phone call was placed.** The voice path is unchanged; follow-up calls use the same worker and tool API, with a richer system prompt. Real-device checks (paired phone or SIP), the timing of a live callback, and a spoken conversation in each language still have to be done by hand.
- **Inferred "information requested".** That trigger depends on the worker reporting `information_requested` engagement events. If they are absent, those calls fall into `QUALIFICATION_INCOMPLETE` or `COMPLETED`.

## Production verification log (2026-11-05)

### Step 1 — Migration 046 on `boiler` (production DB)
- **Inspection:** 046 only creates 3 partial, non-unique indexes, so duplicate data cannot block it and it rewrites no data.
- **Before anything ran,** all three indexes already existed. Mongoose `autoIndex` had built them when the dev API (with the new models) started at 19:31. There were no name or key conflicts.
- **Ledger before:** versions 1–24 and 45. Note that **025–044 are pending**, not only 029–044.
- **Data finding:** production `leadfollowups` was empty (0 documents), so migration 032's backfill has never run there.
- **Backup:**
  - Tools: MongoDB Database Tools 100.16.1 (`brew install mongodb/brew/mongodb-database-tools`).
  - Output: `mongodump` of the whole DB to `~/updata-backups/boiler-20261105-203507`, 277 MB, 229/229 collections.
  - Check: dumped counts match live counts (leads 926, callrecords 27, callcampaigns 13, users 14, customers 13, callingagents 3, migrations 25).
  - Gotcha: `server/.env` has CRLF line endings. A URI taken with `grep | cut` ends in `\r` and silently dumps a database named `"boiler\r"`; use `tr -d '\r'`.
- **Applied:** 046 alone, through a script that refuses to run if ledger row 46 already exists. It runs 046 `up()` (idempotent; the indexes already existed) and inserts ledger row 46 with the runner's own sha256 checksum.
- **After:** all 3 indexes verified with the expected keys and partial filters. Counts unchanged (leadfollowups 0, callcampaigns 13). Ledger now `1–24,45,46`. `runner.js status`: 046 ✅ 2026-11-05T15:38:49Z, 025–044 still pending.

### Step 2 — API restart on :9097
- **What :9097 is:** a local development API (`NODE_ENV=development`) on the same `boiler` DB. It is not the production server (PM2 `updata-api` on the Ubuntu host via `deploy/deploy.sh`, which was not touched).
- **Before restarting:**
  - The process was a plain `node src/server.js` started by a Codex session.
  - The developer's `bun run dev` nodemon was idle because the port was taken.
  - There were 0 live outbound calls, 0 active campaigns and 0 live inbound calls.
- **Restart:**
  - SIGTERM to the Codex process; the port was free after 1 s.
  - nodemon (the developer's dev process manager) restarted the API and it was listening after 21 s.
  - nodemon has since reloaded it on every server code change.
- **Health:** `/health/ready` returned database ok, Redis ok and file storage ok.
- **Auth:** CRM, follow-up and settings routes return 401 with no token and with an invalid token.
- **Scheduler:**
  - Exactly one repeatable schedule (`periodic-ai-follow-up-dispatch`, `* * * * *`).
  - The first run after the restart returned `{"disabled":true,"repaired":0,"launched":0}`, which is correct while the organisation switch is off.
  - 0 failed jobs.
  - Before the restart: 52 runs, exactly one per minute, with no duplicates.
- **Log findings:**
  - 168 Redis `Command timed out` rejections, all at the earlier process's boot (19:32:46) and none afterwards.
  - One transient Atlas connection drop (19:47) that made one login return 500.
- **Not verified here:** an authenticated browser session. The connected Chrome could not load `localhost:3000`.

### Step 3 — Real-device tests: setup done 2026-11-05, live session Fri 2026-11-06 08:00–20:00 PKT
The session was moved to daytime because recipient quiet hours (Mon–Sat 08:00–20:00 PKT) correctly block automatic calls at night.

**Prepared (no calls placed):**
- **Test agent:** "QA Follow-up Agent" `6aecb5460323bfc6eb106a09`.
  - Owner: Salman Admin.
  - Phone: paired phone "Techno Spark" `6ae24a85…`.
  - Language: auto (follows the caller).
  - Questions: 3 (decision maker, timeline, number of sites).
  - Rule: qualified = decision maker who is planning within three months.
  - Follow-up automation: on for this agent only. Triggers: callback, needs time, unreachable, incomplete. Window: 09:00–19:30 PKT, Mon–Sat. 2 attempts per follow-up, retry after 5 min, at most 4 follow-ups.
  - Escalation: notifies Salman.
- **Test lead:** existing authorized lead **L-00809** "Updata Test — Al Noor Heating Solutions". It dials its mobile, the tester's own number +92 305 •••9624 (a different phone from the paired phone). Consent: granted ("test calling"). No prior calls.
- **Organisation automation:** **OFF**. Every other agent has follow-up calling off, so turning the organisation switch on during the test only affects the QA agent.
- **Scenario 4 dry run** on the real configuration at 21:56 PKT:

  | What the lead said | Resolved to |
  |---|---|
  | "in 10 minutes" | Fri 09:00 PKT, shifted from Thu 22:06 |
  | "tomorrow morning" | Fri 10:00, approximate |
  | "tomorrow at 15:00" | Fri 15:00, exact |
  | "later" | Fri 09:00, approximate default |

- **Evidence script:** a read-only dump of the lead's follow-ups, campaigns and calls (`qa-status.mjs`) is run after each scenario. Baseline: lead `new`, no follow-ups, campaigns or calls.

**Live session plan:**
1. **Pre-flight (I run it, ~08:50):**
   - API health, one scheduler, organisation switch OFF.
   - Start the voice worker (`npm run dev:agent`, agent `crm-voice-agent-dev`) and the gateway (`phone-gateway`, profile `6ae24a85…`, `/dev/cu.usbserial-0001`).
   - Confirm the paired-phone readiness is ok and the worker has registered.
2. **Call 1 — "Start Now", tester answers.** Accept the AI disclosure, answer Q1 ("yes"), then say "please call me again in 10 minutes".
   - Expect a follow-up due +10 min, `relative`, routed to the QA agent (S1).
   - With the organisation switch OFF, nothing dials at the due time (automation guard).
3. **Turn the organisation switch ON.** Only the QA agent can act.
4. **Call 2 — automatic, within 1 minute of the due time.**
   - The agent refers to the previous call and does not ask Q1 again (it is prefilled).
   - Answer Q2, then say "call me today at HH:MM" (about 20 minutes later).
   - Covers S5, S6, S7, S8, then S3.
5. **Call 3 — automatic at HH:MM.** Answer Q3.
   - The lead becomes **qualified** and the follow-up closes with a summary; the timeline and history update.
   - Covers S9 and S10.
6. **S2:**
   - "Start Now", then say "call me tomorrow morning". Expect Sat ~10:00, approximate.
   - Pause it (S12: no automatic call while paused), then cancel it.
7. **S11 — don't answer** a follow-up call. Expect a retry after 5 min; after a second miss, `no_answer` plus the next round (unreachable) in 1 h, which is then cancelled.
8. **S14 — restart the API** (nodemon) while a follow-up is scheduled. It must still run at its time.
9. **S15:**
   - Stop the gateway before a due follow-up: the device wait reason is recorded and nothing dials.
   - Pause the agent: deferred with `agent_not_active`.
   - Restore both.
10. **S13, without dialling:**
    - Mark the lead `converted` with a follow-up due: the dispatcher cancels it (`lead_status_stop`). Restore the lead status.
    - A do-not-contact entry on the number: cancelled with `do_not_contact`. Then remove the suppression and keep consent.
11. **Sync:** the tester checks the web Follow-ups page and the Android app's Follow-ups screen during steps 2–7.
12. **After the session:**
    - Organisation switch back to OFF until the staged rollout.
    - Stop the worker and gateway, restore the gateway profile if needed.
    - Record all evidence here.

Production-ready is **not** claimed until this session passes.
