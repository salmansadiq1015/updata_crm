# Multi-provider voice engine: audit and migration plan

Audit and plan recorded 2026-10-30, before architecture edits.

## Existing architecture

The Express API owns campaigns, call-scoped bearer authentication, disclosure,
validated answers, optimistic state versions, retries, lead synchronization and
transcript deduplication. `questionEngine.js` is the authoritative question flow.
`agent-worker/src/agent.js` runs a separate LiveKit AgentSession. Browser clients
and the paired-phone HFP gateway publish/consume LiveKit audio; the worker's
OpenAI plugin connects to OpenAI Realtime. Permanent credentials stay on servers.

OpenAI coupling exists in the worker model construction, mandatory key check,
startup probe, failure classifier, voice/VAD/transcription configuration, response
usage identity, context budget environment names, API default model, cost rate
cards/provider allowlist, telephony health messages and billing UI copy. Post-call
analysis and other CRM AI services also use OpenAI but are separate from the live
voice layer and its bill. Existing compaction/response-usage helpers are present
but are not wired into the current worker entry point.

Settings currently use one `AiCallingSettings` global document and protected
`/ai-calling/settings` routes. Extend that document, preserving the kill switch.
Call cost already preserves raw SDK usage, modality/cache splits and calculated
versus provider-reported amounts. Extend it without repricing unknown history as
today's model. AI provider identity must be separate from telephony `provider`.

Android's normal SIM dialer supports SIM selection, call-state events, campaigns
and authentication, but has no bidirectional AI cellular audio path (see
`mobile/README.md` and native `CallAudioProbe.kt`). The paired-phone AI path uses
an external Classic Bluetooth HFP gateway plus LiveKit (`phone-gateway/README.md`).
Keep both paths intact. Do not introduce a telephony replacement or claim an
ordinary Android microphone can capture/inject cellular audio.

## Migration sequence

1. Verify official model/API documentation and installed LiveKit interfaces.
2. Add a shared model registry/configuration resolver; Gemini 3.8 Live primary,
   OpenAI gpt-realtime-2.1-mini secondary. Keep explicit legacy OpenAI model
   overrides. Preview selection is test-only until real benchmark evidence exists.
3. Use LiveKit's Google plugin backed by official `@google/genai` Live API, keeping
   existing audio transport, tools, transcription publication and answer gates.
   Normalize lifecycle/usage events at the adapter boundary. Verify actual setup
   acknowledgement before selecting a provider, closing failed attempts first.
4. Fall back only during establishment. Never silently migrate an active call.
   Preserve CRM answers/current step independently. Persist attempts and reasons.
5. Extend existing protected settings with provider configuration, secure server
   credentials, connection tests, pricing, duration and observed-cost limits.
6. Price actual modality usage by provider/model; separate measured usage,
   calculated list-price estimates, provider-reported amounts and invoice data.
   Add provider comparison aggregates/UI with missing evidence shown explicitly.
7. Wire bounded response output, stable instructions, safe context compaction and
   explicit cleanup from the previous optimization; never impose OpenAI caching
   semantics on Gemini. Gemini Live caching is not supported by the model docs.
8. Run worker, API, UI and telephony regressions. Provide an opt-in equivalent
   live benchmark procedure. Do not place customer calls as a test. Report live
   audio, physical SIM, invoice and before/after acceptance as unverified until
   actual evidence exists.

## Official references verified

- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-live
- https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-live-preview
- https://ai.google.dev/gemini-api/docs/live-api/capabilities
- https://ai.google.dev/api/live
- https://ai.google.dev/gemini-api/docs/pricing
- https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini
- https://docs.livekit.io/agents/models/realtime/gemini/

Gemini PCM is little-endian 16-bit, native input 16 kHz and output 24 kHz;
LiveKit's provider adapter must perform resampling. Voice names are provider
specific. Google documents no explicit caching for these Live models. Published
rates are estimates, not evidence of this account's billed costs.
