# AI Calling UI redesign audit

**Audit date:** 26 October 2026  
**Branch:** `feature/sms-link-assistant`  
**Scope:** web CRM AI Calling, browser voice test, campaign lifecycle, paired-phone gateway surfaces, call monitoring/history, server APIs, agent worker, and Android regressions.

## Executive verdict

The existing product already had a substantial, safety-conscious calling backend. The redesign therefore keeps the campaign/question engine, LiveKit/OpenAI worker, paired-phone provider, permissions, consent/DNC gates, outcome reconciliation, analytics, and mobile flows as the source of truth. The work in this change is an integrated UI and API extension, not a second calling implementation.

The web module now presents a cohesive dark control-room experience, an actual state-driven Updata voice orb, an isolated Agent Test Studio, more precise transport/readiness language, preflight guidance in campaign creation, improved live-call monitoring, and searchable production call history. No UI state fabricates audio, transcripts, campaigns, questions, outcomes, or device health.

Production readiness remains conditional. Browser and paired-phone paths are fully testable in software, but this audit did not place a real phone call. Cloud PSTN still requires a configured outbound SIP trunk and authorized test number. Bidirectional cellular audio through the physical ESP32/phone path is still blocked on the hardware acceptance gate documented in `docs/paired-phone/IMPLEMENTATION-STATUS.md`.

Status vocabulary:

- **VERIFIED**: supported by code inspection plus automated test evidence in this checkout.
- **PARTIAL**: implemented, but a production or policy boundary remains.
- **MISSING**: no supported implementation was found.
- **HARDWARE BLOCKED**: software exists; physical acceptance could not be performed.

## Repository and baseline

The worktree was already dirty at the start of this request, including uncommitted AI Calling, paired-phone, SMS-link, worker, Android, and documentation work. Those changes were preserved. No reset, checkout, migration, deployment, or provider call was performed.

Baseline captured before this redesign:

| Area | Command | Result |
|---|---|---|
| Web client | `cd client && npm test` | **132 suites / 676 tests passed**; known jsdom warning about the forbidden internal request header remained non-fatal |
| API server | `cd server && npm test -- --runInBand` | **233 suites / 1,891 tests passed** |
| Voice worker | `cd server/agent-worker && npm test` | **22 tests passed** |
| Phone gateway | `cd server/phone-gateway && npm test` | **60 tests passed** |
| Android app | `cd mobile && npm test -- --runInBand` | **56 suites / 452 tests passed**; existing React test-environment warnings remained non-fatal |

## Architecture found and preserved

| Layer | Implementation | Audit result |
|---|---|---|
| Web app | Next.js 16, React, TypeScript, Tailwind, TanStack Query, Radix primitives, Lucide | **VERIFIED** and reused |
| CRM API | Express, Joi, Mongoose, permission middleware, owner-scoped AI Calling services | **VERIFIED** and reused |
| Realtime updates | Existing socket invalidation plus bounded polling for active-call state | **VERIFIED** and reused |
| Browser test | Browser mic/speaker → LiveKit room → configured OpenAI Realtime worker | **VERIFIED in software**; no provider call made in this audit |
| Cloud phone | LiveKit dispatch + outbound SIP participant → phone network | **PARTIAL**; implementation exists, live PSTN depends on trunk/provider configuration |
| Paired phone | Android cellular call ↔ Bluetooth HFP ↔ ESP32/USB gateway ↔ LiveKit agent leg | **HARDWARE BLOCKED**; software and protocol tests pass, physical two-way audio is unproven |
| Campaign engine | Lead eligibility, question flow, conditional logic, answer validation, outcome rules, retries/cooldowns, schedules | **VERIFIED** and preserved |
| SMS/link paths | Existing SIM/SMS and SMS-link assistant modules | **VERIFIED regression coverage**; not replaced by this work |
| Android | AI-agent, SIM campaign, paired-phone, call detail, four locales | **VERIFIED regression coverage**; no redesign-specific mobile code was required |

The transports remain deliberately distinct:

1. **Browser test:** browser microphone/speaker through LiveKit to the configured agent. It creates an isolated test call record, uses lead context read-only, does not dial a phone number, and does not update the lead.
2. **Cloud phone:** configured SIP trunk and caller identity through LiveKit.
3. **Paired phone:** the user's phone/SIM through Bluetooth HFP and the ESP32/gateway. Bluetooth connected is not treated as proof that HFP, an active phone line, or bidirectional audio is ready.

## Feature audit

| Feature | Before redesign | Current status | Evidence / limitation |
|---|---|---|---|
| Dashboard campaign overview | Working but visually fragmented | **VERIFIED** | Existing queries and mutations retained; new loading skeletons, precise stats, quick actions, transport health, campaigns, history, devices, and analytics |
| Campaign create/edit | Comprehensive creation flow; update API had no matching web entry point | **VERIFIED** | Same schema-driven wizard now creates or edits draft/paused campaigns. Editing locks channel/selection/test identity, preserves recipients/attempts, versions questionnaire changes, and retains real preflight checks |
| Start/pause/resume/cancel/retry | Working | **VERIFIED** | Existing server mutations, duplicate-submit guards, and safe retry/reconciliation rules preserved |
| Lead eligibility and sequential dialing | Working | **VERIFIED** | Consent, suppression, quiet hours, limits, leases, device locks, and ambiguous-outcome parking remain server-authoritative |
| Question branching and validation | Working | **VERIFIED** | Existing question engine remains the only questionnaire implementation |
| Browser Agent Test Studio | Working but visually basic and status-imprecise | **VERIFIED in software** | Redesigned around real campaign/agent/question data, real LiveKit status, real transcripts, mute/end controls, permission errors, diagnostics, and isolated test behavior |
| Updata voice identity | Generic icon | **VERIFIED** | Reusable SVG orb supports eight real states, optional bounded audio level, semantic status, and reduced motion without a render loop |
| Live transcript | Available during browser session | **PARTIAL** | Real session segments only, bounded to 250 entries, partial/final state and scroll-position preservation; no durable transcript store was found |
| Persistent recordings | Not implemented | **MISSING by policy** | Requires explicit consent, retention, storage, and access-control decisions |
| Paired-device management | Implemented in the dirty baseline | **VERIFIED in software / HARDWARE BLOCKED** | Registration, pairing, heartbeat, versions, readiness, verification, limits, key rotation, clear/revoke, and diagnostics exist; physical ESP32 acceptance remains |
| Live call monitor | Basic real-time list | **VERIFIED in software** | Orb and precise phase/audio-loss messaging added; current question/progress and paired gateway state come from the existing API |
| Human takeover | Paired transport only | **PARTIAL** | Kept only where the gateway supports it; never shown as a generic cloud/browser capability |
| Call history | Detail-by-ID and campaign calls existed; no unified searchable history | **VERIFIED** | Added owner-scoped paginated `GET /ai-calling/calls`, production-test exclusion, filters/search, history table, and existing full review/reconcile drawer |
| Analytics | Working | **VERIFIED** | Real API rates/counts retained; answer rate is shown only where measurable |
| Review-required and uncertain outcomes | Working | **VERIFIED** | Uncertain calls stay `needs_reconcile`; UI never silently retries them |
| Authentication/RBAC | Existing JWT/session and AI Calling read/write/admin permissions | **VERIFIED** | New history route uses authentication and `ai-calling:read`; existing mutation permissions retained |
| Data isolation | Creator ownership, company-wide lead semantics | **PARTIAL** | All campaign/call reads and writes are creator-scoped. This repository is single-tenant and has no organization/tenant key; it must not be described as architectural multi-tenancy |
| Audit logging | Lead transitions and calling lifecycle evidence exist | **PARTIAL** | Critical call/lead changes are recorded; there is no universal UI-interaction audit trail |

## UI findings and remediation

### Findings

- The previous dashboard mixed standard CRM cards with operational voice controls and did not establish a clear calling-room hierarchy.
- The original browser test displayed a generic robot icon and broad readiness copy. It did not visually distinguish room connection, agent presence, subscribed audio, or microphone publication strongly enough.
- Conversation content was visually secondary, had limited partial-transcript treatment, and always followed the latest entry.
- Campaign selection, audio health, voice-agent identity, objective, and questions competed for space rather than forming a scan-friendly configuration rail.
- Campaign creation exposed the right data but did not summarize the server-authoritative safety gates before submission.
- Call details were reachable from campaign monitoring, but there was no unified, searchable, filterable call-history surface.
- “Connected” could be interpreted too broadly in the paired-phone path unless the UI explicitly separated Bluetooth, HFP, phone line, and audio-path evidence.

### Implemented design system

- Deep navy surfaces (`#070b16` through `#0e172b`), restrained slate borders, blue/indigo accents, violet/magenta only around the voice identity, and green only for observed healthy state.
- Local dark styling for AI Calling so the redesign does not replace the application-wide UI framework.
- Reused Lucide, Radix, Tailwind, query hooks, dialogs, status pills, and existing app patterns; no additional UI or animation dependency.
- Responsive 68/32 Agent Test Studio layout on desktop, stacked scrolling on narrower screens, bounded modal dimensions, focus-visible controls, semantic labels, and real empty/error/loading states.
- CSS/SVG orb motion honors `prefers-reduced-motion`; no Canvas/WebGL animation loop, audio analyzer, or battery-heavy dependency was introduced.

## Functional correctness and safety

- The browser console suppresses duplicate starts, ignores stale async completions, disconnects LiveKit on unmount, clears timers, and bounds transcript memory.
- “Agent connected” and “Audio ready” are separate. Audio becomes ready only after a real subscribed audio track; neither is inferred from the campaign configuration banner.
- The end action uses an inline confirmation and closes the real room. The test transcript remains visible after local termination.
- The studio obtains live question progress by exact call ID; it does not guess progress from transcript text.
- History excludes `isTest` and test providers by default and is scoped by `createdBy` before search/filter expansion.
- Review mutations refresh history. Unknown paired/provider outcomes remain parked until an owner explicitly resolves them.
- Campaign preflight is explanatory and client-side; the server remains authoritative for permissions, calling hours, consent, DNC, limits, route eligibility, and device locks. Paused campaigns with an in-flight call cannot be edited until that call finishes, preventing a questionnaire/agent change from altering a live conversation.

## Security review

| Control | Result |
|---|---|
| Authentication on new API | **VERIFIED** via the existing router authentication middleware |
| Read permission | **VERIFIED** (`ai-calling:read`) |
| Owner isolation | **VERIFIED** in the new history service test, including another owner's record |
| Input validation | **VERIFIED** with bounded Joi query fields, enums, boolean conversion, and escaped regex search |
| Test/production separation | **VERIFIED**; test calls are excluded by default and browser tests cannot mutate lead/campaign results |
| Secrets/tokens | **UNCHANGED**; no secret was added to browser state or documentation |
| DNC, consent, calling hours, attempt limits | **UNCHANGED / VERIFIED** in the existing server suite |
| CSRF/origin | **UNCHANGED**; existing same-origin/CORS controls apply |
| Durable tenant boundary | **NOT PRESENT**; ownership is per creator in a single-tenant CRM |

## Reusable components and integration points

- `UpdataVoiceOrb`: state-driven identity used in the studio, launcher, live call activity, campaign builder, and compact transcript/agent views.
- `WebCallConsole`: isolated LiveKit session controller and real transcript surface.
- `AgentTestStudio`: modal composition and campaign/configuration rail.
- `CallHistoryPanel`: paginated API-backed list with filters and keyboard-openable details.
- Existing `CallReviewDrawer`, `PairedPhonesPanel`, `VoiceKillSwitch`, analytics, status pills, campaign mutations, and paired-phone hooks remain the shared operational components.

## Remaining blockers and follow-up

1. Flash and run the documented ESP32-WROOM-32 hardware acceptance procedure. Until bidirectional audio passes, paired-phone cellular calling is **not production verified**.
2. Configure and validate an outbound SIP trunk/caller identity with an authorized number before claiming cloud PSTN readiness.
3. Run a supervised failure-injection campaign after each physical transport passes: USB loss, Bluetooth/HFP loss, worker restart, provider disconnect, and uncertain outcome reconciliation.
4. Decide recording/transcript consent, retention, encryption, and access policy before implementing durable media.
5. Add an organization key and migration plan only if true multi-tenant isolation becomes a product requirement; creator ownership is not a substitute for it.
6. Run browser/device accessibility and responsive visual acceptance on supported real browsers. Automated semantics are covered, but this audit does not claim a formal WCAG certification.

## Implementation plan disposition

The requested sequence was followed: repository/baseline audit, shared visual language, reusable orb, Agent Test Studio, actual audio/transcript state, dashboard, campaign preflight, device and live monitoring integration, call history API/UI, focused regression tests, then full lint/type/build/test verification. Final command results and the precise change inventory are maintained in `UI-REDESIGN-IMPLEMENTATION-STATUS.md`.
