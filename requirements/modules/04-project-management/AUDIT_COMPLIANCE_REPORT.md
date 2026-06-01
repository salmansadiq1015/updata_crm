# Module 04 — Project Management: Final Compliance Report

**Date:** 2026-06-01
**Scope:** PROJ-001 through PROJ-007 (Swiss HVAC ERP, Module 04)
**Method:** Per-requirement audit of server + client against every acceptance criterion, with adversarial re-verification of each reported gap.

---

## 1. Executive Summary

**Verdict: The module is NOT 100% complete.** It is approximately **49% complete** by strict acceptance-criterion count (**22 of 45 ACs fully IMPLEMENTED**). The remaining 23 ACs are PARTIAL (19) or MISSING (4).

The defining pattern is a **strong-server / weak-client split**. The backend is broadly built — CRUD, soft-delete, audit logging, event publishing, business-day validation, cascade logic, and export pipelines all exist and are guarded by authentication + permission middleware. Failures cluster in three categories:

1. **Unwired client UI** — functional server endpoints with no UI to reach them (create-from-template, document generation, predecessor dependencies, list sorting, date-range filters, restore flows, per-status dashboard cards).
2. **Broken integration seams** — background jobs enqueued onto queues with no matching worker handler (status notifications, partner confirmations silently skip), and a cross-module integration that was never built (PM schedule → MOD-05).
3. **Catalog / config gaps** — required document template types absent from the enum and seed (`appointment_confirmation`, `status_report`, `completion_certificate`, `project_schedule`), making PDF generation fail at runtime.

Weakest: **PROJ-004 (14%)** and **PROJ-005 (17%)**, both effectively backend-only. Strongest: **PROJ-001 / PROJ-003 (71%)**.

Two genuine **runtime defects** (not merely gaps):
- **PROJ-002 AC-6:** status-change notification job lands on the `auth-email` queue whose sole worker has no matching case → silently skipped. No notification is ever sent.
- **PROJ-002 AC-5:** the override permission string differs across spec / server / client (`project:status:override` vs `projects:admin` vs `project:status:override`), and the spec permission is never granted to any role → override UI never renders for normal users, including Admins.

A pervasive **permission-vocabulary mismatch** runs through every requirement: the spec uses fine-grained slugs (`project:create`, `project:schedule:manage`, `project:documents:read`, …) while the code uses coarse `projects:read/write/delete/admin`. Functionally gated, but non-compliant — and in the override case actually broken.

---

## 2. Compliance Table

| Req | Title | Implemented / Total ACs | % | Status |
|-----|-------|:----:|:----:|--------|
| PROJ-001 | Project Creation & Management | 5 / 7 | 71% | Partial |
| PROJ-002 | Project Status Tracking | 3 / 6 | 50% | Partial (2 defects) |
| PROJ-003 | Preparatory Actions Management | 5 / 7 | 71% | Partial |
| PROJ-004 | Construction Schedule Management | 1 / 7 | 14% | Critical gaps |
| PROJ-005 | Project Document Creation | 1 / 6 | 17% | Critical gaps |
| PROJ-006 | Document Repository per Project | 3 / 8 | 38% | Partial |
| PROJ-007 | Project Dashboard & Overview | 4 / 8 | 50% | Partial |
| **Total** | **Module 04** | **22 / 45** | **~49%** | **Not Complete** |

---

## 3. Per-Requirement Detail (PARTIAL / MISSING ACs only)

### PROJ-001 — Project Creation & Management (71%)
Complete: AC-2, AC-3, AC-7. (AC-1, AC-5 implemented with minor notes.)

- **AC-4 Create from template (PARTIAL)** — Server fully built (`server/src/modules/pm/project.service.js:324-423`; route `project.routes.js:18`; validation `project.validation.js:94-105`). **Client has zero wiring** — no endpoint constant, service method, mutation hook, or template-picker UI. `duplicateProject` hits `/:id/duplicate`, not `/from-template`.
- **AC-6 Soft-delete + "Include Deleted" filter (PARTIAL)** — Default exclusion works (`project.model.js:95-98`). The **retrieval half is absent**: no API param wired in, schemas reject unknown keys, no client control (`project-filter-bar.jsx:35-108`). Also `softDelete` forces `status=ARCHIVED` (`project.repository.js:101-107`), conflating delete and archive.
- *Note (AC-5):* audit records changed field **names** only (`Object.keys`), not before/after values.

### PROJ-002 — Project Status Tracking (50%)
Complete: AC-1, AC-3, AC-4.

- **AC-2 Block on incomplete prep actions + list outstanding (PARTIAL)** — Blocking works (`status.service.js:43-56`). The **"lists the outstanding actions" clause is unmet**: server returns only an aggregate count in the error string; client only shows a raw toast (`use-status-mutations.js:23`).
- **AC-5 Override permission (PARTIAL — DEFECT)** — Mechanics + reason logging correct (`status.service.js:58-60,96-105`). **Permission contract broken:** spec `project:status:override` never seeded; server gates on `projects:admin`/role `Admin` (`status.controller.js:33-45`); client gates UI on `project:status:override` (`project-detail.jsx:79`) — never renders.
- **AC-6 Notifications within 60s (MISSING — DEFECT)** — Job enqueued to `auth-email` (`status.service.js:126-133`); `AuthEmailWorker` (`authEmail.job.js:95-125`) has no matching case → skipped. `sendProjectStatusNotification` (`mail.js:303-319`) is dead code.

### PROJ-003 — Preparatory Actions Management (71%)
Complete: AC-2, AC-3, AC-4, AC-5, AC-7.

- **AC-1 Create with all 8 fields (PARTIAL)** — Server accepts all fields; **client form (`prep-actions-tab.jsx:227-271`) exposes only Action Type, Title, Description, Mandatory, Due Date.** "Assigned To" and "Reference" have no input; **Attachments entirely absent** (no model field, no UI).
- **AC-6 Edit with history (PARTIAL)** — Editing works; "history" is only `updatedBy`/`updatedAt` + generic audit of field **names**. No per-action history model, endpoint, or client changelog.
- *Defects (notes):* template prep-action copy (`project.service.js:389-399`) uses `name`/`sortOrder` but model requires `title` → fails validation. `PREP_ACTION_CREATED` has no subscriber → assignee not notified on create.

### PROJ-004 — Construction Schedule Management (14%)
Complete: AC-1.

- **AC-2 Predecessor + auto-adjust (PARTIAL)** — Server cascade exists (`schedule.service.js:78-96,366`); **client form has no predecessor field**. No conflict detection (AF-3), no drag-and-drop (AF-1).
- **AC-3 Partner confirmation email + PDF (PARTIAL)** — Record created + job enqueued (`schedule.service.js:168-196`), but `auth-email` worker has **no `send-partner-confirmation` case** → skipped. `sendPartnerConfirmationEmail` + template are dead code. **No PDF generated.**
- **AC-4 Record + show partner response (PARTIAL)** — Recording works (`schedule.service.js:238`); **read path never returns confirmations** (`getSchedule` returns bare entries; `findConfirmationsByEntry` is dead). Client `entry.confirmations` always empty.
- **AC-5 Configurable 5-day threshold + warn (PARTIAL)** — **Hardcoded to 5** (no config); server **hard-rejects** instead of warning; no client pre-send warning.
- **AC-6 Visible in MOD-05 (MISSING)** — **No integration.** PM publishes `SCHEDULE_ENTRY_*` but **no module subscribes**; deploy has zero references to schedule entries.
- **AC-7 Export as PDF (PARTIAL)** — Wired but **fails at runtime**: `project_schedule` template never seeded **and** not in the `documentTemplate.model.js:3-12` enum. iCal export works.

### PROJ-005 — Project Document Creation (17%)
Complete: AC-2.

- **AC-1 Create from template, auto-populated (PARTIAL)** — Server `generate()` complete (`document.service.js:198-277`) but **unreachable from UI**; no Create Document action / template picker / variable preview.
- **AC-3 Support 3 template types (MISSING)** — None of `appointment_confirmation` / `status_report` / `completion_certificate` in the enum or seed; generation throws NotFoundError for unknown types.
- **AC-4 Edit before finalizing (MISSING)** — One-shot generation; `generateDocumentSchema` accepts only `templateType`; no draft state. AF-2 unimplemented.
- **AC-5 Send via email (MISSING)** — No PM email path; doctpl `email.service.js` resolves attachments only via GeneratedDocument id, which PM docs don't reference.
- **AC-6 Logged in project activity log (PARTIAL)** — Generic audit only (`document.service.js:258-266`); **no activity-log surface** exists.

### PROJ-006 — Document Repository per Project (38%)
Complete: AC-1, AC-2, AC-4.

- **AC-3 Search by name/category/date (PARTIAL)** — Server supports all three; **client sends only `category`**; name search is in-memory; **no date-range UI**.
- **AC-5 Mobile uploads appear in repo (PARTIAL)** — Mobile upload creates only `FileMetadata`, **not `ProjectDocument`**; web repo queries `ProjectDocument` only. One-directional visibility — web never sees mobile uploads.
- **AC-6 Soft-delete restorable 30 days (PARTIAL)** — Server implements restore (`document.service.js:167-196`); **client has soft-delete only** — no restore wiring or trash view.
- **AC-7 Project-level permissions (PARTIAL)** — Guarded, but with **generic `projects:*`** instead of spec's `project:documents:*` (which exist nowhere).
- **AC-8 Configurable max size 50 MB (PARTIAL)** — Service layer honors config; **multer pre-filter hardcoded to 50 MB** (`pm.routes.js:40-43`), so raising the env var is silently capped.

### PROJ-007 — Project Dashboard & Overview (50%)
Complete: AC-4, AC-5, AC-6, AC-7.

- **AC-1 Per-status cards + overdue (PARTIAL)** — Server computes counts; **client renders only 4 fixed cards** (no Draft/Planning/On Hold/Completed). Overdue card reads `summary.overdue` but server nests at `summary.risk.overdue` → always 0; Upcoming Milestones card reads a field never returned → always 0.
- **AC-2 Filter by status/type/PM/customer/date (PARTIAL)** — Status, type, PM-as-binary-self-filter only. **Missing:** date range, customer picker, arbitrary PM.
- **AC-3 Sortable (PARTIAL)** — Server supports it; **client never sends `sortBy`/`sortOrder`**; no sort control.
- **AC-8 Auto/manual refresh (MISSING)** — No `refetchInterval`, no manual Refresh button; `refreshedAt` is server-side only.
- *Latent bug:* `use-cursor-list.js:48-49` reads `cursor`/`hasMore` but server returns `nextCursor`/`hasNext` → pagination dead beyond page 1.

---

## 4. Remaining Work (Prioritized)

### HIGH — blocks core functionality or are runtime defects
**Server**
- PROJ-002 AC-6: add `send-status-notification` worker handler + recipient resolution; wire `sendProjectStatusNotification`.
- PROJ-002 AC-5: reconcile override permission across spec/server/client; seed it (or align to one existing slug).
- PROJ-004 AC-3: add `send-partner-confirmation` handler + generate/attach PDF; populate `documentId`.
- PROJ-004 AC-4: join confirmations into `getSchedule` (use existing `findConfirmationsByEntry`).
- PROJ-005 AC-3 / PROJ-004 AC-7: add `appointment_confirmation`, `status_report`, `completion_certificate`, `project_schedule` to TEMPLATE_TYPES enum + seed + `_buildFilename`.
- PROJ-004 AC-6: build PM-schedule → MOD-05 integration.
- PROJ-006 AC-5: bridge mobile uploads to `ProjectDocument`.
- PROJ-003 (notes): fix template-derived prep-action copy (`title`/`isMandatory`/type details).

**Client**
- PROJ-001 AC-4: build template-picker UI + wiring.
- PROJ-005 AC-1/AC-4: build Create Document flow (template select, variable review/edit, draft save); wire `generateDocument`.
- PROJ-007 AC-1: render per-status cards; fix Overdue (`summary.risk.overdue`) and Upcoming Milestones field mismatches.
- PROJ-007 cursor bug: fix `nextCursor`/`hasNext` mismatch.

### MED — meaningful gaps
**Server:** PROJ-004 AC-5 (configurable threshold + warn); PROJ-005 AC-5 (email path via `fileId`); PROJ-001 AC-6 (`includeDeleted` param + decouple ARCHIVED); permission-vocabulary decision (module-wide).
**Client:** PROJ-007 AC-2 (date/customer/PM filters); PROJ-007 AC-3 (column sorting); PROJ-006 AC-3 (server search + date UI); PROJ-006 AC-6 (restore + trash view); PROJ-003 AC-1 (Assigned To/Reference/Attachments inputs); PROJ-004 AC-2 (predecessor field); PROJ-002 AC-2 / PROJ-003 AC-4 (surface outstanding actions in transition dialog).

### LOW — polish / audit-trail completeness
**Server:** before/after values in audit (PROJ-001 AC-5, PROJ-003 AC-6); wire multer limit to config (PROJ-006 AC-8); add PM to overdue recipients (PROJ-003 AC-5); activity-log surface (PROJ-005 AC-6).
**Client:** partner directory picker + drag-drop/conflict + bulk confirmation (PROJ-004 AF-1/2/3); reconcile cache-key inconsistency (PROJ-002).

---

## 5. Cross-Cutting Notes

1. **Permission vocabulary mismatch (module-wide)** — spec fine-grained slugs vs code's coarse `projects:*` (`server/src/shared/constants/roles.js:38-42`); actively broken in PROJ-002 AC-5.
2. **Queue/worker dead-letter pattern (systemic)** — two features enqueue onto `auth-email` with no matching worker case; jobs skip silently. Recommend default-case alarm or per-family queues.
3. **Dead code / half-built pipelines** — `sendProjectStatusNotification`, `sendPartnerConfirmationEmail` + `partnerAppointmentConfirmation.ejs`, `findConfirmationsByEntry` all exist but are never invoked.
4. **Document template catalog gates two ACs** — PROJ-004 AC-7 and PROJ-005 AC-3 share the same root cause (missing enum entries + seed).
5. **Soft-delete / archive conflation (PROJ-001)** — `softDelete` forces ARCHIVED; complicates restore/include-deleted.
6. **Audit trail vs activity log** — change tracking records field names only; no user-facing activity feed.
7. **Client cursor-pagination defect (PROJ-007)** — `nextCursor`/`hasNext` vs `cursor`/`hasMore` breaks pagination beyond page 1.
8. **MOD-05 integration absence (PROJ-004 AC-6)** — the only true cross-module requirement in this batch is entirely unbuilt.

---

*All gaps independently re-verified against the codebase at `D:\Animmza\Boiler`. File paths are server- or client-relative as cited.*
