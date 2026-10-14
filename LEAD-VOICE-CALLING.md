# AI Voice Calling

An outbound AI voice-calling feature for leads: configure questions dynamically, call
business leads with an AI agent (OpenAI Realtime over LiveKit + SIP), collect structured
answers, and auto-update the CRM pipeline through validated business rules.

It is a self-contained module (`server/src/modules/aiCalling`, `client/src/modules/aiCalling`)
that reuses the existing auth/RBAC, BullMQ queue, audit, notification, socket and lead
infrastructure. It does not change the lead schema, auth, or tenancy.

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
LIVEKIT_TIMEOUT_MS=15000
```

### Worker process (`server/agent-worker/.env`)
Same `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_AGENT_NAME`, plus its
own `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`.

---

## 4. Setup

```bash
# 1. Indexes (migration 017)
cd server && npm run migrate

# 2. API (jobs auto-register: outbound-calling + ai-call-reconciliation)
npm run dev

# 3. Voice agent worker (needs LiveKit + OpenAI)
cd server/agent-worker
cp .env.example .env         # fill LIVEKIT_* and OPENAI_API_KEY
npm install
npm run download-files       # one-time: Silero VAD, etc.
npm start                    # registers with LiveKit, waits for dispatches
```

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
| GET | `/leads/:leadId/history` | read |
| GET | `/analytics` · `/analytics/export` | read |
| POST | `/suppressions` | write — manual do-not-call |
| GET/PUT | `/leads/:leadId/consent` | read / write — evidence-backed call consent |
| GET | `/telephony/health` | read |

**Agent tool API** (`/api/v1/ai-calling/agent/:callId/*`): authenticated by a **per-call
bearer token** (not a user session), scoped to exactly one call. The only DB mutations the AI
can trigger: `context`, `disclose`, `record-answer`, `mark-unknown`, `confirm`,
`request-callback`, `do-not-contact`, `decline`, `end`. Every answer is validated server-side.

**Webhook:** `POST /api/v1/webhooks/ai-calling/livekit` (signature-verified, idempotent).

RBAC: the dedicated `ai-calling:{read,write,admin}` permissions are *implied* by
`crm:read`/`crm:write`/`crm:admin` and `lead:read` (see `PERMISSION_IMPLICATIONS`), so existing
CRM users keep access and Admin inherits everything.

---

## 7. Reliability

- **Sequential by default**, `schedule.maxConcurrency` for parallelism; the queue worker leases
  recipients atomically so two workers never dial the same lead.
- **attempts: 1** on the queue — a campaign tick is never blindly retried; campaign state lives
  in the recipient documents, and a crash recovers on the next tick via lease expiry.
- **Idempotent post-call processing** (`resultsProcessedAt`) so duplicate webhooks / retries can't
  double-apply a status transition, follow-up, or suppression.
- **Ambiguous dispatch** (we don't know if the call was placed) is marked `needs_reconcile` and
  never auto-retried; the reconciliation sweep (every 2 min) resolves stuck calls conservatively.
- **Retries** only for transient no-answer/busy/failed within `maxAttemptsPerLead`; permanent
  rejections (bad number, not configured) are terminal.

---

## 8. Security, consent & privacy

- AI identity disclosure is spoken at the start (configurable, `{company}` interpolated).
- With `AI_CALLING_REQUIRE_CONSENT=true` (the default), an active, unexpired,
  evidence-backed call consent record for the lead's current normalized phone number is
  required both when recipients are snapshotted and immediately before dialing.
- Immediate stop handling: a do-not-contact request suppresses the number across all campaigns.
- Recording is **off by default** (`agentConfig.recordCall`) — enabling it requires a lawful
  disclosure/consent flow and storage you configure.
- Phone numbers are HMAC-hashed in the suppression ledger; call context sent to the model is the
  minimal public business snapshot (never the whole DB, never the raw phone).
- A public business listing is **not** treated as consent for automated marketing calls.

---

## 9. Testing

```bash
cd server && npm test -- --runInBand tests/unit/aiCalling
#   engines (question/rule/answer), workflow (idempotency, DNC, review, retry,
#   reconciliation, analytics, CSV), agent flow (context→disclose→branch→confirm→
#   finish→status), agent HTTP API (token auth + validation).
cd client && npx vitest run src/modules/leads   # leads integration unaffected
```

The agent brain, signature validation, consent gate, fallback policy, and duplicate-dispatch
guards are tested without telephony. What needs live credentials to verify:
a real PSTN/SIP call, the OpenAI Realtime audio runtime, and the worker process. Mocked tests
passing is **not** a claim that the live telephony path is verified.

---

## 10. Limitations / not yet done

- Real outbound PSTN, live LiveKit/OpenAI Realtime audio, barge-in behavior, and the worker
  runtime are not verifiable without a LiveKit project + SIP trunk + OpenAI key + a phone.
- Live Twilio voice fallback is not verified until its separate LiveKit trunk, registered
  caller ID, country eligibility, and an authorized test destination are available.
- Call **recording** capture/storage (egress + object storage + consent) is not wired; the
  `recordingRef` field exists for it.
- Cost figures populate only from real provider usage.
```
