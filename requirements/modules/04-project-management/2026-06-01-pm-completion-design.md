# MOD-04 Project Management — Completion & Premium UI Design

| Field | Value |
|-------|-------|
| Date | 2026-06-01 |
| Status | Approved (design) |
| Scope | Complete all 7 requirements (PROJ-001…007) to 100% of acceptance criteria, fix 2 runtime defects, and bring all pages to a Notion/ClickUp premium standard |
| Baseline | Audit found 22/45 ACs implemented (~49%) — see `AUDIT_COMPLIANCE_REPORT.md` |
| Codebase | Server `server/src/modules/pm/`, Client `client/src/modules/pm/` |

---

## 1. Goal

Close the 23 remaining acceptance criteria across PROJ-001…007, fix the two runtime defects (status-notification dead-letter, override-permission mismatch), and deliver a premium ClickUp/Notion-grade UI — all on the existing design system.

## 2. Locked decisions

| Decision | Choice |
|----------|--------|
| Sequencing | **Phased with review checkpoints** — 7 phases, each ends in a reachable (UI-wired) slice; no backend-only deliverables |
| Permission model | **Adopt the spec's fine-grained permission slugs** module-wide |
| Notifications | **Full end-to-end** — in-app always, email behind an SMTP config flag |
| Project detail page | **Option A** — ClickUp task-detail: header (number + name + status pill), tab strip (Overview / Prep Actions / Schedule / Documents / Activity) with count badges, persistent right-rail property panel |
| Projects workspace | **Option B** — List view + Kanban Board (drag → status, rule-aware) + view switcher, atop the full PROJ-007 dashboard |
| Construction schedule | **Option A** — list + read-only timeline delivering 100% of ACs; **interactive drag-Gantt (AF-1/AF-3) explicitly deferred** as a fast-follow, out of scope here |
| AF-3 auto-archive after retention | **In scope** |
| AF-4 same-name version control | **In scope** |

## 3. Architecture & conventions

- **Server** follows the existing per-module layered pattern: `*.model.js`, `*.repository.js`, `*.service.js`, `*.controller.js`, `*.validation.js`, routes in `pm.routes.js`/`project.routes.js`. New cross-cutting capability (permissions, notification handlers, template types) lives in its shared/platform home, not duplicated in PM.
- **Client** follows `modules/pm/{components,hooks,services,validations,constants}`. Build on the ClickUp-tuned tokens in `client/src/app/globals.css` and the shadcn/ui primitives in `client/src/components/ui/`. **Must consult `node_modules/next/dist/docs/` before writing client code** — this is a customized Next.js (see `client/AGENTS.md`).
- **TDD throughout** — write failing tests first (jest server / vitest client), then implement.
- Each unit keeps one clear purpose and a well-defined interface; split files that grow too large (e.g. the schedule service / schedule tab).

## 4. Phase plan

### Phase 0 — Platform foundations (unblocks everything)
1. **Fine-grained permissions.** Define `project:create`, `project:edit`, `project:read`, `project:delete`, `project:status:update`, `project:status:override`, `project:prep-actions:manage`, `project:schedule:manage`, `project:documents:read`, `project:documents:write`, `project:documents:create`, `project:documents:delete` in the server permission constants and client permission constants. **Migrate the new permissions onto existing roles in the same change** that swaps the route guards, so live users are not locked out. Update all PM server route guards and all client `PermissionGate`/`hasPermission` usages.
2. **Notification backbone.** Add real worker handlers for `send-status-notification` and `send-partner-confirmation` (on a queue with a registered worker), add recipient resolution (project team / PM / assignee), wire the existing dead mail helpers (`sendProjectStatusNotification`, `sendPartnerConfirmationEmail`) + EJS templates, deliver **in-app notifications** via the notifications module unconditionally and **email** behind an SMTP config flag. Add a default-case alarm/log-error in the queue worker so unknown job types can never silently skip again.
3. **Document template catalog.** Add `appointment_confirmation`, `status_report`, `completion_certificate`, and `project_schedule` to `documentTemplate.model.js` `TEMPLATE_TYPES` enum, extend `_buildFilename`, and seed template records for each.
4. **Cursor-pagination fix.** Reconcile client `use-cursor-list` (`cursor`/`hasMore`) with the server response shape (`nextCursor`/`hasNext`) so pagination works beyond page 1.
5. **Soft-delete / archive decoupling.** Stop forcing `status=ARCHIVED` on `softDelete`; add an `includeDeleted` query param to the project list endpoint + validation schema.

### Phase 1 — PROJ-001 + PROJ-007 (Creation & Workspace)
- **Create-from-template** client flow: endpoint constant, service method, mutation hook, and a template-picker step in the project wizard. Fix the template→prep-action copy so it maps `title` / `isMandatory` / type-specific details (currently uses non-existent `name`/`sortOrder` and fails model validation).
- **"Include Deleted"** filter control in the project filter bar, wired to the Phase 0 query param.
- **Dashboard cards**: render all six status cards (Draft, Planning, In Progress, On Hold, Completed) + Overdue, reading `summary.byStatus.*` and `summary.risk.overdue`; fix the upcoming-milestones card field mismatch.
- **Workspace**: List view with real server-side sorting (name, date, status, customer — pass `sortBy`/`sortOrder`, enable column sort UI) + **Kanban Board** grouped by status with drag-to-transition that calls the status endpoint and respects PROJ-002 transition rules + a List/Board view switcher. Add date-range, customer-picker, and project-manager-picker filters.
- (Low) capture before/after values in the project update audit entry.

### Phase 2 — PROJ-002 (Status)
- **Precondition pre-check**: service method + endpoint returning the *specific* outstanding mandatory preparatory actions for a blocked transition; surface the list in the transition dialog (and reuse for PROJ-003 AC-4).
- Override path now functions (Phase 0 permission reconciliation); confirm override reason is logged.
- **Status-change notifications** fire within the spec window via the Phase 0 backbone (recipients = project team/PM).
- **AF-3 auto-archive**: scheduled job archiving Completed projects after the configured retention period.

### Phase 3 — PROJ-003 (Prep Actions)
- Add the missing client form inputs: **Assigned To** (`assignedToId`) and **Reference** (`externalReference`).
- **Attachments**: add an attachments field to the prep-action model + an upload/list UI reusing the file service.
- **History**: add a prep-action history record (mirroring `ProjectStatusHistory`) + query endpoint + a client changelog view, capturing field changes with old/new values.
- Notify the assignee on prep-action creation (subscribe to `PREP_ACTION_CREATED`); add the project manager to overdue-notification recipients.

### Phase 4 — PROJ-004 (Schedule)
- **Predecessor selection** field in the schedule entry form; confirm dependent-date auto-recalc on date change.
- **Partner confirmation email + generated PDF**: generate the PDF via the `project_schedule`/appointment template, attach it, populate `partnerConfirmation.documentId`, and deliver the email through the Phase 0 backbone.
- **Confirmations visible**: join confirmations into `getSchedule` (use existing `findConfirmationsByEntry`) so recorded partner responses render in the schedule. Replace the raw `partnerCompanyId` ObjectId text input with a partner-directory picker.
- **Configurable threshold**: make the 5-business-day rule configurable; change the server hard-reject into a **warning**; add a client pre-send warning.
- **MOD-05 integration**: the deploy module subscribes to `SCHEDULE_ENTRY_*` events and surfaces internal-team schedule entries in Field Deployment Planning.
- **PDF export** works (depends on Phase 0 `project_schedule` template type + seed).

### Phase 5 — PROJ-005 + PROJ-006 (Documents)
- **PROJ-005 Create Document flow**: template picker filtered by project type/context, **variable review/edit before finalizing**, save-as-draft, regenerate; wire the existing `generateDocument` service into the documents tab. Template types come from Phase 0. Add an **email-send** path for project documents (resolve attachment via `fileId`). Add a project **activity-log** surface that records document creation (and other project activity).
- **PROJ-006**: server-backed search (name + category + **date-range UI**); **restore + trash view** for soft-deleted documents (wire the existing 30-day restore endpoint); **mobile→ProjectDocument bridge** so mobile uploads appear in the web repository; fine-grained document permissions (Phase 0); wire the multer size limit to `config.storage.maxFileSize`; **same-name version control** (AF-4); **bulk-upload categorization** (AF-1, common vs per-file category).

### Phase 6 — Premium polish + verification
- Consistent design-system application across all PM pages: status pills, right-rail panel, tab badges, skeleton loaders, empty states, gsap micro-transitions, responsive layout, dark mode, accessibility (ARIA, keyboard).
- Full server + client test run; manual verification of each previously-failing AC.

## 5. Acceptance-criteria coverage map

Every currently PARTIAL/MISSING AC maps to a phase:

| Phase | Requirements | Closes ACs |
|-------|--------------|-----------|
| 0 | Platform | Unblocks PROJ-002 AC-5/AC-6, PROJ-004 AC-3/AC-7, PROJ-005 AC-3, PROJ-006 AC-7, PROJ-007 pagination |
| 1 | PROJ-001, PROJ-007 | 001 AC-4, AC-6; 007 AC-1, AC-2, AC-3, AC-8 |
| 2 | PROJ-002 | 002 AC-2, AC-5, AC-6 |
| 3 | PROJ-003 | 003 AC-1, AC-6 |
| 4 | PROJ-004 | 004 AC-2, AC-3, AC-4, AC-5, AC-6, AC-7 |
| 5 | PROJ-005, PROJ-006 | 005 AC-1, AC-3, AC-4, AC-5, AC-6; 006 AC-3, AC-5, AC-6, AC-8 |
| 6 | All | Polish + verification (no new ACs) |

## 6. Risks & mitigations

- **Permission migration (highest risk).** Changing route guards without granting the new permissions to existing roles locks out live users. Mitigation: define, seed, and migrate the new permissions onto current roles in the *same* atomic change as the route-guard swap; add tests asserting an existing admin/PM role retains access to every PM route.
- **Customized Next.js.** Consult `node_modules/next/dist/docs/` before any client work (`client/AGENTS.md`).
- **Email deliverability.** Email is gated behind an SMTP config flag; in-app notifications are the always-on guarantee so ACs do not depend on SMTP credentials being present.
- **Dead-letter recurrence.** The default-case worker alarm prevents the silent-skip class of bug from recurring.

## 7. Out of scope

- Interactive drag-and-drop Gantt with live dependency lines and conflict glow (PROJ-004 AF-1/AF-3) — explicit fast-follow.
- Portfolio Calendar view (PROJ-007) — redundant with the construction-schedule timeline.
- Any requirement outside MOD-04.
