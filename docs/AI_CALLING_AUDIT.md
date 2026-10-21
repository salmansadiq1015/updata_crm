# AI calling audit — 2026-10-20

Status at initial inspection: **NOT_PRODUCTION_READY**. This audit was written before source changes. Later remediation and fresh verification are recorded below; older reports in `LEAD-VOICE-CALLING.md` are historical evidence, not executions in this audit.

## 1. Actual architecture and flow

Mode A uses Expo 57 / React Native 0.86, React Navigation, TanStack Query, Zustand, AsyncStorage and a local Kotlin Expo telephony module. Preserve the existing navigation rather than migrating the application during a reliability repair. Mobile `callCampaign` and web `simCalls` share `/api/v1/sim-calls`. Express authentication, `ai-calling:read/write`, owner-scoped campaign/task lookups and Joi guard routes. MongoDB stores campaigns, lead tasks, attempts, answers, callbacks and events. Migration 028 creates additive indexes; BullMQ runs `simCallSweep` every five minutes.

Flow: draft creation → start → claim with device/attempt lock → server eligibility check → native Telecom SIM call or dialer handoff → idle/offhook evidence → **human-confirmed** outcome → durable mobile outbox → server attempt → existing leadCommunication receipt pipeline → CRM contact log/follow-up/suppression → next-lead countdown. Answers are independently partially saved. Call evidence does not prove connection or talk duration.

Mode B already exists separately in `server/src/modules/aiCalling`, `server/agent-worker` and web/mobile `aiAgent`: LiveKit SIP room → Node agent → OpenAI Realtime with server-held provider credentials and validated tools. It is optional, paid and not a SIM audio bridge. There is no supported bidirectional SIM audio transport in Mode A.

## 2. Verified baseline

Fresh commands, before source edits:

| Command | Actual result |
| --- | --- |
| `cd server && npm test -- --runInBand` | 221 suites / 1665 tests passed (isolated MongoDB/HTTP; infrastructure/provider mocks) |
| `cd client && npm test --` | 128 files / 654 tests passed (jsdom; network errors printed by existing mocks) |
| `cd mobile && npm test -- --runInBand` | 45 suites passed, 1 failed; 360 tests passed, 11 failed of 371; failures in campaign runner |
| `adb devices -l` | Only sdk_gphone64 emulator attached; no TECNO device |

Initial sandbox runs of Jest failed at the Watchman socket. They were rerun with approved host access; those startup failures are not test passes. Subsequent mobile runs use `--watchman=false` to avoid the unrelated Watchman recrawl.

API integration tests exercise real auth, roles, Joi, MongoDB, campaign actions, lock claims, outcomes, CRM writes, callback operations, sweep and all route ownership checks. Existing mobile tests simulate native call events. These do not prove cellular audio, OEM behavior, release signing or live provider operation.

## 3. Confirmed defects / incomplete behavior

| Priority | Finding and root cause | Acceptance criterion |
| --- | --- | --- |
| P0 | Dial endpoint returns authorization repeatedly for an already dialed attempt; pre-read then unchecked update allows races with release/sweep | Concurrent/replayed dial requests authorize at most once; stale locks cannot dial; ambiguous authorization reconciles without retry dialing |
| P0 | Do-not-contact exists only as an argument to first CRM sync, not on the persisted attempt | Opt-out survives crash/retry/sweep; blocks subsequent eligibility even if CRM sync fails |
| P0 | Outbox deletes/replaces an item by id after awaiting an older request; account change is unchecked | Newer answers and completions survive old success/failure; account switch stops old queue and cannot mutate another account's work |
| P1 | CRM `complete()` returns failed receipt steps without throwing, but SIM sync unconditionally marks `ok` | Incomplete CRM receipt remains failed/retryable and UI distinguishes server save from CRM completion |
| P1 | Cancelled campaign completion can return a retry/callback task to pending/scheduled | Recording an in-flight outcome never reopens cancelled work |
| P1 | `needs_review` can be skipped or retried without reconciling an unfinished dial | Unknown dialed outcome requires reconciliation before any retry |
| P1 | Required answers are only a UI asterisk; skipped required questions accepted | Answered outcomes require each visible required question to be answered or explicitly unknown; failed/unreached calls remain recordable |
| P1 | Answers omit source/actor/question snapshot and per-attempt answer snapshot | Server records validated provenance and immutable completion source for delayed CRM sync |
| P1 | Callback conversion normalizes invalid dates/times and DST gaps silently (both clients) | Invalid/nonexistent wall times rejected; ambiguous times rejected instead of choosing silently |
| P1 | Mobile runner test baseline has 11 failures; pending investigation | Root cause reproduced and fixed; full mobile tests/typecheck/lint pass |
| P1 | Runner foreground guard ends before asynchronous permission/server authorization; navigation may leave screen mounted | No native launch after pause, background or leaving caller while authorization is in flight |
| P2 | Campaign creation lacks server idempotency; lost response may duplicate campaign | Stable client operation key and unique owner-key index with conflict detection |

## 4. Requirements gaps

Mobile question editor offers basic types but not web's custom choices/conditional editing. Post-call voice note transcription exists; campaign transcripts are editable, not automatically extracted into arbitrary CRM fields. No background SIM extraction job, confidence/review model or field conflict review exists. Do not describe stored transcript text as structured extraction. Server answers are structured but arbitrary questionnaire fields intentionally do not overwrite unrelated lead fields.

Campaign lifecycle is `draft → running ⇄ paused → completed`, with cancellation; draft validation/start provides the readiness check. There is no persisted READY state. No need to rename established API states to claim completeness. No independent failed-campaign state. Callback reminders are in-app, not push. No release-to-production device automation exists. Existing E2E files primarily target unrelated workflows; the requested full mobile/server/web/device chain is not currently automated.

## 5. Android / device constraints

`CALL_PHONE` permits supported native calling; denied permission falls back to user-operated dialer. `READ_PHONE_STATE` exposes idle/ringing/offhook, not answered/busy. No default dialer role or InCallService; no READ_CALL_LOG. Native application-context call monitor persists bounded events and resumes after process death, but is not a call foreground service; OEM process killing can lose intermediate events. Device return requires reconciliation and manual confirmation. Only foreground, focused UI may auto-dial after a cancellable countdown. Server cannot revoke a number already returned to a device; cancellation is enforced before authorization, and client checks again before native launch.

The earlier TECNO KJ5 Android 13 measurements report silenced microphone sources (RMS 0) during a SIM call and protected call sources failing initialization. They were not reproduced in this audit because the phone is absent. Read-aloud is local TTS; far-end audibility is unverified and not required for human-assisted calling. Accessibility is not an audio bypass and has no legitimate required purpose here; do not add a service or protected audio permissions.

## 6. AI and speech capabilities

Mode A: opt-in post-call `expo-audio` recording → authenticated backend multipart upload → server STT gateway (`whisper-1`) → caller-reviewed transcript. No live listening, barge-in, response generation or AI audio injection. Local audio cache lifecycle/retention and transcription-provider retention need operator verification.

Mode B: existing LiveKit worker uses installed SDK's RealtimeModel, interruption settings, SIP-answer gate, silence/max-duration guards, completion-once control and server tools. Provider SDK owns encoding/resampling/buffers; no new raw audio queue should be invented in the mobile SIM runner. Live latency, interruption time, reconnection, carrier interoperability, provider usage budgets and load have not been measured here. Server credentials remain server-side; a future direct WebRTC client must use short-lived credentials with authenticated authorization and usage limits. No isolated demo is needed.

## 7. Backend / CRM and security

Campaign/task isolation is by creator. CRM leads are explicitly company-wide in this **single-tenant deployment** (`lead.service.js`). There is no organization/tenant key: do not call this multi-tenant safe or change shared-lead ownership semantics in this repair. A multi-tenant SaaS release needs an architectural tenant boundary across auth, leads, communication, queues and storage.

Authentication uses in-memory access tokens and Keystore-backed refresh tokens. Backups are disabled in app config. Outbox contains personal data in app-private AsyncStorage, without a retention cap or application-layer encryption. Audit events avoid transcript/number payloads, but arbitrary exception messages and existing HTTP error logs require continued scrutiny. Global API rate limiting exists; Mode A has no separate per-user spending quota (SIM carrier plan applies). No new secrets/configuration should be added unless implementation requires them.

Consent, jurisdiction, retention/deletion, business authorization, calling schedules and opt-out handling require explicit operational review. Technical tests are not legal compliance. Jurisdictions have not been specified, so legal approval cannot be inferred. STIR/SHAKEN remains a carrier concern for applicable provider calls.

## 8. Performance / reliability / deployment

Task claims use atomic findOneAndUpdate and unique campaign+lead index. Summaries aggregate Mongo queries after each action; inspect load under large concurrent campaigns. Attempts/drafts/history can grow over long-lived usage; no campaign archival policy. Sync retries are bounded; failed work remains visible for manual recovery. Existing deployment applies migrations and checks readiness after restart, but this audit has no staging target or deployment authorization. Do not deploy dirty mixed user work or modify production records.

## 9. Remediation execution

Implement the confirmed correctness defects with regression tests first. Preserve existing working screens and contracts. Extend additive schemas/index migrations only when needed. Re-run full suites, client/mobile typechecks, lint, worker tests, Android debug/release compilation and dependency checks. Record actual limitations; never convert missing device, legal or provider evidence into a readiness claim.

Fresh implementation, commands, results and remaining release gates will be appended here after verification.

## 10. Implemented remediation

- Dial authorization uses an atomic task/device/lease/undialed-attempt predicate. Duplicate or ambiguous authorization becomes reconciliation work; it never supplies another dialing instruction. Release, skip and sweep also check the state they are changing.
- An unresolved authorized attempt cannot be skipped or retried. Mobile reconciles a remembered attempt even when the campaign was paused/cancelled. A pending completion blocks claiming another task after restart.
- The runner has immediate single-flight guards, checks foreground/focus/pause again after asynchronous authorization and monitoring, and avoids launching after navigation/unmount. Previously missing permissions/automatic countdown work already present in the initial dirty tree is preserved.
- Outbox synchronization compares the exact captured item and account generation before applying responses. Old successes cannot discard new answers; old errors cannot resurrect superseded work; account changes stop the captured queue. Activation waits for pending durable writes before restoring data.
- Durable-storage failures now display an explicit warning and Retry, hold automatic/manual dialing, and keep unsent work in memory. Read failures hold restoration instead of overwriting unreadable stored work. The runner awaits local attempt persistence before native launch.
- Completion clears delayed partial saves. Typed text clearing records unknown, and rapid form updates merge current local answers. No UI claims a CRM save solely from an empty outbox: the label is **Saved to the campaign**, with CRM synchronization separately visible in task/detail history.
- Opt-out intent and the contacted destination hash are durable on the attempt. Eligibility checks unsynchronized opt-outs; sync retries reconstruct the same intent and suppression. Opt-out closes scheduled callback work. Cancellation is rechecked after outcome sync so an in-flight completion cannot reopen queued work.
- Every completed attempt snapshots its questionnaire answers, reviewed qualification and callback request. CRM note content is frozen before side effects. Incomplete CRM receipts remain failed/retryable. Shared qualification merging uses bounded optimistic retries, preserving unrelated concurrent fields.
- Visible required answers are enforced for answered calls; explicit unknown is allowed. Unreached/refused outcomes do not demand invented answers. Exact options, integer/date/time validation and cycle detection are enforced. The web-exposed `contains` condition now works in both question engines (it previously always evaluated false).
- Answers record question text/version, manual source, user, timestamp and validation. Campaign creation accepts stable owner-scoped `creationKey`, rejects conflicting content, recovers incomplete initialization, and does not restore removed leads when an old create is replayed after a draft edit.
- The mobile question editor reuses the shared component with an expandable settings panel for types, custom choices, order and one equality condition. Web remains the editor for complex all/any clauses. Mobile/web callback conversion rejects invalid dates, gaps and ambiguous DST repeats.
- Campaign wrap-up now integrates the existing note-extraction proposer and review modal. It compares current CRM values, displays exact evidence, and requires caller approval. Accepted qualification is saved with the final attempt and retried through the existing communication receipt/sweep. `lead:write` is additionally required for this merge; extraction evidence must occur in saved notes/transcript. Suggestions use the first 5,000 characters, never run silently during a SIM call, and do not mutate contact name/email/phone from unconstrained prose.
- CI now includes mobile typecheck, lint, build-configuration tests and serial Jest. The requested audit is explicitly unignored so it can be versioned; unrelated ignored documentation remains ignored.

## 11. Changed modules

This audit's changes are in server `simCall` models/service/routes/validation/constants, shared CRM `leadQualification.service`, shared question engine, new migration `029_sim_call_reliability`, and regression tests. Mobile changes extend `callCampaign` runner, outbox, forms, domain rules and tests; shared question editor/types/validation; shared proposal review; and four locale catalogs. Web changes cover creation-key handling, recoverable form errors, callback conversion and tests. CI, `.gitignore`, this audit, `LEAD-VOICE-CALLING.md` and mobile README are updated.

Initial user changes also existed in app configuration, theme, navigation, lead screens, release scripts and calling UI. They remain in the working tree and must not be attributed wholly to this audit. No commit, production deployment or database migration against live data was performed.

## 12. Release and verification constraints

The first local Gradle debug/release/native-test command succeeded against the pre-existing generated project (13m38s, 1502 tasks). Inspection showed its application ID/version differed from checked-in Expo configuration. Native sources were regenerated with Expo for **staging / play** before the subsequent verification build. Generated files are not hand-edited. Local Gradle release compilation uses the generated debug signing config: **a successful assembleRelease is not a production signature**. Use the existing EAS credential workflow for a release-signed artifact, then run `npm run verify:apk -- <signed.apk>`.

SDK inspection: min SDK 24, compile/target SDK 36. The subsequent local artifact targets arm64-v8a (target phone architecture) and x86_64 (emulator); this does not verify every supported Android/OEM version. No new call-audio/accessibility/Call Log permissions were added. The play distribution excludes private SMS components.

Dependency audits: server production dependencies report zero advisories; mobile reports 30 high and 17 moderate, with five underlying advisory packages (`braces`, `node-forge`, `postcss-selector-parser`, `sprintf-js`, `uuid`). Several have no published patch, and suggested top-level downgrade paths are not compatible SDK remediation. Do not run `npm audit fix --force` or treat toolchain reachability as automatically harmless. Client/worker registry queries encountered DNS failures even after approved unsandboxed retries; historical clean reports are not substituted for current audits.

No TECNO was attached (`adb devices -l` listed only the emulator). No outbound call, live STT/LLM/SIP session, provider-latency measurement, production health probe or staging deployment was run. A second-phone test requires an explicitly authorized number and listener. No provider charges were incurred by these tests. Mode A still uses the operator's SIM plan; optional STT/extraction uses the existing configured provider only after user action. Mode B requires LiveKit infrastructure/SIP/carrier and OpenAI usage charges; exact cost depends on operator accounts and traffic and has not been measured.

## 13. Staging and rollback procedure

1. Preserve/review the mixed working tree. Back up MongoDB and verify restore access. Deploy the additive server revision first, then run `cd server && npm run migrate` and `npm run migrate:status`; check 028 and 029 on staging. The test suite checks index creation twice and data preservation on rollback against isolated MongoDB, not a production database.
2. Start/restart API and the normal job worker. Confirm authenticated campaign operations and queue registration for `sim-call-sweep`; confirm Redis connectivity, readiness endpoint and database/index health. Configure stable existing `AI_CALLING_PHONE_HASH_SECRET` and HTTPS. New code introduces no required environment variables.
3. Deploy web, then install a release-signed staging mobile build. Review permission manifests and shared-APK verification. Do not distribute the local debug-signed release artifact as a production APK.
4. Run the device matrix below and retain actual observations. Confirm every saved attempt, callback, quote and qualification change through both web and mobile. Check needs-review and failed-sync recovery without calling real leads.
5. Roll back API/web/mobile code if needed, preserving collections, unique indexes, attempts, communications and suppression records. Migration 029 `down` intentionally retains additive evidence/indexes. A code rollback does not undo CRM effects already confirmed by a caller. Do not drop collections or automatically requeue unknown calls.

## 14. Required real-device acceptance matrix (not executed in this audit)

Use three operator-created test leads with explicitly authorized numbers and a second-phone listener. Record device model, OS/build, SIM, APK signature/version and server revision. Do not use production leads for fault injection.

| Test | Required observation |
| --- | --- |
| Fresh install/login/permissions | Denial provides dialer/manual fallback; granting reloads SIM choices; no call before user starts workflow |
| Create custom campaign | Types/options/order/condition saved and visible on server/web; lost-response retry creates one campaign |
| First auto-call | Cancellable countdown, selected SIM, foreground/focused app, one native launch per authorization |
| Phone answered / no answer / rejected | Confirm outcome manually; offhook is never presented as answered or talk duration |
| Local read-aloud | User hears question; record far-end audibility separately; no full-duplex claim |
| Partial answers/retry | Corrections and explicit unknown survive navigation/retry without losing other answers |
| Wrap-up/extraction | Record opt-in voice note after call, review transcript/suggestions/current CRM values, save once, verify qualification and receipt |
| Offline save/reconnect | Pending result stays visible, no progression; reconnect/reauth sends the same attempt once |
| Force-stop / reboot | Reconcile authorized attempt; no redial; paused/cancelled campaign still allows recording existing outcome |
| Screen lock / HiOS kill / battery saver | No foreground bypass; absent call-state evidence uses manual confirmation; no fabricated connection status |
| Countdown pause / Stop / navigation | Immediate hold and no delayed launch, including during a slow authorization response |
| Remote pause/cancel | New authorization rejected; in-flight result preserved; no reopened callback/queued work |
| Callback timezone/DST | Explicit instant, gap/repeat rejected, due ordering correct, reschedule/cancel visible in CRM |
| Opt-out + backend fault | Durable opt-out blocks every later eligibility check despite failed CRM sync; retry restores ledger |
| Account switch during sync | No old queue operation sent with new account state; other user's data never displayed |

## 15. Remaining production gates

**NOT_PRODUCTION_READY** until the applicable gates are closed. Critical missing evidence includes a release-signed installed build, current TECNO lifecycle/authorized-call testing, deployment readiness/rollback exercise, dependency remediation or documented risk acceptance, and jurisdiction/consent/retention approval.

Additional limitations: single-tenant shared CRM architecture (not a multi-tenant SaaS boundary); no end-to-end live mobile/browser/cellular automation; no measured LiveKit/SIP/Realtime latency, interruption, reconnection or load; no direct protected SIM audio path; no arbitrary identity-field extraction; no unattended extraction queue; no policy-driven transcript/cache/outbox retention/deletion UI or application-layer encryption of local drafts; no push callback reminders; no per-user SIM-call quota/frequency cap across campaigns; no benchmark of large concurrent campaigns. Audit-event writes are best-effort and need a durable compliance trail if required. These limitations are not fixed by passing mocked tests.

## 16. Official references checked

- [Android audio sharing](https://developer.android.com/media/platform/sharing-audio-input): protected telephony capture versus ordinary microphone behavior.
- [Google Play AccessibilityService policy](https://support.google.com/googleplay/android-developer/answer/10964491): accessibility is not remote call recording authorization.
- [Android foreground-service restrictions](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start) and [activity launch restrictions](https://developer.android.com/guide/components/activities/secure-bal).
- [Android call-state callback](https://developer.android.com/reference/android/telephony/TelephonyCallback.CallStateListener).
- [Expo 57 audio](https://docs.expo.dev/versions/v57.0.0/sdk/audio/) and [speech](https://docs.expo.dev/versions/v57.0.0/sdk/speech/).
- [OpenAI Realtime conversations](https://developers.openai.com/api/docs/guides/realtime-conversations) and [short-lived client credentials](https://developers.openai.com/api/reference/resources/realtime/subresources/client_secrets/methods/create). Existing worker holds the API key server-side; the SIM client gets no Realtime credential because it has no audio path.
- Dependency advisories: [braces](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), [node-forge](https://github.com/advisories/GHSA-86w9-cpqp-85rv), [selector parser](https://github.com/advisories/GHSA-rj75-hqrm-r3gf), [sprintf-js](https://github.com/advisories/GHSA-hp3w-g68c-fv3c), [uuid](https://github.com/advisories/GHSA-w5hq-g745-h8pq).


## 17. Fresh verification evidence

All commands below executed on this workstation on 2026-10-20. Server tests use isolated MongoDB and real HTTP/auth/Joi/CRM paths with queue/provider infrastructure mocked. Mobile native calls and AI suggestion responses are mocked. Web unit/UI tests run in jsdom. None is a real carrier/AI conversation.

| Check | Command | Actual result |
| --- | --- | --- |
| Server full, final run | `cd server && npm test -- --runInBand --watchman=false` | **221 suites / 1683 tests passed** (653.63 s) |
| SIM API final validation | `cd server && npm test -- --runInBand --watchman=false tests/unit/simCall.api.test.js` | **48/48 passed** (27.49 s), including final exact single-choice validation |
| Shared question engine | `cd server && npm test -- --runInBand --watchman=false tests/unit/aiCalling.questionEngine.test.js` | **8/8 passed**, including web contains condition |
| CRM + SIM integration | `cd server && npm test -- --runInBand --watchman=false tests/unit/simCall.api.test.js tests/unit/leadCommunication.api.test.js` | **72/72 passed** in the intermediate combined run |
| Mobile full, final source | `cd mobile && npm test -- --runInBand --watchman=false` | **48 suites / 388 tests passed** (91.026 s, including rejected-outcome recovery) |
| Mobile static checks | `cd mobile && npm run typecheck`; `npm run lint` | Passed; zero errors/warnings |
| Build configuration | `cd mobile && npm run test:build-config` | **2/2 passed** |
| Voice worker | `cd server/agent-worker && npm test` | **14/14 passed**, fake room/events; no provider call |
| Web baseline | `cd client && npm test --` | **128 files / 654 tests passed** before edits |
| Web changed module | `cd client && npm test -- --maxWorkers=1 src/modules/simCalls` | **2 files / 10 tests passed**, including lost-response create retry |
| Web full under concurrent native build | `cd client && npm test -- --maxWorkers=2` | **653 passed / 2 timed out**, both pre-existing lead-list UI tests (10 s / 15 s deadlines) |
| Web affected failure file alone | `cd client && npm test -- --maxWorkers=1 src/modules/leads/__tests__/lead-list-view.test.tsx` | **28/28 passed** (27.40 s); no test timeout or assertion was weakened |
| Web typecheck/lint | `cd client && npm run typecheck`; `npm run lint`; `./node_modules/.bin/eslint src/modules/simCalls --max-warnings 0` | Typecheck passed; full lint has 0 errors / 127 existing warnings; changed SIM module has 0 warnings |
| Migration | Covered by SIM API integration test | 029 up twice, down retains evidence/indexes; unique owner/key protects concurrent creation; no live migration run |
| Native build before regeneration | `cd mobile/android && ./gradlew :app:assembleDebug :app:assembleRelease :updata-telephony:testDebugUnitTest --offline` | Passed (13m38s); generated native metadata was stale, so this is not the final artifact |
| Native build after regeneration | See exact command below | Passed (17m02s, 1454 tasks). Native JVM telephony tests included; no device calls |
| Server production dependency audit | `cd server && npm audit --omit=dev --json` | **0 vulnerabilities** |
| Mobile production dependency audit | `cd mobile && npm audit --omit=dev --json` | **47 advisories: 30 high / 17 moderate**; retained as unresolved release gate |
| Client / worker dependency audits | `npm audit --omit=dev --json` in each directory | Registry DNS failure, also after approved unsandboxed retry; not reported as clean |
| Whitespace/diff check | `git diff --check` | Passed |

Intermediate runs also found genuine fixture/type issues (a null qualification seed and incomplete typed mocks), which were corrected, plus web/mobile wall-clock timeouts while native compilation and multiple full suites competed for resources. The final mobile pass and targeted CRM/web passes above do not erase the recorded failed intermediate runs. The serial full web run and incremental final-source artifact build are recorded below.

Exact native generation/build commands:

```bash
cd mobile
EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_API_URL=https://updata.behjja.com/api/v1 EXPO_PUBLIC_DISTRIBUTION=play ./node_modules/.bin/expo prebuild --platform android --no-install
cd android
EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_API_URL=https://updata.behjja.com/api/v1 EXPO_PUBLIC_DISTRIBUTION=play ./gradlew :app:assembleDebug :app:assembleRelease :updata-telephony:testDebugUnitTest --offline -PreactNativeArchitectures=arm64-v8a,x86_64
```

This sets a bundle URL; it does not deploy to or verify that host. Debug signing remains a release gate. Temporary execution logs were kept under `/tmp/updata-*`; they are local evidence and are not committed (test logs can include synthetic contact data and stack traces).


Final-source Android incremental build (including rejected-outcome correction): **PASS**, 1m23s, 1454 tasks (63 executed), using the same staging/play/arm64+x86_64 command above. Native test XML reports **12 tests, 0 failures, 0 errors** (8 telephony helper tests and 4 SMS helper tests). Generated metadata is `ai.updata.crm.staging`, version `0.1.2` / code `3`.

Local artifact: `mobile/android/app/build/outputs/apk/release/app-release.apk`, 60,455,552 bytes,
SHA-256 `b85f88acc81d8958b91816eb015fbc61f4bfb07f13cdde42908f4bf3262128d7`.
This is a **debug-signed staging test artifact**, not a production release. Running
`cd mobile && npm run verify:apk -- android/app/build/outputs/apk/release/app-release.apk`
correctly **FAILS** at “Sign the shared APK with the release key.” Earlier permission/component
and non-debuggable checks in that script passed; alignment follows signing in the script and
is not claimed as passed by this failed run. The release bundle contains the configured HTTPS
API URL and no `localhost:9097`; no project/service OpenAI key signatures were found. A broad
`sk-` scan matched a concatenated Lucide `asterisk-...` icon string, verified as a false positive.
This limited scan is not a credential-inventory guarantee.

Final static verification: mobile typecheck, lint and formatting passed; changed server modules
pass ESLint with `--max-warnings 0`. Full server lint reported 0 errors and 66 existing warnings after removing two unused imports
in the touched SIM service;
no full-app warning cleanup is claimed. Full web lint reported 0 errors / 127 existing warnings.

A final approved `adb devices -l` recheck still listed only the emulator. Live-device verification
remains **NOT EXECUTED**. No live numbers were authorized for this audit, so no calls were made.


Serial full web verification: `cd client && npm test -- --maxWorkers=1` → **128 files / 655 tests
passed**, 275.20 s. This resolves the observed resource-contention timeouts without changing
unrelated tests. `cd client && npm run build` also **passed** (Next.js 16.4 production build).
Next skips integrated type validation in this repository; the separately executed
`npm run typecheck` passed. Web SIM-module ESLint with `--max-warnings 0` passed.

Rejected-outcome recovery: a failed completion can now be reopened with **Correct rejected
outcome**. The runner fetches and validates the current server attempt before removing the
failed local write, preserves the draft, and returns to wrap-up without dialing. It refuses
editing if the server attempt has changed or completed. A regression test verifies one native
call across rejection, correction and successful resubmission.


Final status: **NOT_PRODUCTION_READY**. Final-source mobile verification is 48 suites / 388 tests passed (91.026 s), with typecheck, lint and formatting passing. Server full: 1683 passed; web full: 655 passed; worker: 14 passed; native helpers: 12 passed. All requested readiness claims remain constrained by the explicit device, signing, dependency, privacy, tenant and deployment gates above.

## 18. Verification run 2026-10-21 (current working tree)

Re-executed against the combined tree (the 2026-10-20 auto-call fixes in `useCampaignRunner`
plus the remediation above). Mocked and real results are kept separate.

**Automated (mocks / in-memory MongoDB)**

| Command | Result |
| --- | --- |
| `cd mobile && npx jest --runInBand --ci` | 48 suites, **388/388** |
| `cd mobile && npx tsc --noEmit` · `npx eslint . --max-warnings 0` · `node --test scripts/build-config.test.cjs` | 0 errors · clean · pass |
| `cd client && npx tsc --noEmit -p .` · `npx vitest run` | 0 errors · 128 files, **655/655** |
| `cd server && NODE_OPTIONS=--experimental-vm-modules npx jest` | 221 suites, **1683/1683** |

**Live integration (real HTTP, isolated MongoDB replica set + Redis, current server code; no call placed)**
16/16 checks: same `creationKey` + same content returns the same campaign, other content 409
`SIM_CALL_CREATION_CONFLICT`; claim before start 409 `NOT_RUNNING`; dial from another device 409
`TASK_LOCKED`; second dial of one attempt 409 `ALREADY_DIALED`; `answered` without a required
answer 400; completion replay returns `replayed: true`; one CRM communication
`simcall-<attemptId>` (no duplicate after replay); answers carry `source`, `questionText`,
`updatedBy`; unauthenticated 401.

**Migration 029 (isolated database with existing campaigns/tasks):** applied in 189 ms; second
run "No pending migrations"; `sim_call_creation_key` (unique, partial) and
`sim_call_opt_out_recovery` present; existing data untouched.

**Backward compatibility with the deployed server:** the live API validates with
`stripUnknown: true`, so `creationKey` / `qualification` from the new app are ignored (no error)
until the server is deployed; question conditions use `equals`, which the deployed schema accepts.
Deploying the new server is still required for creation idempotency and qualification saves.

**Dependencies:** `npm audit --omit=dev` in `mobile/` reports 47 advisories rooted in `braces`/
`micromatch`, `node-forge`, `postcss-selector-parser`, `sprintf-js`, `uuid`. The Android
release bundle's source map (`npx expo export --platform android --source-maps`) contains 83 npm
packages and **none** of these; the only `@expo/cli` file shipped is `metro-require/require.js`
(Metro's module loader). Risk: build-machine tooling only. Accepted, re-check on each SDK upgrade.

**Release signing:** a dedicated release key exists outside the repo (`~/.updata-signing/`,
SHA-256 `1ecf1bde…72fe`). Shared APKs 0.1.0, 0.1.1 and 0.1.2 are signed with it and pass
`npm run verify:apk`; 0.1.0 is installed on the TECNO. The key must be backed up; losing it
blocks updates.

**Real device (TECNO KJ5, Android 13, 2026-10-20, isolated server, own SIMs only)** — see
`LEAD-VOICE-CALLING.md` 0.14: fresh-install permission flow, SIM choice, visible countdown then
call with no tap (`telecom_direct`), return to outcome with call-state evidence, next lead
auto-called after saving, Stop cancels with no dial, background holds auto-call, conditional
question both branches, answers kept across retry. Claim lapse after 20 min idle was found on the
device (answers 409) and fixed (re-claim + carry answers; tests added).
Not yet done on the device: read-aloud audibility at the far end and any third-party number,
force-stop during a call with the current build, keyguard lock, battery saver.
