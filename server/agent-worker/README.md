# Updata CRM — Voice Agent worker

The voice engine now selects Gemini `gemini-3.8-live` first and OpenAI
`gpt-realtime-2.1-mini` on failed establishment. Explicit `SECONDARY_MODEL`
overrides remain configurable. Copy any desired legacy `OPENAI_REALTIME_MODEL`
selection to `SECONDARY_MODEL` or select it in the admin panel. Admin settings under
Calling Agents → Connections take precedence for new calls. Gemini preview
`gemini-3.1-flash-live-preview` is restricted to test calls. No active-call provider
switch is performed. Collected answers stay in the CRM.

Set `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) and `OPENAI_API_KEY` on the worker.
Alternatively, administrators can save AES-256-GCM encrypted credentials; API and
worker then require the same `AI_CALLING_CREDENTIAL_SECRET` (64 hex characters).
Never put that secret or a permanent provider key in a client/mobile environment.
The call-scoped context contains only sealed credentials. Keep `server/shared`
next to `server/agent-worker` when deploying the standalone worker process.

The runtime and both plugins are pinned to LiveKit 1.9.2, with `@google/genai`
2.32.0. `providers/googleSocketOwnership.js` confines an SDK transport ownership
shim to these calls so even a WebSocket awaiting setup acknowledgement is closed
before fallback. SDK upgrades require the local protocol tests, including setup
timeout, to pass; do not remove the pins without reviewing that compatibility
boundary. Official SDKs still own authentication, payloads and audio processing.

`AI_CALLING_MAX_SESSION_SECONDS` caps campaign duration; an optional
`AI_CALLING_MAX_CALL_COST_USD` stops after observed response usage reaches the
configured list-price limit. A response can overshoot it. Missing prices stop a
budget-limited call rather than treating unknown spend as free. Connection tests
in the admin panel check API-server model access; use a browser Live test to
verify worker credentials and audio.

Run isolated live transport checks, without dialing or modifying CRM records:

```bash
node scripts/provider-smoke.mjs --live --provider=gemini
node scripts/provider-smoke.mjs --live --provider=openai
node scripts/provider-smoke.mjs --live --provider=auto
# Optional identical raw 24 kHz mono PCM16 fixture for both providers:
node scripts/provider-smoke.mjs --live --provider=gemini --audio=/path/to/fixture.pcm
```

These checks consume provider usage. Output separates measured tokens/TTFT from
calculated costs and never claims invoice reconciliation. The complete audit,
acceptance matrix and measured evidence are in `MULTI_PROVIDER_VOICE_REPORT.md` at
the repository root. The older OpenAI setup notes below remain relevant to the
fallback adapter and existing SIP deployments; a SIM gateway does not require a
new telephony service.

A standalone [LiveKit Agents](https://docs.livekit.io/agents/) worker that runs an
[OpenAI Realtime](https://platform.openai.com/docs/guides/realtime) voice session
and bridges each call to the CRM's constrained **agent tool API**.

It is deliberately separate from the Express API so that long-running audio
sessions never consume ordinary web-request resources.

## How a call flows

```
CRM API (campaign tick)
  │  livekitSip.provider.createOutboundCall()
  │    1. AgentDispatchService.CreateDispatch  → dispatches THIS worker into a room
  │    2. SIP.CreateSIPParticipant             → dials the lead onto the PSTN, joins the room
  ▼
LiveKit room  ⇄  SIP trunk  ⇄  PSTN (the lead's phone)
  ▲
  │  this worker joins the room, runs OpenAI Realtime (STT+LLM+TTS, barge-in)
  │  and calls the CRM tool API with the per-call bearer token from job metadata:
  │     GET  /context          → system prompt, lead context, first action
  │     POST /disclose, /record-answer, /mark-unknown, /confirm,
  │          /request-callback, /do-not-contact, /decline, /end
  ▼
CRM API validates every answer, owns the question flow + status transitions.
```

The model can ONLY invoke those tools. It never writes to the database, never
decides qualification, and never sees other leads — the backend is the authority.

## Run it

**The browser "Live test" / Agent Test Studio and SMS-link voice calls need this worker running.**
Without it LiveKit accepts the dispatch but no agent joins (the studio then says so after 30 s).
Locally, in a second terminal next to the API: `cd server && npm run dev:agent`.

```bash
cd server/agent-worker
cp .env.example .env     # fill LIVEKIT_* and OPENAI_API_KEY
npm install
npm run download-files   # one-time: fetch Silero VAD etc.
npm start                # registers with LiveKit and waits for dispatches
```

`LIVEKIT_AGENT_NAME` here **must equal** the API's `LIVEKIT_AGENT_NAME`, and the
CRM must set `PUBLIC_API_BASE_URL` to a URL this worker can reach (it is embedded
in each call's metadata as `agentToolApi`).

Optional tuning:

| Variable | Default | |
|---|---|---|
| `OPENAI_REALTIME_TURN_DETECTION` | server VAD | `semantic` = OpenAI semantic VAD (measured 2.5–5 s per reply on browser calls) |
| `OPENAI_REALTIME_SILENCE_MS` | 1000 | Silence that ends the person's turn (server VAD); allows pauses while spelling details |
| `OPENAI_REALTIME_TRANSCRIBE_MODEL` | gpt-transcribe | Written transcript only; the voice model hears the audio directly |
| `OPENAI_REALTIME_TRANSCRIBE_LANGUAGE` | call language hint | Optional language override; leave blank for automatic detection on auto-language calls |
| `OPENAI_REALTIME_TRANSCRIBE_LANGUAGES` | call language plus English spelling | Optional comma-separated language hints for mixed-language calls; takes precedence over the singular override |
| `AGENT_IDLE_PROCESSES` | production: up to 4 · dev: 0 | Pre-started job processes (≈ 1 s faster call start) |

Recognition receives the questionnaire wording and expected field types as context,
without lead answers or personal details that could bias it into inventing an answer.
It preserves the spoken language, spelling, digits and corrections. Automatic language
mode sends no fixed language restriction. Regional language settings are normalized
to recognition codes; mixed-language hints remain optional. This follows the
[OpenAI guidance on committed-turn transcription and context](https://developers.openai.com/api/docs/guides/realtime-transcription).
Restart the voice worker after deploying these changes. Existing stored transcripts
are unchanged; correcting them requires the original audio. A live call with the
affected audio is still needed to measure recognition accuracy.

## Browser calls (SMS link page and the CRM "Live test")

No SIP and no phone number: the customer's browser joins the LiveKit room. The
worker connects OpenAI Realtime while the browser joins, waits for the customer,
then speaks. For SMS link conversations the CRM adds the persona, language and
approved FAQ to the context, and the worker forwards finished utterances to
`/transcript`. The customer leaving the room ends the call. See
`docs/SMS-LINK-ASSISTANT.md` §4a.

## Telephony prerequisites (the part that costs money)

1. A LiveKit Cloud project (or self-hosted LiveKit + LiveKit SIP service).
2. An **outbound SIP trunk via any carrier — carrier-agnostic, NOT Twilio**
   (Telnyx, Plivo, Vonage, Peoplefone, Sipcall, …) with a DID/caller-ID number.
   Either set the API's `LIVEKIT_SIP_OUTBOUND_TRUNK_ID`, or give the carrier's SIP
   credentials via `SIP_OUTBOUND_*` and the CRM auto-provisions the LiveKit trunk.
3. An OpenAI key with Realtime access (model `gpt-realtime`).

None of OpenAI Realtime usage, SIP connectivity, phone numbers or carrier minutes
are free. Configure spend limits on the campaign (`schedule.maxCampaignSpend`,
`maxCallsPerDay`) and with your providers before running a real campaign.

## Not verifiable without credentials

This worker is written to run against real LiveKit + OpenAI + SIP. It cannot be
exercised in CI or without a live project, trunk and a phone to answer. The
backend question engine, status rules and post-call processing it drives ARE
fully tested (`server/tests/unit/aiCalling.*`) and can be validated end-to-end in
the browser via the campaign **Simulate** console without any telephony.
