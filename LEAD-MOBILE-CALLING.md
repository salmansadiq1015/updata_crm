# Mobile SIM calling, SMS and qualification (Android)

The Android app (`mobile/`) lets a signed-in Updata user open the CRM's **own** leads, call a lead
from the phone's SIM or hand an SMS to the phone's SMS app, record the outcome, notes and
qualification, and see the confirmed result in the CRM (mobile app and web lead drawer).

Updata stays the source of truth. The phone keeps only a per-user outbox of work the CRM has not
confirmed yet. Nothing is claimed that the device cannot observe: Android does not tell an app
that a callee answered, and opening the SMS app is not proof that a message was sent.

Status as of 2026-10-16: implemented; tested on an emulator against an isolated local stack;
installed on a physical TECNO KJ5 (Android 13, dual SIM) — physical-device verification is in
progress and requires the backend from this change to be deployed.
**Not yet verified on a physical phone/SIM, not approved for production** — see
[Release status](#release-status).

---

## What a user can do

1. Sign in (same `/auth` flow as the web; refresh token in the Android Keystore).
2. Browse the CRM lead list — same endpoint, filters, sort and page size as the web list.
3. **Call** a lead:
   - the CRM authorises the attempt first (lead exists, number not suppressed) and returns the
     number it holds — the app never dials a number the CRM did not hand it;
   - with phone permissions, Android places the call on the SIM the user picked
     (`TelecomManager.placeCall`); without them the number opens in the phone app;
   - the app records call-state changes (idle / ringing / off-hook) with timestamps;
   - the user records the outcome, whether they spoke with the lead, notes, qualification
     answers, follow-up (with time zone), status change and do-not-contact.
4. **SMS**: CRM template (same `{{variable}}` allowlist as the CRM) → per-lead preview with
   encoding/segment count → opens the phone's SMS app with the text → the user reports
   sent / not sent / not sure.
5. **Review & save**: a before/after dialog, then a per-step receipt from the CRM
   (outcome, contact log, last contact, status, qualification, do-not-contact list).
6. The result appears in the lead's history in the app and in the web CRM lead drawer
   ("Mobile calls & SMS" + "Qualification").

## Architecture

```
mobile/src/features/communication/        (React Native, TypeScript)
  domain/        pure rules: SMS encoding, templates, call evidence, operation state machine
  store/         per-user durable outbox (AsyncStorage, write-through, recovery on launch)
  services/      contactFlows (call/SMS workflows), outboxSync (the only retry engine)
  screens/       CallSession, SmsCompose, CommunicationQueue (sync queue)
mobile/src/services/telephony/            the only bridge to native code
mobile/modules/updata-telephony/          local Expo module (Kotlin)
server/src/modules/crm/leadCommunication.*   device-communication API (Express/Mongoose)
server/src/modules/crm/leadQualification.*   qualification schema + AI proposals
client/src/modules/leads/ui/lead-mobile-communications.tsx   web display (read-only)
```

Two kinds of work are kept strictly apart:

| | Communication side effect | CRM synchronisation |
|---|---|---|
| What | dial, open SMS app | events, outcome, contact log, status, qualification |
| When | once, only after the CRM authorised the attempt | after the side effect, retried until confirmed |
| Retry | **never** — not on error, not after a crash | yes: idempotent on the server, backoff with jitter |

A "dispatching" marker is written to disk **before** the dial. If the app dies at that moment,
the next launch shows the attempt as *start uncertain* and asks the user what happened; it
never redials.

## API (all under `/api/v1/crm/leads/:leadId`)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/communications/eligibility?channel=&destinationField=` | lead:read | preview only; re-checked on create |
| POST | `/communications` | lead:write | client UUID `operationId`; 201 new / 200 replay; returns `dialNumber` from the lead; 409 `CONTACT_NOT_ELIGIBLE` stores nothing |
| POST | `/communications/:operationId/events` | lead:write | dedupe by `seq`; late events accepted; server derives `observed` |
| POST | `/communications/:operationId/complete` | lead:write | resumable steps + receipt; 409 `ALREADY_COMPLETED` (different outcome), 409 `COMPLETION_IN_PROGRESS` (retry) |
| GET | `/communications` | lead:read | history, newest first |
| GET | `/qualification` | lead:read | 12-field schema + the lead's reviewed answers |
| POST | `/qualification/propose` | lead:write | AI suggestions from the user's notes; **never writes**; `available:false` when no provider |
| POST | `/qualification/transcribe` | lead:write | multipart `audio` (≤10 MB, audio/* only) → `{available, text}` via the CRM's STT provider (OpenAI Whisper); audio held in memory and discarded, never stored; `available:false` when no provider |

Writes reuse existing CRM pieces: `ContactLog` (channel `phone`/`sms`), `lastContactedAt` /
`lastContactChannel`, the guarded lead status update (its `lead.updated` audit fires; `converted`
is protected), and the existing suppression ledgers (`CallSuppression`, messaging
`MessageSuppression`). New: `LeadCommunication` collection (migration
`025_lead_communication_indexes.js`, **not yet run on any shared database**) and an optional
`Lead.qualification` sub-document. Audit events `lead.communication_started` /
`lead.communication_completed` carry no notes, message body or phone number.

## Capability matrix

| Capability | Status | Evidence | Needs |
|---|---|---|---|
| CRM lead list parity (search, status/source/type/"mine", sort, cursor paging, page 25) | Implemented, tested | API E2E: identical ids/order/total; web vs app screenshots on emulator | lead:read |
| Call via phone app (no permissions) | Implemented | unit tests; not device-run this session | — |
| Call on a chosen SIM | Implemented, **emulator-verified** | Telecom accepted call with `subscriptionApplied:true` | CALL_PHONE, READ_PHONE_STATE |
| SIM list (slot, carrier, eSIM flag, default) | Implemented, **emulator-verified** (1 SIM) | listed "T-Mobile · SIM 1" | READ_PHONE_STATE |
| Dual-SIM / eSIM selection on real hardware | **Not verified** | needs physical dual-SIM phone | — |
| Call-state evidence (idle/ringing/off-hook) | Implemented, **emulator-verified** | idle→offhook→idle stored and synced | READ_PHONE_STATE |
| "Lead answered" / talk time | **Unsupported by design** | Android exposes no answer signal to non-dialer apps; user reports it | — |
| SMS via system composer | Implemented, **emulator-verified** | Messages opened with CRM number + exact text | — |
| Direct SMS sending / delivery reports | **Private build only**, **emulator-verified** (multipart, delivery, radio-off) | Play build: composer only (no SMS permissions) | SEND_SMS |
| AI SMS agent over this phone's SIM (send, read replies, STOP, answers → lead) | **Private build only**, **emulator-verified end to end, screen off** | see [AI SMS agent](#ai-sms-agent-from-this-phones-sim-private-build) | SEND_SMS, RECEIVE_SMS |
| Inbound SMS / STOP monitoring on phone | **Private build only**: replies from active conversation numbers only; STOP → SMS suppression + consent revoked | emulator-verified | RECEIVE_SMS |
| Mode A — assisted calling (questions, notes, manual qualification) | Implemented, **emulator-verified incl. no-AI path** | "AI suggestions are not set up" shown, form fully usable | — |
| Mode A — "ask next" guide with branching + suggested next steps (follow-up, status, follow-up SMS) | Implemented, unit + render tests; not device-run | answers go into the same draft; suggestions apply only on tap | — |
| AI suggestions from notes | Implemented, mocked-provider tests only | real provider not exercised | OpenAI key on server |
| Mode B — live transcription/copilot on SIM audio | **Disabled / unsupported** | no supported, permitted SIM-audio route; `RECORD_AUDIO` blocked | — |
| Mode C — autonomous AI on SIM | **Disabled / unsupported** | same; the cloud route is the separate `aiCalling` module (LiveKit/SIP, different number) | — |
| Offline | Read cached screens; **no new call/SMS offline** (CRM must authorise); outcomes queue and sync later | unit/flow tests | — |
| Give leads to the AI agent (AI call / AI SMS campaigns) from the phone | Implemented on the CRM's existing campaign APIs; mocked tests; **not launched against a real backend** | see [In-app AI agent](#in-app-ai-agent) | ai-calling:write / crm:write |
| AI agent languages | 73 languages + `auto` (mirror the callee), validated server-side, named in the agent prompt | server tests | — |

## AI SMS agent from this phone's SIM (private build)

The AI converses with leads **by SMS from the user's own SIM**. There is no cloud SMS provider and no
LiveKit in this path. The CRM server is the brain: it writes every message (sender identity + STOP
instruction in the first one), interprets every reply with the same deterministic engines as AI
calling (an LLM may help classify a free-text reply, but its value must pass the deterministic
validator), and stores everything on the lead. The phone is only the transport.

**Flow:** Leads → select → AI agent → "AI SMS from this phone (SIM)" → questions + company name →
*Check leads* (draft: eligible / excluded with reasons) → *Start sending* (explicit confirmation).
A foreground service ("AI SMS agent running" notification) runs a Headless JS loop, so sending and
reply handling continue with the screen off. Each cycle: report finished sends → upload replies →
refresh the watch list → lease ≤ 1 message → confirm `attempting` → `SmsManager` → report result.

**Safety rules (each covered by tests):**
- At most once: a message is journaled natively *before* `SmsManager` is called; a message id is
  never handed to the modem twice; a send whose result was lost becomes `unknown` and is parked
  for a human ("Did this SMS reach the lead?" → *It was sent* / *Send again* / *Stop*).
- Multipart: all parts OK → sent; none → failed (safe to retry); some → unknown (never auto-resend).
- Offline (airplane mode / no SIM): nothing is leased. Transient radio failures retry with backoff
  (2 → 10 → 30 → 60 min), never immediately.
- Pacing ≥ 20 s between sends, ≤ `maxMessagesPerDay` per campaign, campaign send window + the lead's
  local quiet hours, one reminder after 48 h without reply, then expiry.
- Consent/opt-out: SMS consent required (`AI_SMS_REQUIRE_CONSENT`, default true); SMS suppression and
  "do not contact" block enrolment and every send; a bare STOP/STOPP/ARRÊT/توقف… reply suppresses
  the number, revokes SMS consent, stops the lead's other SMS campaigns, and sends one confirmation.
- Privacy: the receiver keeps only replies from numbers in the user's active conversations; every
  other SMS is ignored natively and never stored or uploaded. `READ_SMS` is never requested.
- Results sync to the lead through the existing communication pipeline (contact log, last contacted,
  audited status change, `Lead.qualification` with `source: sms_agent` + the lead's words as
  evidence), visible on the web lead drawer under "Mobile calls & SMS" with the full transcript.

**Two builds** (`EXPO_PUBLIC_DISTRIBUTION`): `play` (default; no SMS permissions, `tools:node=remove`
on all SMS permissions) and `private` (company phones, direct APK install). EAS profiles:
`production` (Play, AAB) and `production-private` / `staging-private` (APK).

**Emulator evidence (2026-10-19, isolated API + local Mongo, fake numbers, no real leads):** opening
sent as 2-part SMS; app backgrounded + screen asleep; injected reply "High!" captured, interpreted
(`interest=high`), next question sent in < 1 s; an unrelated SMS from another number was ignored;
final reply → closing SMS, lead `qualified`, `budget=25000` / `interest=high` with evidence, timeline
entry + contact log; STOP → one confirmation, suppression, consent revoked, DNC on the lead;
airplane mode → zero attempts while offline, single successful send after. Found and fixed during
this run: missing `WAKE_LOCK` (service crash), immediate retry burning attempts while offline.

**Still needs the physical phone (TECNO KJ5, dual SIM):** real carrier delivery reports, SIM choice
on Jazz vs Telenor, HiOS background killing with the battery exemption, notification permission
prompt on Android 13. Use your own second number only.

## Call queue (call selected leads one by one on your SIM)

Leads → **Select** (or long-press) → choose leads → **Call one by one (n)** (or Call Agent tab →
**Call queue**). The queue screen shows "Lead 3 of 10", progress, the current lead (number masked,
eligibility checked by the CRM when the lead comes up — ineligible leads are skipped with the
CRM's reason), and Up next. **Call** opens the normal call screen; nothing is dialed until the user
presses **Start call**. After the outcome is saved the call screen offers **Next lead**. Skip, Pause
and End queue (confirmed) are available; the summary lists called / skipped / callbacks /
qualification answers and each lead's result. The queue is stored per user, deleted on sign-out,
and a restart never re-dials: an open call stays current with "Record outcome".

This is the honest form of "the agent calls one by one": the user speaks over their own SIM and the
assistant collects the information (questions to ask, AI suggestions from notes, qualification).
A fully autonomous AI voice on calls uses the cloud agent below and needs a SIP trunk.

## Leads and follow-ups in the app

- **Create / edit leads** (`LeadForm`): same rules as the CRM API (international numbers
  required; a local number such as `03054949624` gets a one-tap "Use +92 3054949624" suggestion,
  defaulting to the phone's own region; nothing is changed silently), duplicate warning, only
  changed fields are sent on edit, converted leads are read-only.
- **Follow-ups agenda**: `GET /crm/leads/follow-ups?from&to&scope=mine|all` (contact-log
  follow-ups, soft-deleted leads excluded) → Overdue / Today / Upcoming screen and a dashboard card;
  refreshed after every saved call/SMS outcome. On a server older than this release the card hides
  itself instead of showing an error.

## In-app AI agent

Leads screen → **Select** (or long-press) → choose leads → **Give to AI agent (n)**; or **Give to AI
agent** on a lead. Steps: channel (AI call / AI SMS, each with live provider readiness) → language
(AI call; searchable, native names) → set-up (agent, objective, questions prefilled from the CRM
qualification fields / SMS template and purpose) → review (server eligibility with exclusion
reasons) → **Start** behind a confirmation sheet (recipient count, exclusions, SMS segment
estimate, explicit acknowledgement). Campaigns are created as drafts first; progress is read from
the server (polling only while running); pause/resume/cancel follow the server's guards; AI calls
offer a text **test conversation** (server `simulate`, no telephony).

These are the CRM's own `aiCalling` and `messaging` campaigns — no second campaign system. AI
calls use the CRM's cloud telephony (LiveKit + SIP trunk), **not the phone's SIM**; with no SIP
trunk configured, `/ai-calling/telephony/health` reports `no_sip_trunk` and the app keeps Start
disabled. AI SMS go through the CRM's SMS providers (real messages, real cost). Languages:
`GET /ai-calling/languages` (73 BCP-47 codes + `auto`); default via `AI_CALLING_DEFAULT_LANGUAGE`.

## What is stored

Per attempt (`leadcommunications`): channel, route (`telecom_direct` / `dialer_handoff` /
`sms_composer`), mode, which lead field was used, a masked number and an HMAC hash (never the raw
number in the record), SIM metadata as reported by Android (`originNumber` only if the SIM reports
it, labelled `sim_reported`), device OS/app version/model, an append-only event list (dispatch,
call states, app backgrounded/foregrounded, composer opened/returned, disposition, submit),
derived observation (off-hook time, incoming-call interference), outcome, SMS text + encoding +
segments + user-reported send status, qualification answers with source (`user` /
`ai_proposed_user_confirmed`) and evidence quote, and the receipt.

Qualification merge rule: only `answered` / `refused` / `not_applicable` are written; `unknown`
never overwrites an existing answer.

On the phone: the outbox (operations not yet confirmed, with notes) under a per-user key, deleted
on sign-out (the Settings dialog warns when unsynced work would be lost). Auto Backup is off.

## Permissions and Google Play

`CALL_PHONE` and `READ_PHONE_STATE` are standard runtime permissions outside Play's restricted
SMS/Call-Log groups. The app requests them only on the call screen, with an explanation, and works
without them. The merged **debug** manifest was checked (release manifest: re-check at release) for the absence of `SEND_SMS`, `READ_SMS`,
`RECEIVE_SMS`, `READ_CALL_LOG`, `PROCESS_OUTGOING_CALLS`, `ANSWER_PHONE_CALLS`,
`MANAGE_OWN_CALLS` and foreground-service permissions. `android.hardware.telephony` is declared
`required=false`. Decided (2026-10-19): **both** routes.
- **Play build** (`EXPO_PUBLIC_DISTRIBUTION=play`, EAS `production`): the above still holds; SMS
  permissions are additionally marked `tools:node="remove"`, so no library can add them. Data-safety
  form: declare phone-state use and that call outcomes/notes are sent to the CRM.
- **Private build** (`private`, EAS `production-private`, direct APK on company phones, never uploaded
  to Play): adds `SEND_SMS`, `RECEIVE_SMS`, `FOREGROUND_SERVICE(_DATA_SYNC)`, `POST_NOTIFICATIONS`,
  `WAKE_LOCK`, `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`, the SMS receivers and the agent service. Still
  never `READ_SMS`, `READ_CALL_LOG`. Verified in the regenerated manifest.

**Microphone (both builds, 2026-10-19):** `RECORD_AUDIO` is declared for opt-in post-call voice
notes ("Dictate notes" on the outcome form). It is requested on first tap, recording happens only
while the user holds the session open (max 120 s), and Android does not give the app the call's
audio anyway: if a call is still active the recorder fails and the app says so. Play data-safety:
declare audio recorded on request, sent to the CRM for transcription, not stored.

## Voice features

- **Voice → text (OpenAI Whisper, server-side):** `VoiceNoteButton` records `.m4a` with
  `expo-audio`, uploads it to `/qualification/transcribe`, and appends the text to the call notes
  for the user to review (then "Suggest answers" can turn notes into qualification proposals).
  The OpenAI key stays on the server. Verified 2026-10-19 against the isolated API with a real
  spoken clip (5 s round trip, exact transcript).
- **Text → voice (free, on-device):** the call guide's speaker button reads the current question
  with `expo-speech` (Android TTS, app language, no network or cost). The SIM call's audio stays
  human: it is useful on speakerphone or to rehearse; Android does not let an app inject audio
  into a cellular call.
- **Time selection:** call/SMS windows use the native 24-hour picker (`AppTimeField`) instead of
  typed `HH:MM`.
- `expo-audio` declares `expo-asset` as a `*` peer, which npm resolved to the next SDK (58) and
  broke Gradle settings evaluation; `expo-asset` is pinned to `~57.0.20` as a direct dependency.

## Test evidence (2026-10-16)

| Suite | Command | Result |
|---|---|---|
| Mobile unit/component/flow | `cd mobile && npm run check` | typecheck, lint, format OK; **178/178** tests, 21 suites |
| Native module JVM tests + debug build | `cd mobile/android && ./gradlew :app:assembleDebug :updata-telephony:testDebugUnitTest` | build OK; **8/8** |
| Server (new + regression) | `cd server && npm test -- --runInBand tests/unit/leadCommunication.api.test.js tests/unit/aiCalling src/modules/crm/__tests__ tests/unit/lead tests/unit/crm.test.js tests/unit/messaging tests/unit/extension` | **431/431**, 36 suites (re-run by the integrator) |
| Web client | `cd client && npx tsc --noEmit -p . && npx vitest run src/modules/leads src/modules/aiCalling src/lib/i18n` | tsc OK; 155/156 — the 1 failure (`lead-bulk-contact.test.tsx`) fails identically without these changes |
| API end-to-end | isolated Docker Mongo + Redis, synthetic leads, providers disabled | **27/27** checks (parity, idempotent create/events/complete, single contact-log, opt-out blocks both channels, 401/404/400) |
| Emulator end-to-end (API 36, emulated modem) | dev build + Metro + same isolated API | sign-in → lead → permissions → SIM call → events → outcome → receipt → app history → **web drawer**; SMS composer → "not sent" → receipt |

Flow tests cover: no dial when the CRM refuses or is unreachable; "dispatching" persisted before
the dial; crash during dispatch → *start uncertain*, never redial; retry only the idempotent
completion; conflicts pause instead of retrying; a late response after another user signs in is
dropped; another user's queued work is never sent.

Found and fixed during device testing: `Intl.RelativeTimeFormat` does not exist in Hermes on
Android and crashed lead rows (`src/utils/date.ts` now falls back to an absolute date; regression
test added).

## Known limitations

- Emulator calls end immediately (no remote party), so a connected call, hold, Bluetooth and
  multi-minute timings were not observed. OEM dialers may ignore the SIM selection; below API 30
  SIM matching is best-effort.
- No foreground service: if Android kills the process during a call, monitoring stops; events up
  to then are kept and synced.
- If the CRM creates the contact-log entry but fails to record that step, a retry can create a
  second entry (no back-link field on `ContactLog`).
- The CRM has no lead tasks, saved views, field-level permissions or optimistic concurrency;
  follow-ups are `ContactLog.followUpAt`, and concurrent edits are last-write-wins as on the web.
  There is no CLI client in the repository.
- Geography facets (country/city/area) exist on the web list only.
- The UI is de/en/fr/ar (RTL); SMS bodies support any script (Urdu, Arabic…), app strings for
  Urdu are not provided.

## Release status

AI SMS agent release checklist:
1. Server: deploy (migrations through `027_sim_sms_indexes` run in `deploy.sh`); the `sim-sms-sweep`
   job registers automatically. Keep `AI_SMS_REQUIRE_CONSENT=true` unless the legal basis is settled.
2. Build: `eas build -p android --profile production-private` (APK, own upload keystore kept
   off-repo); distribute to company phones only (MDM or direct install).
3. On each agent phone: sign in, open AI agent → "AI SMS from this phone", grant SMS + notifications,
   tap "Allow running in the background" (battery exemption), choose the SIM.
4. Pilot: one campaign to your own second number; confirm delivery reports, a STOP reply and the
   lead record on the web before messaging real leads.
5. Legal: SMS consent evidence per lead, sender identification and STOP wording per country,
   carrier fair-use limits for personal SIMs (pacing/daily cap are configurable per campaign).

Ready for an **internal test build** on real phones. Before production:

1. Physical-device matrix: single SIM, dual SIM, eSIM, no SIM, min/latest Android, 2+ OEMs; real
   answered/unanswered/busy calls; process kill during a call.
2. Run migration `025` on staging, then production.
3. Decide distribution and complete the Play Data-safety declaration.
4. Confirm the consent / do-not-contact policy for each operating country (recording stays off).
5. Exercise the AI-suggestion endpoint against the real provider with synthetic notes.
6. Release signing via EAS credentials (local release builds use the debug key).

## Reproducing the isolated E2E

Docker `redis:7-alpine` (port 6390) and `mongo:7` (port 27030, single-node replica set); the API
started with those URIs, `ADMIN_EMAIL`/`ADMIN_PASSWORD` set for the seed, and every provider key
(OpenAI, LiveKit, SMS, WhatsApp, e-mail, storage, payments) blanked or pointed at a closed local
port. `server/.env.local` must not exist (it overrides the shell). The mobile dev build uses
`EXPO_PUBLIC_API_URL=http://10.0.2.2:9097/api/v1`.
