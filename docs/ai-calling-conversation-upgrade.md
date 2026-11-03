# Calling conversation policy upgrade

## Architecture audit and implementation plan

The existing calling path is CallingAgent → immutable CallCampaign snapshot → leased CampaignRecipient → CallRecord → LiveKit room → agent-worker → call-scoped tool API. Gemini is selected first; OpenAI remains the secondary establishment fallback. Both providers use the existing realtime audio, transcription, barge-in and cleanup adapters. The deterministic question engine is also used by SMS, SIM scripts and web links, so the new voice policy is an optional argument; those shared defaults remain compatible.

The audit found bounded retries hardcoded to three in voice service calls, an eight-second silence default, prompt-only language changes, no persisted behavior event history, and no saved-agent test action in the workspace header. Existing tools already validate answers, gate speech turns, persist transcripts, handle refusal/DNC/callbacks, and constrain campaign dispatch with recipient/device/tick leases. These were extended, not replaced.

Implementation sequence:

1. Extend the shared persisted agent configuration and validators, retaining legacy defaults for existing stored agents/campaigns.
2. Add per-call language/evidence state, bounded unanswered policy, classification history and aggregate behavior inside the existing CallRecord.
3. Connect LiveKit transcription-language metadata, audio-model context, VAD speech states and cancellable silence timers to those policies.
4. Expose configuration, saved-agent browser testing and historical lead analytics using existing UI and access controls.
5. Verify policy, API, ownership, queue/finalization and provider transport regressions independently of Graphify.

## Runtime contracts

- `engine/conversationPolicy.js` contains pure language and engagement policies. A call owns its initial/current/detected language, switch timestamps/modes and language configuration. Neither the saved agent nor campaign defaults change when a lead switches language.
- ASR language metadata is used when present. The realtime audio model reports contextual evidence through `report_language` otherwise. Provider confidence is left absent when the ASR API supplies none. Explicit requests take priority over automatic evidence from the same speech turn. Automatic switching requires full linguistic evidence and one/two/three distinct turns according to high/medium/low sensitivity. Unicode word segmentation supports languages without spaces. Configured supported languages and follow-preference controls are enforced server-side.
- CRM revisions serialize language instruction updates; delayed acknowledgements cannot revert a newer language. The current language also survives context compaction and worker context reload.
- The silence timer runs only after agent speech/thinking stops. Caller speech cancels both the silence timer and the separate repetition delay. A speech epoch prevents a delayed API response from starting overlapping playback after a new caller turn.
- Repetition budget counts retries after the original question. For a budget of three, the original ask receives three retries; the next unsuccessful response period exhausts that question. Silent/unclear/partial replies never become valid answers. Explicit refusals resolve without repeated pressure. Partial evidence is retained without inventing a complete value.
- Consecutive exhausted questions trigger the configurable `unresponsive` termination. The worker requests a current-language goodbye and performs bounded cleanup. The disposition is a reached call, is sent for review, finalizes its recipient and is not automatically redialed as an unanswered telephone connection.
- Behavior events have stable IDs, actual speech timestamps, ordered retrying uploads and atomic per-call deduplication. Response-time samples measure agent-question completion to lead speech onset, not emotion, personality or speech speed. Missing samples remain null. History can be disabled independently of aggregate metrics. The retained event/receipt limit is 2,000 per call; the worker queue is bounded to 1,000 pending events.
- Existing campaign tick/recipient/device leases still own progression and exactly-once dispatch. Disabling automatic next-lead progression restricts concurrency to one and pauses the campaign after finalization. Consent, DNC, scheduling, owner scope and existing reconciliation remain in the original dispatch path.
- Post-call processing freezes mutable conversation tools while its processing lease is held. Answers, language state and behavior events are finalized before the processed stamp. The original processing claim, retry handling and device release remain intact.

## API, persistence and UI

`POST /ai-calling/agents/:id/test` creates/reuses an owner-scoped, versioned browser-test campaign snapshot. An assigned, owned lead supplies read-only context. It cannot launch a telephone campaign. The browser connects through the existing WebCallConsole and LiveKit test endpoint; no production lead is updated. Save agent changes before testing.

The worker adds `/language` and `/behavior` endpoints under the existing call-token authentication. The existing `/no-response` and `/mark-unknown` tools carry evidence, retry receipts and refusal reasons. Question state, language state, behavior events, aggregate metrics and termination reason are persisted on CallRecord. Existing call-detail and lead-history access controls apply to all new data. No new lead, call or tenant model was introduced.

Agent settings expose language policy, silence/repetition/termination controls and intelligence toggles. Lead call history supports campaign filtering and individual-call selection; both call detail and review show the behavior timeline alongside existing answers/transcripts. Labels cover English, German, French and Arabic CRM locales.

Migration `040_call_behavior_history` adds the owner/lead/campaign/time history index only. Existing records are not backfilled with invented telemetry. Apply the migration and deploy the API, browser client and worker together. Previously launched campaigns retain their snapshots; launch a new campaign to use updated agent settings.

## Validation and operational limits

Automated checks cover Arabic opening instructions, sustained Arabic/English evidence, explicit French requests, Darija identity, cross-call isolation, retry exhaustion, cancellation during the repetition delay, meaningful-answer reset, classification, event deduplication, refusal evidence, measured response timing, finalization, saved-agent snapshot isolation, provider fallback/transport, ownership checks, campaign race recovery and all four UI locales.

Automated source/transport tests do not establish real-world accent, recognition or pronunciation quality. Native-speaker Arabic, English, French and Moroccan Darija acceptance still requires the deployed LiveKit worker and microphone conversations through **Test agent**, then a consented phone test on the intended SIP/SIM route. Provider language/dialect quality depends on the selected model/voice. Existing provider fallback is during session establishment; it does not splice a secondary provider into an already speaking session.

Uploads retry transient failures and cleanup performs a bounded flush. A prolonged API outage or hard worker-process loss can leave undelivered audio telemetry; this is explicitly logged, and no missing behavior is synthesized. Durable questionnaire mutations remain authoritative and the existing reconciler finalizes interrupted calls.

### Isolated live output checks

On 2026-11-03, the provider smoke script returned real native output audio and transcripts for `ar`, `en`, `fr` and `ar-MA` using OpenAI `gpt-realtime-2.1-mini`. The reports are in `ai-calling-language-smoke.json`. Arabic and Darija outputs used Arabic script; the French and English outputs used their requested languages. This is output-generation evidence, not a native-speaker quality endorsement or a test of ASR/switching.

An automatic-selection smoke failed Gemini establishment with `CREDENTIAL_UNAVAILABLE` in the standalone worker test environment, established OpenAI successfully, and returned audio. This does not inspect sealed credentials stored by a deployed CRM.

To repeat one isolated, billable output test without CRM writes or phone calls:

```sh
cd server/agent-worker
node scripts/provider-smoke.mjs --live --provider=openai --language=ar-MA --output=/tmp/darija-smoke.json
```
