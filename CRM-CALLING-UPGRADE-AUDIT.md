# CRM calling and messaging upgrade: initial audit

Historical checkpoint: this inventory was written before the later implementation
included in this release. Its gap/status matrix is not the current release
inventory. Use [the production deployment guide](PRODUCTION-DEPLOYMENT.md) for
the delivered components, required migrations, configuration and verification.

This is a preliminary inventory, not a production certification. Repository inspected on 2026-10-29, branch `main`. Existing deployments and external services were not inspected. Statuses below describe the requested end-to-end acceptance criteria, not whether some related code exists.

## Architecture and observed gaps

- The application declares itself single-tenant (`README.md`); leads are shared company-wide (`server/src/modules/crm/lead.service.js`). User ownership is not tenant isolation. **Do not enable multiple independent companies** until trusted tenant context and isolation are implemented and tested across synchronous and asynchronous paths.
- Express routes use authentication and permission middleware. AI calls, SIM calls, SIM SMS and provider messaging use distinct services, models and jobs. `server/src/app.js` and `server/src/jobs/index.js` mount and schedule them. A cross-channel atomic frequency gate is not established by these separate implementations.
- The lead detail drawer has separate mobile communication, AI calling and provider-history sections; it is not the requested unified timeline. The qualification service now retains versions for new mobile/SIM SMS qualification merges; historical changes from before this update cannot be reconstructed. The follow-up service is a read-only contact-log agenda, not a complete inbox.
- SIM SMS has consent/suppression checks, device leases, inbound message deduplication and unknown-result handling. Its interpreter handles one open question; unmatched inbound messages are not retained by the SIM SMS service. ESP32 paired-phone records represent a different calling gateway, not an Android SMS device-health dashboard.
- AI calling has campaigns, transcripts, answer validation, insights, analytics and reconciliation. Their presence does not establish evidence-linked intelligence, approved knowledge, handoff, quality benchmarks or production quality.
- Changes in this work recheck SIM SMS eligibility before device dispatch and serialize competing result transitions. These checks are not atomic with consent updates or a carrier send; retries and recovery after a process crash still need a durable transactional design. They do not provide cross-channel limits.

## Requirement and test matrix

Status: Partial means related functionality exists but the full requested acceptance criteria have not been demonstrated; Not implemented means no complete implementation was established during this preliminary review. The test column identifies required verification, not a claim that it has passed.

| Requirement | Status | Evidence / tests still needed |
| --- | --- | --- |
| Unified lead timeline | Partial | Separate history sections in `lead-detail-drawer.tsx`; integration and pagination across all sources and merge preservation needed. |
| Answer history and evidence | Partial | New mobile/SIM SMS qualification merges retain before/after snapshots, evidence and communication references; a read endpoint and lead panel expose them. AI call extraction, correction workflow, question versions, transcript links and complete review metadata remain. |
| Explainable scoring | Not implemented | Configurable reproducible evidence-backed scoring and recalculation tests needed. |
| Duplicate review and safe merge | Not implemented | Full history-preserving concurrent merge and recovery tests needed. |
| Assignment, SLAs, escalation | Not implemented | Policies, timezones, retry-safe jobs, authorization and alerts need end-to-end tests. |
| Unified follow-up inbox | Partial | `leadFollowUps.service.js` is read-only; ownership, lifecycle and suppression tests needed. |
| Evidence-linked calling intelligence | Partial | `aiCalling/engine/conversationInsights.js`; validate source attribution, correction and uncertainty. |
| Approved business knowledge | Not implemented | Publishing, version pinning and rollback tests needed. |
| Human transfer and fallback | Partial | Provider-specific transfer and unavailable-agent fallback require real provider validation. |
| Multilingual quality benchmarks | Not implemented | Reviewed ground truth, accuracy, interruption, noise and latency evaluation required. |
| Calling quality dashboard | Partial | Existing analytics route and panel; required persisted telemetry and drill-down need verification. |
| Script experiments | Not implemented | Versioned rollout, attribution, guardrails and rollback tests needed. |
| Android SMS device health | Partial | Device transport and separate gateway pairing exist; Android heartbeat and diagnostics need implementation and device tests. |
| Cross-campaign contact limits | Partial | Channel-specific gates exist; atomic cross-channel dispatch enforcement and concurrency tests needed. |
| Multiple answers per SMS | Not implemented | `replyInterpreter.js` processes one question; mapping and review tests needed. |
| Central recovery inbox | Partial | Unknown SMS outcomes and provider recovery exist; consolidated inbox, unmatched replies and safe audited actions needed. |
| Callback notifications and RTL | Partial | Follow-up data and translations exist; real screen and device validation required. |
| Access governance and masking | Partial | Route permissions exist; team access, consistent API masking and audited unmasking need security tests. |
| Tenant isolation | Blocked | Single-tenant architecture; negative HTTP, job, event, storage and recovery tests required before multi-tenant use. |
| Conversion and profitability | Partial | Attribution, source costs and revenue reconciliation tests needed. |
| Premium UI and accessibility | Partial | Existing screens and component library; responsive, accessibility, RTL and connected workflow verification required. |
| Data integrity and reliability | Partial | Existing indexes, leases and recovery jobs; cross-channel atomicity, crash recovery and migration tests remain. |
| Full regression and production readiness | Blocked | Full automated, UI, device and provider acceptance scenarios in the request remain outstanding. |

## Implementation sequence

1. Establish authorization and data ownership policy; map each dispatch and event path, then add durable idempotency and recovery before new workflows.
2. Add backward-compatible evidence and event histories, safe merge semantics and cross-channel contact identity with migration and concurrency tests.
3. Build ownership, follow-up, scoring and review workflows using existing lead and task infrastructure.
4. Add versioned approved knowledge, provider-supported handoff, actual telemetry and reviewed multilingual evaluation.
5. Extend Android device reporting and SMS review/recovery, then integrate the web UI with those real states.
6. Add experiments and attributable costs only where source data supports them; run full security, UI, device and provider acceptance before release.

## Deployment and rollback for current changes

No new environment variables, indexes or migrations are introduced. Deploy the server through the existing deployment process after integration tests pass and validate compatible Android clients honor `proceed: false` (`mobile/src/features/smsAgent/domain/runner.ts`). Roll back by redeploying the previous server revision; no stored data conversion is required. Existing in-flight messages must be reviewed after any interrupted result processing. Real carrier/device behavior, full UI and RTL verification have not been performed.

## Qualification history increment

New versions are stored atomically with the current lead qualification and exposed through `GET /api/v1/crm/leads/:leadId/qualification/history` under `lead:read`. Existing leads need no migration; the first new version includes the previous current value if available, but earlier history is unavailable. Communication retries are deduplicated by communication and field. The existing audit service logs metadata on a best-effort basis, so the audit log is not transactionally guaranteed. History is embedded in the lead document and must be moved to a scalable transactional or reconciled store before it approaches MongoDB document-size limits; the API currently uses offset pagination. No correction UI, direct evidence navigation, or historical backfill is claimed.
