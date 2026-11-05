# Incoming Calls — AI Receptionist

Every call to a connected phone becomes a persisted, searchable CRM interaction. A configured AI
agent can answer it, hold a natural multilingual conversation and save what the caller said, with
provenance. Afterwards the CRM links or creates the lead, qualifies it, prices the call, routes the
work to a person and proposes follow-ups — never sending anything to the caller on its own.

**Versions:** firmware **0.1.4** (ESP32 HFP bridge) · gateway **0.5.0** · migration **045** ·
voice worker with inbound mode (`server/agent-worker/src/inbound.js`).

## 1. Architecture

```
caller ─GSM─▶ Android phone ─Bluetooth HFP (RING, +CLIP, +CCWA)─▶ ESP32 (fw 0.1.4) ─USB─▶ gateway 0.5.0
gateway ── POST /paired-phone/gateway/inbound/ring ──▶ CRM decides (rules) ── async LiveKit dispatch ─▶ voice worker
gateway joins room `inbound-<id>` as `sip-<id>` ▶ waits for the worker's `updata.agent_ready` ▶ ANSWER (ATA) ▶ bridges call audio
worker (receptionist mode, Gemini/OpenAI realtime) ── /api/v1/inbound-calls/agent/:id/* ──▶ CRM saves info, questions, intent, transcript
hang-up ▶ finalize (once): outcome · intents · qualification · cost · lead · follow-ups · work status/assignee · notifications
```

Reused, not rebuilt: the paired-phone bridge and its audio path, the LiveKit worker (providers,
transcripts, language switching, quality telemetry), calling agents, the knowledge base, lead
dedup, the lead timeline, follow-ups, notifications, socket realtime, the cost engine.

New: `server/src/modules/inboundCalling/` — `InboundCall` (session), `InboundSettings` (per owner),
`InboundCallEvent` (idempotency/replay log), pure engines (`stateMachine`, `ruleEngine`,
`callerMatch`, `intents`, `qualification`, `recommendations`, `receptionistPrompt`, `workStatus`,
`closingQuestions`), services (`inboundCall` orchestrator, `inboundQuery`, `inboundCost`), sweep job.
`CallRecord` is not reused for sessions (it requires a campaign + recipient).

### Call lifecycle (`engine/stateMachine.js`)

```
DETECTED → RECEIVED → IDENTIFYING → QUEUED (AI) | RINGING (person)
  → ANSWERING → ANSWERED → CONNECTING_AUDIO → AI_ACTIVE → [TRANSFERRING → HUMAN_ACTIVE] → WRAPPING_UP → COMPLETED
  → HUMAN_ACTIVE (picked up on the handset) → WRAPPING_UP → COMPLETED
  → MISSED | REJECTED | CANCELLED | FAILED | INTERRUPTED
```

Separate fields: call status, AI status, audio status, **work status** (new / in progress /
follow-up / waiting on caller / resolved / closed / spam), qualification, lead status.
"AI connected" requires the agent session **and** an open audio link.

## 2. Behaviour

- **One decision per call** (`ruleEngine.js`): blocked numbers and do-not-contact callers never get
  the AI; owner rules by priority (caller type, numbers/prefixes, phone, SIM, business hours, lead
  status); otherwise the default. The master switch beats every rule. An AI decision falls back to
  a person when the agent is inactive, the AI session cap is reached, the voice kill switch is on,
  audio is not verified, the board cannot answer (`canAnswer`), the phone is busy, or LiveKit is
  missing — the reason is stored (`aiBlockedBy`).
- **Caller identification:** E.164 in the home region; exact match only. Several matches →
  `ambiguous`, never merged; a person links one or creates a new lead.
- **Receptionist:** greets once, answers only from approved knowledge, never invents prices,
  names or commitments, switches language on request (or two consistent caller turns) and stays in
  it, saves details as they are said (explicit vs inferred, with evidence), records every caller
  question with its category and answered state, handles callback / person / do-not-contact.
- **Questions before goodbye** (per agent): up to 20, from templates (contact details, support,
  orders, restaurant, appointments, sales) or custom; types text, long text, email, phone, address,
  number, date, time, choice, yes/no. Skipped when already answered; refusals recorded; answers
  validated by type (an invalid answer is asked again once).
- **Lead:** created when the AI answers (default policy) so an interrupted call still leaves the
  caller in the CRM. Only explicit answers fill empty lead fields (email, website, address parts,
  an extra phone number); other answers go to the notes once per call. Inferred values never
  become lead facts. Status NEW→CONTACTED after a conversation; QUALIFIED only from the criteria.
- **After the call** (exactly once, atomic lease): outcome, intents (agent first, keyword fallback),
  qualification, cost (token usage × list rates, same engine as outbound; no SIM airtime),
  recommendations, follow-up tasks per policy, then the agent's **routing**: assignee (lead owner or
  the agent's configured user) and work status per result; the assignee is notified. A status set
  by a person is never overwritten.
- **Human handoff:** the owner is alerted on every CRM page; **Take over** moves the audio to the
  handset. If nobody takes over in time, the agent offers a callback — it never claims a transfer.
- **Second call during a call (call waiting):** recorded at once (`callWaiting`, never AI-answered);
  if the first call ends while it still rings, the same session is re-decided and the AI may answer;
  if the caller gives up it is a missed call with a high-priority alert and a return-call task.
- **Messages:** nothing is sent to the caller by SMS or e-mail. `automation.autoSendSms/Email` exist
  as settings but no automatic sender is implemented; follow-ups are internal tasks.
- **Recording:** not implemented. No recording is captured, stored or shown; the UI has no recording
  controls. Adding it would need a capture integration plus caller-consent / disclosure handling.

## 3. API

Owner (`/api/v1/inbound-calls`, permissions `inbound-calls:read|write|admin`, implied by
`ai-calling:*` / `crm:*`; assignees see calls assigned to them):

| Method | Path | Purpose |
|---|---|---|
| GET | `/`, `/stats`, `/analytics`, `/live`, `/devices`, `/export` | history (filters incl. `workStatus`, `assignedTo`, `leadCreated`, `ids`), dashboards, CSV |
| GET | `/costs`, `/costs/export` | cost analytics (same shape as agent call analytics) |
| GET / PATCH | `/settings` | settings (optimistic `version`) |
| POST / DELETE | `/rules`, `/rules/test`, `/rules/:ruleId` | rules + dry run |
| GET | `/question-templates` | closing-question templates |
| POST | `/agents/:agentId/test` | browser test as a caller (recorded as a test only) |
| PUT | `/devices/:id/sims` | the phone's SIMs, reported by the Android app |
| GET | `/:id` | detail: transcript, Q&A, closing questions, fields, summary, qualification, cost, work + history |
| PATCH | `/:id/work` | work status / assignee / note |
| POST | `/:id/notes`, `/:id/fields/:fieldId`, `/:id/match`, `/:id/lead`, `/:id/recommendations/:recId`, `/:id/follow-up` | review actions (follow-ups accept `leadId` / `createLead`) |
| POST | `/:id/control/:kind` | `answer`, `reject`, `takeover`, `hangup` (via the gateway heartbeat) |

Gateway (device token, `/api/v1/paired-phone/gateway/inbound`): `POST /ring` (`waiting` for call
waiting), `POST /calls/:callId/events`, `POST /calls/:callId/answer-job`.
Voice agent (per-call token, scope `inbound-call-agent`): `/api/v1/inbound-calls/agent/:callId/`
`context, answered, caller-info, caller-question, intent, request-callback, request-human,
do-not-contact, transcript, activity, language, behavior, voice-provider, end`.
Sockets (`user:<id>`): `inbound-call:update|transcript|activity|audio|handoff|settings`.

## 4. Setup

1. **Database:** run migration `045_inbound_calls` (indexes + permissions). On `boiler` it was run
   on its own on 2026-11-04 (migrations 029–044 are still pending there and were not run).
2. **Firmware 0.1.4:** back up the board first, then from `server/phone-gateway`:
   `npm run build:esp32` · `bash esp32/idf.sh -p <port> -b 460800 flash` ·
   `node bin/esp32-verify.mjs --port <port>`. A firmware change resets the device's audio
   verification — run the audio test again before the AI can answer.
3. **Gateway 0.5.0:** `node bin/updata-gateway.mjs run --profile <deviceId> --port <port>`
   (`--api` changes and saves the CRM URL in that profile). The computer must stay **awake and online**
   to receive calls: the gateway keeps it awake (`caffeinate`) while incoming AI answering is on, but
   closing a laptop lid on battery still sleeps it — keep it on power (or clamshell with a display).
4. **Voice worker:** restart after every worker change (`npm run dev` does not hot-reload).
   Its `LIVEKIT_AGENT_NAME` must match the API's and must not be shared with another environment.
5. **CRM:** Incoming Calls → Agents: create an incoming agent (Nova Reception exists as a test
   agent) → its settings: greeting, instructions, routing after the call, questions before goodbye
   → Settings: default agent, home region, answer delay, business hours, blocked numbers, lead
   policy, qualification criteria → switch **AI answers incoming calls** on.
6. **Android app:** open Incoming Calls on the paired phone once so it reports its SIM cards.

## 5. Verification (2026-11-04)

Automated (all green at the time of writing):

| Suite | Result |
|---|---|
| server `inboundCalling.*`, calling agents, paired phone, permission mirror | 98 + 2 |
| voice worker | 121 / 121 |
| gateway (incl. call waiting, lost-ACK tolerance, boot-loop detection) | 132 / 132 |
| firmware host checks · build | 99 / 99 · OK |
| web (Incoming Calls, AI Calling, translations, auth) | 266 / 266 |
| mobile (full suite) | 528 / 529 (1 known timing flake elsewhere) |

On real hardware (TECNO Spark, ESP32 bridge, local API on the production database):
- firmware 0.1.4 flashed after a verified backup; bridge self-test 8/8; ANSWER capability reported;
- one real incoming call answered by the AI end to end (ring + caller ID 1 s, answered, audio, an
  explicit switch to Urdu, handoff alert, completed, priced $0.1228 for 3:38) — it exposed five
  defects, all fixed (silence after answer, slow dispatch, $0 cost, invented name, stale AI status);
- the owner re-verified call audio on firmware 0.1.4.

**Not yet verified on real hardware** (needs calls from a second phone): the faster greeting,
closing questions, human takeover on the handset, failed takeover → callback, call waiting,
blocked / disabled / unavailable fallbacks, Arabic and French conversations, gateway crash and phone
disconnect during a call. The website and Android screens have not been reviewed visually in a
browser / on the phone.

## 6. Limits

- One live call per phone (one HFP audio link); call waiting is recorded, not answered while busy.
- HFP does not say which SIM rang; per-SIM rules apply on single-SIM phones (auto) or when reported.
- "Rang out" and "declined on the handset" both look like MISSED; CRM rejects are REJECTED.
- Accepting a waiting call by swapping on the handset is reported as not answered (no held-call state).
- No recording; no automatic SMS/e-mail.
- A sleeping or offline computer cannot answer: calls then ring normally on the phone (nothing is lost,
  but the AI does not take them). Seen on 2026-11-05: the voice worker gave up after the Mac slept and
  lost DNS; restart the worker and gateway after a long sleep or network outage.

## 7. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| AI does not answer | Open the call: `aiBlockedBy` names the reason (switched off, no/paused agent, audio not verified, `firmware_no_answer`, device busy, session cap, dispatch failed). |
| Silence after answering | The voice worker is running old code — restart it. |
| AI stopped answering after the laptop slept | The worker exits after 10 failed LiveKit reconnects (no network); restart the worker (and the gateway if it stopped). Keep the computer on power. |
| Gateway: `board_lost … ack_timeout` | One lost serial frame is now tolerated; repeated drops → check the USB cable / port. |
| Device error `BOARD_BOOT_LOOP` | The ESP32 keeps restarting: unplug 10 s; if it continues, write back the NVS partition from a good backup (gateway README, "Board keeps restarting"). |
| Device error `BOARD_RESET_<REASON>` | The ESP32 crashed / watchdog / brownout — check power and cable; the reason is logged as `board_boot`. |
| "Several matches" | The number is on more than one lead — link the right one or create a new lead from the call. |
| Live Monitor fails to load | Fixed (projection collision); refresh. |
