# Updata CRM multi-provider realtime voice engineering report

Date: 30 October 2026, Asia/Karachi. This combines the earlier cost optimization
work and the provider extension in the shared worktree. No production deployment,
outbound customer call, SIM hardware test or production configuration write was
performed for this extension.

**Status: implementation and local validation are available; full production
acceptance is NOT complete.** Gemini credentials are absent from the worker
environment, so live Gemini audio, model access, multilingual quality and actual
Gemini-versus-OpenAI costs cannot be certified. OpenAI's requested fallback model
and the provider manager's missing-Gemini fallback received real audio in isolated
live smoke tests. Those tests do not establish full qualification quality.

## 1. Architecture audit and migration plan

The pre-edit audit and sequence are in
[docs/multi-provider-voice-engine.md](docs/multi-provider-voice-engine.md). The
previous optimization audit is [AI_CALLING_COST_AUDIT.md](AI_CALLING_COST_AUDIT.md).

Existing components and preserved responsibilities:

| Component | Responsibility |
| --- | --- |
| Express AI calling services | Campaigns, per-call bearer authentication, validated tools, optimistic state versions, consent, disclosure, branching, callback/opt-out, lead synchronization |
| Deterministic question engine | Current question, exact collected values, confirmation/retry state, qualification and completion |
| LiveKit worker | Provider sessions, native audio, room input/output, interruptions, transcripts, quality telemetry and call cleanup |
| Browser/mobile interfaces | Existing LiveKit room connection or normal Android SIM dialing; no permanent AI key |
| Paired-phone gateway | External Bluetooth HFP audio bridge from the user's SIM phone to LiveKit |
| Call analytics | Raw usage, modality/cache details, model-specific estimated prices, reported costs and outcome metrics |

Direct OpenAI coupling was found in worker construction, mandatory key gating,
startup probes, failure messages, voice/VAD/ASR settings, response identity,
environment defaults, cost-provider allowlists, dashboard text and a separate
SMS-link voice price calculator. Those live-voice concerns now use the provider
configuration/adapters or shared pricing. OpenAI text composition, post-call
analysis and other CRM AI services remain separate, with separate billing scope.

The migration retains the existing `AiCallingSettings` document and protected
settings routes. `CallRecord.provider` remains the telephony transport.
`CallRecord.aiVoice` records AI provider/model, room/session identity, fallback,
attempts and failure codes. Answers and transcripts are never moved into the
provider manager or deleted by a provider transition.

## 2. Gemini integration

The pinned LiveKit Google plugin uses official `@google/genai` Live API sessions.
The adapter configures native AUDIO output, input/output transcription, Gemini
voice `Puck`, automatic VAD, interruption policy, blocking CRM tools, bounded
output and supported server context compression. The installed adapter resamples
input PCM to 16 kHz and emits mono PCM16 output at 24 kHz.

Gemini must acknowledge setup before its session can be selected. The same
verified SDK session is returned to AgentSession; selection does not discard a
probe and open an unverified replacement socket. API payloads remain provider
specific, while LiveKit events normalize audio generations, transcriptions,
function calls, errors and usage.

Gemini Live does not support the explicit caching behavior of OpenAI Realtime.
No OpenAI cache parameter or application history-deletion algorithm is sent to
Gemini. Unsupported cached Gemini usage is marked unpriced rather than charged
at an invented discount.

SDK compatibility is explicit: Google plugin 1.9.2 does not expose a public
readiness event, so the adapter checks its assigned active session after official
SDK setup completion. SDK 2.32.0 does not expose cancellation of a socket waiting
for setup acknowledgement. A confined async ownership shim retains and closes
those SDK transport handles, confirms closure, and prevents late callbacks after
termination. OpenAI plugin 1.9.2 also needs a queue wake after close to release an
idle socket. Local protocol tests cover these compatibility boundaries. Upgrade
all pinned dependencies together and rerun those tests; these are maintenance
constraints, not undocumented guarantees about future SDK versions.

## 3. OpenAI fallback and policies

The existing LiveKit OpenAI adapter, voice configuration, contextual ASR, server
or semantic VAD, CRM tool gates and session history remain functional. The new
default fallback is `gpt-realtime-2.1-mini`. Administrators can choose another
Realtime model ID; a syntactically valid name is not proof of account access.

Selection policy:

1. Initialize Gemini with the configured production/test model.
2. Wait for provider session establishment within a bounded timeout and call
   duration budget. Admit no caller audio before selection.
3. On failed establishment, close the primary, persist a bounded reason and, if
   enabled, attempt OpenAI. If socket closure cannot be confirmed, stop instead
   of starting another provider.
4. Persist successful selection before attaching room audio. A CRM persistence
   failure stops the call rather than being misclassified as provider failure.
5. Keep the selected provider for the call. SDK reconnects can retry within that
   provider. Fatal active-session errors retain collected CRM answers and report
   failure; there is no automatic cross-provider migration mid-call.

Attempt reporting is idempotent by room/session, provider and status. A resumed
SMS-link conversation can establish a fresh room using its saved answers, while
an active room cannot change provider through the attempt API. Preview models
are test-only and cannot be saved as production models. Promotion requires a
reviewed benchmark and registry change.

## 4. Model registry and pricing

Verified against official documentation on 30 October 2026:

| Purpose | Model ID | Production selection |
| --- | --- | --- |
| Primary | `gemini-3.8-live` | Default; live account access still unverified locally |
| Experimental | `gemini-3.1-flash-live-preview` | Test calls only; no Gemini benchmark yet |
| Secondary | `gpt-realtime-2.1-mini` | Default; live output smoke passed |
| Legacy compatibility | `gpt-realtime`, `gpt-realtime-mini` | Selectable explicitly |

Published USD rates per million tokens, excluding separate services:

| Model | Audio input | Audio output | Text input | Text output | Cached audio/text input |
| --- | ---: | ---: | ---: | ---: | --- |
| Gemini 3.8 Live | 3.00 | 12.00 | 0.75 | 4.50 | Unsupported |
| Gemini 3.1 Flash Live Preview | 3.00 | 12.00 | 0.75 | 4.50 | Unsupported |
| GPT Realtime 2.1 Mini | 10.00 | 20.00 | 0.60 | 2.40 | 0.30 / 0.06 |

These are list-price estimates, not measured Gemini billing or proof that the
preview is cheaper or more reliable. Existing `AI_CALLING_MODEL_PRICING` overrides
remain available. Missing identity, missing pricing, inconsistent token totals
and ambiguous cache splits stay unpriced. Separately billed transcription and
post-call analysis are not silently added to native realtime token totals.
CRM function-call tokens are included in model usage; no additional paid Google
grounding/tool service is enabled by this integration.

Sources: [Google Live capabilities](https://ai.google.dev/gemini-api/docs/live-api/capabilities),
[Google Live WebSocket reference](https://ai.google.dev/api/live),
[Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing),
[OpenAI model/pricing](https://developers.openai.com/api/docs/models/gpt-realtime-2.1-mini),
[LiveKit Gemini plugin](https://docs.livekit.io/agents/models/realtime/gemini/).

## 5. Settings, credentials and environment

Calling Agents → Connections contains the administrator-only AI Provider
Configuration panel. It supports production/fallback/test model choices,
provider voice, fallback enablement, duration/cost limits, encrypted credential
replacement/removal, model access tests, health observations and list pricing.
Permanent keys are never returned to the web or Android application. Worker
context contains sealed credentials, authenticated by the existing call token,
with `Cache-Control: no-store`.

| Variable | Default / purpose |
| --- | --- |
| `PRIMARY_PROVIDER` | `gemini` |
| `PRIMARY_MODEL` | `gemini-3.8-live` |
| `SECONDARY_PROVIDER` | `openai` |
| `SECONDARY_MODEL` | `gpt-realtime-2.1-mini` |
| `GEMINI_FALLBACK_ENABLED` | `true` |
| `GEMINI_API_KEY` | Backend worker key; `GOOGLE_API_KEY` is also supported |
| `GEMINI_LIVE_VOICE` | `Puck` |
| `GEMINI_EXPERIMENTAL_MODEL` | Empty; optional test-only preview |
| `AI_CALLING_CREDENTIAL_SECRET` | Optional 32 random bytes encoded as 64 hex characters, identical on API/worker, required for credentials saved in admin settings |
| `AI_CALLING_MAX_SESSION_SECONDS` | `300`, combined with the campaign's shorter limit |
| `AI_CALLING_MAX_CALL_COST_USD` | `0` disables the observed-cost guard |
| `AI_CALLING_CONNECTION_TIMEOUT_MS` | `15000` |

Database settings override environment defaults for new calls. Existing OpenAI
ASR, voice, output/context limits and price overrides remain supported. To retain
a legacy OpenAI model selection, copy `OPENAI_REALTIME_MODEL` to `SECONDARY_MODEL`
or choose it in the admin panel; it no longer silently replaces the requested new
fallback default. No real environment file was edited by this extension.

Saved keys use randomized AES-256-GCM encryption bound to the provider. A missing
or mismatched encryption secret produces a configuration failure, not plaintext
storage. Environment-only worker credentials do not require this shared secret.

The admin access test checks the API server's credentials/model endpoint. Its
result is explicitly labelled; it does not certify a Live WebSocket or microphone
path, and worker environment keys can differ. Actual worker attempts update
health separately. The existing browser Live test remains the room/audio check.

The per-call guard uses observed usage and shared model rates after responses.
It can overshoot within one response and does not replace provider account
limits. Unknown pricing stops a budget-limited session. Session limits include
provider setup time. Active calls keep their selected configuration.

## 6. Cost optimization and analytics

The earlier optimization remains integrated: concise stable instructions,
one initial CRM checkpoint, next steps in tool results, duplicate answer/message
protection, bounded response output, OpenAI compaction at safe completed-turn
boundaries, exact saved-answer checkpoints, per-response metrics, cumulative
snapshot accounting and explicit shutdown before final usage reporting.

The provider dashboard adds observed audio/text/cache usage, actual model IDs,
calculated modality costs, separately reported amounts, minute/connected-minute/
qualified-lead ratios, measured reply latency, validation completion, fallback,
errors, provider distribution and daily/monthly UTC buckets. It does not invent
qualification accuracy or causal savings. Test calls are excluded from production
cohorts; unknown historical providers remain unknown. CSV and call diagnostics
include provider selection and attempt reasons.

The separate SMS-link calculator now uses shared provider/model pricing. Its
legacy price override applies only to `gpt-realtime`. Unpriced usage has an
explicit budget reservation and null calculated API cost. A bounded per-room
ledger preserves raw aggregate usage, pricing evidence and billing provenance;
the legacy link budget counter is not presented as reconciled provider billing.
Voice usage also reaches the CRM call-cost record. Link room detail retains the
last 20 rooms; conversations exceeding that retention are explicitly marked
incomplete rather than describing the retained subset as the whole cost. Mixed
provider conversations are excluded from single-provider comparison columns.

## 7. Actual measurements and comparison limits

Existing measured optimization evidence is preserved in
[AI_CALLING_OPTIMIZATION_REPORT.md](AI_CALLING_OPTIMIZATION_REPORT.md),
[AI_CALLING_BENCHMARK_SHORT.json](AI_CALLING_BENCHMARK_SHORT.json),
[AI_CALLING_BENCHMARK_EIGHT.json](AI_CALLING_BENCHMARK_EIGHT.json) and
[AI_CALLING_PRODUCTION_BASELINE.json](AI_CALLING_PRODUCTION_BASELINE.json).
The unified worktree also contains the replacement-mini fixture in
[AI_CALLING_BENCHMARK_CURRENT_MINI.json](AI_CALLING_BENCHMARK_CURRENT_MINI.json).

| Existing English synthetic experiment | Before estimate | After estimate | Observed reduction |
| --- | ---: | ---: | ---: |
| gpt-realtime, two questions | $0.060754 | $0.047993 | 21.0% |
| gpt-realtime, eight questions | $0.201678 | $0.121190 | 39.9% |
| gpt-realtime-mini, eight questions | $0.039607 | $0.024275 | 38.7% |
| gpt-realtime-2.1-mini, eight questions | $0.054998 | $0.027949 | 49.2% |

Those are actual provider tokens priced at recorded rates, not invoices. They
test the OpenAI prompt optimization, not the Gemini migration. Eight answers
passed validation in both full-model variants; exact fixture
matches were 6/8 before and 7/8 after. Both legacy mini variants matched 6/8. These
small fixtures do not establish human qualification accuracy or production
savings. The new `gpt-realtime-2.1-mini` fixture completed eight fields with exact
matches improving from 5/8 to 6/8. Both variants misheard the synthetic surname;
the baseline also captured an incorrect birth year, corrected in the optimized
run. Successful validation is not proof of correct extraction. The new mini
model still requires reviewed critical-field and multilingual acceptance.
The production baseline's 168-second call estimated $0.361578; comparing
it directly with the short smoke below would be invalid.

New isolated live evidence:

| Test | Result | Setup time | Provider TTFT | Output audio | Calculated API cost |
| --- | --- | ---: | ---: | ---: | ---: |
| Requested OpenAI fallback model | Audio received | 1,629 ms | 769 ms | 0.85 s | $0.000427 |
| Manager: missing Gemini → OpenAI | Audio received | 1,419 ms overall | 376 ms | 0.60 s | $0.000341 |
| Gemini 3.8 Live | Missing credential | Not measured | Not measured | Not measured | Not measured |

The smoke uses a text request for one short audio response, with no room, SIM
leg, customer call or CRM write. It is not a multilingual or qualification test.
Raw redacted evidence is in `AI_CALLING_OPENAI_PROVIDER_SMOKE.json`,
`AI_CALLING_FALLBACK_PROVIDER_SMOKE.json` and
`AI_CALLING_GEMINI_PROVIDER_SMOKE.json`. Invoice verification is false. No actual
Gemini-versus-OpenAI savings can be reported.

## 8. Audio, fallback and SIM validation

Validation performed in this worktree:

| Check | Result |
| --- | --- |
| Broad calling/SIM/paired-phone/link-voice API regression | 32 suites, 503 tests passed |
| Final affected API/analytics/link-price regression after corrections | 6 suites, 71 tests passed |
| Voice worker, SDK protocol and optimization regressions | 100 tests passed; final manager-only rerun also passed 11 |
| Calling web UI | 24 files, 165 tests passed |
| Phone/HFP gateway | 104 tests passed |
| Android calling/campaign/queue/reconciliation/guide regression | 15 suites, 122 tests passed on the full rerun |
| Client and mobile TypeScript checks | Passed |
| Targeted API/client lint and full mobile lint | Passed |
| Next.js production build | Passed, 123 pages generated |
| Whitespace/diff check | Passed |

One Android screen test failed on the initial run, then passed in isolation and
in the full rerun without mobile source changes. These local tests establish
software behavior, not physical SIM audio or live Gemini production quality.

Local protocol tests use the installed SDKs against localhost WebSocket servers,
not fabricated provider performance results. They verify Gemini setup ACK,
production payload, tool schema/response IDs, blocking function calls, native
audio input resampling, 24 kHz output, mixed Urdu/English transcription event
content, interruption events, usage details and closure. They verify OpenAI
configuration/PCM, and that a real SDK socket stuck awaiting Gemini setup is
closed before the fallback socket establishes. Manager tests cover missing keys,
invalid authentication/model, rate limits, timeouts, disabled fallback, both
providers unavailable and failure to persist/close. HTTP tests verify call-scoped
authentication, attempt deduplication and unchanged CRM answers/state.

SIM compatibility is preserved by design and regression evidence. The Android
app still owns SIM selection, normal outgoing calls, call-state/completion,
authentication, campaign outbox and CRM synchronization. No Android telephony or
HFP gateway implementation was changed and no replacement telephony service was
introduced. Ordinary Android SIM audio remains human-assisted; the app does not
acquire cellular uplink/downlink merely because Gemini was added. AI SIM audio
requires the existing supported HFP bridge and working device/gateway setup.
Physical device/audio tests remain outstanding.

| Requested scenario | Evidence / remaining gate |
| --- | --- |
| Basic outbound call | SIM/gateway/API regressions; no physical outbound call placed |
| Eight-question qualification | OpenAI 2.1 mini completed the isolated synthetic fixture; Gemini and full room/hardware qualification remain unverified |
| Short/long conversations | Existing OpenAI fixtures and compaction regressions; no equivalent Gemini runs |
| Interruptions | Protocol/worker tests; live acoustic test outstanding |
| Multiple/unclear answers | Deterministic workflow and HTTP regression tests |
| English/Urdu/multilingual | Language/answer/transcription event tests; Gemini speech quality unverified |
| Disconnect/rate limit | Controlled protocol/manager tests; no intentional real quota exhaustion |
| Gemini unavailable/OpenAI fallback | Actual missing-key fallback received OpenAI audio; controlled timeout tests also pass |
| Termination/cleanup | Worker once-only shutdown and both SDK socket tests |
| CRM answer synchronization | HTTP/workflow tests preserve saved answers and reject active provider replacement |

## 9. Changed files

Provider/configuration implementation:

- `server/shared/voiceProviderConfig.js`, `voiceCredentials.js`, `voiceCost.js`
- `server/agent-worker/src/providers/providerManager.js`, `livekitAdapters.js`, `googleSocketOwnership.js`
- `server/agent-worker/src/agent.js`, `toolApi.js`, `responseUsage.js`
- `server/agent-worker/package.json`, `package-lock.json`, `.env.example`, `README.md`
- `server/agent-worker/scripts/provider-smoke.mjs`
- `server/src/config/schema.js`, `server/.env.example`
- `server/src/modules/aiCalling/voiceProvider.service.js`, `aiCallingSettings.model.js`, `callRecord.model.js`
- `server/src/modules/aiCalling/aiCalling.routes.js`, `aiCalling.validation.js`, `aiCalling.controller.js`, `aiCalling.service.js`
- `server/src/modules/aiCalling/engine/callCost.js`, `providerComparison.js`, `callAnalytics.service.js`
- `server/src/modules/linkAssistant/engine/voice.js`, `linkVoice.service.js`, `linkSession.model.js`
- `server/src/modules/linkAssistant/linkAssistant.service.js` preserves voice usage when finalizing the CRM record
- `client/src/modules/aiCalling/services/voice-provider-api.ts`, `types/ai-calling-types.ts`
- `client/src/modules/aiCalling/ui/voice-provider-settings.tsx`, `provider-cost-comparison.tsx`, `calling-agent-platform.tsx`, `agent-call-analytics.tsx`
- Calling UI messages in `agent-test-studio.tsx`, `campaign-overview.tsx`, `web-call-console.tsx`, `campaign-wizard.tsx`
- Worker/provider, API, link-voice and client administration regression tests
- `.gitignore` allows the saved migration audit; this report and redacted smoke JSON evidence are new files

The earlier optimization's additional prompt, context, response, session cleanup,
analysis-usage, diagnostics, comparison and benchmark files are enumerated in
`AI_CALLING_OPTIMIZATION_REPORT.md`; they remain in this unified worktree.

## 10. Deployment and outstanding acceptance

Deploy API, client, worker and adjacent `server/shared` sources together. No
database migration is required for these additive Mongoose fields. Keep existing
SIM/gateway configuration. Install the locked worker dependencies, configure the
Gemini key and secondary key, and restart the worker. For admin-stored keys, set
the encryption secret on both processes before saving them. Do not rotate that
secret without re-encrypting saved keys.

Before enabling production campaigns, run identical eight-question, interruption,
unclear/multi-answer, English, Urdu, multilingual and extended-session scripts
through both real providers with the same recorded input and duration. Compare
provider-reported usage and latency, human-review collected values, test the real
HFP/SIM audio path, and reconcile matching provider billing exports. Test the
experimental Gemini model separately; no promotion is authorized by its registry
entry or advertised rate.

Production acceptance remains open for live Gemini, new-model full qualification,
physical SIM audio, equivalent provider costs, human-labelled accuracy and invoice
reconciliation. No production savings or untested capability is certified here.
