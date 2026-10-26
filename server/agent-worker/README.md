# Updata CRM — Voice Agent worker

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
| `OPENAI_REALTIME_SILENCE_MS` | 600 | Silence that ends the person's turn (server VAD) |
| `OPENAI_REALTIME_TRANSCRIBE_MODEL` | gpt-4o-mini-transcribe | Written transcript only; the model hears the audio itself |
| `AGENT_IDLE_PROCESSES` | production: up to 4 · dev: 0 | Pre-started job processes (≈ 1 s faster call start) |

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
