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
| Direct SMS sending / delivery reports | **Not built** (no `SEND_SMS`) | Play policy; composer only | — |
| Inbound SMS / STOP monitoring on phone | **Not built** | opt-outs via outcome "do not contact" or CRM messaging webhooks | — |
| Mode A — assisted calling (questions, notes, manual qualification) | Implemented, **emulator-verified incl. no-AI path** | "AI suggestions are not set up" shown, form fully usable | — |
| AI suggestions from notes | Implemented, mocked-provider tests only | real provider not exercised | OpenAI key on server |
| Mode B — live transcription/copilot on SIM audio | **Disabled / unsupported** | no supported, permitted SIM-audio route; `RECORD_AUDIO` blocked | — |
| Mode C — autonomous AI on SIM | **Disabled / unsupported** | same; the cloud route is the separate `aiCalling` module (LiveKit/SIP, different number) | — |
| Offline | Read cached screens; **no new call/SMS offline** (CRM must authorise); outcomes queue and sync later | unit/flow tests | — |
| Give leads to the AI agent (AI call / AI SMS campaigns) from the phone | Implemented on the CRM's existing campaign APIs; mocked tests; **not launched against a real backend** | see [In-app AI agent](#in-app-ai-agent) | ai-calling:write / crm:write |
| AI agent languages | 73 languages + `auto` (mirror the callee), validated server-side, named in the agent prompt | server tests | — |

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
`RECEIVE_SMS`, `READ_CALL_LOG`, `PROCESS_OUTGOING_CALLS`, `RECORD_AUDIO`, `ANSWER_PHONE_CALLS`,
`MANAGE_OWN_CALLS` and foreground-service permissions. `android.hardware.telephony` is declared
`required=false`. Distribution route (public Play vs managed) is still to be decided; the Play
Data-safety form must declare phone-state use.

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
