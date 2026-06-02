# MOD-04 Re-Audit Remaining Work (2026-06-01 branch HEAD)

Decisions in force: (A) fine-grained `project:*` permissions; (B) full end-to-end notifications.

## What the parallel effort closed (now DONE)

| AC | Evidence |
|----|----------|
| PROJ-002 AC-2 | Outstanding mandatory prep actions listed in transition dialog |
| PROJ-002 AC-6 | Status-change notifications delivered via auth-email worker |
| PROJ-006 AC-8 | Multer limit wired to `config.pm.documentMaxUploadBytes` |
| PROJ-007 AC-2 | Full filters (status/type/PM/customer/date range) in place |

## Status table — items still to close

| Req | AC | Status | Category |
|-----|----|--------|----------|
| PROJ-001 | AC-4 Create from template | PARTIAL | Client only |
| PROJ-001 | AC-6 Soft-delete must not force ARCHIVED | PARTIAL | Server only |
| PROJ-002 | AC-5 Override permission string | PARTIAL | Perm migration |
| PROJ-003 | AC-1 Attachments UI in prep-action form | PARTIAL | Client only |
| PROJ-003 | AC-6 Per-action history view | PARTIAL | Client only |
| PROJ-004 | AC-2 Predecessor field in schedule form | PARTIAL | Client only |
| PROJ-004 | AC-3 Partner confirmation PDF attached | PARTIAL | Server only |
| PROJ-004 | AC-4 Partner response detail rendered | PARTIAL | Client only |
| PROJ-004 | AC-5 Configurable threshold + warn | PARTIAL | Server+Client |
| PROJ-004 | AC-6 MOD-05 integration | NOT_DONE | Server only |
| PROJ-004 | AC-7 Schedule PDF export | NOT_DONE | Server (template types) |
| PROJ-005 | AC-1 Create Document UI | PARTIAL | Client only |
| PROJ-005 | AC-3 Template types (3 required) | NOT_DONE | Server only |
| PROJ-005 | AC-4 Edit before finalize + draft | NOT_DONE | Server+Client |
| PROJ-005 | AC-5 Email documents | NOT_DONE | Server+Client |
| PROJ-005 | AC-6 Activity log surface | PARTIAL | Server+Client |
| PROJ-006 | AC-3 Date-range search UI | PARTIAL | Client only |
| PROJ-006 | AC-5 Mobile uploads → ProjectDocument | NOT_DONE | Server only |
| PROJ-006 | AC-6 Restore/trash client UI | PARTIAL | Client only |
| PROJ-006 | AC-7 Fine-grained document permissions | PARTIAL | Perm migration |
| PROJ-007 | AC-1 All-status cards rendered | PARTIAL | Client only |
| PROJ-007 | AC-3 Customer sort column | PARTIAL | Client only |
| PROJ-007 | AC-8 Milestones widget refresh | PARTIAL | Client+Server bugs |

## Fine-grained permission migration (entire module)

Root blocker: `server/src/shared/constants/roles.js:39-42` defines only `projects:read/write/delete/admin`.
No `project:create/edit/delete/read/status:update/status:override/prep-actions:manage/schedule:manage/documents:read/write/create/delete` exists anywhere.

Every PM route + client gate is still coarse. Override gate uses `projects:admin` (status.controller.js:45; project-detail.jsx:79).

See Phase 0 plan for the atomic seed+route-swap.

## Remaining bugs outside ACs

- Soft-delete forces ARCHIVED (`project.repository.js:125,142`) — PROJ-001 AC-6.
- Cursor pagination: `use-cursor-list.js:49-50` reads `cursor/hasMore` but server returns `nextCursor/hasNext` — Next button dead (Phase 0).
- Milestones cache key ignores `days` param (`project.service.js:283-290`) — PROJ-007 AC-8.
- Milestones invalidation in `use-schedule-mutations.js:15` fires with no arg — misses keyed query.
- Notification fan-out: only PM notified, not full team (PROJ-002 AC-6 / decision B).
