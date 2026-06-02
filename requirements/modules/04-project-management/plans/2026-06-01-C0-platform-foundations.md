# C0: platform-foundations Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Establish the five cross-cutting primitives (fine-grained permissions, notification fan-out, document template types, cursor-pagination field reconciliation, and soft-delete/archive decoupling) that every later cluster depends on without locking out any existing user.

**Architecture:** Server changes follow the layered pattern `constants → seed → route-guards → controller`; permission additions are atomic with role migration in `seed.js` so existing roles are never locked out between deploy steps. Client changes update the shared `permissions.ts` constant file and every `hasPermission`/`PermissionGate` call site in the PM module. The notification fan-out subscribes to `PROJECT_STATUS_CHANGED` / `PROJECT_STATUS_OVERRIDDEN` events already published by `status.service.js` and resolves the full project team from `project.projectManagerId` before calling `notificationService.create`.

**Tech Stack:** Node/Express/Mongoose/Joi/Jest + Next.js/React Query/shadcn-ui/Vitest

---

## Pre-flight checklist (read before touching code)

- Read `client/AGENTS.md` — this is a customised Next.js; check `node_modules/next/dist/docs/` before writing any client code.
- Run `cd server && npm test` once to confirm green baseline before T1.
- Run `cd client && npx vitest run` once to confirm green baseline before T4.

---

## Task T1 — Fine-grained PM permission constants (server)

### What and why

`server/src/shared/constants/roles.js` currently exports only `PROJECTS_READ / WRITE / DELETE / ADMIN` (lines 39-42). Every PM route and the status-override gate checks coarse strings. We add 12 fine-grained slugs as new constants **without removing** the coarse ones so nothing breaks during the atomic seed step in T2.

### T1-A: Write the failing test

Create file `server/tests/unit/pm.permissions.test.js`:

```js
import { PERMISSIONS } from '../../src/shared/constants/roles.js';

describe('PM fine-grained permission constants', () => {
  const REQUIRED = [
    'project:create',
    'project:edit',
    'project:read',
    'project:delete',
    'project:status:update',
    'project:status:override',
    'project:prep-actions:manage',
    'project:schedule:manage',
    'project:documents:read',
    'project:documents:write',
    'project:documents:create',
    'project:documents:delete',
  ];

  test.each(REQUIRED)('PERMISSIONS object contains "%s"', (slug) => {
    const values = Object.values(PERMISSIONS);
    expect(values).toContain(slug);
  });
});
```

Run: `cd server && npm test -- tests/unit/pm.permissions.test.js`
Expected: 12 failing tests ("received array does not contain value").

### T1-B: Implement

Edit `server/src/shared/constants/roles.js`. After the existing `PROJECTS_ADMIN` line (line 42), add:

```js
  // Projects — fine-grained (Phase C0)
  PROJECT_CREATE: 'project:create',
  PROJECT_EDIT: 'project:edit',
  PROJECT_READ: 'project:read',
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

Run: `cd server && npm test -- tests/unit/pm.permissions.test.js`
Expected: 12 passing.

### T1 commit

```
git add server/src/shared/constants/roles.js server/tests/unit/pm.permissions.test.js
git commit -m "feat(C0-T1): add fine-grained project:* permission constants"
```

---

## Task T2 — Seed fine-grained permissions onto existing roles (server, atomic)

### What and why

`server/src/seed/seed.js` is the single source of truth for `PERMISSION_DEFINITIONS` and `ROLE_DEFINITIONS`. We must add the 12 new permission definitions **and** add them to the relevant roles in the same file so that the upsert loop in `seedDatabase()` creates them and `$addToSet` hands them to existing roles. This is the "atomic change" the design spec requires — no live user loses access between a partial deploy.

Role mapping to implement:
- **Admin** — already gets `*`; no explicit entry needed.
- **Projektleiter** — receives all 12 new slugs (manages everything).
- **Techniker** — receives `project:read`, `project:documents:read` (field view).
- **Disponent** — receives `project:read`, `project:schedule:manage`, `project:documents:read`.
- **Buchhalter** — receives `project:read`, `project:documents:read`.
- **Lehrling** — receives `project:read`.
- **User** — receives `project:read`.

### T2-A: Write the failing test

Create file `server/tests/unit/pm.seed.permissions.test.js`:

```js
import { PERMISSION_DEFINITIONS, ROLE_DEFINITIONS } from '../../src/seed/seed.js';

describe('seed.js fine-grained PM permissions', () => {
  const FINE_GRAINED = [
    'project:create',
    'project:edit',
    'project:read',
    'project:delete',
    'project:status:update',
    'project:status:override',
    'project:prep-actions:manage',
    'project:schedule:manage',
    'project:documents:read',
    'project:documents:write',
    'project:documents:create',
    'project:documents:delete',
  ];

  test.each(FINE_GRAINED)('PERMISSION_DEFINITIONS contains %s', (key) => {
    const keys = PERMISSION_DEFINITIONS.map((d) => `${d.module}:${d.action}`);
    expect(keys).toContain(key);
  });

  test('Projektleiter role has all 12 fine-grained PM keys', () => {
    const pl = ROLE_DEFINITIONS.find((r) => r.name === 'Projektleiter');
    for (const key of FINE_GRAINED) {
      expect(pl.permissionKeys).toContain(key);
    }
  });

  test('Techniker role has project:read and project:documents:read', () => {
    const tech = ROLE_DEFINITIONS.find((r) => r.name === 'Techniker');
    expect(tech.permissionKeys).toContain('project:read');
    expect(tech.permissionKeys).toContain('project:documents:read');
  });

  test('User role has project:read', () => {
    const user = ROLE_DEFINITIONS.find((r) => r.name === 'User');
    expect(user.permissionKeys).toContain('project:read');
  });
});
```

Run: `cd server && npm test -- tests/unit/pm.seed.permissions.test.js`
Expected: failures (definitions not yet present).

### T2-B: Implement — add to PERMISSION_DEFINITIONS in seed.js

In `server/src/seed/seed.js`, inside the `PERMISSION_DEFINITIONS` array, append after the existing `projects` block (after `{ module: 'projects', action: 'admin', ... }`):

```js
  // Projects — fine-grained (Phase C0)
  { module: 'project', action: 'create',              description: 'Create new projects' },
  { module: 'project', action: 'edit',                description: 'Edit project details' },
  { module: 'project', action: 'read',                description: 'View project details' },
  { module: 'project', action: 'delete',              description: 'Delete / soft-delete projects' },
  { module: 'project', action: 'status:update',       description: 'Transition project status through allowed flow' },
  { module: 'project', action: 'status:override',     description: 'Override project status transition rules' },
  { module: 'project', action: 'prep-actions:manage', description: 'Create, update, and delete preparatory actions' },
  { module: 'project', action: 'schedule:manage',     description: 'Create, update, and delete schedule entries' },
  { module: 'project', action: 'documents:read',      description: 'View project documents' },
  { module: 'project', action: 'documents:write',     description: 'Upload and update project documents' },
  { module: 'project', action: 'documents:create',    description: 'Generate project documents from templates' },
  { module: 'project', action: 'documents:delete',    description: 'Delete project documents' },
```

### T2-C: Implement — add to ROLE_DEFINITIONS in seed.js

Locate `Projektleiter` permissionKeys array in `ROLE_DEFINITIONS` and add after `'projects:admin'`:

```js
      'project:create', 'project:edit', 'project:read', 'project:delete',
      'project:status:update', 'project:status:override',
      'project:prep-actions:manage', 'project:schedule:manage',
      'project:documents:read', 'project:documents:write',
      'project:documents:create', 'project:documents:delete',
```

Locate `Techniker` permissionKeys and add:

```js
      'project:read', 'project:documents:read',
```

Locate `Disponent` permissionKeys and add:

```js
      'project:read', 'project:schedule:manage', 'project:documents:read',
```

Locate `Buchhalter` permissionKeys and add:

```js
      'project:read', 'project:documents:read',
```

Locate `Lehrling` permissionKeys and add:

```js
      'project:read',
```

Locate `User` permissionKeys and add (replace the existing `'projects:read'` entry — keep the old one too so the coarse guard still works):

```js
      'project:read',
```

Run: `cd server && npm test -- tests/unit/pm.seed.permissions.test.js`
Expected: all passing.

### T2 commit

```
git add server/src/seed/seed.js server/tests/unit/pm.seed.permissions.test.js
git commit -m "feat(C0-T2): seed fine-grained project:* permissions onto all roles atomically"
```

---

## Task T3 — Swap PM route guards to fine-grained slugs (server)

### What and why

`server/src/modules/pm/project.routes.js` and `server/src/modules/pm/pm.routes.js` still use coarse `projects:read/write/delete/admin`. We swap each guard to the matching fine-grained slug. The coarse slugs remain in the constants file and in the DB; no existing token breaks because `$addToSet` in T2 already granted the new slugs.

`status.controller.js` checks `'projects:admin'` for the override gate (line 44). We swap that to `'project:status:override'`.

### T3-A: Write the failing test

Create file `server/tests/unit/pm.routes.guards.test.js`:

```js
/**
 * Smoke-tests that route guard strings in pm route files match fine-grained slugs.
 * We read the source files as text and assert the expected requirePermission calls.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(process.cwd(), 'src');

function readRoute(rel) {
  return readFileSync(resolve(ROOT, rel), 'utf-8');
}

describe('project.routes.js uses fine-grained guards', () => {
  let src;
  beforeAll(() => { src = readRoute('modules/pm/project.routes.js'); });

  test('GET / uses project:read',         () => expect(src).toContain("requirePermission('project:read')"));
  test('POST / uses project:create',      () => expect(src).toContain("requirePermission('project:create')"));
  test('PATCH /:id uses project:edit',    () => expect(src).toContain("requirePermission('project:edit')"));
  test('DELETE /:id uses project:delete', () => expect(src).toContain("requirePermission('project:delete')"));
  test('POST /from-template uses project:create', () => {
    // from-template creates a project — reuses project:create guard
    const lines = src.split('\n');
    const line = lines.find((l) => l.includes("'/from-template'"));
    expect(line).toBeDefined();
    // The requirePermission call should appear within 2 lines of the route line
    const idx = lines.indexOf(line);
    const nearby = lines.slice(idx, idx + 3).join(' ');
    expect(nearby).toContain("requirePermission('project:create')");
  });
  test('GET /dashboard/* uses project:read', () => {
    const matches = src.match(/requirePermission\('project:read'\)/g);
    expect(matches?.length).toBeGreaterThanOrEqual(2);
  });
});

describe('pm.routes.js uses fine-grained guards', () => {
  let src;
  beforeAll(() => { src = readRoute('modules/pm/pm.routes.js'); });

  test('POST /status uses project:status:update',        () => expect(src).toContain("requirePermission('project:status:update')"));
  test('GET /status/history uses project:read',          () => expect(src).toContain("requirePermission('project:read')"));
  test('prep-actions GET uses project:read',             () => expect(src).toContain("requirePermission('project:read')"));
  test('prep-actions POST uses project:prep-actions:manage', () => expect(src).toContain("requirePermission('project:prep-actions:manage')"));
  test('schedule GET uses project:read',                 () => expect(src).toContain("requirePermission('project:read')"));
  test('schedule POST entries uses project:schedule:manage', () => expect(src).toContain("requirePermission('project:schedule:manage')"));
  test('documents GET uses project:documents:read',      () => expect(src).toContain("requirePermission('project:documents:read')"));
  test('documents POST uses project:documents:write',    () => expect(src).toContain("requirePermission('project:documents:write')"));
  test('documents POST /generate uses project:documents:create', () => expect(src).toContain("requirePermission('project:documents:create')"));
  test('documents DELETE uses project:documents:delete', () => expect(src).toContain("requirePermission('project:documents:delete')"));
});

describe('status.controller.js uses project:status:override', () => {
  let src;
  beforeAll(() => { src = readRoute('modules/pm/status.controller.js'); });

  test('override check uses project:status:override not projects:admin', () => {
    expect(src).toContain("'project:status:override'");
    expect(src).not.toContain("'projects:admin'");
  });
});
```

Run: `cd server && npm test -- tests/unit/pm.routes.guards.test.js`
Expected: all failures (routes still use coarse strings).

### T3-B: Implement — project.routes.js

Edit `server/src/modules/pm/project.routes.js`. Replace each `requirePermission(...)` call as follows (exact line-by-line):

| Route | Old guard | New guard |
|---|---|---|
| `GET /dashboard/summary` | `'projects:read'` | `'project:read'` |
| `GET /dashboard/milestones` | `'projects:read'` | `'project:read'` |
| `GET /export` | `'projects:read'` | `'project:read'` |
| `POST /from-template` | `'projects:write'` | `'project:create'` |
| `GET /search` | `'projects:read'` | `'project:read'` |
| `PATCH /bulk-update` | `'projects:admin'` | `'project:edit'` |
| `POST /bulk-delete` | `'projects:admin'` | `'project:delete'` |
| `GET /` | `'projects:read'` | `'project:read'` |
| `POST /` | `'projects:write'` | `'project:create'` |
| `GET /:id` | `'projects:read'` | `'project:read'` |
| `PATCH /:id` | `'projects:write'` | `'project:edit'` |
| `DELETE /:id` | `'projects:delete'` | `'project:delete'` |
| `POST /:id/duplicate` | `'projects:write'` | `'project:create'` |

### T3-C: Implement — pm.routes.js

Edit `server/src/modules/pm/pm.routes.js`. Replace each `requirePermission(...)` call:

| Route | Old guard | New guard |
|---|---|---|
| `POST /projects/:id/status` | `'projects:write'` | `'project:status:update'` |
| `GET /projects/:id/status/history` | `'projects:read'` | `'project:read'` |
| `GET /prep-actions/` | `'projects:read'` | `'project:read'` |
| `POST /prep-actions/` | `'projects:write'` | `'project:prep-actions:manage'` |
| `GET /prep-actions/:actionId` | `'projects:read'` | `'project:read'` |
| `PATCH /prep-actions/:actionId` | `'projects:write'` | `'project:prep-actions:manage'` |
| `DELETE /prep-actions/:actionId` | `'projects:delete'` | `'project:prep-actions:manage'` |
| `GET /prep-actions/:actionId/attachments` | `'projects:read'` | `'project:read'` |
| `POST /prep-actions/:actionId/attachments` | `'projects:write'` | `'project:prep-actions:manage'` |
| `GET /prep-actions/:actionId/attachments/:fileId/download` | `'projects:read'` | `'project:read'` |
| `GET /prep-actions/:actionId/history` | `'projects:read'` | `'project:read'` |
| `GET /schedule/` | `'projects:read'` | `'project:read'` |
| `GET /schedule/export` | `'projects:read'` | `'project:read'` |
| `POST /schedule/entries` | `'projects:write'` | `'project:schedule:manage'` |
| `PATCH /schedule/entries/:entryId` | `'projects:write'` | `'project:schedule:manage'` |
| `DELETE /schedule/entries/:entryId` | `'projects:delete'` | `'project:schedule:manage'` |
| `POST /schedule/entries/:entryId/confirmations` | `'projects:write'` | `'project:schedule:manage'` |
| `PATCH /schedule/entries/:entryId/confirmations/:confId` | `'projects:write'` | `'project:schedule:manage'` |
| `GET /documents/` | `'projects:read'` | `'project:documents:read'` |
| `POST /documents/` | `'projects:write'` | `'project:documents:write'` |
| `POST /documents/generate` | `'projects:write'` | `'project:documents:create'` |
| `GET /documents/:docId` | `'projects:read'` | `'project:documents:read'` |
| `GET /documents/:docId/download` | `'projects:read'` | `'project:documents:read'` |
| `PATCH /documents/:docId` | `'projects:write'` | `'project:documents:write'` |
| `POST /documents/:docId/restore` | `'projects:write'` | `'project:documents:write'` |
| `DELETE /documents/:docId` | `'projects:delete'` | `'project:documents:delete'` |

### T3-D: Implement — status.controller.js override gate

In `server/src/modules/pm/status.controller.js`, the `_hasOverridePermission` method checks `'projects:admin'` on line 44. Change that string to `'project:status:override'`:

```js
// Before:
return populated.role.permissions.some(
  (p) => `${p.module}:${p.action}` === 'projects:admin',
);

// After:
return populated.role.permissions.some(
  (p) => `${p.module}:${p.action}` === 'project:status:override',
);
```

Run: `cd server && npm test -- tests/unit/pm.routes.guards.test.js`
Expected: all passing.

Also run full suite to confirm no regressions: `cd server && npm test`

### T3 commit

```
git add server/src/modules/pm/project.routes.js server/src/modules/pm/pm.routes.js server/src/modules/pm/status.controller.js server/tests/unit/pm.routes.guards.test.js
git commit -m "feat(C0-T3): swap PM route guards to fine-grained project:* slugs"
```

---

## Task T4 — Fine-grained PM permission constants (client)

### What and why

`client/src/shared/constants/permissions.ts` has only coarse `PROJECTS_READ / WRITE / DELETE` (lines 36-38). `project-detail.jsx` line 77-79 checks `hasPermission('projects:write')` and `hasPermission('projects:admin')`. We add all 12 fine-grained keys and update every PM component call site.

Read `client/AGENTS.md` and `node_modules/next/dist/docs/` before touching any client code.

### T4-A: Write the failing test

Create `client/src/modules/pm/components/__tests__/pm-permissions.test.ts`:

```ts
import { PERMISSIONS } from '@/shared/constants/permissions';

const REQUIRED_PM = [
  'project:create',
  'project:edit',
  'project:read',
  'project:delete',
  'project:status:update',
  'project:status:override',
  'project:prep-actions:manage',
  'project:schedule:manage',
  'project:documents:read',
  'project:documents:write',
  'project:documents:create',
  'project:documents:delete',
] as const;

describe('client PERMISSIONS — fine-grained PM slugs', () => {
  const values = Object.values(PERMISSIONS);

  test.each(REQUIRED_PM)('contains "%s"', (slug) => {
    expect(values).toContain(slug);
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/pm-permissions.test.ts`
Expected: 12 failures.

### T4-B: Implement — permissions.ts

Edit `client/src/shared/constants/permissions.ts`. After the existing `PROJECTS_DELETE` line (line 38), add:

```ts
  // Projects — fine-grained (Phase C0)
  PROJECT_CREATE: 'project:create',
  PROJECT_EDIT: 'project:edit',
  PROJECT_READ: 'project:read',
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

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/pm-permissions.test.ts`
Expected: all passing.

### T4-C: Implement — update PM component call sites

The following components use coarse `hasPermission` / `PermissionGate` strings that must be updated:

**`client/src/modules/pm/components/project-detail.jsx`** (lines 77-79):

```jsx
// Before:
const canWrite = hasPermission('projects:write');
const canDelete = hasPermission('projects:delete');
const canOverride = hasPermission('projects:admin');

// After:
const canWrite = hasPermission('project:edit');
const canDelete = hasPermission('project:delete');
const canOverride = hasPermission('project:status:override');
```

**`client/src/modules/pm/components/projects-table.jsx`** — find all `hasPermission('projects:...')` calls and update:
- `hasPermission('projects:write')` → `hasPermission('project:create')` (for create/edit actions)
- `hasPermission('projects:delete')` → `hasPermission('project:delete')`
- `hasPermission('projects:admin')` → `hasPermission('project:status:override')` (bulk/admin actions may use `project:edit` or `project:delete` as appropriate; check surrounding context)

**`client/src/modules/pm/components/prep-actions-tab.jsx`** — replace:
- `hasPermission('projects:write')` → `hasPermission('project:prep-actions:manage')`
- `hasPermission('projects:delete')` → `hasPermission('project:prep-actions:manage')`

**`client/src/modules/pm/components/schedule-tab.jsx`** — replace:
- `hasPermission('projects:write')` → `hasPermission('project:schedule:manage')`
- `hasPermission('projects:delete')` → `hasPermission('project:schedule:manage')`

**`client/src/modules/pm/components/documents-tab.jsx`** — replace:
- `hasPermission('projects:read')` → `hasPermission('project:documents:read')`
- `hasPermission('projects:write')` → `hasPermission('project:documents:write')`
- `hasPermission('projects:delete')` → `hasPermission('project:documents:delete')`

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/pm-permissions.test.ts`
Expected: still passing.

### T4 commit

```
git add client/src/shared/constants/permissions.ts client/src/modules/pm/components/project-detail.jsx client/src/modules/pm/components/projects-table.jsx client/src/modules/pm/components/prep-actions-tab.jsx client/src/modules/pm/components/schedule-tab.jsx client/src/modules/pm/components/documents-tab.jsx client/src/modules/pm/components/__tests__/pm-permissions.test.ts
git commit -m "feat(C0-T4): add fine-grained project:* permission constants to client and update PM component gates"
```

---

## Task T5 — Notification fan-out for PROJECT_STATUS_CHANGED (server)

### What and why

`status.service.js` publishes `PROJECT_STATUS_CHANGED` and `PROJECT_STATUS_OVERRIDDEN` events (lines 113-125) and also enqueues a BullMQ job (lines 128-134) that only emails the project manager. `notifications.events.js` has no handler for either event, so the in-app notification channel is never written. The design spec (decision B) requires **always-on in-app notifications** for the full project team plus email when SMTP is configured.

The fix is in `notifications.events.js`: subscribe to both `PROJECT_STATUS_CHANGED` and `PROJECT_STATUS_OVERRIDDEN`, resolve all recipient user IDs from `project.projectManagerId` (and `project.createdBy` as the fallback team), exclude the actor, and call `dispatch` with channel `IN_APP` unconditionally and `EMAIL` only when `config.mail.host` is set.

The BullMQ email job in `status.service.js` already covers email delivery via `authEmail.job.js` (it already skips when PM === actor). We add the in-app fan-out independently so both can coexist without duplication — the in-app path uses `notificationService.create` and never touches the queue.

### T5-A: Write the failing test

Create `server/tests/unit/pm.notifications.fanout.test.js`:

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import eventBus from '../../src/shared/events/EventBus.js';
import EVENT_TYPES from '../../src/shared/events/eventTypes.js';

let Project, User, Role, Customer;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  // Register the notification events handler under test
  const { registerNotificationsEvents } = await import('../../src/modules/notifications/notifications.events.js');
  registerNotificationsEvents();

  Project  = mongoose.model('Project');
  User     = mongoose.model('User');
  Role     = mongoose.model('Role');
  Customer = mongoose.model('Customer');
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;
function uid() { return new mongoose.Types.ObjectId(); }

async function makeUser(suffix) {
  const role = await Role.create({ name: `R${++counter}`, permissions: [] });
  return User.create({
    email: `u${counter}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Test', lastName: suffix,
    role: role._id, status: 'active',
  });
}

async function makeProject(pmUser, creatorUser) {
  const customer = await (mongoose.model('Customer')).create({
    customerNumber: `K-${++counter}`,
    name: `Kunde ${counter}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: creatorUser._id,
  });
  return Project.create({
    projectNumber: `P-${counter}`,
    name: `Projekt ${counter}`,
    projectType: 'NEW_INSTALLATION',
    customerId: customer._id,
    projectManagerId: pmUser._id,
    createdBy: creatorUser._id,
    status: 'DRAFT',
  });
}

describe('PROJECT_STATUS_CHANGED fan-out', () => {
  test('dispatches in-app notification to PM when actor is different user', async () => {
    // Spy on notificationService.create to avoid DB writes for notifications
    const notifModule = await import('../../src/modules/notifications/notification.service.js');
    const createSpy = jest.spyOn(notifModule.default, 'create').mockResolvedValue({ _id: uid() });

    const pm = await makeUser('PM');
    const actor = await makeUser('Actor');
    const project = await makeProject(pm, actor);

    await eventBus.publishAndWait(EVENT_TYPES.PROJECT_STATUS_CHANGED, {
      projectId: project._id.toString(),
      fromStatus: 'DRAFT',
      toStatus: 'PLANNING',
      changedBy: actor._id.toString(),
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        channels: expect.arrayContaining(['IN_APP']),
        recipientIds: expect.arrayContaining([pm._id.toString()]),
        sourceEvent: 'PROJECT_STATUS_CHANGED',
      }),
      null,
      expect.any(Object),
    );

    createSpy.mockRestore();
  });

  test('does NOT dispatch when actor is the PM (self-change)', async () => {
    const notifModule = await import('../../src/modules/notifications/notification.service.js');
    const createSpy = jest.spyOn(notifModule.default, 'create').mockResolvedValue({ _id: uid() });

    const pm = await makeUser('PM2');
    const project = await makeProject(pm, pm);

    await eventBus.publishAndWait(EVENT_TYPES.PROJECT_STATUS_CHANGED, {
      projectId: project._id.toString(),
      fromStatus: 'DRAFT',
      toStatus: 'PLANNING',
      changedBy: pm._id.toString(),
    });

    // All recipients filtered out → create should not be called or recipientIds empty
    const calls = createSpy.mock.calls;
    const pmNotifCall = calls.find((c) =>
      c[0]?.sourceEvent === 'PROJECT_STATUS_CHANGED' &&
      (c[0]?.recipientIds || []).includes(pm._id.toString()),
    );
    expect(pmNotifCall).toBeUndefined();

    createSpy.mockRestore();
  });
});
```

> Note: this test requires `eventBus.publishAndWait` — check whether `EventBus` exposes this. If it only has `publish`, the test must await a short microtask flush using `await new Promise(process.nextTick)` after `eventBus.publish(...)` before asserting the spy.

Check `server/src/shared/events/EventBus.js` before finalising the test. If `publishAndWait` does not exist, replace with:

```js
eventBus.publish(EVENT_TYPES.PROJECT_STATUS_CHANGED, { ... });
await new Promise((r) => setTimeout(r, 50)); // let async handlers settle
```

Run: `cd server && npm test -- tests/unit/pm.notifications.fanout.test.js`
Expected: failures (no subscriber registered for PROJECT_STATUS_CHANGED in notifications.events.js).

### T5-B: Implement — add PM event handlers to notifications.events.js

In `server/src/modules/notifications/notifications.events.js`, inside `registerNotificationsEvents`, add after the last `eventBus.subscribe` block (before the final `logger.info`):

```js
  // --- PM Status Change Events ---
  eventBus.subscribe(EVENT_TYPES.PROJECT_STATUS_CHANGED, async (data) => {
    const payload = data.payload || data;
    if (!payload.projectId) return;

    // Resolve recipients: project manager + createdBy, excluding the actor
    let recipientIds = [];
    try {
      const Project = (await import('../pm/project.model.js')).default;
      const project = await Project.findById(payload.projectId)
        .select('projectManagerId createdBy')
        .lean();
      if (!project) return;

      const candidates = [
        project.projectManagerId?.toString(),
        project.createdBy?.toString(),
      ].filter(Boolean);

      recipientIds = [...new Set(candidates)].filter(
        (id) => id !== String(payload.changedBy),
      );
    } catch (err) {
      logger.error('Failed to resolve PM notification recipients', {
        module: 'notifications', action: 'project.status_changed', error: { message: err.message },
      });
      return;
    }

    if (recipientIds.length === 0) return;

    // Determine channels: IN_APP always; EMAIL only when SMTP is configured
    const config = (await import('../../config/index.js')).default;
    const channels = ['IN_APP'];
    if (config.mail?.host) channels.push('EMAIL');

    await dispatch(payload, {
      type: 'project_status_changed',
      category: 'PROJECT',
      priority: 'NORMAL',
      channels,
      recipientIds,
      payload: {
        projectId: payload.projectId,
        fromStatus: payload.fromStatus,
        toStatus: payload.toStatus,
        comment: payload.comment || '',
        isOverride: false,
      },
      sourceModule: 'pm',
      sourceEvent: 'PROJECT_STATUS_CHANGED',
      sourceEntityType: 'Project',
      sourceEntityId: payload.projectId,
      idempotencyKey: `project-status-${payload.projectId}-${payload.toStatus}-${Date.now()}`,
    });
  });

  eventBus.subscribe(EVENT_TYPES.PROJECT_STATUS_OVERRIDDEN, async (data) => {
    const payload = data.payload || data;
    if (!payload.projectId) return;

    let recipientIds = [];
    try {
      const Project = (await import('../pm/project.model.js')).default;
      const project = await Project.findById(payload.projectId)
        .select('projectManagerId createdBy')
        .lean();
      if (!project) return;

      const candidates = [
        project.projectManagerId?.toString(),
        project.createdBy?.toString(),
      ].filter(Boolean);

      recipientIds = [...new Set(candidates)].filter(
        (id) => id !== String(payload.changedBy),
      );
    } catch (err) {
      logger.error('Failed to resolve PM override notification recipients', {
        module: 'notifications', action: 'project.status_overridden', error: { message: err.message },
      });
      return;
    }

    if (recipientIds.length === 0) return;

    const config = (await import('../../config/index.js')).default;
    const channels = ['IN_APP'];
    if (config.mail?.host) channels.push('EMAIL');

    await dispatch(payload, {
      type: 'project_status_overridden',
      category: 'PROJECT',
      priority: 'HIGH',
      channels,
      recipientIds,
      payload: {
        projectId: payload.projectId,
        fromStatus: payload.fromStatus,
        toStatus: payload.toStatus,
        overrideReason: payload.overrideReason || '',
        isOverride: true,
      },
      sourceModule: 'pm',
      sourceEvent: 'PROJECT_STATUS_OVERRIDDEN',
      sourceEntityType: 'Project',
      sourceEntityId: payload.projectId,
      idempotencyKey: `project-status-override-${payload.projectId}-${payload.toStatus}-${Date.now()}`,
    });
  });
```

Also update the `logger.info` subscriber list at the bottom to include:
```
'PROJECT_STATUS_CHANGED', 'PROJECT_STATUS_OVERRIDDEN',
```

Run: `cd server && npm test -- tests/unit/pm.notifications.fanout.test.js`
Expected: all passing.

### T5 commit

```
git add server/src/modules/notifications/notifications.events.js server/tests/unit/pm.notifications.fanout.test.js
git commit -m "feat(C0-T5): fan-out in-app notifications on project status change to full team"
```

---

## Task T6 — Document template catalog: add PM template types (server)

### What and why

`server/src/modules/doctpl/documentTemplate.model.js` `TEMPLATE_TYPES` array (lines 3-12) has 8 types, none for PM. `documentGeneration.service.js` `_buildFilename` (lines 101-115) has no entries for the 4 new types. `server/src/seed/doctplSeed.js` seeds 8 records. We add `appointment_confirmation`, `status_report`, `completion_certificate`, and `project_schedule` to all three locations.

### T6-A: Write the failing test

Create `server/tests/unit/pm.doctpl.types.test.js`:

```js
import { TEMPLATE_TYPES } from '../../src/modules/doctpl/documentTemplate.model.js';

const PM_TYPES = [
  'appointment_confirmation',
  'status_report',
  'completion_certificate',
  'project_schedule',
];

describe('documentTemplate.model.js TEMPLATE_TYPES includes PM types', () => {
  test.each(PM_TYPES)('TEMPLATE_TYPES contains "%s"', (t) => {
    expect(TEMPLATE_TYPES).toContain(t);
  });
});

import documentGenerationService from '../../src/modules/doctpl/documentGeneration.service.js';

describe('documentGenerationService._buildFilename handles PM types', () => {
  const data = { documentNumber: 'DOC-001', customer: { name: 'Muster GmbH' } };

  test.each(PM_TYPES)('returns a non-empty string for type "%s"', (type) => {
    const name = documentGenerationService._buildFilename(type, data, 'de');
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
    expect(name).toMatch(/\.pdf$/);
    // Must not fall back to the raw type slug (which contains underscores but looks unformatted)
    expect(name).not.toMatch(/^appointment_confirmation/);
  });
});
```

Run: `cd server && npm test -- tests/unit/pm.doctpl.types.test.js`
Expected: 8 failures (4 TEMPLATE_TYPES + 4 filename).

### T6-B: Implement — documentTemplate.model.js

Edit `server/src/modules/doctpl/documentTemplate.model.js`. The `TEMPLATE_TYPES` export (lines 3-12) is a plain array. Append the four new values:

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
  // PM types added in Phase C0
  'appointment_confirmation',
  'status_report',
  'completion_certificate',
  'project_schedule',
];
```

### T6-C: Implement — documentGeneration.service.js _buildFilename

Edit `server/src/modules/doctpl/documentGeneration.service.js`. In `_buildFilename` (line 100), add four entries to `typeMap`:

```js
_buildFilename(templateType, data, language) {
  const typeMap = {
    quotation: 'Offerte',
    order_confirmation: 'Auftragsbestaetigung',
    invoice_standard: 'Rechnung',
    invoice_advance: 'Akontorechnung',
    invoice_final: 'Schlussrechnung',
    cover_letter: 'Begleitschreiben',
    service_report: 'Servicebericht',
    inspection_certificate: 'Inspektionszertifikat',
    // PM types
    appointment_confirmation: 'Terminbestaetigung',
    status_report: 'Statusbericht',
    completion_certificate: 'Abschlussprotokoll',
    project_schedule: 'Bauprogramm',
  };
  const typeName = typeMap[templateType] || templateType;
  const docNum = data.documentNumber || 'DRAFT';
  const custName = (data.customer?.name || '').replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const dateStr = new Date().toISOString().split('T')[0];
  return `${typeName}_${docNum}_${custName}_${dateStr}.pdf`;
}
```

### T6-D: Implement — doctplSeed.js

Edit `server/src/seed/doctplSeed.js`. The `PM_SECTIONS` helper uses only `header`, `body`, `footer` — identical to `LETTER_SECTIONS`. Add a helper for PM letter-style templates and append four entries to `TEMPLATES`:

```js
const PM_LETTER_SECTIONS = () => [
  { id: 'header', name: 'Header', type: 'header', position: 0,  isVisible: true, isConditional: false, config: {} },
  { id: 'body',   name: 'Body',   type: 'body',   position: 1,  isVisible: true, isConditional: false, config: {} },
  { id: 'footer', name: 'Footer', type: 'footer', position: 99, isVisible: true, isConditional: false, config: {} },
];

const PM_TABLE_SECTIONS = () => [
  { id: 'header', name: 'Header', type: 'header', position: 0,  isVisible: true, isConditional: false, config: {} },
  { id: 'body',   name: 'Body',   type: 'body',   position: 1,  isVisible: true, isConditional: false, config: {} },
  { id: 'table',  name: 'Entries', type: 'table', position: 2,  isVisible: true, isConditional: false, config: {} },
  { id: 'footer', name: 'Footer', type: 'footer', position: 99, isVisible: true, isConditional: false, config: {} },
];

const PM_SCHEDULE_COLUMNS = () => [
  { field: 'phase',       label: { de: 'Phase',    fr: 'Phase',    it: 'Fase',       en: 'Phase'      }, widthPercent: 20, alignment: 'left',  format: 'text' },
  { field: 'description', label: { de: 'Vorgang',  fr: 'Tâche',    it: 'Attività',   en: 'Task'       }, widthPercent: 35, alignment: 'left',  format: 'text' },
  { field: 'startDate',   label: { de: 'Von',      fr: 'Début',    it: 'Inizio',     en: 'Start'      }, widthPercent: 15, alignment: 'center',format: 'date' },
  { field: 'endDate',     label: { de: 'Bis',      fr: 'Fin',      it: 'Fine',       en: 'End'        }, widthPercent: 15, alignment: 'center',format: 'date' },
  { field: 'responsible', label: { de: 'Verantwortlich', fr: 'Responsable', it: 'Responsabile', en: 'Responsible' }, widthPercent: 15, alignment: 'left', format: 'text' },
];
```

Then in the `TEMPLATES` array, append:

```js
  { templateType: 'appointment_confirmation', name: 'Terminbestätigung',  sections: PM_LETTER_SECTIONS(),  tableColumns: [] },
  { templateType: 'status_report',            name: 'Statusbericht',       sections: PM_LETTER_SECTIONS(),  tableColumns: [] },
  { templateType: 'completion_certificate',   name: 'Abschlussprotokoll',  sections: PM_LETTER_SECTIONS(),  tableColumns: [] },
  { templateType: 'project_schedule',         name: 'Bauprogramm',         sections: PM_TABLE_SECTIONS(),   tableColumns: PM_SCHEDULE_COLUMNS() },
```

Run: `cd server && npm test -- tests/unit/pm.doctpl.types.test.js`
Expected: all passing.

### T6 commit

```
git add server/src/modules/doctpl/documentTemplate.model.js server/src/modules/doctpl/documentGeneration.service.js server/src/seed/doctplSeed.js server/tests/unit/pm.doctpl.types.test.js
git commit -m "feat(C0-T6): add PM document template types (appointment_confirmation, status_report, completion_certificate, project_schedule)"
```

---

## Task T7 — Cursor pagination field reconciliation (client)

### What and why

`client/src/modules/crm/hooks/use-cursor-list.js` reads `data?.pagination?.cursor` (line 49) and `data?.pagination?.hasMore` (line 50). The server `buildCursorResponse` in `server/src/shared/utils/pagination.js` returns `pagination.nextCursor` (not `cursor`) and `pagination.hasNext` (not `hasMore`). This mismatch means `onNext` always has `hasMore = false` and `nextCursor = null` so pagination never advances beyond page 1.

The fix is in `use-cursor-list.js` — change line 49 to read `data?.pagination?.nextCursor` and line 50 to read `!!data?.pagination?.hasNext`.

### T7-A: Write the failing test

Create `client/src/modules/pm/components/__tests__/use-cursor-list-fields.test.ts`:

```ts
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { useCursorList } from '@/modules/crm/hooks/use-cursor-list';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('useCursorList reads server field names', () => {
  test('hasNext is true when pagination.hasNext is true', async () => {
    const PAGE_1_RESPONSE = {
      data: [{ id: '1' }],
      pagination: { hasNext: true, nextCursor: 'abc123', limit: 25 },
    };

    const { result } = renderHook(
      () => useCursorList({
        queryKey: (p: object) => ['test', p],
        queryFn: async () => PAGE_1_RESPONSE,
        params: {},
        initialSize: 25,
      }),
      { wrapper },
    );

    // Wait for data to load
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(result.current.hasNext).toBe(true);
  });

  test('onNext pushes nextCursor onto stack', async () => {
    const PAGE_1_RESPONSE = {
      data: [{ id: '1' }],
      pagination: { hasNext: true, nextCursor: 'cursor-page-2', limit: 25 },
    };

    let calledWithCursor: string | undefined;
    const { result } = renderHook(
      () => useCursorList({
        queryKey: (p: { cursor?: string }) => { calledWithCursor = p.cursor; return ['test2', p]; },
        queryFn: async () => PAGE_1_RESPONSE,
        params: {},
        initialSize: 25,
      }),
      { wrapper },
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
      result.current.onNext();
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(calledWithCursor).toBe('cursor-page-2');
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/use-cursor-list-fields.test.ts`
Expected: failures (`hasNext` is false because hook reads wrong field).

### T7-B: Implement

Edit `client/src/modules/crm/hooks/use-cursor-list.js`. Lines 49-50:

```js
// Before:
const nextCursor = data?.pagination?.cursor || null;
const hasMore = !!data?.pagination?.hasMore;

// After:
const nextCursor = data?.pagination?.nextCursor || null;
const hasMore = !!data?.pagination?.hasNext;
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/use-cursor-list-fields.test.ts`
Expected: all passing.

### T7 commit

```
git add client/src/modules/crm/hooks/use-cursor-list.js client/src/modules/pm/components/__tests__/use-cursor-list-fields.test.ts
git commit -m "fix(C0-T7): reconcile useCursorList to read server pagination fields nextCursor/hasNext"
```

---

## Task T8 — Soft-delete / archive decoupling (server)

### What and why

`project.repository.js` `softDelete` (line 122-128) sets `status: 'ARCHIVED'` in the same update that sets `isDeleted: true`. Same for `bulkSoftDelete` (line 139-144). According to PROJ-001 AC-6, deleting (soft-delete) a project must not force it into ARCHIVED status — status and soft-delete are independent concerns. A project can be soft-deleted while remaining in any status for audit purposes.

### T8-A: Write the failing test

Create `server/tests/unit/pm.softdelete.test.js`:

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import projectRepository from '../../src/modules/pm/project.repository.js';

let Project, User, Role, Customer;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  Project  = mongoose.model('Project');
  User     = mongoose.model('User');
  Role     = mongoose.model('Role');
  Customer = mongoose.model('Customer');
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let counter = 0;

async function seedProject(status = 'DRAFT') {
  const role = await Role.create({ name: `R${++counter}`, permissions: [] });
  const user = await User.create({
    email: `u${counter}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'A', lastName: 'B', role: role._id, status: 'active',
  });
  const customer = await Customer.create({
    customerNumber: `K-${50000 + counter}`,
    name: `Kunde ${counter}`, type: 'business',
    postalCode: '8001', city: 'Zürich', canton: 'ZH', createdBy: user._id,
  });
  return Project.create({
    projectNumber: `P-${50000 + counter}`,
    name: `Projekt ${counter}`,
    projectType: 'NEW_INSTALLATION',
    customerId: customer._id,
    projectManagerId: user._id,
    createdBy: user._id,
    status,
  });
}

describe('projectRepository.softDelete', () => {
  test('sets isDeleted=true but preserves the original status', async () => {
    const p = await seedProject('IN_PROGRESS');
    const deleted = await projectRepository.softDelete(p._id);
    expect(deleted.isDeleted).toBe(true);
    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect(deleted.status).toBe('IN_PROGRESS');  // must NOT be forced to ARCHIVED
  });

  test('soft-deleted DRAFT project keeps DRAFT status', async () => {
    const p = await seedProject('DRAFT');
    const deleted = await projectRepository.softDelete(p._id);
    expect(deleted.status).toBe('DRAFT');
  });
});

describe('projectRepository.bulkSoftDelete', () => {
  test('preserves status of all soft-deleted projects', async () => {
    const p1 = await seedProject('PLANNING');
    const p2 = await seedProject('IN_PROGRESS');
    await projectRepository.bulkSoftDelete([p1._id, p2._id]);
    const found1 = await Project.findById(p1._id).setOptions({ includeDeleted: true }).lean();
    const found2 = await Project.findById(p2._id).setOptions({ includeDeleted: true }).lean();
    expect(found1.isDeleted).toBe(true);
    expect(found1.status).toBe('PLANNING');
    expect(found2.isDeleted).toBe(true);
    expect(found2.status).toBe('IN_PROGRESS');
  });
});
```

Run: `cd server && npm test -- tests/unit/pm.softdelete.test.js`
Expected: 3 failures (status is forced to ARCHIVED by existing code).

### T8-B: Implement

Edit `server/src/modules/pm/project.repository.js`.

**`softDelete` method** (lines 122-128): remove `status: 'ARCHIVED'` from the update:

```js
async softDelete(id) {
  return Project.findByIdAndUpdate(
    id,
    { isDeleted: true, deletedAt: new Date() },
    { returnDocument: 'after' },
  );
}
```

**`bulkSoftDelete` method** (lines 139-144): remove `status: 'ARCHIVED'` from `$set`:

```js
async bulkSoftDelete(ids) {
  const result = await Project.updateMany(
    { _id: { $in: ids }, isDeleted: false },
    { $set: { isDeleted: true, deletedAt: new Date() } },
  );
  return result.modifiedCount;
}
```

Run: `cd server && npm test -- tests/unit/pm.softdelete.test.js`
Expected: all passing.

Run full suite to confirm no regressions: `cd server && npm test`

### T8 commit

```
git add server/src/modules/pm/project.repository.js server/tests/unit/pm.softdelete.test.js
git commit -m "fix(C0-T8): softDelete and bulkSoftDelete no longer force project status to ARCHIVED (PROJ-001 AC-6)"
```

---

## Final verification

After all 8 tasks are committed:

1. Run `cd server && npm test` — all suites including existing `pm.test.js`, `pm.projectDashboard.test.js`, and all 6 new C0 test files must pass.
2. Run `cd client && npx vitest run` — all suites including the 3 new C0 test files must pass.
3. Check `git log --oneline -10` — confirm 8 commits with `feat(C0-T*)` / `fix(C0-T*)` prefixes.
4. Confirm no existing PM route returns 403 for an Admin user by running the server in dev mode and hitting `GET /api/v1/pm/projects` with an Admin JWT — expect 200.

---

## ACs closed by this cluster

| AC | Requirement |
|----|-------------|
| PROJ-002 AC-5 | Override permission now uses `project:status:override` slug — gate works for Projektleiter and Admin |
| PROJ-002 AC-6 (partial) | In-app notifications now fan out to PM + createdBy on every status change |
| PROJ-004 AC-7 (unblocked) | `project_schedule` template type now exists in DB after seed |
| PROJ-005 AC-3 (unblocked) | `appointment_confirmation`, `status_report`, `completion_certificate`, `project_schedule` template types now in model + seed |
| PROJ-006 AC-7 (unblocked) | Fine-grained `project:documents:*` slugs exist in DB and client |
| PROJ-001 AC-6 | Soft-delete no longer forces ARCHIVED status |
| PROJ-007 pagination | `useCursorList` now reads `nextCursor`/`hasNext` — Next button works |
