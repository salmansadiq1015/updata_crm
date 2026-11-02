# Updata AI calling cost optimization: implementation and measured results

Date: 2026-10-30. Status: implemented and locally regression tested; isolated OpenAI usage benchmarks completed. Full production acceptance is still pending hardware/SIM scenarios and invoice reconciliation. No production deployment, outbound phone calls or production database writes were performed by this audit.

## Result

The controlled eight-question `gpt-realtime` experiment reduced the estimated model cost from **$0.201678 to $0.121190 (39.9%)**, with all eight fields validated in both versions. Text input fell from **49,190 to 39,892 tokens (18.9%)**; cache hits increased from **54.5% to 79.1%**. This demonstrates more than a shorter prompt: stable prefixes improved cached text/audio reuse and reduced paid input. These are actual provider-reported token records priced with configured rates, not provider invoices or a claim about every production call.

The short experiment reduced estimated cost by 21.0%. The mini model's eight-question estimate fell 38.7%, but it misheard the synthetic surname in both variants. Do not promote mini based on this small English fixture.

## Production baseline independently verified

`AI_CALLING_PRODUCTION_BASELINE.json` contains a redacted read-only retrieval of the exact supplied call, including raw aggregate usage, cached modality split and recorded rates. It excludes lead identities and transcript contents.

| Metric | Verified baseline |
| --- | ---: |
| Provider / model | paired_phone / gpt-realtime |
| Connected duration | 168 seconds |
| Estimated Realtime model cost | $0.361578 |
| Estimated cost per connected minute | $0.129135 |
| Audio input / output | 7,190 / 1,213 |
| Text input / output | 61,429 / 835 |
| Cached audio / text | 2,688 / 33,408 |
| Total input / output / total tokens | 68,619 / 2,048 / 70,667 |
| Cached fraction of all input | 52.60% |
| Audio input / output estimates | $0.145139 / $0.077632 |
| Text input / output estimates | $0.125447 / $0.013360 |
| Estimated discount already obtained from caching | $0.205210 |
| Invoice verified | No |

Its transcript has 10 caller turns (455 characters) and 11 assistant turns (893 characters). The campaign snapshot has eight question texts totaling 407 characters, an objective of 295 characters, custom style of 335 characters, disclosure of 198 characters, and zero approved knowledge entries. There is no evidence of a huge lead/knowledge payload explaining 61,429 unique text tokens.

The source and provider records identify the amplification mechanism: **each response is billed against its retained instructions, tool schemas, earlier tool results and conversation**, including tool-only responses. The old worker rewrote instructions after every tool result, invalidating valuable prefix reuse. Ordinary turns did not resend the entire CRM transcript through an application loop. In the controlled eight-question benchmark, 19 provider responses produced 49,190 baseline text-input tokens. The production aggregate lacks response IDs and component-level token attribution, so the exact allocation of its 61,429 tokens across initial instructions, lead data, tools, old assistant responses and SDK framing cannot be reconstructed. No exact historical attribution has been fabricated.

## Architecture preserved

The Express service and existing deterministic question engine still validate and save answers immediately, select questions, branch, clarify, confirm critical values, process opt-outs/callbacks, decide qualification and finalize results. Existing call-scoped tokens, tenant filters, optimistic concurrency, transcript deduplication and retention remain. Paired-phone SIM, SIP, fallback routing and monitoring were not rebuilt by this audit. CRM transcripts and answers are independent of the compacted model context.

The pre-implementation audit is `AI_CALLING_COST_AUDIT.md`. Separate provider-migration changes appeared concurrently in this shared worktree, including Gemini adapters, credentials/configuration and provider UI. Those changes were preserved and are outside the provenance of the OpenAI benchmark. The benchmark talks directly to the named OpenAI models and does not validate or promote that separate routing migration. Review the combined provider configuration before deployment; the final worktree is no longer an exclusively OpenAI worker.

## Implementation

### Prompts and question state

- Implemented the supplied 14-rule concise base prompt, preserving AI disclosure, recording honesty, language selection, approved business knowledge, transfer rules, answer validation, explicit refusal handling and backend control of completion.
- Removed overlapping worker guidance and verbose examples. Campaign instructions/question definitions/knowledge precede per-lead business name/city. Shared instructions are identical across leads. No duplicate lead metadata or whole CRM record is injected.
- Standing session instructions no longer change after every answer. A one-time developer message supplies initial structured state; each normal tool result supplies the next step. The backend continues to own current-question selection and stored answers.
- Bulk answers, critical read-backs, explicit unknowns, silence/unrelated responses and interruption recovery retain the existing APIs and answer gate.

### Context management

- The configurable budget uses actual provider input tokens, not character-to-token estimates.
- OpenAI compaction runs at a quiet, completed-turn boundary only after a threshold and minimum response interval. It retains at least 24 original recent items, complete function call/output pairs, IDs, partial spelling and audio. It creates headroom rather than trimming on every turn.
- A fresh backend checkpoint includes exact normalized/raw answers, confirmation state, disclosure/end state, progress and current action. Older caller statements and distinct earlier spoken assistant statements are preserved verbatim, including language/follow-up requests and quoted business facts. Repeated identical assistant phrases are archived once; tool-call/result chatter is distilled away. Raw transcripts remain in CRM.
- Compaction is deferred when audio lacks a usable transcript, a tool pair is incomplete, recent context is too small, the caller resumes, or preserving facts would expand text context. Limits are soft triggers, not a guarantee of a fixed final token window. Very long preserved caller facts can prevent further reduction; no answers are silently discarded.
- No unsupported Realtime cache parameters or truncation options were added. The installed LiveKit public `updateChatCtx` API performs provider conversation changes. Gemini history deletion is explicitly excluded by the concurrent adapter integration.

### Caching and usage evidence

- Static instructions and schemas remain stable; dynamic steps use append-only normal tool results. Existing prefixes are preserved until thresholded compaction.
- A response-ID-deduplicated collector stores modality tokens, cached modality counts, cancellation, TTFT and observed cache status. It marks compaction/reconnection observations without pretending to know the provider's cache-miss cause.
- Final SDK usage remains a cumulative snapshot. Response detail is never added again to it. Canceled responses retain usage; detail retention is bounded and dropped records are disclosed.
- Post-call Chat Completions extraction now preserves provider usage independently, including unparseable outputs. Existing transcript-version idempotency remains. No unsupported Realtime caching options were applied to this separate API. Its stable system-message prefix already supports automatic reuse where the chosen model permits it; a separate cache key/retention policy needs account/model-specific evaluation.

### Audio, output and cleanup

- Kept 24 kHz mono PCM, contextual ASR, spelling pauses, current noise reduction and 1,000 ms VAD silence defaults. No empty manual commits were added to production.
- Provider VAD interruption now honors the campaign's barge-in setting; invalid semantic eagerness falls back to a supported value.
- Output is capped at a configurable 1,024 tokens (allowed range 512–4,096), sufficient for spoken questions and structured finish notes in the live fixture. Input ASR remains enabled because confirmation/answer gates rely on it.
- Browser calls wait for the participant before establishing the provider session. Shutdown stops the watchdog/timer, explicitly closes provider audio, flushes transcripts and reads final cumulative usage before once-only reporting. Existing goodbye playback precedes cleanup, and existing room deletion still hangs up SIM/SIP legs.

### Analytics

Each recorded call now exposes model, modality token counts, raw cached input counts, cache-hit percentage, estimated cost/minute, response count, mean output tokens, cache savings, response IDs, per-response estimated cost/TTFT/cancellation and compaction metadata. Existing caller/agent turn counts, transcripts and qualification summaries remain.

Rate-card costs remain labeled estimates. Historic rates are used for response pricing and caching discounts. Unknown modality splits stay unpriced rather than receiving invented discounts. Raw cached counts remain visible even when a cached audio/text split cannot be priced.

The comparison UI requires matching recorded questionnaire fingerprint, lead, model, provider, historical rates, voice/language/interruption/output settings and completed answer counts. It normalizes to connected minutes and computes a monthly projection only from user-entered minutes. Old calls without provenance are not automatically claimed as compatible baselines. This is a two-call estimate comparison, not a causal statistical result.

## Controlled provider experiments

The reusable harness is `server/agent-worker/scripts/qualification-cost-benchmark.mjs`. It reads baseline prompts/tools from Git and optimized prompts/tools from the worker; schemas are taken from production definitions rather than hand-maintained benchmark copies. It uses the same deterministic validators/question engine in an isolated local state, with no CRM writes. Each run has a $3 rate-card usage guard.

Identical locally synthesized English PCM fixtures, questionnaire, voice and 1,024 output cap were used within each baseline/optimized pair. Sessions used manual commits without ASR, VAD, LiveKit transport, realtime playback pacing or SIM hardware. Context-budget compaction was not reached in these short fixtures; its preservation behavior is tested separately. These measurements isolate prompt/prefix improvements and do not establish long-call compaction savings.

| Scenario | Model | Variant | Model estimate | Input tokens | Output tokens | Cached tokens | Cache hit | Valid fields | Mean first audio ms |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 questions | gpt-realtime | baseline | $0.060754 | 14,250 | 598 | 7,616 | 53.4% | 2/2 | 896 |
| 2 questions | gpt-realtime | optimized | $0.047993 | 10,983 | 457 | 5,952 | 54.2% | 2/2 | 601 |
| 8 questions | gpt-realtime | baseline | $0.201678 | 52,146 | 1,151 | 28,416 | 54.5% | 8/8 | 731 |
| 8 questions | gpt-realtime | optimized | $0.121190 | 42,819 | 1,046 | 33,856 | 79.1% | 8/8 | 716 |
| 8 questions | gpt-realtime-mini | baseline | $0.039607 | 51,906 | 1,047 | 32,640 | 62.9% | 8/8 | 851 |
| 8 questions | gpt-realtime-mini | optimized | $0.024275 | 42,792 | 991 | 35,968 | 84.1% | 8/8 | 688 |

The eight-question runs each generated 19 responses and validated eight fields. Exact normalized matches against a deliberately strict fixture were 6/8 → 7/8 for full Realtime and 6/8 → 6/8 for mini. Education phrasing differed from the literal expected string in every run without changing meaning. The baseline full model heard “Morgan Reid”; optimized full heard “Morgan Reed”; mini heard “Morgan Ray” in both runs. Validation success alone is not extraction accuracy. These observations support retaining the full model for further testing and enforcing configured critical-name confirmations where required.

| Eight-question run | Audio in | Audio out | Text in | Text out | Audio input estimate | Audio output estimate | Text input estimate | Text output estimate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-realtime baseline | 2,956 | 514 | 49,190 | 637 | $0.060213 | $0.032896 | $0.098378 | $0.010192 |
| gpt-realtime optimized | 2,927 | 485 | 39,892 | 561 | $0.037039 | $0.031040 | $0.044140 | $0.008976 |
| gpt-realtime-mini baseline | 2,921 | 479 | 48,985 | 568 | $0.016173 | $0.009580 | $0.012491 | $0.001363 |
| gpt-realtime-mini optimized | 2,866 | 424 | 39,926 | 567 | $0.008794 | $0.008480 | $0.005638 | $0.001361 |

Totals include per-response rounding. Fixture execution lasted 17.374 → 9.958 seconds for the short pair, 28.953 → 28.545 seconds for full eight-question calls and 25.373 → 22.830 seconds for mini. Their execution-time cost rates are stored in the JSON as `estimatedCostPerHarnessMinute`; they are not connected-call minutes and must not be compared to the production $0.1291/minute baseline. Audio arrived/generation completed faster than real playback.

Raw evidence: `AI_CALLING_BENCHMARK_SHORT.json` and `AI_CALLING_BENCHMARK_EIGHT.json`, with response IDs, provider usage, captured answers, TTFT, durations and rate breakdowns. No admin key or invoice export is configured; dollar totals have not been reconciled with provider billing.


### Current replacement mini model

The same eight-question fixture was also run against the currently recommended `gpt-realtime-2.1-mini` replacement, without changing production routing. Its baseline and optimized prompts used the same voice, output cap and audio corpus.

| Model | Variant | Estimate | Input tokens | Output tokens | Cache hit | Valid fields | Exact normalized matches | Mean first audio ms |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| gpt-realtime-2.1-mini | baseline | $0.054998 | 58,213 | 2,031 | 54.0% | 8/8 | 5/8 | 927 |
| gpt-realtime-2.1-mini | optimized | $0.027949 | 48,519 | 1,486 | 86.9% | 8/8 | 6/8 | 908 |

Estimated cost fell **49.2%**, from $0.054998 to $0.027949. The baseline heard the birth year as 2023 instead of 2001; the optimized run captured 2001 correctly. Both heard “Morgan Ray” instead of “Morgan Reed.” Education phrasing also differed from the strict literal expected value. Validation marked all eight fields valid despite the name error, so neither successful tool execution nor cheap pricing establishes qualification accuracy. The replacement mini model is accessible to the configured key, but this fixture does not justify promoting it without human-reviewed critical-field, language and interruption tests.

Durations were 34.664 and 27.521 seconds of accelerated harness execution. Full raw modality counts, response IDs, captured answers, estimated components and timing are in `AI_CALLING_BENCHMARK_CURRENT_MINI.json`. Eight provider sessions in total were measured across the short, legacy-eight-question and replacement-mini experiments; combined rate-card estimate was approximately $0.5784; this is not an invoice reconciliation. No real phone calls were placed.

## Model decision

Keep the tested full `gpt-realtime` temporarily on the OpenAI path pending a larger multilingual human-reviewed suite. [OpenAI’s deprecation schedule](https://developers.openai.com/api/docs/deprecations) removes both `gpt-realtime` and `gpt-realtime-mini` on January 20, 2027; evaluate the recommended `gpt-realtime-2.1` and `gpt-realtime-2.1-mini` replacements before that date. Do not treat the legacy models as a long-term production recommendation. Mini is materially cheaper in this fixture but its name-capture error prevents an accuracy-preserving promotion claim. Newer model families need their own exact rate cards and live evaluations. Chained ASR/text/TTS or a different realtime provider needs separate latency, interruption and qualification benchmarks; changing architectures was not necessary to demonstrate the measured savings here.

## Regression and production-acceptance matrix

| Requested case | Completed evidence | Still needed for production acceptance |
| --- | --- | --- |
| Short qualification | Baseline/optimized real OpenAI usage plus backend flow tests | SIM/LiveKit human call and billing reconciliation |
| Long qualification | Threshold, headroom and exact fact-preservation regression tests | Long real call exercising compaction and provider usage before/after |
| Eight questions | Six real audio-provider runs, raw usage and answer capture | Human/telephone/language review and invoice comparison |
| Interruption | Existing barge-in/partial spelling tests; new retained-object/cancellation tests | Controlled real audio interruption through SIM/LiveKit |
| Multiple answers | Existing bulk-answer/API and validation regressions; checkpoint retention | Real multi-answer utterances across supported languages |
| Repeated answers | Existing answer gate/retry-idempotency regressions | Repeated-answer real call with per-response telemetry |
| Unclear answers | Existing validator/clarification tests; no-transcript compaction deferral | Noisy/unclear real audio evaluation |
| Failed call | Existing no-answer/failure/reconciler tests; close-failure evidence flush | Real provider/network failure with usage reconciliation |
| Reconnected session | Existing SDK restore inspection, reconnect telemetry/dedup tests | Actual reconnect while speaking through the production bridge |
| Completion/cleanup | Existing once-only finalization/CRM processing; explicit close-order test | Verify provider socket/media stop on a real SIM call |

Regression execution results are recorded below after the final run. Deterministic tests do not receive invented duration, token, cost, accuracy or latency measurements; those fields exist only in provider-run evidence where observed.

## Changed modules attributable to this audit

- `server/src/modules/aiCalling/engine/leadContext.js`: concise behavior, stable shared prompt and separate minimal lead instruction.
- `server/src/modules/aiCalling/aiCalling.service.js`: structured context checkpoint and questionnaire fingerprint; existing state/API preserved.
- `server/agent-worker/src/agent.js`: stable instructions, context budget/checkpoints, telemetry, browser wait and shutdown integration. This file also has concurrent provider changes outside this audit.
- `server/agent-worker/src/contextManagement.js`, `responseUsage.js`, `sessionCleanup.js`: fact-preserving compaction, response observations and ordered cleanup.
- `server/agent-worker/src/transcription.js`, `.env.example`: supported VAD/interruption controls and configurable budgets. The example also has concurrent provider defaults outside this audit.
- `server/src/modules/aiCalling/engine/costDiagnostics.js`, `callAnalytics.service.js`: historic-rate response costs and cache diagnostics.
- `server/src/modules/aiCalling/callIntelligence.service.js`, `callIntelligence.schemas.js`: retain separate post-call provider usage.
- `client/src/modules/aiCalling/ui/agent-call-analytics.tsx`, `types/ai-calling-types.ts`, `cost-comparison.ts`: call diagnostics and evidence-based cost comparison. The analytics UI/types also have concurrent provider extensions.
- Worker `test/costOptimization.test.js` and `test/contextTransport.test.js`, backend `aiCalling.costDiagnostics.test.js`, frontend `cost-comparison.test.ts` and `agent-call-analytics.test.tsx`: regressions.
- Benchmark script and redacted evidence/report files at the repository root.

No dependency was added for these optimizations. The Google plugin/package and provider registry/credential/routing additions belong to concurrent workspace work.

## Verification results

- Calling/SIM/paired-phone backend: 28 suites, 476 tests passed.
- Calling frontend: 23 files, 162 tests passed; the final cost-specific rerun passed 12 tests.
- Original worker and cost-optimization tests: 84 passed.
- New installed-SDK context transport test: 1 passed, verifying only head items are deleted, recent IDs are preserved, and instructions are unchanged.
- Full client TypeScript check and `git diff --check` passed.
- The combined worker run also loaded newly added concurrent provider-transport tests. Its OpenAI audio-send mock timed out and left that runner open; only that audit run was stopped. The independent provider-migration test processes were left intact. This integrated transport failure is outside the passing core/compaction scope and needs resolution before the combined worktree is deployed.

Provider experiments, tests and configuration checks are separate evidence categories. No test-only synthetic fixture is represented as a production phone call.

## Recommended configuration and remaining limitations

For the tested OpenAI path: model `gpt-realtime`; configured voice unchanged; output cap 1,024; server VAD silence 1,000 ms with 500 ms prefix; existing ASR/language hints; compaction enabled at 12,000 actual input tokens with 24 recent items and at least eight response events between compactions. Environment overrides and valid ranges are defined in `contextManagement.js`; disable compaction with `OPENAI_REALTIME_COMPACTION=false` if needed. Preserve per-model rate overrides from real contracts and do not assign a new model a guessed family price.

Do not claim the production definition of done yet: exact historical token attribution is limited by aggregate records; ASR/post-call analysis/carrier/platform costs are not all invoice-reconciled; only one synthetic English fixture per comparison was run; actual SIM interruptions/reconnects, multilingual quality and long-session compaction still need controlled acceptance calls. No monthly production savings are asserted. The delivered code and evidence are reviewable; there is no deployment or production model change from the benchmark.
