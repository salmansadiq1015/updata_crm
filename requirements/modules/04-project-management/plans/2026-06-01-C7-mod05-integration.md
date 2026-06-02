# C7: mod05-integration Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Surface PM schedule entries with `responsibleType === 'INTERNAL_TEAM'` in the deploy/field-ops module by subscribing to `SCHEDULE_ENTRY_*` events in `deploy.events.js` and exposing a new `GET /api/v1/deploy/field-ops/schedule` endpoint backed by a focused service method that queries `ScheduleEntry` directly.

**Architecture:** The PM `schedule.service.js` already publishes `SCHEDULE_ENTRY_CREATED`, `SCHEDULE_ENTRY_UPDATED`, `SCHEDULE_ENTRY_DELETED`, and `SCHEDULE_ENTRIES_CASCADED` on the in-process `EventBus`. The deploy module registers handlers in `deploy.events.js`; three new handlers in that file will invalidate a new `deploy:field-ops:schedule:*` cache key family on every schedule mutation. A new `fieldOps.service.js` in the deploy module owns the query — it does a lazy import of `ScheduleEntry` (avoiding circular deps, matching the existing pattern in `dashboard.service.js`) and filters by `responsibleType: 'INTERNAL_TEAM'`. A new route (`field-ops.routes.js`) and controller (`fieldOps.controller.js`) expose this via `GET /api/v1/deploy/field-ops/schedule`, mounted in `deploy.routes.js`.

**Tech Stack:** Node/Express/Mongoose/Joi/Jest + Next.js/React Query/shadcn-ui/Vitest

---

## Pre-flight checklist (read before writing any code)

- [x] `server/src/modules/deploy/deploy.events.js` — existing handler structure confirmed (each handler wrapped in try/catch, uses `event.payload.*`, calls `cacheManager.invalidatePattern`).
- [x] `server/src/modules/pm/schedule.service.js` — confirms `eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_CREATED, { entryId, projectId, entryType, name, createdBy }, ...)`, `SCHEDULE_ENTRY_UPDATED`, `SCHEDULE_ENTRY_DELETED`, `SCHEDULE_ENTRIES_CASCADED`.
- [x] `server/src/shared/events/eventTypes.js` — confirms `SCHEDULE_ENTRY_CREATED = 'schedule_entry.created'`, `SCHEDULE_ENTRY_UPDATED = 'schedule_entry.updated'`, `SCHEDULE_ENTRY_DELETED = 'schedule_entry.deleted'`, `SCHEDULE_ENTRIES_CASCADED = 'schedule_entries.cascaded'`.
- [x] `server/src/modules/pm/scheduleEntry.model.js` — confirms field `responsibleType: { type: String, enum: ['INTERNAL_TEAM', 'PARTNER_COMPANY'], default: null }` and `projectId`, `name`, `entryType`, `startDate`, `endDate`, `milestoneDate`, `status`, `sortOrder`, `isDeleted`.
- [x] `server/src/modules/deploy/dashboard.service.js` — confirms lazy-import pattern (`const X = (await import('./x.js')).default`), `cacheManager.getOrSet(key, fn, TTL)`, `DASHBOARD_TTL = { l1Ttl: 15, l2Ttl: 30 }`.
- [x] `server/src/modules/deploy/dashboard.routes.js` — confirms `requirePermission('scheduling:read')`, `validate(schema)`, controller method call pattern.
- [x] `server/src/modules/deploy/deploy.routes.js` — confirms top-level sub-router mount pattern with try/catch lazy import.
- [x] `server/src/shared/events/EventBus.js` — `eventBus.on(type, handler)` receives full envelope `{ id, type, source, correlationId, timestamp, version, payload }`. `eventBus.subscribe()` is the safe wrapper (adds DLQ); `eventBus.on()` is used directly in `deploy.events.js` — use `eventBus.on()` to match existing style.
- [x] Test file conventions: `server/tests/unit/*.test.js` using `mongodb-memory-server`, `connectTestDb`/`clearTestDb`/`disconnectTestDb` from `server/tests/setup.js`.

---

## Task 1 — Add three event handlers to `deploy.events.js`

### 1.1 Write failing test

**File:** `server/tests/unit/deploy.fieldOpsEvents.test.js`

```js
import { jest } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

// We spy on cacheManager before importing deploy.events so the module picks up the spy.
const invalidatePatternMock = jest.fn().mockResolvedValue(undefined);

jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: { invalidatePattern: invalidatePatternMock },
}));

jest.unstable_mockModule('../../src/shared/logger/index.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), debug: jest.fn(), warn: jest.fn() },
}));

jest.unstable_mockModule('../../src/config/index.js', () => ({
  default: { redis: { keyPrefix: 'test:' } },
}));

let eventBus;
let EVENT_TYPES;

beforeAll(async () => {
  await connectTestDb();
  ({ default: eventBus } = await import('../../src/shared/events/EventBus.js'));
  ({ default: EVENT_TYPES } = await import('../../src/shared/events/eventTypes.js'));
  await import('../../src/modules/deploy/deploy.events.js').then(m => m.registerDeployEvents());
});

afterEach(async () => {
  await clearTestDb();
  invalidatePatternMock.mockClear();
});

afterAll(async () => {
  await disconnectTestDb();
});

describe('deploy.events — SCHEDULE_ENTRY_* handlers', () => {
  test('SCHEDULE_ENTRY_CREATED invalidates deploy:field-ops:schedule:* cache', async () => {
    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_CREATED, {
      entryId: 'eid1',
      projectId: 'pid1',
      entryType: 'PHASE',
      name: 'Rohbau',
      createdBy: 'uid1',
    }, { source: 'pm:schedule' });

    // Handlers are async; yield the microtask queue
    await new Promise(r => setImmediate(r));

    expect(invalidatePatternMock).toHaveBeenCalledWith(
      expect.stringContaining('deploy:field-ops:schedule:'),
    );
  });

  test('SCHEDULE_ENTRY_UPDATED invalidates deploy:field-ops:schedule:* cache', async () => {
    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_UPDATED, {
      entryId: 'eid2',
      projectId: 'pid1',
      changedFields: ['startDate'],
      updatedBy: 'uid1',
    }, { source: 'pm:schedule' });

    await new Promise(r => setImmediate(r));

    expect(invalidatePatternMock).toHaveBeenCalledWith(
      expect.stringContaining('deploy:field-ops:schedule:'),
    );
  });

  test('SCHEDULE_ENTRY_DELETED invalidates deploy:field-ops:schedule:* cache', async () => {
    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_DELETED, {
      entryId: 'eid3',
      projectId: 'pid1',
      deletedBy: 'uid1',
    }, { source: 'pm:schedule' });

    await new Promise(r => setImmediate(r));

    expect(invalidatePatternMock).toHaveBeenCalledWith(
      expect.stringContaining('deploy:field-ops:schedule:'),
    );
  });

  test('SCHEDULE_ENTRIES_CASCADED invalidates deploy:field-ops:schedule:* cache', async () => {
    eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRIES_CASCADED, {
      triggerId: 'eid1',
      projectId: 'pid1',
      affectedEntryIds: ['eid4', 'eid5'],
      updatedBy: 'uid1',
    }, { source: 'pm:schedule' });

    await new Promise(r => setImmediate(r));

    expect(invalidatePatternMock).toHaveBeenCalledWith(
      expect.stringContaining('deploy:field-ops:schedule:'),
    );
  });

  test('handler does not re-throw on cache error (non-blocking)', async () => {
    invalidatePatternMock.mockRejectedValueOnce(new Error('Redis down'));

    expect(() => {
      eventBus.publish(EVENT_TYPES.SCHEDULE_ENTRY_CREATED, {
        entryId: 'eid6',
        projectId: 'pid1',
        entryType: 'PHASE',
        name: 'Phase X',
        createdBy: 'uid1',
      }, { source: 'pm:schedule' });
    }).not.toThrow();

    await new Promise(r => setImmediate(r));
    // No assertion on error — confirms handler swallowed it (logger.error called instead).
  });
});
```

**Run (confirm FAIL):**
```
cd server && npm test -- tests/unit/deploy.fieldOpsEvents.test.js
```
Expected: all 5 tests fail with "handler not found" / no calls to `invalidatePatternMock` matching `deploy:field-ops:schedule:*`.

### 1.2 Implement

Edit `server/src/modules/deploy/deploy.events.js`. Add three new handlers at the bottom of `registerDeployEvents()`, immediately before the final `logger.info(...)` call.

**Exact edit — `old_string`:**
```js
  logger.info('Deploy event handlers registered', { module: 'deploy', action: 'events.register' });
```

**Exact edit — `new_string`:**
```js
  // --- SCHEDULE_ENTRY_CREATED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRY_CREATED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:field-ops:schedule:*`);

      logger.info('Deploy field-ops schedule cache invalidated after schedule entry created', {
        module: 'deploy',
        action: 'event.schedule_entry_created',
        entryId: event.payload?.entryId,
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ENTRY_CREATED event in deploy', {
        module: 'deploy',
        action: 'event.schedule_entry_created',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ENTRY_UPDATED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRY_UPDATED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:field-ops:schedule:*`);

      logger.info('Deploy field-ops schedule cache invalidated after schedule entry updated', {
        module: 'deploy',
        action: 'event.schedule_entry_updated',
        entryId: event.payload?.entryId,
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ENTRY_UPDATED event in deploy', {
        module: 'deploy',
        action: 'event.schedule_entry_updated',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ENTRY_DELETED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRY_DELETED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:field-ops:schedule:*`);

      logger.info('Deploy field-ops schedule cache invalidated after schedule entry deleted', {
        module: 'deploy',
        action: 'event.schedule_entry_deleted',
        entryId: event.payload?.entryId,
        projectId: event.payload?.projectId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ENTRY_DELETED event in deploy', {
        module: 'deploy',
        action: 'event.schedule_entry_deleted',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_ENTRIES_CASCADED ---
  eventBus.on(EVENT_TYPES.SCHEDULE_ENTRIES_CASCADED, async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}deploy:field-ops:schedule:*`);

      logger.info('Deploy field-ops schedule cache invalidated after schedule entries cascaded', {
        module: 'deploy',
        action: 'event.schedule_entries_cascaded',
        triggerId: event.payload?.triggerId,
        projectId: event.payload?.projectId,
        affectedCount: event.payload?.affectedEntryIds?.length ?? 0,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_ENTRIES_CASCADED event in deploy', {
        module: 'deploy',
        action: 'event.schedule_entries_cascaded',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('Deploy event handlers registered', { module: 'deploy', action: 'events.register' });
```

**Run (confirm PASS):**
```
cd server && npm test -- tests/unit/deploy.fieldOpsEvents.test.js
```
Expected: 5/5 pass.

### 1.3 Commit
```
git add server/src/modules/deploy/deploy.events.js server/tests/unit/deploy.fieldOpsEvents.test.js
git commit -m "feat(deploy): subscribe to SCHEDULE_ENTRY_* events and invalidate field-ops cache"
```

---

## Task 2 — Create `fieldOps.service.js` with `getInternalTeamSchedule`

### 2.1 Write failing test

**File:** `server/tests/unit/deploy.fieldOpsService.test.js`

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let ScheduleEntry;
let Project;
let Role;
let User;
let Customer;
let fieldOpsService;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  ({ default: Project } = await import('../../src/modules/pm/project.model.js'));
  ({ default: ScheduleEntry } = await import('../../src/modules/pm/scheduleEntry.model.js'));
  Role = mongoose.model('Role');
  User = mongoose.model('User');
  Customer = mongoose.model('Customer');
  ({ default: fieldOpsService } = await import('../../src/modules/deploy/fieldOps.service.js'));
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let seq = 0;
function nextSeq() { return ++seq; }

async function seedUser() {
  const n = nextSeq();
  const role = await Role.create({ name: `R_${n}`, permissions: [] });
  return User.create({
    email: `u${n}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Test',
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

async function seedProject(userId) {
  const n = nextSeq();
  const customer = await Customer.create({
    customerNumber: `K-${50000 + n}`,
    name: `Kunde ${n}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: userId,
  });
  return Project.create({
    projectNumber: `P-${60000 + n}`,
    name: `Projekt ${n}`,
    projectType: 'NEW_INSTALLATION',
    customerId: customer._id,
    projectManagerId: userId,
    createdBy: userId,
    status: 'IN_PROGRESS',
  });
}

describe('fieldOpsService.getInternalTeamSchedule', () => {
  test('returns only INTERNAL_TEAM entries', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    await ScheduleEntry.create([
      {
        projectId: project._id,
        name: 'Montage',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-15'),
        status: 'PLANNED',
        sortOrder: 1,
        createdBy: user._id,
      },
      {
        projectId: project._id,
        name: 'Partner-Arbeit',
        entryType: 'PHASE',
        responsibleType: 'PARTNER_COMPANY',
        startDate: new Date('2026-07-16'),
        endDate: new Date('2026-07-20'),
        status: 'PLANNED',
        sortOrder: 2,
        createdBy: user._id,
      },
      {
        projectId: project._id,
        name: 'Abnahme',
        entryType: 'MILESTONE',
        responsibleType: 'INTERNAL_TEAM',
        milestoneDate: new Date('2026-08-01'),
        status: 'PLANNED',
        sortOrder: 3,
        createdBy: user._id,
      },
    ]);

    const result = await fieldOpsService.getInternalTeamSchedule({});

    expect(result).toHaveLength(2);
    expect(result.every(e => e.responsibleType === 'INTERNAL_TEAM')).toBe(true);
    const names = result.map(e => e.name);
    expect(names).toContain('Montage');
    expect(names).toContain('Abnahme');
    expect(names).not.toContain('Partner-Arbeit');
  });

  test('filters by projectId when provided', async () => {
    const user = await seedUser();
    const p1 = await seedProject(user._id);
    const p2 = await seedProject(user._id);

    await ScheduleEntry.create([
      {
        projectId: p1._id,
        name: 'Phase P1',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-10'),
        status: 'PLANNED',
        createdBy: user._id,
      },
      {
        projectId: p2._id,
        name: 'Phase P2',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-08-01'),
        endDate: new Date('2026-08-10'),
        status: 'PLANNED',
        createdBy: user._id,
      },
    ]);

    const result = await fieldOpsService.getInternalTeamSchedule({
      projectId: p1._id.toString(),
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Phase P1');
  });

  test('filters by status when provided', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    await ScheduleEntry.create([
      {
        projectId: project._id,
        name: 'Phase PLANNED',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-10'),
        status: 'PLANNED',
        createdBy: user._id,
      },
      {
        projectId: project._id,
        name: 'Phase IN_PROGRESS',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-11'),
        endDate: new Date('2026-07-20'),
        status: 'IN_PROGRESS',
        createdBy: user._id,
      },
    ]);

    const result = await fieldOpsService.getInternalTeamSchedule({ status: 'PLANNED' });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Phase PLANNED');
  });

  test('filters by startDate/endDate date range (PHASE entries)', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    await ScheduleEntry.create([
      {
        projectId: project._id,
        name: 'In Range',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-05'),
        endDate: new Date('2026-07-12'),
        status: 'PLANNED',
        createdBy: user._id,
      },
      {
        projectId: project._id,
        name: 'Out of Range',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-15'),
        status: 'PLANNED',
        createdBy: user._id,
      },
    ]);

    const result = await fieldOpsService.getInternalTeamSchedule({
      from: '2026-07-01',
      to: '2026-07-31',
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('In Range');
  });

  test('excludes soft-deleted entries', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    const entry = await ScheduleEntry.create({
      projectId: project._id,
      name: 'Deleted Phase',
      entryType: 'PHASE',
      responsibleType: 'INTERNAL_TEAM',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-10'),
      status: 'PLANNED',
      createdBy: user._id,
    });

    await ScheduleEntry.findByIdAndUpdate(entry._id, { isDeleted: true, deletedAt: new Date() });

    const result = await fieldOpsService.getInternalTeamSchedule({});
    expect(result).toHaveLength(0);
  });

  test('populates projectId with name and projectNumber', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    await ScheduleEntry.create({
      projectId: project._id,
      name: 'Rohbau',
      entryType: 'PHASE',
      responsibleType: 'INTERNAL_TEAM',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-31'),
      status: 'PLANNED',
      createdBy: user._id,
    });

    const result = await fieldOpsService.getInternalTeamSchedule({});

    expect(result).toHaveLength(1);
    expect(result[0].projectId).toBeDefined();
    expect(result[0].projectId.name).toBe(project.name);
    expect(result[0].projectId.projectNumber).toBe(project.projectNumber);
  });
});
```

**Run (confirm FAIL):**
```
cd server && npm test -- tests/unit/deploy.fieldOpsService.test.js
```
Expected: all 5 tests fail with `Cannot find module '../../src/modules/deploy/fieldOps.service.js'`.

### 2.2 Implement

**New file:** `server/src/modules/deploy/fieldOps.service.js`

```js
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const FIELD_OPS_TTL = { l1Ttl: 30, l2Ttl: 120 };

/**
 * Simple deterministic hash for cache key generation.
 * Identical to the helper used in calendar.service.js.
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

class FieldOpsService {
  /**
   * Return PM schedule entries where responsibleType === 'INTERNAL_TEAM'.
   *
   * Supports optional filters:
   *   projectId {string}  — restrict to a single project
   *   status    {string}  — restrict to a single ENTRY_STATUS value
   *   from      {string}  — ISO date; entries whose startDate or milestoneDate >= from
   *   to        {string}  — ISO date; entries whose startDate or milestoneDate <= to
   *
   * The result is cached under deploy:field-ops:schedule:<hash(params)> and
   * invalidated by the SCHEDULE_ENTRY_* handlers in deploy.events.js.
   */
  async getInternalTeamSchedule({ projectId, status, from, to } = {}) {
    const paramsStr = JSON.stringify({ projectId, status, from, to });
    const cacheKey = `${config.redis.keyPrefix}deploy:field-ops:schedule:${simpleHash(paramsStr)}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        // Lazy import: avoids a circular dependency because the pm module
        // already imports deploy indirectly through the event bus at startup.
        const ScheduleEntry = (await import('../pm/scheduleEntry.model.js')).default;

        const filter = { responsibleType: 'INTERNAL_TEAM', isDeleted: false };

        if (projectId) {
          filter.projectId = projectId;
        }

        if (status) {
          filter.status = status;
        }

        if (from || to) {
          // Match entries where the operative date falls within [from, to].
          // PHASE entries use startDate; MILESTONE entries use milestoneDate.
          // We apply the range to whichever date field is present using $or.
          const dateFilter = {};
          if (from) dateFilter.$gte = new Date(from);
          if (to) dateFilter.$lte = new Date(to);

          filter.$or = [
            { entryType: 'PHASE', startDate: dateFilter },
            { entryType: 'MILESTONE', milestoneDate: dateFilter },
          ];
        }

        const entries = await ScheduleEntry.find(filter)
          .populate({ path: 'projectId', select: 'name projectNumber' })
          .sort({ startDate: 1, milestoneDate: 1, sortOrder: 1 })
          .lean();

        logger.debug('Field-ops internal-team schedule fetched', {
          module: 'deploy',
          action: 'fieldOps.getInternalTeamSchedule',
          count: entries.length,
          filters: { projectId, status, from, to },
        });

        return entries;
      },
      FIELD_OPS_TTL,
    );
  }
}

const fieldOpsService = new FieldOpsService();
export default fieldOpsService;
```

**Run (confirm PASS):**
```
cd server && npm test -- tests/unit/deploy.fieldOpsService.test.js
```
Expected: 5/5 pass.

### 2.3 Commit
```
git add server/src/modules/deploy/fieldOps.service.js server/tests/unit/deploy.fieldOpsService.test.js
git commit -m "feat(deploy): add fieldOps.service.js querying INTERNAL_TEAM schedule entries"
```

---

## Task 3 — Controller, Joi validation, and route for field-ops schedule

### 3.1 Write failing test (route integration via supertest)

**File:** `server/tests/unit/deploy.fieldOpsRoute.test.js`

```js
import mongoose from 'mongoose';
import request from 'supertest';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import { jest } from '@jest/globals';

// Mock auth middleware so we don't need real JWTs in a unit test.
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => {
    req.user = { _id: new mongoose.Types.ObjectId().toString(), permissions: ['scheduling:read'] };
    next();
  },
  requirePermission: () => (_req, _res, next) => next(),
}));

let app;
let ScheduleEntry;
let Project;
let Role;
let User;
let Customer;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  ({ default: Project } = await import('../../src/modules/pm/project.model.js'));
  ({ default: ScheduleEntry } = await import('../../src/modules/pm/scheduleEntry.model.js'));
  Role = mongoose.model('Role');
  User = mongoose.model('User');
  Customer = mongoose.model('Customer');

  // Build a minimal Express app that only mounts the field-ops router.
  const { default: express } = await import('express');
  const { default: fieldOpsRoutes } = await import('../../src/modules/deploy/field-ops.routes.js');

  const server = express();
  server.use(express.json());

  // Attach res.success helper (mirrors what the real app does).
  server.use((_req, res, next) => {
    res.success = ({ data }) => res.json({ success: true, data });
    next();
  });

  server.use('/api/v1/deploy/field-ops', fieldOpsRoutes);

  // Generic error handler
  server.use((err, _req, res, _next) => {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  });

  app = server;
});

afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let seq = 0;
function nextSeq() { return ++seq; }

async function seedUser() {
  const n = nextSeq();
  const role = await Role.create({ name: `R_${n}`, permissions: [] });
  return User.create({
    email: `u${n}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Test',
    lastName: 'User',
    role: role._id,
    status: 'active',
  });
}

async function seedProject(userId) {
  const n = nextSeq();
  const customer = await Customer.create({
    customerNumber: `K-${70000 + n}`,
    name: `Kunde ${n}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: userId,
  });
  return Project.create({
    projectNumber: `P-${80000 + n}`,
    name: `Projekt ${n}`,
    projectType: 'NEW_INSTALLATION',
    customerId: customer._id,
    projectManagerId: userId,
    createdBy: userId,
    status: 'IN_PROGRESS',
  });
}

describe('GET /api/v1/deploy/field-ops/schedule', () => {
  test('200 — returns only INTERNAL_TEAM entries', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    await ScheduleEntry.create([
      {
        projectId: project._id,
        name: 'Interne Phase',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-10'),
        status: 'PLANNED',
        createdBy: user._id,
      },
      {
        projectId: project._id,
        name: 'Partner Phase',
        entryType: 'PHASE',
        responsibleType: 'PARTNER_COMPANY',
        startDate: new Date('2026-07-11'),
        endDate: new Date('2026-07-20'),
        status: 'PLANNED',
        createdBy: user._id,
      },
    ]);

    const res = await request(app).get('/api/v1/deploy/field-ops/schedule');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Interne Phase');
    expect(res.body.data[0].responsibleType).toBe('INTERNAL_TEAM');
  });

  test('200 — filters by status query param', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    await ScheduleEntry.create([
      {
        projectId: project._id,
        name: 'Planned',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-05'),
        status: 'PLANNED',
        createdBy: user._id,
      },
      {
        projectId: project._id,
        name: 'Completed',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-10'),
        status: 'COMPLETED',
        createdBy: user._id,
      },
    ]);

    const res = await request(app)
      .get('/api/v1/deploy/field-ops/schedule')
      .query({ status: 'PLANNED' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Planned');
  });

  test('400 — rejects invalid status value', async () => {
    const res = await request(app)
      .get('/api/v1/deploy/field-ops/schedule')
      .query({ status: 'INVALID_STATUS' });

    expect(res.status).toBe(400);
  });

  test('400 — rejects non-ISO from date', async () => {
    const res = await request(app)
      .get('/api/v1/deploy/field-ops/schedule')
      .query({ from: 'not-a-date' });

    expect(res.status).toBe(400);
  });

  test('200 — empty array when no INTERNAL_TEAM entries exist', async () => {
    const res = await request(app).get('/api/v1/deploy/field-ops/schedule');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });
});
```

**Run (confirm FAIL):**
```
cd server && npm test -- tests/unit/deploy.fieldOpsRoute.test.js
```
Expected: all 5 tests fail with `Cannot find module '../../src/modules/deploy/field-ops.routes.js'`.

### 3.2 Implement — validation schema

**New file:** `server/src/modules/deploy/fieldOps.validation.js`

```js
import Joi from 'joi';

const VALID_STATUSES = ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'WAIVED'];

export const fieldOpsScheduleSchema = {
  query: Joi.object({
    projectId: Joi.string()
      .pattern(/^[a-f\d]{24}$/i)
      .optional()
      .messages({ 'string.pattern.base': '"projectId" must be a valid MongoDB ObjectId' }),

    status: Joi.string()
      .valid(...VALID_STATUSES)
      .optional()
      .messages({ 'any.only': `"status" must be one of ${VALID_STATUSES.join(', ')}` }),

    from: Joi.date()
      .iso()
      .optional()
      .messages({ 'date.format': '"from" must be a valid ISO date' }),

    to: Joi.date()
      .iso()
      .min(Joi.ref('from'))
      .optional()
      .messages({
        'date.format': '"to" must be a valid ISO date',
        'date.min': '"to" must not be earlier than "from"',
      }),
  }),
};
```

### 3.3 Implement — controller

**New file:** `server/src/modules/deploy/fieldOps.controller.js`

```js
import fieldOpsService from './fieldOps.service.js';

class FieldOpsController {
  async getSchedule(req, res, next) {
    try {
      const { projectId, status, from, to } = req.query;
      const data = await fieldOpsService.getInternalTeamSchedule({ projectId, status, from, to });
      return res.success({ data });
    } catch (err) {
      next(err);
    }
  }
}

const fieldOpsController = new FieldOpsController();
export default fieldOpsController;
```

### 3.4 Implement — routes

**New file:** `server/src/modules/deploy/field-ops.routes.js`

```js
import { Router } from 'express';
import fieldOpsController from './fieldOps.controller.js';
import { validate } from '../../shared/validation/validate.js';
import { authenticate, requirePermission } from '../../shared/middleware/authenticate.js';
import { fieldOpsScheduleSchema } from './fieldOps.validation.js';

const router = Router();

/**
 * GET /api/v1/deploy/field-ops/schedule
 *
 * Returns PM schedule entries with responsibleType === 'INTERNAL_TEAM' for
 * display in the Field Deployment Planning section of the deploy module.
 *
 * Query params:
 *   projectId {ObjectId string} — filter to a single project
 *   status    {string}          — one of PLANNED|IN_PROGRESS|COMPLETED|CANCELLED|WAIVED
 *   from      {ISO date}        — entries on or after this date
 *   to        {ISO date}        — entries on or before this date (must be >= from)
 */
router.get(
  '/schedule',
  authenticate,
  requirePermission('scheduling:read'),
  validate(fieldOpsScheduleSchema),
  (req, res, next) => fieldOpsController.getSchedule(req, res, next),
);

export default router;
```

### 3.5 Mount in `deploy.routes.js`

**File:** `server/src/modules/deploy/deploy.routes.js`

After the existing `// --- Mobile ---` block, add:

**Exact edit — `old_string`:**
```js
// --- Mobile ---
router.use('/mobile', mobileRoutes);

export default router;
```

**Exact edit — `new_string`:**
```js
// --- Mobile ---
router.use('/mobile', mobileRoutes);

// --- Field Ops ---
try {
  const { default: fieldOpsRoutes } = await import('./field-ops.routes.js');
  router.use('/field-ops', fieldOpsRoutes);
} catch {
  // field-ops.routes.js not yet created — skip
}

export default router;
```

**Run (confirm PASS):**
```
cd server && npm test -- tests/unit/deploy.fieldOpsRoute.test.js
```
Expected: 5/5 pass.

### 3.6 Commit
```
git add \
  server/src/modules/deploy/fieldOps.validation.js \
  server/src/modules/deploy/fieldOps.controller.js \
  server/src/modules/deploy/field-ops.routes.js \
  server/src/modules/deploy/deploy.routes.js \
  server/tests/unit/deploy.fieldOpsRoute.test.js
git commit -m "feat(deploy): expose GET /api/v1/deploy/field-ops/schedule for INTERNAL_TEAM entries"
```

---

## Task 4 — Full regression run

Run the entire server test suite to confirm no regressions:

```
cd server && npm test
```

Expected: all pre-existing tests pass; three new test files add 15 new passing tests.

If any pre-existing test fails, investigate before proceeding. The most likely cause is that registering additional `eventBus.on()` listeners in `deploy.events.js` increments the listener count — if a test creates a new `EventBus` instance or imports the singleton after the module is registered, check for `MaxListenersExceededWarning`. The bus already calls `this.setMaxListeners(50)` so this should not occur unless the test suite registers the handlers multiple times. If it does, add a guard in `registerDeployEvents()`:

```js
// Guard: only register once (idempotency for test environments that re-import the module)
if (eventBus.listenerCount(EVENT_TYPES.SCHEDULE_ENTRY_CREATED) > 0) {
  logger.debug('Deploy event handlers already registered — skipping', { module: 'deploy' });
  return;
}
```

Add this guard as the very first statement inside `registerDeployEvents()` and re-run.

---

## Task 5 — Client: field-ops schedule panel (Next.js)

> **MANDATORY:** Read `client/AGENTS.md` and then `node_modules/next/dist/docs/` for the current routing and data-fetching conventions before writing any client code.

### 5.1 Write failing Vitest test

**File:** `client/src/modules/pm/components/__tests__/FieldOpsSchedulePanel.test.tsx`

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the API service before importing the component.
vi.mock('../../../deploy/services/fieldOps.service', () => ({
  getInternalTeamSchedule: vi.fn(),
}));

import { getInternalTeamSchedule } from '../../../deploy/services/fieldOps.service';
import FieldOpsSchedulePanel from '../FieldOpsSchedulePanel';

const mockedGet = getInternalTeamSchedule as ReturnType<typeof vi.fn>;

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('FieldOpsSchedulePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a loading skeleton while fetching', () => {
    mockedGet.mockReturnValue(new Promise(() => {})); // never resolves
    render(<FieldOpsSchedulePanel />, { wrapper });
    expect(screen.getByTestId('field-ops-skeleton')).toBeInTheDocument();
  });

  it('renders INTERNAL_TEAM entries in a table', async () => {
    mockedGet.mockResolvedValue([
      {
        _id: 'abc123',
        name: 'Rohbau',
        entryType: 'PHASE',
        responsibleType: 'INTERNAL_TEAM',
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2026-07-15T00:00:00.000Z',
        status: 'PLANNED',
        projectId: { name: 'Projekt Alpha', projectNumber: 'P-001' },
      },
    ]);

    render(<FieldOpsSchedulePanel />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText('Rohbau')).toBeInTheDocument();
    });

    expect(screen.getByText('P-001')).toBeInTheDocument();
    expect(screen.getByText('Projekt Alpha')).toBeInTheDocument();
    expect(screen.getByText('PLANNED')).toBeInTheDocument();
  });

  it('shows empty state when no entries are returned', async () => {
    mockedGet.mockResolvedValue([]);

    render(<FieldOpsSchedulePanel />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('field-ops-empty')).toBeInTheDocument();
    });
  });

  it('shows an error message on API failure', async () => {
    mockedGet.mockRejectedValue(new Error('Network error'));

    render(<FieldOpsSchedulePanel />, { wrapper });

    await waitFor(() => {
      expect(screen.getByTestId('field-ops-error')).toBeInTheDocument();
    });
  });
});
```

**Run (confirm FAIL):**
```
cd client && npx vitest run src/modules/pm/components/__tests__/FieldOpsSchedulePanel.test.tsx
```
Expected: all 4 tests fail with module-not-found errors.

### 5.2 Implement — API service

**New file:** `client/src/modules/deploy/services/fieldOps.service.ts`

```ts
import apiClient from '@/lib/apiClient';

export interface ScheduleEntryFieldOps {
  _id: string;
  name: string;
  entryType: 'PHASE' | 'MILESTONE';
  responsibleType: 'INTERNAL_TEAM';
  startDate?: string;
  endDate?: string;
  milestoneDate?: string;
  status: 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'WAIVED';
  notes?: string | null;
  sortOrder: number;
  projectId: {
    _id?: string;
    name: string;
    projectNumber: string;
  };
}

export interface FieldOpsScheduleParams {
  projectId?: string;
  status?: string;
  from?: string;
  to?: string;
}

export async function getInternalTeamSchedule(
  params: FieldOpsScheduleParams = {},
): Promise<ScheduleEntryFieldOps[]> {
  const searchParams = new URLSearchParams();
  if (params.projectId) searchParams.set('projectId', params.projectId);
  if (params.status) searchParams.set('status', params.status);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);

  const qs = searchParams.toString();
  const url = `/deploy/field-ops/schedule${qs ? `?${qs}` : ''}`;

  const res = await apiClient.get<{ success: boolean; data: ScheduleEntryFieldOps[] }>(url);
  return res.data.data;
}
```

### 5.3 Implement — React Query hook

**New file:** `client/src/modules/deploy/hooks/useFieldOpsSchedule.ts`

```ts
import { useQuery } from '@tanstack/react-query';
import {
  getInternalTeamSchedule,
  type FieldOpsScheduleParams,
} from '../services/fieldOps.service';

export const FIELD_OPS_SCHEDULE_KEY = 'deploy:field-ops:schedule';

export function useFieldOpsSchedule(params: FieldOpsScheduleParams = {}) {
  return useQuery({
    queryKey: [FIELD_OPS_SCHEDULE_KEY, params],
    queryFn: () => getInternalTeamSchedule(params),
    staleTime: 30_000,
  });
}
```

### 5.4 Implement — `FieldOpsSchedulePanel` component

> Before writing this file, confirm the shadcn/ui Table component import path by running:
> ```
> cd client && node -e "require('./src/components/ui/table')" 2>&1 | head -5
> ```
> If it resolves, use `@/components/ui/table`. Otherwise adjust the import path to match the actual location.

**New file:** `client/src/modules/pm/components/FieldOpsSchedulePanel.tsx`

```tsx
'use client';

import { useFieldOpsSchedule } from '@/modules/deploy/hooks/useFieldOpsSchedule';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { ScheduleEntryFieldOps } from '@/modules/deploy/services/fieldOps.service';

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PLANNED: 'secondary',
  IN_PROGRESS: 'default',
  COMPLETED: 'outline',
  CANCELLED: 'destructive',
  WAIVED: 'outline',
};

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('de-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function entryDateLabel(entry: ScheduleEntryFieldOps): string {
  if (entry.entryType === 'PHASE') {
    return `${formatDate(entry.startDate)} – ${formatDate(entry.endDate)}`;
  }
  return formatDate(entry.milestoneDate);
}

export default function FieldOpsSchedulePanel() {
  const { data: entries, isLoading, isError } = useFieldOpsSchedule();

  if (isLoading) {
    return (
      <div data-testid="field-ops-skeleton" className="space-y-2 p-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div
        data-testid="field-ops-error"
        className="p-4 text-sm text-destructive"
        role="alert"
        aria-live="assertive"
      >
        Fehler beim Laden der Feldeinsatzplanung. Bitte Seite neu laden.
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div
        data-testid="field-ops-empty"
        className="p-8 text-center text-sm text-muted-foreground"
      >
        Keine internen Einträge vorhanden.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Projekt</TableHead>
            <TableHead>Eintrag</TableHead>
            <TableHead>Typ</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry._id}>
              <TableCell className="whitespace-nowrap">
                <span className="font-mono text-xs text-muted-foreground">
                  {entry.projectId.projectNumber}
                </span>{' '}
                <span className="font-medium">{entry.projectId.name}</span>
              </TableCell>
              <TableCell>{entry.name}</TableCell>
              <TableCell>
                <Badge variant="outline" className="text-xs">
                  {entry.entryType === 'PHASE' ? 'Phase' : 'Meilenstein'}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {entryDateLabel(entry)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_VARIANT[entry.status] ?? 'secondary'}>
                  {entry.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Run (confirm PASS):**
```
cd client && npx vitest run src/modules/pm/components/__tests__/FieldOpsSchedulePanel.test.tsx
```
Expected: 4/4 pass.

### 5.5 Commit
```
git add \
  client/src/modules/deploy/services/fieldOps.service.ts \
  client/src/modules/deploy/hooks/useFieldOpsSchedule.ts \
  client/src/modules/pm/components/FieldOpsSchedulePanel.tsx \
  client/src/modules/pm/components/__tests__/FieldOpsSchedulePanel.test.tsx
git commit -m "feat(deploy/client): add FieldOpsSchedulePanel surfacing INTERNAL_TEAM schedule entries"
```

---

## Task 6 — Final full test pass

Run both suites:

```
cd server && npm test
cd client && npx vitest run
```

All tests must be green. If a client test fails because the module path for `apiClient` differs from `@/lib/apiClient`, locate the actual client HTTP helper with:

```
grep -r "export.*apiClient\|export default.*axios\|export default.*fetch" client/src/lib/ --include="*.ts" -l
```

Adjust the import in `fieldOps.service.ts` to match the real path, then re-run.

---

## Summary of all new/modified files

| Operation | Path |
|-----------|------|
| Modified  | `server/src/modules/deploy/deploy.events.js` |
| New       | `server/src/modules/deploy/fieldOps.service.js` |
| New       | `server/src/modules/deploy/fieldOps.validation.js` |
| New       | `server/src/modules/deploy/fieldOps.controller.js` |
| New       | `server/src/modules/deploy/field-ops.routes.js` |
| Modified  | `server/src/modules/deploy/deploy.routes.js` |
| New       | `server/tests/unit/deploy.fieldOpsEvents.test.js` |
| New       | `server/tests/unit/deploy.fieldOpsService.test.js` |
| New       | `server/tests/unit/deploy.fieldOpsRoute.test.js` |
| New       | `client/src/modules/deploy/services/fieldOps.service.ts` |
| New       | `client/src/modules/deploy/hooks/useFieldOpsSchedule.ts` |
| New       | `client/src/modules/pm/components/FieldOpsSchedulePanel.tsx` |
| New       | `client/src/modules/pm/components/__tests__/FieldOpsSchedulePanel.test.tsx` |

## Acceptance-criteria closure

PROJ-004 AC-6: "MOD-05 integration — the deploy module subscribes to `SCHEDULE_ENTRY_*` events and surfaces internal-team schedule entries in Field Deployment Planning."

Closed by:
- Task 1: `SCHEDULE_ENTRY_CREATED`, `SCHEDULE_ENTRY_UPDATED`, `SCHEDULE_ENTRY_DELETED`, and `SCHEDULE_ENTRIES_CASCADED` handlers registered in `deploy.events.js`.
- Task 2+3: `GET /api/v1/deploy/field-ops/schedule` returns only `responsibleType === 'INTERNAL_TEAM'` entries with project details, supports `projectId`/`status`/`from`/`to` filters, and is cache-invalidated by the event handlers.
- Task 5: `FieldOpsSchedulePanel` component renders the entries in a table within the deploy/field-ops surface.
