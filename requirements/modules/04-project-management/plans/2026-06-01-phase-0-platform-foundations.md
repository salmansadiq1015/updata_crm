# Phase 0 — Platform Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cross-cutting foundations that unblock every later PM phase — fine-grained permissions, a reliable notification path, the missing document template types, the cursor-pagination fix, and soft-delete/archive decoupling.

**Architecture:** Server is layered per module (`*.model/repository/service/controller/validation.js`, routes in `*.routes.js`); permissions live in `server/src/shared/constants/roles.js` + are seeded in `server/src/seed/seed.js`; notifications flow through `notificationService.create()` driven by the event bus (`pm.events.js`); the client mirrors permission strings in `client/src/shared/constants/permissions.ts` and gates UI via `hasPermission`/`PermissionGate`.

**Tech Stack:** Node/Express, Mongoose, Joi, BullMQ job queues, Jest (server), Next.js + React Query + Vitest (client).

**Reference — grounding notes (verified against live code 2026-06-01):**
- Permission middleware `requirePermission(perm)` does exact-string match; role `Admin` bypasses all checks (`authenticate.js:139`). So new permissions only need granting to **Projektleiter** and **User**; Admin is automatic.
- Seeding is additive for non-admin roles (`$addToSet`) and runs on every startup, then invalidates the permission cache (`seed.js:271-296`). Keeping the old `projects:*` keys defined is harmless; we ADD the new `project:*` keys.
- `listProjectsSchema` **already** accepts `includeDeleted`, `plannedStartFrom/To`, `customerId`, `projectManagerId` (`project.validation.js:52-63`); the repository already honors `includeDeleted` + date range (`project.repository.js:46-94`). So no server work is needed for those filters — only the client UI (later phases). Phase 0's soft-delete task is **only** the ARCHIVED decoupling.
- The working notification pattern to mirror is the `PREP_ACTION_OVERDUE` handler in `pm.events.js:79-130` which calls `notificationService.create({ channels:['IN_APP','EMAIL'], recipientIds, type, category, priority, payload, sourceModule, sourceEvent, sourceEntityType, sourceEntityId }, null)`.

**Before writing client code:** read the relevant guide in `client/node_modules/next/dist/docs/` — this is a customized Next.js (see `client/AGENTS.md`).

**Run commands** (from repo root unless noted): server tests `cd server && npm test -- <path>`; client tests `cd client && npx vitest run <path>`.

---

## File structure for this phase

| File | Responsibility | Action |
|------|----------------|--------|
| `server/src/shared/constants/roles.js` | Canonical permission string constants | Modify — add 12 `project:*` keys |
| `server/src/seed/seed.js` | Permission definitions + role grants | Modify — add definitions + grant to roles |
| `client/src/shared/constants/permissions.ts` | Client permission strings | Modify — add the same 12 keys |
| `server/src/modules/pm/project.routes.js` | Project route guards | Modify — swap guards |
| `server/src/modules/pm/pm.routes.js` | Status/prep/schedule/document route guards | Modify — swap guards |
| `server/src/modules/pm/status.controller.js` | Override permission check | Modify — use `project:status:override` |
| `server/src/modules/pm/project.repository.js` | Soft-delete persistence | Modify — stop forcing ARCHIVED |
| `server/src/modules/pm/pm.events.js` | Domain event → notification dispatch | Modify — add status-change notification |
| `server/src/modules/pm/status.service.js` | Status transition | Modify — remove dead auth-email enqueue |
| `server/src/jobs/authEmail.job.js` | Auth-email worker | Modify — default-case guard |
| `server/src/modules/doctpl/documentTemplate.model.js` | Template type enum | Modify — add 4 types |
| `server/src/modules/doctpl/documentGeneration.service.js` | Filename builder | Modify — add 4 filename mappings |
| `server/src/seed/doctplSeed.js` | Template seed records | Modify — seed 4 new templates |
| `client/src/modules/pm/components/project-detail.jsx` | Override gate | Modify — `project:status:override` |
| Various PM components | PermissionGate/hasPermission usages | Modify — swap strings |

---

## Task 1: Define fine-grained PM permission constants

**Files:**
- Modify: `server/src/shared/constants/roles.js:38-42`
- Modify: `server/src/seed/seed.js` (PERMISSION_DEFINITIONS list + Projektleiter/User role grants)
- Modify: `client/src/shared/constants/permissions.ts:35-39`
- Test: `server/tests/pm/permissions.seed.test.js`

The 12 new permission strings:
`project:read`, `project:create`, `project:edit`, `project:delete`, `project:status:update`, `project:status:override`, `project:prep-actions:manage`, `project:schedule:manage`, `project:documents:read`, `project:documents:write`, `project:documents:create`, `project:documents:delete`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/pm/permissions.seed.test.js`:

```js
import { ROLE_DEFINITIONS, PERMISSION_DEFINITIONS } from '../../src/seed/seed.js';

const FINE_GRAINED = [
  'project:read', 'project:create', 'project:edit', 'project:delete',
  'project:status:update', 'project:status:override',
  'project:prep-actions:manage', 'project:schedule:manage',
  'project:documents:read', 'project:documents:write',
  'project:documents:create', 'project:documents:delete',
];

const defKey = (d) => `${d.module}:${d.action}`;

describe('fine-grained PM permissions', () => {
  it('defines every fine-grained PM permission', () => {
    const keys = PERMISSION_DEFINITIONS.map(defKey);
    for (const p of FINE_GRAINED) expect(keys).toContain(p);
  });

  it('grants all fine-grained PM permissions to Projektleiter', () => {
    const pl = ROLE_DEFINITIONS.find((r) => r.name === 'Projektleiter');
    for (const p of FINE_GRAINED) expect(pl.permissionKeys).toContain(p);
  });

  it('grants read-only PM permissions to the User role', () => {
    const user = ROLE_DEFINITIONS.find((r) => r.name === 'User');
    expect(user.permissionKeys).toContain('project:read');
    expect(user.permissionKeys).toContain('project:documents:read');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/pm/permissions.seed.test.js`
Expected: FAIL — keys not found in PERMISSION_DEFINITIONS / role grants.

- [ ] **Step 3: Add the constants to `roles.js`**

In `server/src/shared/constants/roles.js`, after the `// Projects` block (line 42, the `PROJECTS_ADMIN` line), insert:

```js
  // Projects — fine-grained (spec MOD-04)
  PROJECT_READ: 'project:read',
  PROJECT_CREATE: 'project:create',
  PROJECT_EDIT: 'project:edit',
  PROJECT_DELETE: 'project:delete',
  PROJECT_STATUS_UPDATE: 'project:status:update',
  PROJECT_STATUS_OVERRIDE: 'project:status:override',
  PROJECT_PREP_ACTIONS_MANAGE: 'project:prep-actions:manage',
  PROJECT_SCHEDULE_MANAGE: 'project:schedule:manage',
  PROJECT_DOCUMENTS_READ: 'project:documents:read',
  PROJECT_DOCUMENTS_WRITE: 'project:documents:write',
  PROJECT_DOCUMENTS_CREATE: 'project:documents:create',
  PROJECT_DOCUMENTS_DELETE: 'project:documents:delete',
```

- [ ] **Step 4: Add definitions + role grants in `seed.js`**

In `server/src/seed/seed.js`, find the existing Projects entries in `PERMISSION_DEFINITIONS` (the `{ module: 'projects', ... }` block) and add immediately after it:

```js
  // Projects — fine-grained (MOD-04)
  { module: 'project', action: 'read', description: 'View projects' },
  { module: 'project', action: 'create', description: 'Create projects' },
  { module: 'project', action: 'edit', description: 'Edit projects' },
  { module: 'project', action: 'delete', description: 'Delete/archive projects' },
  { module: 'project', action: 'status:update', description: 'Transition project status' },
  { module: 'project', action: 'status:override', description: 'Override status transition preconditions' },
  { module: 'project', action: 'prep-actions:manage', description: 'Manage preparatory actions' },
  { module: 'project', action: 'schedule:manage', description: 'Manage construction schedule' },
  { module: 'project', action: 'documents:read', description: 'View project documents' },
  { module: 'project', action: 'documents:write', description: 'Upload/edit project documents' },
  { module: 'project', action: 'documents:create', description: 'Generate project documents' },
  { module: 'project', action: 'documents:delete', description: 'Delete project documents' },
```

In the `Projektleiter` role `permissionKeys` array (after the existing `'projects:read', 'projects:write', 'projects:delete', 'projects:admin',` line) add:

```js
      'project:read', 'project:create', 'project:edit', 'project:delete',
      'project:status:update', 'project:status:override',
      'project:prep-actions:manage', 'project:schedule:manage',
      'project:documents:read', 'project:documents:write',
      'project:documents:create', 'project:documents:delete',
```

In the `User` role `permissionKeys` array (after `'projects:read',`) add:

```js
      'project:read', 'project:documents:read',
```

- [ ] **Step 5: Add the same keys to the client constants**

In `client/src/shared/constants/permissions.ts`, replace the `// Projects (future)` block (lines 35-39) with:

```ts
  // Projects (MOD-04)
  PROJECTS_READ: 'projects:read',
  PROJECTS_WRITE: 'projects:write',
  PROJECTS_DELETE: 'projects:delete',
  PROJECT_READ: 'project:read',
  PROJECT_CREATE: 'project:create',
  PROJECT_EDIT: 'project:edit',
  PROJECT_DELETE: 'project:delete',
  PROJECT_STATUS_UPDATE: 'project:status:update',
  PROJECT_STATUS_OVERRIDE: 'project:status:override',
  PROJECT_PREP_ACTIONS_MANAGE: 'project:prep-actions:manage',
  PROJECT_SCHEDULE_MANAGE: 'project:schedule:manage',
  PROJECT_DOCUMENTS_READ: 'project:documents:read',
  PROJECT_DOCUMENTS_WRITE: 'project:documents:write',
  PROJECT_DOCUMENTS_CREATE: 'project:documents:create',
  PROJECT_DOCUMENTS_DELETE: 'project:documents:delete',
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- tests/pm/permissions.seed.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/shared/constants/roles.js server/src/seed/seed.js client/src/shared/constants/permissions.ts server/tests/pm/permissions.seed.test.js
git commit -m "feat(pm): define fine-grained project permissions and grant to roles"
```

---

## Task 2: Swap PM route guards to fine-grained permissions

**Files:**
- Modify: `server/src/modules/pm/project.routes.js:15-29`
- Modify: `server/src/modules/pm/pm.routes.js` (status/prep/schedule/document guards)
- Modify: `server/src/modules/pm/status.controller.js` (override check)
- Test: `server/tests/pm/route-guards.test.js`

Permission mapping (old → new):

| Route | Old | New |
|-------|-----|-----|
| GET `/dashboard/summary`, `/dashboard/milestones`, `/export`, `/search`, GET `/`, GET `/:id` | `projects:read` | `project:read` |
| POST `/` | `projects:write` | `project:create` |
| POST `/from-template`, POST `/:id/duplicate` | `projects:write` | `project:create` |
| PATCH `/:id` | `projects:write` | `project:edit` |
| DELETE `/:id` | `projects:delete` | `project:delete` |
| PATCH `/bulk-update` | `projects:admin` | `project:edit` |
| POST `/bulk-delete` | `projects:admin` | `project:delete` |
| POST `/:id/status` | `projects:write` | `project:status:update` |
| GET `/:id/status/history` | `projects:read` | `project:read` |
| prep-actions GET, GET `/:actionId` | `projects:read` | `project:read` |
| prep-actions POST, PATCH, DELETE | `projects:write`/`delete` | `project:prep-actions:manage` |
| schedule GET, `/export` | `projects:read` | `project:read` |
| schedule POST/PATCH/DELETE entries + confirmations | `projects:write`/`delete` | `project:schedule:manage` |
| documents GET, `/:docId`, `/download` | `projects:read` | `project:documents:read` |
| documents POST (upload), PATCH, `/restore` | `projects:write` | `project:documents:write` |
| documents `/generate` | `projects:write` | `project:documents:create` |
| documents DELETE | `projects:delete` | `project:documents:delete` |

- [ ] **Step 1: Write the failing test**

Create `server/tests/pm/route-guards.test.js`. This test reads the route source and asserts the new guards are present (a fast static check that needs no DB):

```js
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

describe('PM route guards use fine-grained permissions', () => {
  const projectRoutes = read('src/modules/pm/project.routes.js');
  const pmRoutes = read('src/modules/pm/pm.routes.js');

  it('project create/edit/delete use fine-grained guards', () => {
    expect(projectRoutes).toContain("requirePermission('project:create')");
    expect(projectRoutes).toContain("requirePermission('project:edit')");
    expect(projectRoutes).toContain("requirePermission('project:delete')");
    expect(projectRoutes).toContain("requirePermission('project:read')");
  });

  it('status transition uses project:status:update', () => {
    expect(pmRoutes).toContain("requirePermission('project:status:update')");
  });

  it('prep/schedule/document sub-routes use fine-grained guards', () => {
    expect(pmRoutes).toContain("requirePermission('project:prep-actions:manage')");
    expect(pmRoutes).toContain("requirePermission('project:schedule:manage')");
    expect(pmRoutes).toContain("requirePermission('project:documents:create')");
    expect(pmRoutes).toContain("requirePermission('project:documents:delete')");
  });

  it('no PM route still uses the coarse projects:* guards', () => {
    expect(projectRoutes).not.toContain("requirePermission('projects:");
    expect(pmRoutes).not.toContain("requirePermission('projects:");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/pm/route-guards.test.js`
Expected: FAIL — old `projects:*` guards still present.

- [ ] **Step 3: Edit `project.routes.js`**

Replace lines 15-29 with (guards swapped per the table):

```js
router.get('/dashboard/summary', authenticate, requirePermission('project:read'), (req, res, next) => projectController.dashboardSummary(req, res, next));
router.get('/dashboard/milestones', authenticate, requirePermission('project:read'), (req, res, next) => projectController.dashboardMilestones(req, res, next));
router.get('/export', authenticate, requirePermission('project:read'), validate(exportProjectsSchema), (req, res, next) => projectController.exportCsv(req, res, next));
router.post('/from-template', authenticate, requirePermission('project:create'), validate(createFromTemplateSchema), (req, res, next) => projectController.createFromTemplate(req, res, next));
router.get('/search', authenticate, requirePermission('project:read'), validate(searchProjectsSchema), (req, res, next) => projectController.search(req, res, next));
router.patch('/bulk-update', authenticate, requirePermission('project:edit'), validate(bulkUpdateProjectsSchema), (req, res, next) => projectController.bulkUpdate(req, res, next));
router.post('/bulk-delete', authenticate, requirePermission('project:delete'), validate(bulkDeleteProjectsSchema), (req, res, next) => projectController.bulkDeactivate(req, res, next));

router.get('/', authenticate, requirePermission('project:read'), validate(listProjectsSchema), (req, res, next) => projectController.list(req, res, next));
router.post('/', authenticate, requirePermission('project:create'), validate(createProjectSchema), (req, res, next) => projectController.create(req, res, next));
router.get('/:id', authenticate, requirePermission('project:read'), validate(projectIdParamSchema), (req, res, next) => projectController.getById(req, res, next));
router.patch('/:id', authenticate, requirePermission('project:edit'), validate(updateProjectSchema), (req, res, next) => projectController.update(req, res, next));
router.delete('/:id', authenticate, requirePermission('project:delete'), validate(projectIdParamSchema), (req, res, next) => projectController.delete(req, res, next));
router.post('/:id/duplicate', authenticate, requirePermission('project:create'), validate(duplicateProjectSchema), (req, res, next) => projectController.duplicate(req, res, next));
```

- [ ] **Step 4: Edit `pm.routes.js` guards**

Apply these exact replacements:
- Line 52: `requirePermission('projects:write')` → `requirePermission('project:status:update')` (status transition).
- Line 59: `requirePermission('projects:read')` → `requirePermission('project:read')` (status history).
- Prep-action router: line 69 → `project:read`; line 75 → `project:prep-actions:manage`; line 82 → `project:read`; line 89 → `project:prep-actions:manage`; line 96 → `project:prep-actions:manage`.
- Schedule router: line 107 → `project:read`; line 113 → `project:read`; line 120 → `project:schedule:manage`; line 127 → `project:schedule:manage`; line 134 → `project:schedule:manage`; line 141 → `project:schedule:manage`; line 148 → `project:schedule:manage`.
- Document router: line 159 → `project:documents:read`; line 166 → `project:documents:write`; line 174 → `project:documents:create`; line 181 → `project:documents:read`; line 188 → `project:documents:read`; line 195 → `project:documents:write`; line 202 → `project:documents:write`; line 209 → `project:documents:delete`.

- [ ] **Step 5: Fix the override permission check in `status.controller.js`**

Open `server/src/modules/pm/status.controller.js`. The override branch currently checks role `Admin` or `projects:admin` (around lines 32-47). Replace the permission check so override requires `project:status:override`:

```js
// Inside transitionStatus, where override is requested:
if (override) {
  const perms = req.user?.permissions || [];
  const isAdmin = req.user?.role?.name === 'Admin';
  if (!isAdmin && !perms.includes('project:status:override')) {
    return res.fail({
      statusCode: 403,
      message: 'You do not have permission to override status preconditions.',
      code: 'FORBIDDEN',
    });
  }
}
```

(Match the surrounding variable names used in the file — `req.user.permissions` is the cached permission array attached by `authenticate`. If the controller reads permissions differently, keep its existing accessor and only change the permission string to `project:status:override`.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- tests/pm/route-guards.test.js`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/pm/project.routes.js server/src/modules/pm/pm.routes.js server/src/modules/pm/status.controller.js server/tests/pm/route-guards.test.js
git commit -m "feat(pm): swap PM route guards to fine-grained permissions"
```

---

## Task 3: Swap client permission gates to fine-grained strings

**Files:**
- Modify: `client/src/modules/pm/components/project-detail.jsx:79` (override gate)
- Modify: `client/src/modules/pm/components/projects-table.jsx` (create/edit/duplicate/archive gates)
- Modify: `client/src/modules/pm/components/documents-tab.jsx` (canWrite gate)
- Modify: `client/src/modules/pm/components/prep-actions-tab.jsx`, `schedule-tab.jsx` (manage gates)
- Test: `client/src/modules/pm/components/__tests__/permission-gates.test.jsx`

Mapping for client gates:
- New Project / create → `project:create`
- Edit project → `project:edit`
- Duplicate → `project:create`
- Archive/delete → `project:delete`
- Status override toggle → `project:status:override`
- Prep-action add/edit/delete → `project:prep-actions:manage`
- Schedule add/edit/delete + send confirmation → `project:schedule:manage`
- Document upload/edit/restore → `project:documents:write`; generate → `project:documents:create`; delete → `project:documents:delete`; view/list/download → `project:documents:read`

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/pm/components/__tests__/permission-gates.test.jsx`. Grep-style source assertion (fast, no render needed):

```jsx
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const read = (p) => fs.readFileSync(path.resolve(__dirname, p), 'utf8');

describe('PM client gates use fine-grained permissions', () => {
  it('project-detail override uses project:status:override', () => {
    expect(read('../project-detail.jsx')).toContain('project:status:override');
  });
  it('projects-table uses project:create / project:edit', () => {
    const src = read('../projects-table.jsx');
    expect(src).toContain('project:create');
    expect(src).toContain('project:edit');
  });
  it('documents-tab uses project:documents:write', () => {
    expect(read('../documents-tab.jsx')).toContain('project:documents:write');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/permission-gates.test.jsx`
Expected: FAIL — strings not present.

- [ ] **Step 3: Update `project-detail.jsx`**

Change the override gate (line 79):

```jsx
const canOverride = hasPermission('project:status:override');
```

- [ ] **Step 4: Update `projects-table.jsx`**

- New Project button `PermissionGate permission='projects:write'` → `permission='project:create'`.
- Edit row action `hasPermission('projects:write')` → `hasPermission('project:edit')`.
- Duplicate row action `hasPermission('projects:write')` → `hasPermission('project:create')`.
- Archive/bulk `hasPermission('projects:delete')` (if present) → `hasPermission('project:delete')`.

- [ ] **Step 5: Update `documents-tab.jsx`, `prep-actions-tab.jsx`, `schedule-tab.jsx`**

- `documents-tab.jsx`: `canWrite = hasPermission('projects:write')` → `hasPermission('project:documents:write')`; any delete gate → `project:documents:delete`; any generate gate → `project:documents:create`.
- `prep-actions-tab.jsx`: add/edit/delete gates → `project:prep-actions:manage`.
- `schedule-tab.jsx`: add/edit/delete/send-confirmation gates → `project:schedule:manage`.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/permission-gates.test.jsx`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add client/src/modules/pm
git commit -m "feat(pm): swap client permission gates to fine-grained strings"
```

---

## Task 4: Fix cursor-pagination field-name mismatch

**Files:**
- Modify: `client/src/modules/crm/hooks/use-cursor-list.js:49-50`
- Test: `client/src/modules/crm/hooks/__tests__/use-cursor-list.test.jsx`

The server returns `pagination.{ hasNext, nextCursor }` (`server/src/shared/utils/pagination.js:83-98`), but the hook reads `pagination.{ cursor, hasMore }` — so the Next button is always dead. This hook is shared by CRM and PM; fixing it fixes both.

- [ ] **Step 1: Write the failing test**

Create `client/src/modules/crm/hooks/__tests__/use-cursor-list.test.jsx`:

```jsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi } from 'vitest';
import { useCursorList } from '../use-cursor-list.js';

function wrapper({ children }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

it('reads hasNext/nextCursor from the server pagination shape', async () => {
  const queryFn = vi.fn().mockResolvedValue({
    data: [{ _id: '1' }],
    pagination: { hasNext: true, nextCursor: 'CURSOR2', limit: 25 },
  });
  const { result } = renderHook(
    () => useCursorList({ queryKey: (m) => ['t', m], queryFn }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.items.length).toBe(1));
  expect(result.current.hasNext).toBe(true);
  act(() => result.current.onNext());
  await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
  expect(queryFn.mock.calls[1][0].cursor).toBe('CURSOR2');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/modules/crm/hooks/__tests__/use-cursor-list.test.jsx`
Expected: FAIL — `hasNext` is false; second call never fires.

- [ ] **Step 3: Fix the field names**

In `client/src/modules/crm/hooks/use-cursor-list.js`, change lines 49-50:

```js
  const nextCursor = data?.pagination?.nextCursor || null;
  const hasMore = !!data?.pagination?.hasNext;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/modules/crm/hooks/__tests__/use-cursor-list.test.jsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/modules/crm/hooks/use-cursor-list.js client/src/modules/crm/hooks/__tests__/use-cursor-list.test.jsx
git commit -m "fix(pagination): read nextCursor/hasNext from server response shape"
```

---

## Task 5: Decouple soft-delete from forced ARCHIVED status

**Files:**
- Modify: `server/src/modules/pm/project.repository.js:122-128` (softDelete) and `:139-145` (bulkSoftDelete)
- Test: `server/tests/pm/soft-delete.test.js`

Currently `softDelete`/`bulkSoftDelete` force `status: 'ARCHIVED'`, conflating delete with archive and corrupting the original status so a future restore can't recover it. Soft-delete should set only `isDeleted`/`deletedAt` and preserve `status`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/pm/soft-delete.test.js`:

```js
import fs from 'node:fs';
import path from 'node:path';

it('softDelete no longer forces status ARCHIVED', () => {
  const src = fs.readFileSync(
    path.join(process.cwd(), 'src/modules/pm/project.repository.js'), 'utf8');
  // The soft-delete writes must not set status to ARCHIVED.
  const softDeleteRegion = src.slice(src.indexOf('async softDelete'), src.indexOf('async findByIds'));
  expect(softDeleteRegion).not.toContain("status: 'ARCHIVED'");
  expect(softDeleteRegion).toContain('isDeleted: true');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/pm/soft-delete.test.js`
Expected: FAIL — `status: 'ARCHIVED'` still present in the region.

- [ ] **Step 3: Edit `softDelete` and `bulkSoftDelete`**

`project.repository.js` — `softDelete` (lines 122-128):

```js
  async softDelete(id) {
    return Project.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { returnDocument: 'after' },
    );
  }
```

`bulkSoftDelete` (lines 139-145):

```js
  async bulkSoftDelete(ids) {
    const result = await Project.updateMany(
      { _id: { $in: ids }, isDeleted: false },
      { $set: { isDeleted: true, deletedAt: new Date() } },
    );
    return result.modifiedCount;
  }
```

> Note: `delete()` in `project.service.js` already guards that only DRAFT projects may be deleted (the archive path is `bulkDeactivate` which sets `status: 'ARCHIVED'` separately). Removing the forced ARCHIVED here does not affect the archive flow.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npm test -- tests/pm/soft-delete.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/pm/project.repository.js server/tests/pm/soft-delete.test.js
git commit -m "fix(pm): soft-delete preserves status instead of forcing ARCHIVED"
```

---

## Task 6: Wire status-change notifications + close the dead-letter

**Files:**
- Modify: `server/src/modules/pm/pm.events.js:36-54` (PROJECT_STATUS_CHANGED handler)
- Modify: `server/src/modules/pm/status.service.js:127-134` (remove dead auth-email enqueue)
- Modify: `server/src/jobs/authEmail.job.js` (default-case guard in the worker switch)
- Test: `server/tests/pm/status-notification.test.js`

The status service publishes `PROJECT_STATUS_CHANGED` (good) **and** enqueues a `send-status-notification` job onto the `auth-email` queue whose worker has no matching case → silently skipped. Fix: drive the notification from the event handler (mirroring the working `PREP_ACTION_OVERDUE` handler), remove the dead enqueue, and add a default-case guard so unknown job types log an error instead of skipping.

- [ ] **Step 1: Write the failing test**

Create `server/tests/pm/status-notification.test.js`:

```js
import { jest } from '@jest/globals';

// Mock the notification service and Project model used by the handler.
const createMock = jest.fn().mockResolvedValue({});
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({
  default: { create: createMock },
}));
jest.unstable_mockModule('../../src/modules/pm/project.model.js', () => ({
  default: {
    findById: () => ({
      select: () => ({
        lean: async () => ({
          _id: 'p1', projectManagerId: 'pm1', projectName: 'Test', teamMemberIds: ['t1'],
        }),
      }),
    }),
  },
}));

const eventBus = (await import('../../src/shared/events/EventBus.js')).default;
const EVENT_TYPES = (await import('../../src/shared/events/eventTypes.js')).default;
const { registerPmEvents } = await import('../../src/modules/pm/pm.events.js');

it('dispatches a notification on PROJECT_STATUS_CHANGED', async () => {
  registerPmEvents();
  eventBus.publish(EVENT_TYPES.PROJECT_STATUS_CHANGED, {
    projectId: 'p1', fromStatus: 'PLANNING', toStatus: 'IN_PROGRESS', changedBy: 'u1',
  }, { source: 'test' });
  await new Promise((r) => setTimeout(r, 50));
  expect(createMock).toHaveBeenCalled();
  const arg = createMock.mock.calls[0][0];
  expect(arg.type).toBe('project_status_changed');
  expect(arg.recipientIds).toContain('pm1');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/pm/status-notification.test.js`
Expected: FAIL — current handler only invalidates cache; `createMock` not called.

- [ ] **Step 3: Enhance the PROJECT_STATUS_CHANGED handler**

In `server/src/modules/pm/pm.events.js`, replace the `PROJECT_STATUS_CHANGED` handler body (lines 37-54) so it keeps the cache invalidation AND dispatches a notification:

```js
  eventBus.on(EVENT_TYPES.PROJECT_STATUS_CHANGED, async (event) => {
    try {
      await cacheManager.del('pm:dashboard:summary');
      await cacheManager.del('pm:dashboard:milestones');

      try {
        const { projectId, fromStatus, toStatus, changedBy } = event.payload;
        const Project = (await import('./project.model.js')).default;
        const project = await Project.findById(projectId)
          .select('projectName projectNumber projectManagerId teamMemberIds')
          .lean();

        const recipientIds = [];
        if (project?.projectManagerId) recipientIds.push(String(project.projectManagerId));
        for (const m of project?.teamMemberIds || []) {
          if (String(m) !== String(changedBy)) recipientIds.push(String(m));
        }
        const unique = [...new Set(recipientIds)].filter((id) => String(id) !== String(changedBy));

        if (unique.length > 0) {
          const notificationService = (await import('../notifications/notification.service.js')).default;
          await notificationService.create({
            channels: ['IN_APP', 'EMAIL'],
            recipientIds: unique,
            type: 'project_status_changed',
            category: 'PROJECT',
            priority: 'NORMAL',
            payload: {
              projectId,
              projectName: project?.projectName,
              projectNumber: project?.projectNumber,
              fromStatus,
              toStatus,
            },
            sourceModule: 'pm',
            sourceEvent: 'PROJECT_STATUS_CHANGED',
            sourceEntityType: 'Project',
            sourceEntityId: projectId,
          }, null);
        }
      } catch (notifErr) {
        logger.error('Failed to dispatch status-change notification', {
          module: 'pm', action: 'event.project_status_changed.notify',
          error: { message: notifErr.message },
        });
      }

      logger.info('PM dashboard caches invalidated after project status change', {
        module: 'pm', action: 'event.project_status_changed',
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle PROJECT_STATUS_CHANGED event in PM', {
        module: 'pm', action: 'event.project_status_changed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });
```

> If `project.model.js` has no `teamMemberIds` field, the spread over `[]` is a no-op and only the PM is notified — verify the field name against the model; if the team field is named differently (e.g. `teamIds`), use that name.

- [ ] **Step 4: Remove the dead enqueue in `status.service.js`**

Delete lines 127-134 (the `// Enqueue status notification email` block calling `queueManager.addJob('auth-email', 'send-status-notification', …)`). If `queueManager` is now unused in the file, remove its import too.

- [ ] **Step 5: Add a default-case guard to the auth-email worker**

In `server/src/jobs/authEmail.job.js`, find the `switch` over job type (around lines 95-125). Ensure the `default` branch logs an **error** (not info) and throws so the job is visibly failed rather than silently skipped:

```js
      default:
        logger.error('Unknown auth-email job type — refusing to skip silently', {
          module: 'jobs', action: 'authEmail.process', jobType: job.name,
        });
        throw new Error(`Unhandled auth-email job type: ${job.name}`);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- tests/pm/status-notification.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/pm/pm.events.js server/src/modules/pm/status.service.js server/src/jobs/authEmail.job.js server/tests/pm/status-notification.test.js
git commit -m "fix(pm): deliver status-change notifications and fail unknown jobs loudly"
```

---

## Task 7: Add the missing document template types

**Files:**
- Modify: `server/src/modules/doctpl/documentTemplate.model.js:3-12` (TEMPLATE_TYPES)
- Modify: `server/src/modules/doctpl/documentGeneration.service.js:101-110` (_buildFilename typeMap)
- Modify: `server/src/seed/doctplSeed.js` (seed records for the 4 new types)
- Test: `server/tests/doctpl/template-types.test.js`

Adds `appointment_confirmation`, `status_report`, `completion_certificate`, `project_schedule` — required by PROJ-004 AC-7 and PROJ-005 AC-3. Without these in the enum, generation throws `NotFoundError`.

- [ ] **Step 1: Write the failing test**

Create `server/tests/doctpl/template-types.test.js`:

```js
import { TEMPLATE_TYPES } from '../../src/modules/doctpl/documentTemplate.model.js';

const REQUIRED = ['appointment_confirmation', 'status_report', 'completion_certificate', 'project_schedule'];

it('TEMPLATE_TYPES includes the PM template types', () => {
  for (const t of REQUIRED) expect(TEMPLATE_TYPES).toContain(t);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npm test -- tests/doctpl/template-types.test.js`
Expected: FAIL — types missing.

- [ ] **Step 3: Extend the enum**

In `documentTemplate.model.js`, replace lines 3-12 with:

```js
export const TEMPLATE_TYPES = [
  'quotation',
  'order_confirmation',
  'invoice_standard',
  'invoice_advance',
  'invoice_final',
  'cover_letter',
  'service_report',
  'inspection_certificate',
  'appointment_confirmation',
  'status_report',
  'completion_certificate',
  'project_schedule',
];
```

- [ ] **Step 4: Extend `_buildFilename` typeMap**

In `documentGeneration.service.js`, add to the `typeMap` (after `inspection_certificate` on line 109):

```js
      appointment_confirmation: 'Terminbestaetigung',
      status_report: 'Statusbericht',
      completion_certificate: 'Fertigstellungsbescheinigung',
      project_schedule: 'Bauzeitenplan',
```

- [ ] **Step 5: Seed template records**

In `server/src/seed/doctplSeed.js`, find the array of seeded template definitions (the one provisioning the 8 existing `templateType` records). Add four entries following the exact shape of an existing entry (copy the structure of the `service_report` entry and change `templateType`, `name`, and a minimal `sections` set). For each new type add:

```js
  { templateType: 'appointment_confirmation', name: 'Terminbestätigung', language: 'de', isActive: true, sections: [{ id: 'header', name: 'Header', type: 'header', position: 0 }, { id: 'body', name: 'Body', type: 'body', position: 1 }, { id: 'footer', name: 'Footer', type: 'footer', position: 2 }] },
  { templateType: 'status_report', name: 'Statusbericht', language: 'de', isActive: true, sections: [{ id: 'header', name: 'Header', type: 'header', position: 0 }, { id: 'body', name: 'Body', type: 'body', position: 1 }, { id: 'footer', name: 'Footer', type: 'footer', position: 2 }] },
  { templateType: 'completion_certificate', name: 'Fertigstellungsbescheinigung', language: 'de', isActive: true, sections: [{ id: 'header', name: 'Header', type: 'header', position: 0 }, { id: 'body', name: 'Body', type: 'body', position: 1 }, { id: 'footer', name: 'Footer', type: 'footer', position: 2 }] },
  { templateType: 'project_schedule', name: 'Bauzeitenplan', language: 'de', isActive: true, sections: [{ id: 'header', name: 'Header', type: 'header', position: 0 }, { id: 'table', name: 'Schedule', type: 'table', position: 1 }, { id: 'footer', name: 'Footer', type: 'footer', position: 2 }] },
```

> Match the exact required fields of the seed's template shape (read one existing entry first). If the seed builds records via a helper, call that helper with these values instead of inlining.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npm test -- tests/doctpl/template-types.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/doctpl/documentTemplate.model.js server/src/modules/doctpl/documentGeneration.service.js server/src/seed/doctplSeed.js server/tests/doctpl/template-types.test.js
git commit -m "feat(doctpl): add appointment/status/completion/schedule template types"
```

---

## Task 8: Phase 0 verification

- [ ] **Step 1: Run the full PM + doctpl test suites**

Run: `cd server && npm test -- tests/pm tests/doctpl`
Expected: all green.

- [ ] **Step 2: Run the seed against a dev DB and confirm permissions land**

Run: `cd server && node src/seed/reseed.js` (or the project's documented seed command)
Expected: log shows the new `project:*` permissions synced and Projektleiter/User updated.

- [ ] **Step 3: Smoke-test an existing privileged user**

Confirm a Projektleiter and an Admin can still list/create projects (no lockout) and that a fresh User can read but not create. Document the result in the phase checkpoint notes.

- [ ] **Step 4: Client lint/build**

Run: `cd client && npm run lint` (fix any new warnings introduced in PM files).

---

## Self-review notes

- **Spec coverage (Phase 0 scope):** fine-grained permissions (Tasks 1-3) ✔; notification backbone + dead-letter guard (Task 6) ✔; template catalog (Task 7) ✔; pagination fix (Task 4) ✔; soft-delete/archive decouple (Task 5) ✔. The `includeDeleted`/date-range server support flagged in the spec is **already present** (validation + repository) — no task needed; the client UI for it is Phase 1.
- **Lockout risk** mitigated: old `projects:*` keys remain defined and granted; new keys are additive; seed runs on startup and invalidates the permission cache; Admin bypasses checks. Task 8 Step 3 explicitly smoke-tests for lockout.
- **No placeholders:** every code step shows real code. Two steps (Task 6 Step 3 team-field name, Task 7 Step 5 seed shape) include an explicit "verify against the model/seed" instruction because the exact field/shape must be confirmed in the live file before writing — the worker reads one existing entry and matches it.
