# AI Voice Calling

**Current re-audit (2026-10-20): see [AI_CALLING_AUDIT.md](docs/AI_CALLING_AUDIT.md).**
Earlier readiness labels and device runs below are historical. Current production readiness
is NOT_PRODUCTION_READY until the release gates in the re-audit are verified.

An outbound AI voice-calling feature for leads: configure questions dynamically, call
business leads with an AI agent (OpenAI Realtime over LiveKit + SIP), collect structured
answers, and auto-update the CRM pipeline through validated business rules.

It is a self-contained module (`server/src/modules/aiCalling`, `client/src/modules/aiCalling`)
that reuses the existing auth/RBAC, BullMQ queue, audit, notification, socket and lead
infrastructure. It does not change the lead schema, auth, or tenancy.

---

## 0. Mobile SIM calling from the user's own phone (no LiveKit / SIP / Twilio)

Requirement (2026-10-19): the Android app calls CRM leads from the **user's own SIM and number**,
an AI agent introduces itself, asks the configured questions, hears and understands the answers,
and the results are stored per lead, with no LiveKit, SIP or Twilio dependency on this path.
The cloud agent described in §1–§10 stays a separate, optional path and is **not** used by the
mobile SIM workflow.

### 0.1 Verified on a real device

Device: **TECNO KJ5, Android 13 (API 33), HiOS 13.5**, dual SIM (Jazz + Telenor), private build,
microphone permission granted. Tool: *Settings → Call audio check*
(`CallAudioCheckScreen` + native `CallAudioProbe`), which measures level statistics only
(RMS/peak) and Android's own `AudioRecordingConfiguration.isClientSilenced()`; no audio is
kept. Calls were placed on Telenor to the authorized test lead (+92 327 7220305).

| Audio source | No call | During the SIM call |
|---|---|---|
| MIC | ok, RMS 764 | **silenced** (`clientSilenced: true`, RMS 0, peak 0) |
| VOICE_COMMUNICATION | ok, RMS 174 | **silenced**, RMS 0 |
| VOICE_RECOGNITION | ok, RMS 340 | **silenced**, RMS 0 |
| UNPROCESSED | ok, RMS 31 | **silenced**, RMS 0 |
| CAMCORDER | ok, RMS 834 | **silenced**, RMS 0 |
| VOICE_CALL / VOICE_DOWNLINK / VOICE_UPLINK | `init_failed` | `init_failed` |

Also measured during the call:
- App test tone (usage voice and media), with MIC capture running at the same time: MIC
  **silenced** (RMS 0) in both cases. The app cannot even observe its own playback.
- `setCommunicationDevice(speaker)` from the app was "accepted", but on the first call the
  route stayed on the earpiece. Speaker control from a non-dialer app is **not reliable**.
- On-device TTS (`expo-speech`) plays on the phone (`spoke: true`). Whether the far end can
  hear it acoustically has **not** been verified (that needs a person on the other end).

This matches Android's platform policy since Android 10 (concurrent-capture rules): while a
voice call is active, ordinary apps receive silence, and the call-audio sources need the
system-only `CAPTURE_AUDIO_OUTPUT` permission.

### 0.2 The five capabilities, separately

| # | Capability | Status on a normal (non-root) Android phone |
|---|---|---|
| 1 | Place a cellular call on the chosen SIM | **Supported, verified** (`CALL_PHONE`, `TelecomManager.placeCall` with the SIM's `PhoneAccountHandle`; Telenor and Jazz both dialled from the app). |
| 2 | Detect call state / manage the campaign | **Partial.** `READ_PHONE_STATE` gives only idle / ringing / off-hook. For an outgoing call, off-hook starts at dialling, so the app **cannot tell answered vs. no answer vs. busy** in real time. Exact states (`STATE_ACTIVE`, `DisconnectCause.BUSY`, programmatic hang-up) require the app to be the **default phone app** (`ROLE_DIALER` + `InCallService`). A post-call `READ_CALL_LOG` lookup (duration > 0 means answered) is a lighter option for the private build. |
| 3 | Capture the lead's spoken answers during the call | **Not possible**, verified: every capture source is silenced during the call (table above). Supported alternative: the user taps answers in the call guide during the call, and/or dictates a voice note **after** the call, which is transcribed (OpenAI Whisper on the server) and turned into proposed answers for the user to confirm. |
| 4 | AI speaking to the lead during the call | **Not possible as a product feature.** There is no uplink-injection API for apps. Playing TTS on the loudspeaker may leak acoustically, but it is unverified and unreliable (echo cancellation), and the AI could still not hear the reply (#3), so it **cannot hold a conversation**. |
| 5 | Control the call and continue to the next lead automatically | **Partial.** The app can dial the next lead after the previous call ends (countdown, user can stop). It cannot hang up or detect "answered" unless it is the default phone app (#2). |

**Conclusion:** a fully autonomous AI conversation (the AI hears and speaks) over a normal SIM
call is **not achievable** with an ordinary app on Android 10+, and was confirmed blocked on the
target device. That needs either system privileges (a platform-signed or rooted device, or a
custom ROM with `CAPTURE_AUDIO_OUTPUT`), or a telephony provider that bridges the call audio
to the AI (the cloud path in §1, which the requirement rules out for mobile).

Accessibility services can have audio-sharing behavior for legitimate accessibility features,
but this does not grant an ordinary CRM access to protected telephony audio or an uplink
injection API. Updata has no required accessibility function here. **Do not enable or implement
an accessibility service to bypass call-audio restrictions or record remote calls.** No such
service is included. See [Android audio sharing](https://developer.android.com/media/platform/sharing-audio-input)
and [Google Play AccessibilityService policy](https://support.google.com/googleplay/android-developer/answer/10964491).

### 0.3 Final architecture (implemented 2026-10-19): AI-assisted SIM call campaigns

Decisions: **A** the human talks on their own SIM; the app guides and captures; nothing claims
the AI heard or spoke on the call. **B** outcomes use Android call state where it is reliable
(dialled → off-hook → idle = "call over") plus the user's confirmation, always; never "answered"
from dialling. The call log is not used yet (0.10). Updata is not made the default phone app.

```
Web CRM (/sim-calls)            Android app (Call Agent → Call campaigns)
  create / edit draft             list · guided create · detail · caller (runner)
  progress · tasks · answers      claim → server re-check → dial on SIM → call-state
  callbacks · activity · actions  → guide + answers → confirm outcome → outbox → next
          \                        /
           REST /api/v1/sim-calls  (auth + RBAC ai-calling:read/write, owner-scoped)
                     |
   simCall service = SOURCE OF TRUTH (queue, locks, safeguards, answers, callbacks)
     ├─ SimCallCampaign / SimCallTask / SimCallEvent (Mongo, migration 028)
     ├─ CRM sync per attempt → leadCommunication (route sim_call_campaign, mode assisted):
     │    contact log (+ follow-up for callbacks), lastContactedAt, do-not-contact
     └─ sweep job every 5 min: expired locks, due-callback reminders, sync retries
```

The pre-existing device-local **Call queue** (CRM 12-field qualification) still works and is
unchanged; campaigns are the server-backed workflow with per-campaign questions.

### 0.4 Requirements checklist

| Requirement | Status |
|---|---|
| SIM call initiation on the user's own number (Jazz/Telenor, TECNO Android 13) | VERIFIED_WORKING (real device, earlier session) |
| AI hears / speaks over the SIM call | BLOCKED_EXTERNAL_DEPENDENCY: Android platform (verified silenced, 0.1) |
| Server-side campaigns: model, states, APIs, RBAC, owner isolation, audit + activity history | VERIFIED_WORKING (30 API tests; emulator E2E; web) |
| Per-campaign questions (types, required, order, hints, options, skip rules) | VERIFIED_WORKING (server validation; web editor incl. skip rules; mobile editor without skip rules/custom options) |
| Answers validated, partial answers kept, never overwritten on resume | VERIFIED_WORKING (tests + emulator: answers restored on retry) |
| Mobile list (search, status filter, progress, review, callbacks due, last activity) | VERIFIED_WORKING (tests + emulator) |
| Mobile guided create (details → questions → calling rules → review → save once) | VERIFIED_WORKING (tests); exercised on device only via the API-created campaign |
| Mobile detail (server progress, valid actions only, unsynced items, callbacks, tasks, history) | VERIFIED_WORKING (emulator) |
| Caller: claim, server re-check, dial, call-state, guide + read-aloud, outcome sheet | VERIFIED_WORKING (emulator, simulated modem) |
| Countdown, Pause/Continue, Skip, optional auto-dial (foreground only) | Countdown/Pause VERIFIED (emulator + tests); auto-dial PARTIALLY_IMPLEMENTED (tests only, off by default) |
| Manual outcome selector always available; "answered" never inferred | VERIFIED_WORKING |
| Callback date/time/timezone explicit; scheduled, not requeued early; due-first; reminder; reschedule/cancel | VERIFIED_WORKING (tests + emulator + web) |
| Offline: results kept, "syncing" shown, no progression, auto-sync on reconnect, conflicts visible | VERIFIED_WORKING (tests + emulator airplane mode) |
| Restart recovery: no redial; reconcile last attempt | VERIFIED_WORKING (emulator force-stop + tests) |
| Stale locks → needs_review (dialled) / back to queue (not dialled) / cancelled (campaign cancelled) | VERIFIED_WORKING (tests) |
| Idempotent completion (attemptId) and CRM sync (operationId simcall-&lt;attemptId&gt;) | VERIFIED_WORKING (tests) |
| Cancelled campaign never initiates calls | VERIFIED_WORKING (emulator: 0 outgoing calls after cancel; tests) |
| Web CRM: list, create (incl. skip rules), detail, tasks, answers, callbacks, activity, pause/resume/cancel/retry | VERIFIED_WORKING (9 vitest + headless browser against the same server data) |
| Whisper voice note in the outcome, user-reviewed transcript | PARTIALLY_IMPLEMENTED: wired + editable; real transcription verified earlier, not on a campaign call |
| Read-aloud heard by the other party | BLOCKED: no listener available (only own SIMs authorized); 0.13 |
| Call-log outcome suggestion (private build, with consent) | MISSING (deliberately deferred, 0.10) |
| Default-phone-app role (exact answered/busy, hang-up) | Not implemented by decision (evaluated: large UX/Play cost) |
| Real-device run of the campaign flow on the TECNO | VERIFIED_WORKING 2026-10-20 (0.13), own-SIM calls only |

### 0.5 API contract (`/api/v1/sim-calls`, envelope `{success,data,pagination?}`)

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/campaigns` | list (`page,limit,status,q`) / create draft (`name, description, leadIds[≤500, unique], questionnaire, instructions, settings, subscriptionId, startsAt`) |
| GET/PATCH | `/campaigns/:id` | detail incl. `summary`; PATCH only while `draft` (questions bump `questionsVersion`; `leadIds` rebuild tasks) |
| POST | `/campaigns/:id/{start,resume,pause,cancel}` | validated transitions (409 `SIM_CALL_INVALID_TRANSITION`) |
| POST | `/campaigns/:id/retry` | `{taskIds?}` unreached/skipped/needs-review → pending (never answered/refused/callback) |
| GET | `/campaigns/:id/tasks`, `/campaigns/:id/events` | paginated; tasks filter `state,outcome,q` |
| POST | `/campaigns/:id/next` | `{deviceId}` → `{task, resumed, reason, nextAt}`; reasons `not_started, outside_calling_hours, waiting, queue_empty, campaign_completed`; 409 `SIM_CALL_CAMPAIGN_NOT_RUNNING` |
| POST | `/tasks/:id/dial` | `{attemptId, deviceId, subscriptionId}` → `{dialNumber}`: re-checks running, hours, suppression/number; 409 `SIM_CALL_NOT_ELIGIBLE` / `SIM_CALL_TASK_LOCKED` |
| PUT | `/tasks/:id/answers` | `{attemptId, answers[{fieldKey,status,value}]}` validated + merged (400 with field errors) |
| POST | `/tasks/:id/complete` | `{attemptId, outcome, interest?, answers?, notes, transcript, callback?{at,timezone,reason}, doNotContact, call{evidence,offhookAt,endedAt,offhookDurationSec,durationSec}}`; idempotent per attempt; different outcome → 409 `SIM_CALL_OUTCOME_CONFLICT` |
| POST | `/tasks/:id/{release,skip,sync}` | release only if not dialled; skip; retry CRM sync |
| PATCH/DELETE | `/tasks/:id/callback` | reschedule `{at,timezone,reason}` / cancel |
| GET | `/callbacks?status=pending\|overdue\|done\|cancelled`, `/leads/:leadId/tasks` | owner-scoped |

### 0.6 State machines

```
Campaign:  draft ──start──▶ running ◀──resume── paused
             │                 │  └──pause──────▶ ▲
             └──cancel──┐      ├──(no open tasks)──▶ completed ──retry──▶ paused
                        ▼      └──cancel──▶ cancelled (pending/scheduled → cancelled)

Task:  pending ──claim──▶ in_progress ──dial──▶ (call) ──complete──▶
         answered|rejected|wrong_number ............▶ completed
         no_answer|busy|failed (attempts < max) ....▶ pending (notBefore = now + retry delay)
         no_answer|busy (attempts = max) ...........▶ completed
         callback_requested ........................▶ scheduled (notBefore = callback time) ─due─▶ claim first
         cancelled (never dialled) .................▶ pending (+5 min)
       in_progress, lock expired:  dialled ▶ needs_review (device can still record; never redialled)
                                   not dialled ▶ pending | scheduled | cancelled (campaign cancelled)
       skip ▶ skipped · not eligible at claim/dial ▶ ineligible · campaign cancel ▶ cancelled
```

### 0.7 Data model and migration

`SimCallCampaign` (name, description, status, questionnaire + `questionsVersion`, instructions,
settings {timezone, callWindow, daysOfWeek, countdownSeconds 3–120, autoDial, maxAttempts 1–5,
retryDelayMinutes, readAloud}, subscriptionId, startsAt, summary, timestamps, createdBy).
`SimCallTask` (campaignId+leadId **unique**, order, state, outcome, notBefore, masked destination,
eligibility, lock {deviceId, attemptId, until}, attemptCount, attempts[] {attemptId, dialedAt,
outcome, interest, evidence, offhook/talk durations, notes, transcript, sync{status, operationId,
error, attempts}}, answers[] {fieldKey, status, value, normalizedValue, attemptId,
questionsVersion}, callback {at, timezone, reason, status, notifiedAt}).
`SimCallEvent` (activity history; no phone numbers or transcripts).
Migration `028_sim_call_indexes.js`: new collections' indexes only (additive, idempotent; `down`
keeps data). Leads are referenced by their CRM ids; no lead documents are created or copied.

### 0.8 Validation evidence (2026-10-19)

Automated (mocks/simulated events, not SIM calls):
- server `npx jest tests/unit/simCall.api.test.js` → **30/30**; full server suite **1662/1663**
  (the 1 failure, `simSms.api` "AI interpretation…", passes 3/3 alone: load-related flake, unchanged code path).
- mobile `npx jest --runInBand` → **45 suites / 349 tests** (baseline 41/327); `tsc` + `eslint src` clean.
- web `npx vitest run` → **652/653** (the 1 failure is the pre-existing `lead-bulk-contact` test); `tsc`/eslint clean.

Android **emulator** (sdk_gphone64, real Android telephony stack, simulated modem; isolated API +
DB), campaign of 3 leads created via the API and **started from the app**:
- Claim showed the masked number, script and questions; skip rule revealed Q3 after "High".
- Call → Android call-state offhook/idle reached the app → outcome sheet stated off-hook time
  and that Android cannot tell whether it was answered → "No answer" saved → server: attempt 1/2,
  retry in 5 min; CRM communication `no_answer/connected=no`.
- Partial answers were on the server before the outcome; restored on the retry (not overwritten).
- Force-stop during Lead 2's call → relaunch → caller resumed straight into the outcome sheet;
  no Call button, no redial.
- Callback 2026-10-20 10:00 Asia/Karachi via native date/time pickers → stored `05:00Z`,
  task `scheduled`, contact-log follow-up `2026-10-20T05:00Z` (Follow-ups agenda).
- Pause held through the countdown (nothing claimed although a retry was due).
- Airplane mode: outcome "Busy" stayed on the phone ("Saved on this phone — syncing", no
  progression, server unchanged) → network back → synced automatically → task completed (2/2).
- Campaign cancelled from outside the app → Call refused by the server, **0** outgoing calls.
- Web CRM (headless Chromium, same data): list, detail, answers, attempts with evidence, sync
  state and activity history matched.

Fixed because of this run: stale campaign badge after a 409, lowercase yes/no labels, undialled
lock in a cancelled campaign returning to `pending`, attempts count including undialled claims;
an unstable store selector (infinite re-render) was found by the runner tests.

Real-device results: see 0.13 (2026-10-20). Real-device plan:
the 0.1 audio check; then a campaign of 3 authorized contacts on each SIM: one answers (other
person confirms whether "Read aloud" on speaker was audible), one does not answer, one rejects;
lock the screen during a call; kill the app mid-call; airplane mode before saving; pause/cancel;
confirm every outcome, answer, callback and duration in the web CRM.

### 0.9 Android permissions and behaviour

- `CALL_PHONE` (place the call on the chosen SIM), `READ_PHONE_STATE` (SIMs + idle/ringing/
  off-hook), `RECORD_AUDIO` (post-call voice notes only). Unchanged from before; nothing new requested.
- Android 10+: the app cannot capture call audio or inject audio (0.1).
- Auto-dial runs only right after a visible countdown, with the app in the foreground; Android's
  own call screen takes over. If the app is in the background, it just shows the next lead.
- Off-hook starts at dialling, so off-hook duration is "dial to hang-up", not talk time; shown
  as such everywhere.

### 0.10 Known limitations and follow-ups

- No autonomous AI voice on SIM calls (platform). Read-aloud plays on the phone only.
- Call-log suggestion (answered vs not + talk time) not implemented: needs `READ_CALL_LOG`
  in the private build only, an in-app consent, and a regenerated Android project (blocked by
  Play policy for the Play build). Outcomes are always user-confirmed today.
- Mobile question editor cannot edit skip rules or custom choice options (web can).
- Campaigns are scoped to their creator (no team view); "organization" = single-tenant install.
- Callback reminders are in-app notifications created by the 5-min sweep (not push).
- Calling-hours/consent rules are the campaign window + CRM suppression/do-not-call; local
  telemarketing law (time windows, consent, recording notices) must be verified by the operator.

### 0.11 Troubleshooting

- "Campaign is not running" in the caller → campaign paused/cancelled/completed elsewhere.
- Lead shows "Needs review" → it was dialled but no outcome was saved before the 20-min lock
  expired; open the caller on the same phone to record it (or Retry from the detail screen).
- "Not yet in the CRM (sync failed)" → retried by the sweep up to 5×; use Retry sync.
- Results stuck "waiting to sync" → check connectivity/session; items rejected by the server are
  listed on the campaign detail with Retry.
- Dev builds: if the app loads an old bundle after a force-stop, reopen via the dev launcher.

### 0.12 Deployment and rollback

Deploy: normal pipeline (`deploy/deploy.sh` runs `node src/migrations/runner.js` before restart →
`028_sim_call_indexes`). No new environment variables. Web route `/sim-calls` (sidebar
"SIM call campaigns", permission `ai-calling:read`). Mobile: new JS only (no new native code or
permissions for this feature), shipped with the next app build.
Rollback: revert the code (unmount `/api/v1/sim-calls`, remove the sweep job); collections stay
(migration `down` is a no-op by design); CRM records already written remain valid contact logs.

### 0.13 Final release gate (2026-10-20)

**Recommendation: `READY_FOR_STAGING`.** The feature works end to end on the target phone and
all suites are green, but it has not been deployed to a staging server, and three checks
remain BLOCKED (below). Production review should follow a staging run.

#### A. Automated tests (mocks / simulated call events, no SIM)

| Check | Status | Command | Evidence |
|---|---|---|---|
| Server, full | PASS | `cd server && NODE_OPTIONS=--experimental-vm-modules npx jest` | 221/221 suites, **1665/1665** tests (08:30 PKT, outside Swiss hours) |
| SIM-call API | PASS | `npx jest tests/unit/simCall.api.test.js` | 31/31 incl. new "every endpoint 401/403/404" |
| SMS-agent + AI-calling under load | PASS | 6× `npx jest tests/unit/simSms.api.test.js tests/unit/aiCalling tests/unit/simCall.api.test.js tests/unit/leadCommunication.api.test.js tests/unit/messaging` | 6/6 green (before fix: 1 failure in 4) |
| Mobile, full | PASS | `cd mobile && npx jest --runInBand` (alone and while the server suite runs) | 349/349; the load-only failure was a real double-create bug, fixed below |
| Mobile typecheck/lint | PASS | `npx tsc --noEmit`, `npx eslint src` | 0 errors |
| Web, full | PASS | `cd client && npx vitest run` | 128 files, **654/654** (previous known failure fixed) |
| Web typecheck | PASS | `npx tsc --noEmit -p .` | 0 errors |

Root causes fixed in this gate (not timeouts, not weakened assertions):
- **AI-calling suites failed outside Swiss business hours** (`reliability`, `workflow`,
  `migration026`): `beforeEach` deleted `AI_CALLING_RECIPIENT_HOURS`, so the real clock decided
  whether the recipient window (08:00–20:00 lead-local) was open. Tests now pin the window.
- **"Parse Error: Expected HTTP/" / intermittent SMS-agent failure under load:** `supertest`
  `request(app)` opened and closed a server on a fresh ephemeral port per request; under parallel
  load a freed port was reused by another process. The SIM-SMS and SIM-call suites now use one
  long-lived server (`app.listen(0)` in `beforeAll`). Reproduced (1/4) before, 0/6 after.
- **Mobile `CallCampaignCreateScreen` "saves once" failed under CPU load (1 in 3 runs):** a real
  double-create. `useSingleFlight` only blocks taps while the request runs; `createdId` was React
  state, so a second tap handled by the render before the success re-render saw `null` and created
  a second campaign. The guard is now a ref (`created.current`); the same window in
  `SimSmsLaunchScreen` is closed the same way. Outcome saves were never affected (server is
  idempotent per attemptId).
- **Web `lead-bulk-contact`:** a real bug in outreach email composition. Choosing a template never
  applied the template's company/sender name because the field is pre-filled with the default
  ("Updata.ai"). Untouched defaults are now replaced; user-typed values are kept (new regression
  test). Unrelated to SIM calling.

#### B. Emulator (Android stack, simulated modem; 2026-10-19)
PASS for claim, dial, call-state evidence, outcome, skip-rule, retry with preserved answers,
restart reconciliation, callback 10:00 Asia/Karachi, pause, offline sync, cancel → 0 calls (0.8).

#### C. Real device: TECNO KJ5, Android 13, Jazz + Telenor, isolated API/DB (2026-10-20)
Calls only between the phone's own two numbers (user's choice); nobody else was called.

| # | Check | Status | Procedure → observed result |
|---|---|---|---|
| 1 | Create campaign + questions in the app | PASS | Picker (3 leads) → details → default questions → calling rules → Create. Server: tz Asia/Karachi, 09:00–19:00, 10 s, 5 questions, script, 3 tasks |
| — | Calling hours | PASS | Started at 08:05 → "Outside the campaign's calling hours. Next: 09:00"; nothing handed out |
| 2 | Server sync / progress | PASS | Every step reflected in the API and web (0.13 C14) |
| 3 | SIM dial + return from native dialer | PASS | Dual SIM: Call disabled until a SIM is chosen; Jazz SIM → `com.sh.smart.caller` InCallActivity "Calling…"; back in app mid-call, answers tapped |
| 4 | Read-aloud heard by the other party | **BLOCKED** | Button works and plays on the phone; no second person/phone authorized to listen |
| 5 | Manual outcome | PASS | Call ended by network after 32 s → app switched to "What happened?" from real call-state callbacks; said it cannot tell answered; user chose "No answer" |
| 6 | Answers kept across retries | PASS | Retry of lead 1 showed "Attempts: 1" with Yes/High restored |
| 7 | Countdown / auto-progression | PASS | 10 s countdown advanced to the next lead; auto-dial off (not exercised on device) |
| 8 | Pause, skip, cancel | PASS | Pause held while offline and after sync (no claim); Skip moved to the next lead; cancel below |
| 9 | Restart during an unfinished call | PASS | Force-stopped app during a live call → relaunch → straight to outcome sheet, 68 s off-hook reconstructed from native events, no Call button, no redial |
| 10 | Network loss → sync | PASS | Airplane mode → callback saved "on this phone — syncing", server unchanged → network back → synced (scheduled, CRM follow-up) |
| 11 | Callback + Follow-ups | PASS | 21 Oct 10:00 Asia/Karachi via native pickers → `2026-10-21T05:00Z`; CRM follow-up set; not requeued |
| 12 | Web cancel while app open | PASS | Cancel via API → tap Call → "The campaign is not running", badge "Cancelled", 0 calls |
| 13 | Duplicate-call prevention | PASS | Device call log (own numbers, test window): exactly 2 outgoing calls = 2 server attempts |
| 14 | Mobile / backend / web consistency | PASS | Headless web: same states, answers, 32 s evidence, sync ok, activity; attempts 2 after API restart on current code |
| — | Screen off/on | PASS (partial) | Screen turned off mid wrap-up, back on → state intact. Locking with a PIN during a live call: NOT TESTED (phone uses App Lock, no keyguard) |
| — | Voice note in a campaign call | NOT TESTED on device | Whisper verified earlier on device; covered by unit tests here |

#### D. Safety, security, release

| Check | Status | Evidence / procedure |
|---|---|---|
| No redial after restart; completed task not re-dialled; paused/cancelled campaign cannot dial | PASS | Device C9/C12/C13 + API tests (dial is re-authorized server-side per attempt) |
| "Answered" never inferred; user confirms | PASS | Device C5; server refuses answered for undialled attempts |
| Countdown cannot bypass server checks | PASS | Every claim/dial re-checks status, hours, suppression (API tests; device calling-hours) |
| Permissions minimal; no accessibility / audio interception | PASS | Manifest: CALL_PHONE, READ_PHONE_STATE, RECORD_AUDIO (voice notes) + SMS-agent perms in private build only; probe a11y service removed |
| AuthN/RBAC/owner isolation on all 23 endpoints | PASS | New test: 401 without token, 403 without permission, 404 for another user on every route; B cannot change A's task |
| Input validation, safe errors | PASS | Joi on every route; AppError envelopes; no stack traces in responses |
| Privacy in logs/history | PASS | Service logs task ids only; events contain no numbers/transcripts (test) |
| DST / timezone | PASS | `zonedWallTimeToIso` Zurich DST test; device Karachi conversion |
| Migration 028 | PASS | Applied on a DB with existing data in 80 ms; second run "No pending migrations"; `up()` twice OK; `down()` keeps data; indexes incl. unique campaign+lead |
| Background job | PASS | Sweep: stale locks → needs_review/pending/cancelled; callback reminders; sync retries (tests + device-data run) |
| Rate limiting | PASS | `/api/v1/sim-calls` behind the global API limiter |
| Release APK build | PASS | `EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_API_URL=https://updata.behjja.com/api/v1 EXPO_PUBLIC_DISTRIBUTION=private ./gradlew :app:assembleRelease` → 37 MB; bundle contains only the https API host, no test credentials, no `localhost:9097` |
| Install release build on TECNO | NOT DONE | Would replace the dev build used for testing; install via EAS `staging-private` |
| Staging deployment, APIs on staging | **BLOCKED** | Code is not committed/deployed; deploy via the GitHub "Deploy" workflow after review |
| Deploy health check | FIXED | `deploy.sh` now fails unless `/health/ready` answers within 60 s after restart; backups need `mongodump` on the host (script warns if missing) |
| Jurisdiction rules (calling hours, consent, recording notices) | **BLOCKED (operator)** | Must be reviewed per country before enabling campaigns; not a technical guarantee |
| Call-log outcome suggestion | NOT IMPLEMENTED | Deferred (0.10); the device log confirms it would add accurate "not connected" signals |

#### E. Remaining risks and actions
1. Staging: commit, deploy to a staging host (migration 028 runs automatically), install the EAS
   `staging-private` APK, repeat C3/C5/C9/C10/C12 against it.
2. Read-aloud audibility: one call to a second phone held by a tester, on speaker.
3. Lock-screen with a PIN during a live call; Android battery saver / background kill during a
   long call on HiOS.
4. Campaign creation has no server idempotency key; the client guard covers double taps, not a
   retry after a lost response. Add an `Idempotency-Key` on create if this shows up in staging.
5. Legal review per jurisdiction before production use.

### 0.14 Bug fix: campaign calling needed a tap every time; "AI does not talk" (2026-10-20)

**Status: `READY_FOR_STAGING`.** Automatic calling now works on the real TECNO. The AI still
cannot speak or listen inside a SIM call: that is an Android limit, not a bug (0.1).

#### Bug A — "I have to press Make Call for every lead"
Traced `Start → claim → eligibility → dial → call state → outcome → sync → countdown → next`.
Three root causes, in order of impact:
1. **The campaign caller never asked for the Phone permissions.** Only the single-lead call
   screen did. On a fresh install (every client APK) `placeCall` had no `CALL_PHONE`, so the
   native module fell back to `ACTION_DIAL`: Android's dialer opened with the number and the
   user had to press Call there, every time. Without `READ_PHONE_STATE` the SIM list was empty
   and the call state was invisible, so the screen could sit on "Call in progress".
   The developer's own phone had the permissions from another screen, which hid the bug.
2. **Auto-dial only existed after a saved outcome, and was off by default.** The first lead
   (and a lead reached by Skip or by reopening the caller) always waited for a tap.
3. **After a hang-up while Updata was in the background**, the runner relied on the JS
   listener only; if it missed the idle event the user had to tap "The call has ended".
   And with only retries left, the caller waited for "Check again" even though the server
   had given the time.

Fixes (mobile only, no server change, no new permission):
- `useCampaignRunner`: asks for `READ_PHONE_STATE` + `CALL_PHONE` before the server records
  the dial; reports the route (`telecom_direct` vs `dialer_handoff`) and whether call state is
  visible; re-reads the native persisted call events whenever the app returns to the
  foreground; one **auto-call** mechanism: a visible "Calling <lead> in N s · Stop" countdown
  on any claimed, never-dialled lead. It runs only while the app is on screen, permissions are
  granted, a SIM is set, the campaign runs, the phone is online and nothing is paused; any
  change resets it. A dialled lead (e.g. found again after a restart) is never auto-called.
  With auto-call, a retry due within an hour is fetched by itself when due.
- Run screen: permission card ("Allow phone access" / "Open settings"), "Call automatically"
  switch (per campaign, per phone, persisted in the campaign outbox store; default = the
  campaign's setting), dialer-handoff and no-call-state hints, outcome shown *above* the
  questions after a call.

#### Bug B — "the AI agent does not talk to the lead"
Not fixable on a SIM call. Measured on the TECNO (0.1): during a call Android silences every
capture source to RMS 0 and refuses the call-audio sources, and an app cannot inject audio
into the call. What works and is verified:

| Capability | Status |
|---|---|
| Show questions in order, skip rules (`condition`) | Works (tests both branches; device) |
| Highlight the next question to ask | Added ("Ask next") |
| Read a question aloud **to the phone user** | Works; plays on the phone, labelled as such |
| Capture answers (chips / text / numbers), kept across retries | Works |
| Post-call voice note → Whisper transcript, labelled "transcribed" | Works (verified 2026-10-19) |
| Hear the lead / AI replies / AI speech into the call | **Not possible** on Android 13 without being the dialer or system app |

The caller now says so where it matters: "The lead hears only you. Read-aloud plays on this
phone, not inside the call; the AI does not speak or listen on SIM calls." The AI-voice
option that does talk is the cloud route (LiveKit + SIP trunk), which needs a SIP provider
and per-lead consent and is separate from SIM calling.

#### Tests (all mocks; not proof of a real call)
New in `CallCampaignRunScreen.test.tsx`: first lead auto-called after a visible countdown;
Stop keeps the lead for a tap; switch enables auto-call; background holds the countdown and
it restarts on return; without permission no auto-call, a tap asks and falls back to the
dialer (with the hint); next lead auto-called after a saved outcome; Pause stops it; a
dialled lead after restart is never called even with auto-call on; hang-up recorded while in
the background is reconciled on return; due retry fetched by itself only with auto-call.
Also fixed a pre-existing race in `CallCampaignScreens.test.tsx` (list test pressed
"Bakeries" before the filtered list rendered; failed 3/4 under load, 0/5 after).

#### Real device (TECNO KJ5, Android 13, isolated API, test app `ai.updata.crm.dev`)
Calls only to the phone's own two numbers.

| Check | Result |
|---|---|
| Fresh install, no permission: explanation + "Allow phone access", auto-call holds | PASS |
| Grant both permissions → SIM chips appear, auto-call waits for a SIM | PASS |
| Pick Jazz → "Calling Device Own Telenor in 8 s · Stop" → call placed with no tap (`telecom_direct`, sub 3) | PASS |
| Hang up → back in Updata, "What happened?" first, off-hook 19 s from call-state | PASS |
| Save "No answer" → next lead claimed and auto-called after its countdown | PASS |
| Server: 2 attempts, `call_state` evidence, SIM 3, CRM sync ok, retries in 5 min | PASS |
| Retry due → fetched by itself (code added after the device run) | Unit-tested only |
| Read-aloud heard by the other party; call to a third-party number | NOT DONE (blocked by tooling permission; see report) |

#### Shareable APK
`Updata-0.1.2.apk` (versionCode 3, release key `1ecf1bde…72fe`, Play-safe: no SMS/call-log/
accessibility permissions; `npm run verify:apk` passes). Installs as an update over 0.1.0/0.1.1.
Rollback: install the previous APK after uninstalling (Android forbids downgrades in place);
no server or database change was made.

### 0.16 SIM-first mobile app: no mandatory SIP/LiveKit trunk (2026-10-21)

**Decision (owner):** the Android app calls and texts through the phone's own SIM. A purchased
SIP number, LiveKit or any telephony provider is **not** part of the mobile setup. Cloud AI
calling (LiveKit + SIP, `/ai-calling`) remains an **optional, separately configured** server mode.

**Audit — where the app depended on a trunk (before):**

| Place | Behaviour before | Now |
|---|---|---|
| Call Agent home | "AI calls: Not ready — no phone trunk", "AI SMS: Not ready — no SMS provider" cards; first action "Call leads with AI" (cloud) | One **Mobile calling readiness** card; SIM call campaigns, call queue and (company build) SMS from this phone first; cloud agent moved to "Optional: cloud AI agent", its call/SMS actions shown only when the server reports them ready |
| Dashboard "Start campaign" | cloud AI agent launch | SIM call campaign (lead picker → create) |
| Lead detail "AI agent" | cloud AI agent launch | "Campaign" → SIM call campaign for that lead |
| Leads header campaign icon | cloud campaigns | SIM call campaigns |
| Settings | "AI calls / AI SMS" trunk status rows | "Mobile calling readiness" row |
| Cloud launch screen (optional path) | red "can't dial: no phone trunk" dead end | "optional, not set up" + **Call from my SIM instead** (same leads) / **Text from this phone instead**; unknown status still shown honestly |

No LiveKit/WebRTC/SIP package exists in the mobile app (checked `package.json`). The server's
`LIVEKIT_*` / `SIP_OUTBOUND_*` settings were already optional (empty defaults); nothing on the
server requires them for SIM calling or SIM SMS. The removed mobile file is the cloud
`callAgent/components/ReadinessCard.tsx`.

**Mobile Calling Readiness screen** (`mobile/src/features/readiness`), every row from real state:
SIM (hardware, airplane mode, SIM state, dual-SIM names), phone permission (Allow / Open
settings when Android stops asking), SMS (company build: send/receive + notification + battery;
shareable build: messaging app), microphone for voice notes, CRM server (reachable + latency,
retry), AI features on the server, **"AI voice inside SIM calls: not possible on Android"**
(measured 0.1), and optional cloud calling (information only).

**New API:** `GET /api/v1/sim-calls/readiness` (auth + `ai-calling:read`) → `{ serverTime,
simCalling, simSms, ai: { configured, … }, cloudCalling: { configured, reason, required:false } }`.
The cloud check has a 3 s cap and can never fail SIM readiness. An older server (404) is shown as
reachable with "update the server to see AI status".

**Tests:** readiness logic (12), readiness screen (4: SIM-ready dual SIM without trunk, permission
request from the row, offline/retry/older server, honest call-audio limit), API (2: shape and
401), updated launch/home/leads tests (no trunk error; SIM fallback replaces to
`CallCampaignCreate` with the same leads).

**Not yet verified on the physical phone:** the readiness screen itself (the TECNO was not
connected after this change). SIM calling, SIM SMS sending and their limits were verified on the
TECNO on 2026-10-21 (0.14, report). AI speech inside SIM calls remains impossible on Android 13.

---

## 1. Architecture

```
CRM Web App (React/Next)                 ← dashboard, wizard, monitor, review, browser test
        │  authenticated REST + Socket.IO
Node/Express backend  = SOURCE OF TRUTH
  ├─ Campaign service  — validation, lifecycle, recipient resolution
  ├─ Question engine   — deterministic conversation state machine (pure)
  ├─ Status-rule engine— answers → qualification verdict (pure)
  ├─ Queue worker      — sequential/concurrent dialing, retries, recovery
  ├─ Agent tool API    — the ONLY DB mutations the AI can trigger (per-call token)
  └─ Reconciliation    — recovers stuck calls on a timer
        │
LiveKit Agents worker (separate process, server/agent-worker)
  └─ OpenAI Realtime voice ⇄ LiveKit room ⇄ primary non-Twilio SIP trunk ⇄ PSTN
                                      └─ optional Twilio SIP trunk fallback
        │
MongoDB  — campaigns, recipients, call records, answers, suppression, audit
Redis+BullMQ — campaign scheduling / concurrency / recovery
```

**Design principle:** the AI conducts the conversation and *proposes* structured answers;
the backend validates and persists them, applies the campaign rules, and decides whether a
lead's status may change. The model never has arbitrary DB access and cannot override
qualification rules, campaign limits, or consent restrictions.

**Honest telephony:** with no LiveKit/SIP configured the feature reports "not configured"
and places **no** calls — it never fakes a PSTN call or fabricates success. The browser
text **Simulate** console works with zero configuration.

---

## 2. State model (three distinct concerns)

| Concern | Field | Examples |
|---|---|---|
| Technical call lifecycle | `CallRecord.state` | ringing · in_progress · completed · no_answer · failed · needs_reconcile |
| Business outcome | `CallRecord.disposition` | answered_completed · callback_requested · do_not_contact · declined · needs_review |
| CRM lead status | `Lead.status` | new · contacted · qualified · unqualified · converted |

A *completed* call never auto-qualifies on its own. Incomplete/contradictory answers go to
**review**, never qualification. A do-not-contact request overrides every content rule.
`converted` is protected — a call never changes it, and there is no automatic path to
"closed won".

---

## 3. Environment variables

All secrets are server-only. Blank = feature stays in "not configured" mode.

### API process (`server/.env`)
```dotenv
# OPENAI_API_KEY is reused from the existing AI config.
OPENAI_REALTIME_MODEL=gpt-4o-realtime-preview
OPENAI_REALTIME_VOICE=alloy

# Browser voice test + agent dispatch (LiveKit only — no phone/SIP needed):
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_AGENT_NAME=crm-voice-agent        # MUST match the worker
PUBLIC_API_BASE_URL=http://localhost:9097 # reachable by the worker; public https in prod

# Real outbound PHONE (PSTN) calls — a SIP trunk via ANY carrier (NOT Twilio):
#   Option A — a trunk you created in the LiveKit dashboard:
LIVEKIT_SIP_OUTBOUND_TRUNK_ID=
#   Option B — bring your own carrier (Telnyx/Plivo/Vonage/Peoplefone/Sipcall…);
#   the CRM auto-provisions the LiveKit trunk from these (leave Option A blank):
SIP_OUTBOUND_ADDRESS=                      # e.g. sip.telnyx.com / sip.peoplefone.ch
SIP_OUTBOUND_NUMBER=                       # your DID / caller-ID, E.164
SIP_OUTBOUND_USERNAME=                     # blank for IP-authenticated trunks
SIP_OUTBOUND_PASSWORD=
SIP_OUTBOUND_TRANSPORT=auto                # auto | udp | tcp | tls
LIVEKIT_SIP_CALLER_ID=                     # optional; else SIP_OUTBOUND_NUMBER is used

# Optional Twilio carrier fallback. Keep disabled until its dedicated LiveKit
# outbound trunk, E.164 caller ID, and explicit country policy are configured.
AI_CALLING_TWILIO_FALLBACK_ENABLED=false
AI_CALLING_TWILIO_FALLBACK_COUNTRIES=       # ISO-2, comma-separated; blank means all
LIVEKIT_TWILIO_SIP_OUTBOUND_TRUNK_ID=
TWILIO_VOICE_FROM_NUMBER=

# Optional (sensible defaults; fall back to JWT_SECRET):
AI_CALLING_AGENT_SECRET=
AI_CALLING_PHONE_HASH_SECRET=
AI_CALLING_REQUIRE_CONSENT=true
AI_CALLING_WORKER_CONCURRENCY=5
AI_CALLING_DEFAULT_LANGUAGE=en             # opening language for agentConfig.language='auto'
LIVEKIT_TIMEOUT_MS=15000
```

### Worker process (`server/agent-worker/.env`)
Same `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_AGENT_NAME`, plus its
own `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, and optionally
`AGENT_RING_TIMEOUT_MS` (default 60000).

### Production checklist (API)
- `PUBLIC_API_BASE_URL=https://…` — **required**. Without it, real dials are refused and the
  campaign is paused (the worker could not reach the CRM → the lead would hear silence).
- `AI_CALLING_PHONE_HASH_SECRET` — set explicitly and never rotate. The do-not-call list and the
  consent ledger are keyed by this HMAC. If it is blank today (falling back to `JWT_SECRET`), set
  it to the **current** `JWT_SECRET` value so existing hashes remain valid.
- `AI_CALLING_RECIPIENT_HOURS` / `AI_CALLING_RECIPIENT_DAYS` — recipient-local quiet hours
  (defaults 08:00–20:00, Mon–Sat). Verify against the rules of every country you call.
- `AI_CALLING_COST_PER_MINUTE` (+ `_CURRENCY`) — optional blended estimate that powers campaign
  cost and `schedule.maxCampaignSpend`; without it cost stays 0 (never invented).

---

## 4. Setup

```bash
# 1. Indexes (migrations 017, 024, 026 — additive, idempotent; deploy.sh runs them)
cd server && npm run migrate

# 2. API (jobs auto-register: outbound-calling + ai-call-reconciliation)
npm run dev

# 3. Voice agent worker (needs LiveKit + OpenAI)
cd server/agent-worker
cp .env.example .env         # fill LIVEKIT_* and OPENAI_API_KEY
npm install
npm run download-files       # one-time: Silero VAD, etc.
npm start                    # registers with LiveKit, waits for dispatches
npm test                     # worker call-control unit tests (no credentials needed)
```

**Production worker under pm2** (then `deploy/deploy.sh` keeps it in step with the API —
it restarts the worker *after* the API, because a new worker calls `/answered`):

```bash
cd /var/www/updata/server/agent-worker && npm ci --omit=dev && npm run download-files
pm2 start "npm start" --name updata-voice-agent --cwd /var/www/updata/server/agent-worker
pm2 save
```

**LiveKit webhook** (call state backstop — answered / hang-up / no-answer / busy): in the LiveKit
project settings add a webhook to `https://<host>/api/v1/webhooks/ai-calling/livekit`, signed
with the same API key/secret as `LIVEKIT_API_*`. Without it calls still finish via the worker's
`/end` and the reconciliation sweep, but slower and with less precise outcomes.

### Telephony prerequisites (the part that costs money)
1. A LiveKit Cloud project (or self-hosted LiveKit + SIP service).
2. For PSTN: a **SIP trunk via any carrier — deliberately carrier-agnostic and
   NOT Twilio** (Telnyx, Plivo, Vonage, or a Swiss provider such as Peoplefone or
   Sipcall) with a DID (caller-ID) number. Either create the outbound trunk in the
   LiveKit dashboard and set `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, or give the carrier's
   SIP credentials (`SIP_OUTBOUND_ADDRESS`/`NUMBER`/`USERNAME`/`PASSWORD`) and the
   CRM provisions the LiveKit trunk for you on first call.
3. An OpenAI key with Realtime access (model `gpt-realtime`).

None of OpenAI Realtime usage, SIP connectivity, numbers or carrier minutes are free.
Twilio is never the primary voice carrier. Its optional fallback uses a separately
provisioned LiveKit outbound trunk and is attempted only after a definitive primary
rejection that proves no PSTN call was accepted. Timeouts and connection failures are
ambiguous and never trigger fallback. The router also tracks whether the LiveKit agent
was already dispatched so a fallback cannot create either a silent call or a duplicate
agent in the room. Before first use, preset LiveKit trunk IDs are resolved through the
LiveKit API: the primary fails closed if its address is a Twilio trunk, while the Twilio
fallback fails closed unless its dedicated trunk address is Twilio.
Configure spend/volume limits on each campaign (`schedule.maxCampaignSpend`, `maxCallsPerDay`)
and with your providers before a real run.

---

## 5. Dynamic questions & status rules (configuration, not code)

Questions and rules are data, snapshotted with a `questionnaireVersion` so later edits can't
reinterpret an in-flight call. Example campaign config:

```json
{
  "name": "Heating service qualification",
  "questionnaire": {
    "questions": [
      { "fieldKey": "dm", "label": "Decision maker", "text": "Are you the decision maker?",
        "type": "boolean", "required": true, "order": 1 },
      { "fieldKey": "employees", "label": "Employees", "text": "How many employees?",
        "type": "integer", "required": true, "min": 1, "order": 2,
        "condition": { "all": [ { "field": "dm", "equals": true } ] } },
      { "fieldKey": "interest", "label": "Interest", "text": "Interested in a follow-up?",
        "type": "single_choice", "options": ["yes","no","later"], "required": true,
        "confirmCritical": true, "order": 3, "mapTo": "qualification.followUpInterest" }
    ]
  },
  "statusRules": [
    { "id": "qualified",
      "when": { "all": [ { "field": "dm", "equals": true }, { "field": "interest", "equals": "yes" } ] },
      "action": "mark_qualified" },
    { "id": "callback", "when": { "any": [ { "field": "interest", "equals": "later" } ] },
      "action": "schedule_callback" },
    { "id": "not_interested", "when": { "all": [ { "field": "interest", "equals": "no" } ] },
      "action": "mark_not_interested" }
  ]
}
```

- **Question types:** short_text, long_text, boolean, single_choice, multiple_choice, integer,
  decimal, currency, date, time, email, phone, url, address, rating.
- **Clause operators:** `equals`, `notEquals`, `in`, `contains`, `exists`, `gt`, `gte`, `lt`, `lte`.
- **Rule actions → lead status:** `mark_qualified`→qualified, `mark_unqualified`/`mark_not_interested`→unqualified,
  `mark_contacted`→contacted, `mark_do_not_contact`→unqualified+suppression, `schedule_callback` and
  `request_review` are side-effects only (status unchanged). `requiresReview: true` on any rule routes
  the call to a human instead of applying the status.

The wizard builds all of the above visually (conditional show-if per question, multi-clause
ALL/ANY rules).

---

## 6. API surface (`/api/v1/ai-calling`)

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/campaigns` | ai-calling:read / ai-calling:write |
| GET/PATCH | `/campaigns/:id` | read / write |
| POST | `/campaigns/:id/preview` | read |
| POST | `/campaigns/:id/simulate` | write — browser text simulation (no telephony) |
| POST | `/campaigns/:id/web-test` | write — browser WebRTC voice test (LiveKit, no SIP) |
| POST | `/campaigns/:id/start \| pause \| resume \| cancel \| retry` | write |
| GET | `/campaigns/:id/recipients \| active-calls \| export` | read |
| GET/POST | `/calls/:id` · `/calls/:id/review` | read / write |
| GET | `/leads/:leadId/history` · `/leads/:leadId/transitions` | read — calls · automated/reviewed status changes |
| GET | `/analytics` · `/analytics/export` | read |
| POST | `/suppressions` | write — manual do-not-call (`phone`, or `leadId` → the lead's stored number) |
| GET/PUT | `/leads/:leadId/consent` | read / write — evidence-backed call consent |
| GET | `/telephony/health` | read — provider config + `operations` (stuck/parked calls, overdue ticks, failure rate) |
| GET | `/languages` | read — AI agent language allow-list (`aiCalling.languages.js`) + default |

**Agent tool API** (`/api/v1/ai-calling/agent/:callId/*`): authenticated by a **per-call
bearer token** (header only, never a query string), scoped to exactly one call (a token used on
another call's path → 403). The only DB mutations the AI can trigger: `context` (read-only for
phone calls), `answered` (worker saw SIP `callStatus=active`), `disclose`, `record-answer`,
`mark-unknown`, `confirm`, `request-callback`, `do-not-contact`, `decline`, `end`. Every answer is
validated server-side; answers before the disclosure or after the call ended are refused; `end`
accepts only telephony-level dispositions (`voicemail|no_answer|busy|failed`) — business outcomes
are always derived server-side. Rate limit: 120 tool calls/min **per call** (not per worker IP).

**Webhook:** `POST /api/v1/webhooks/ai-calling/livekit` (signature-verified, idempotent).

RBAC: the dedicated `ai-calling:{read,write,admin}` permissions are *implied* by
`crm:read`/`crm:write`/`crm:admin` and `lead:read` (see `PERMISSION_IMPLICATIONS`), so existing
CRM users keep access and Admin inherits everything.

---

## 7. Reliability

Verified by `tests/unit/aiCalling.reliability.test.js` (mocked provider; see §9).

- **One tick chain per campaign.** Every enqueue mints a `tickToken`; a tick with a stale token
  exits, and a `tickLeaseUntil` lease stops two ticks overlapping. A watchdog in the
  reconciliation sweep revives a lost chain (overdue `nextTickAt`) with a fresh token.
- **Per-dial gates**, re-checked immediately before *every* dial: campaign still running
  (pause/cancel take effect before the next dial, not the next tick), lead not deleted,
  recipient-local quiet hours, suppression, consent, spend cap, production configuration.
- **Never redial an attempt that may have reached the lead.** `dispatchStartedAt` is persisted
  *before* the provider request. A crash before it → requeued with the attempt refunded; after it
  without a recorded outcome → `needs_reconcile`, recipient parked as `failed`, owner notified,
  **no automatic retry** (only a human "Retry failed" re-dials). Long-ringing calls are checked
  against LiveKit (`ListParticipants`): still live → left alone; gone → no-answer; unknown → parked.
- **Exactly-once post-call processing.** Agent `end`, provider webhooks and the sweep race for an
  atomic `processingLeaseUntil` claim; lead/recipient side effects run before `resultsProcessedAt`
  is stamped, and an expired claim (crash mid-way) is resumed by the sweep (all steps idempotent).
  A late result for an older attempt never overwrites the recipient's current attempt.
- **Lost-update-free tool calls.** `conversationState` is written with optimistic concurrency
  (`stateVersion`), so parallel realtime tool calls can't drop answers.
- **Out-of-order webhooks.** Unique event keys drop duplicates; state only moves forward; an
  answered call can't later become busy/no-answer.
- **Hang-up.** Processing deletes the LiveKit room, which ends the SIP leg (the agent leaving the
  room alone would leave the callee on a silent line).
- **Retries** only for transient no-answer/busy/voicemail/failed within `maxAttemptsPerLead`, with
  exponential backoff (base `retryDelayMinutes`, ×2 per attempt, ≤24h, +≤10% jitter, ≥
  `minMinutesBetweenAttempts`). Permanent rejections are terminal. Daily cap uses the campaign's
  local day.
- **Worker** (`agent-worker`): waits for SIP `callStatus=active` before speaking (never into a
  ringing line or a voicemail greeting it hasn't detected), honours `silenceTimeoutSeconds`
  (prompt once, then end) and `allowBargeIn`, has a `reached_voicemail` tool (no message is left),
  sends `/end` exactly once, and enforces `maxCallSeconds`; the sweep is the backstop if it dies.

---

## 8. Security, consent & privacy

- AI identity disclosure is spoken at the start (configurable, `{company}` interpolated).
- With `AI_CALLING_REQUIRE_CONSENT=true` (the default), an active, unexpired,
  evidence-backed call consent record for the lead's current normalized phone number is
  required both when recipients are snapshotted and immediately before dialing. Consent is
  **company-wide** (leads are shared): the most recent decision by any user wins, so a revocation
  by anyone blocks every campaign. Re-granting puts recipients of a started campaign back in the queue.
- Recipient-local quiet hours (country timezone) apply on top of the campaign window. Multi-zone
  countries (US, CA, AU, BR, RU, MX, …) cannot be resolved from the country alone — use a
  conservative campaign window for them.
- Immediate stop handling: a do-not-contact request suppresses the number across all campaigns.
- Recording is **off by default** (`agentConfig.recordCall`) — enabling it requires a lawful
  disclosure/consent flow and storage you configure.
- Phone numbers are HMAC-hashed in the suppression ledger; call context sent to the model is the
  minimal public business snapshot (never the whole DB, never the raw phone).
- A public business listing is **not** treated as consent for automated marketing calls.

---

## 9. Testing

```bash
cd server && npm test -- tests/unit/aiCalling        # 13 suites
#   engines, workflow, agent flow + HTTP API, reliability (exactly-once, tick chain,
#   crash recovery, webhooks, consent, manual override, spend cap), call windows,
#   webhook mapping, migration 026 on legacy-shaped data.
cd server/agent-worker && npm test                    # worker call control (fake room)
cd client && npx vitest run src/modules/aiCalling     # UI hooks (socket cleanup)
cd mobile && npx jest src/features/aiAgent
```

The agent brain, signature validation, consent gate, fallback policy, and duplicate-dispatch
guards are tested without telephony. What needs live credentials to verify:
a real PSTN/SIP call, the OpenAI Realtime audio runtime, and the worker process. Mocked tests
passing is **not** a claim that the live telephony path is verified.

### Live voice verification (2026-10-19, real LiveKit Cloud + OpenAI Realtime, no PSTN)

A local worker (agent name `crm-voice-agent-e2e`, so it can never take production dispatches)
was driven through `POST /campaigns/:id/web-test` by a headless LiveKit participant that speaks
pre-recorded answers and records the agent. Verified: disclosure, consent → `disclose`, both
campaign questions asked in order, spoken answers understood and stored (`need` verbatim,
`interest`→`high`), goodbye played in full, call `completed / answered_completed`; and a
"busy, call me back tomorrow at 10" lead → `callback_requested` with the time captured.

Bugs found and fixed by that run (none were visible to the mocked tests):
- The model only saw the next step once (first turn / tool results) and **improvised questions**
  (name, products, employee count). The standing instructions now carry the questionnaire and
  `CURRENT STEP`, refreshed via `agent.updateInstructions()` after every tool call.
- An empty campaign disclosure produced a blank disclosure line; there is now a truthful
  default (`disclosureText`). The prompt no longer says "may be recorded" when `recordCall` is off.
- The goodbye was cut off: the worker sent `/end` immediately and the CRM deletes the room
  once it has processed the call. The worker now waits for the agent to stop speaking first
  (`waitUntilQuiet`), and `finish_call`/`reached_voicemail` return no output so the model
  does not read a tool message aloud.
- The worker's health server defaulted to port 8081 (Metro's port); now `AGENT_HEALTH_PORT`.

Still unverified: a real PSTN call (no SIP trunk; see §10).

---

## 10. Limitations / not yet done

- **No phone line yet (2026-10-19):** LiveKit and OpenAI keys work, but `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`
  and `SIP_OUTBOUND_*` are empty, so no AI call can reach a phone. The Twilio account is a
  Trial (calls only verified numbers, trial announcement, Pakistan dialing permission off,
  no owned number) and the primary carrier must not be Twilio by design. Note also that a
  normal Android app cannot put an AI voice into a SIM call or hear the callee, so AI-voiced
  calls must go through a SIP carrier, not the user's phone.
- **Not verified against real providers** (blocked on credentials/authorized test numbers):
  outbound PSTN through a SIP trunk, caller ID, LiveKit webhook delivery to this host, the
  `sip.callStatus` transitions on a real carrier, OpenAI Realtime audio/barge-in quality, and the
  worker's hang-up via `deleteRoom`. See `docs/AI_CALLING_PRODUCTION_AUDIT.md` §F for the exact
  verification script.
- Voicemail detection is the model's judgement (`reached_voicemail` tool); there is no carrier AMD.
- Live Twilio voice fallback is not verified until its separate LiveKit trunk, registered
  caller ID, country eligibility, and an authorized test destination are available.
- Call **recording** capture/storage (egress + object storage + consent) is not wired; the
  `recordingRef` field exists for it. Transcripts are not stored.
- Cost is provider-reported or an operator-configured estimate; no live price feed.
- Campaigns are scoped to their creator; there is no cross-user admin campaign view.


## 0.15 Reliability re-audit and remediation (2026-10-20)

The current audit and exact execution evidence are in [docs/AI_CALLING_AUDIT.md](docs/AI_CALLING_AUDIT.md).
This work preserves the pre-existing dirty mobile changes; the earlier real-device claims are
not fresh device verification. Only an emulator was attached during this re-audit, and no
outbound call was placed.

### Calling and recovery

SIM calls remain human-led, provider-independent calls. One attempt receives **one** server dial
authorization, enforced by an atomic update with active state, device, unexpired lease and an
undialed attempt. Replaying `/dial` returns 409 `SIM_CALL_ALREADY_DIALED`. **Do not retry dialing
after a timeout:** read the task and reconcile the possible call. The server records authorization
before handing off to Android, so `dialedAt` is conservative authorization evidence, not proof a
carrier call occurred. A pause, background transition or navigation away during authorization
prevents the local launch. A cancelled/paused campaign still permits outcome reconciliation of
a locally remembered authorized attempt via the owner-scoped GET task endpoint.

A completed outbox write must reach the server before progression, including after restart.
In-flight answer responses cannot remove newer edits or resurrect superseded writes. Switching
accounts cancels the old queue's subsequent work and prevents it from mutating the new account.
The answer debounce is cleared on completion so a delayed partial save cannot become a false
conflict after the final save. Unknown dialed attempts cannot be skipped/retried; record the
outcome first. Cancelling never reopens queued/callback work when an in-flight outcome arrives.

### Questions, extraction and CRM

Required visible questions must be answered or explicitly unknown for an `answered` outcome.
Unreached/refused calls can still be recorded without forcing invented answers. Typed assisted
values use exact choice matching, integer/date/time validation, and conditional rules use the
latest merged values. Cyclic dependencies are rejected. Mobile campaign setup supports answer
types, custom choices, ordering and one equality condition; complex all/any rules remain in web.
Callback inputs reject invalid calendar values, DST gaps and repeated ambiguous times.

Answers record question text/version, source, actor, timestamp and validation. Final attempts
snapshot their answers and callback request so later retries do not use another conversation's
answers. The final CRM note is fixed before side effects. Partial CRM receipts remain failed and
retryable instead of falsely reporting success. A confirmed opt-out persists on the attempt,
blocks later eligibility even before the suppression ledger sync succeeds, and survives retry.

Campaign wrap-up reuses the existing **Suggest answers from notes** service, only after an
explicit tap. It uses up to 5,000 characters of notes plus reviewed voice-note transcript. It
proposes the existing CRM qualification fields (needs, budget, interest, role, next steps, etc.),
not arbitrary changes to contact identity. Review displays the current CRM value, proposed value
and source quote. Accepted proposals remain local until Save outcome. The server validates the
field and evidence, requires `lead:write` in addition to `ai-calling:write`, snapshots the accepted
answers and persists through the same idempotent `simcall-<attemptId>` communication receipt.
The sweep retries failed CRM work. Concurrent independent qualification merges use version
checks and bounded retries so unrelated fields are not lost.

This is post-call, user-reviewed extraction. No streaming SIM extraction or unattended transcript
extraction job is claimed. Voice/STT and suggestion provider failures leave manual entry usable.
The existing provider key stays server-side; no new credentials or required env variables.

### API additions and deployment order

- `POST /campaigns` accepts optional `creationKey` (8–80 chars). Both clients retain a stable key
  for retries of identical content. Reuse with different content returns 409
  `SIM_CALL_CREATION_CONFLICT`. Initialization can recover a partially created draft; replaying
  creation after a later edit does not rebuild the original lead list.
- `POST /tasks/:id/complete` accepts optional `qualification: {answers:[...]}` with the existing
  CRM qualification answer contract. AI-confirmed answers must quote the saved notes/transcript.
- Saved answers include `questionText`, `source`, `updatedBy`, `validation`, `questionsVersion`.
- Migration **029_sim_call_reliability** adds partial unique owner/creation-key and opt-out recovery
  indexes. Existing attempts need no backfill; their unavailable opt-out intent cannot be inferred.

Deploy backend + migration 029 first, then web, then mobile. Take and verify a database backup;
check migration status, readiness, auth/ownership and queue registration on staging. Install a
release-signed staging build and execute the device gate in the audit before production review.
Rollback code without dropping collections/indexes; existing CRM communications remain valid.
No production deployment, signing or live-provider call was performed by this re-audit.
