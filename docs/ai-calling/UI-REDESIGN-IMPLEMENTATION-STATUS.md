# AI Calling UI redesign: implementation status

**Updated:** 26 October 2026  
**Overall:** `IMPLEMENTED IN SOFTWARE — PHYSICAL CALL ACCEPTANCE STILL GATED`

## Delivery status

| Deliverable | Status | Primary implementation |
|---|---|---|
| UI/UX and architecture audit | Complete | `docs/ai-calling/UI-REDESIGN-AUDIT.md` |
| Reusable Updata AI orb | Complete | `client/src/modules/aiCalling/ui/updata-voice-orb.tsx`, `client/src/app/globals.css` |
| Agent Test Studio | Complete | `agent-test-studio.tsx`, `web-call-console.tsx` |
| Calling dashboard | Complete | `ai-calling-workspace.tsx` |
| Campaign builder improvements | Complete | `campaign-wizard.tsx` |
| Paired-device setup/diagnostics | Integrated and preserved | `paired-phones-panel.tsx`, `paired-call-health.tsx`, paired-phone hooks/API |
| Live call monitoring | Complete in software | `campaign-detail-drawer.tsx`, existing active-call API/socket infrastructure |
| Searchable call history/details | Complete | `call-history-panel.tsx`, server `/calls` route/service, existing review drawer |
| Production-safe controls | Complete in software | Existing campaign/device mutations plus browser-session cleanup and end confirmation |
| Automated coverage | Complete for changed behavior | Orb, studio/session, history, realtime cleanup, reconciliation, service isolation |
| Real cloud PSTN acceptance | Blocked | Requires outbound SIP trunk, caller identity, provider webhook validation, and authorized test number |
| Physical paired-phone acceptance | Blocked | Requires real ESP32 + Android phone/SIM bidirectional-audio run |

## Behavior now exposed in the product

- The dashboard separates campaign operation, voice route, paired devices, analytics, and production call history.
- The Agent Test Studio uses the selected campaign's actual agent configuration, objective, questions, and read-only lead context.
- Draft and paused campaigns reopen in the same guided builder. Channel, recipient selection, and test identity stay locked; configuration saves through the existing update API and preserves enrolled recipients and attempts. A paused campaign with an in-flight call is server-blocked from editing until that call finishes.
- Voice status is based on LiveKit room, participant, subscribed track, microphone, reconnection, and transcription events. Configuration alone never produces a green “live” state.
- The orb represents idle, connecting, listening, speaking, processing, muted, reconnecting, and error states and supports reduced motion.
- Conversation output contains only LiveKit transcript events. Partial segments are identified, history is bounded, and manual scroll position is respected.
- Campaign review now explains transport and safety preflight without bypassing server checks.
- The live monitor distinguishes paired gateway audio evidence from general call state and does not invent speaker state.
- Call history is owner-scoped, paginated, searchable, filterable, excludes test attempts by default, and reuses the established answer-review/unknown-outcome resolution flow.

## Verification evidence

Final results are filled from commands run in this checkout:

| Command | Result |
|---|---|
| `cd client && npm run typecheck` | **Passed** |
| `cd client && npm test` | **135 files / 690 tests passed**; existing jsdom XHR/internal-header noise remains non-fatal |
| Focused AI Calling UI tests (studio, console, orb, campaign editing, history, review, realtime cleanup) | **6 files / 23 tests passed** |
| `cd server && npm test -- --runInBand tests/unit/aiCalling.workflow.test.js` | **1 suite / 26 tests passed**, including owner-scoped history and safe campaign editing |
| `cd server && npm test -- --runInBand` | **233 suites / 1,891 tests passed** |
| `cd server/agent-worker && npm test` | **22 tests passed** |
| `cd server/phone-gateway && npm test` | **60 tests passed** |
| `cd mobile && npm test -- --runInBand` | **56 suites / 452 tests passed** |
| `cd client && npm run lint` | **Passed with 128 existing repository-wide warnings and 0 errors**; the one new ref-access warning found on the first run was corrected |
| `cd server && npm run lint` | **Passed with 66 existing repository-wide warnings and 0 errors** |
| Focused client/server AI Calling lint | **Passed with 0 warnings and 0 errors** |
| `cd client && npm run build` | **Passed**; Next.js 16.4.3 produced all 115 static pages and dynamic routes |

## Files introduced for this redesign

- `client/src/modules/aiCalling/ui/updata-voice-orb.tsx`
- `client/src/modules/aiCalling/ui/agent-test-studio.tsx`
- `client/src/modules/aiCalling/ui/call-history-panel.tsx`
- `client/src/modules/aiCalling/__tests__/updata-voice-orb.test.tsx`
- `client/src/modules/aiCalling/__tests__/call-history-panel.test.tsx`
- `client/src/modules/aiCalling/__tests__/agent-test-studio.test.tsx`
- `client/src/modules/aiCalling/__tests__/campaign-wizard-edit.test.tsx`
- `docs/ai-calling/UI-REDESIGN-AUDIT.md`
- `docs/ai-calling/UI-REDESIGN-IMPLEMENTATION-STATUS.md`

## Existing files extended

- Client visual/state integration: `globals.css`, AI Calling workspace, campaign wizard/detail drawer, review integration, hooks, API/types, endpoints, and browser call console.
- Server history API: AI Calling route, controller, validation, service, and workflow test.
- Dependency metadata: Next.js and its matching ESLint config are aligned at 16.4.3 so `bun run dev` starts the app instead of entering the interactive upgrade-agent flow.

## Explicit non-claims

- A rendered test modal does not prove a real voice call.
- LiveKit configuration does not prove SIP/PSTN reachability.
- Bluetooth pairing does not prove HFP readiness, an active phone line, or bidirectional audio.
- Automated protocol/simulated-board tests do not replace the ESP32 hardware gate.
- Creator scoping in this single-tenant CRM is not organization-level multi-tenancy.
- Persistent recording/transcript storage is not implemented or implied.
