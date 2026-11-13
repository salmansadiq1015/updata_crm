import express from 'express';
import request from 'supertest';
import { jest, expect, test, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

// Employee Management read paths: nullable-sort keyset paging, /users/stats and its cache.
let permissions = ['users:read'];
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: '507f1f77bcf86cd799439011', role: { name: 'Manager' } }; next(); },
  loadUserPermissions: async () => permissions,
  satisfiesPermission: (held, required) => held.includes(required),
  requirePermission: (p) => (_req, res, next) => (permissions.includes(p) ? next() : res.sendStatus(403)),
}));
jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({ default: { revokeAllUserSessions: jest.fn(async () => 0) } }));

let User, Role, repo, userService, roleService, cacheManager, app;
beforeAll(async () => {
  await connectTestDb();
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  await import('../../src/modules/auth/permission.model.js');
  repo = (await import('../../src/modules/auth/user.repository.js')).default;
  userService = (await import('../../src/modules/auth/user.service.js')).default;
  roleService = (await import('../../src/modules/auth/role.service.js')).default;
  cacheManager = (await import('../../src/shared/cache/CacheManager.js')).default;
  const { default: router } = await import('../../src/modules/auth/user.routes.js');
  app = express();
  app.use((_req, res, next) => { res.success = ({ data }) => res.json({ data }); next(); });
  app.use('/api/v1/users', router);
  app.use((e, _req, res, _next) => res.status(e.statusCode || 500).json({ message: e.message }));
});
beforeEach(async () => { await clearTestDb(); cacheManager.l1.flush(); permissions = ['users:read']; });
afterAll(disconnectTestDb);

async function seedUsers() {
  const roles = await Role.insertMany([{ name: 'Admin', permissions: [] }, { name: 'Tech', permissions: [] }]);
  const statuses = ['active', 'pending_activation', 'deactivated', 'locked', 'active'];
  const docs = Array.from({ length: 23 }, (_, i) => ({
    email: `user${i}@example.com`, passwordHash: 'HASH-SECRET', activationTokenHash: 'TOKEN-SECRET', firstName: `F${i % 4}`, lastName: `L${i}`,
    role: roles[i % 2]._id, status: statuses[i % 5],
    lastLoginAt: i % 3 === 0 ? null : new Date(Date.UTC(2026, 0, 1 + (i % 4))), // nulls and ties
    ...(i % 4 === 0 ? {} : { department: i % 2 ? 'Sales' : null }), // missing, null and ties
    isDeleted: i === 22, createdAt: i < 5 ? new Date() : new Date(Date.UTC(2020, 0, 1 + i)),
  }));
  await User.collection.insertMany(docs);
  return roles;
}

test('cursor paging visits every user exactly once in order for nullable sort fields', async () => {
  await seedUsers();
  for (const sortBy of ['lastLoginAt', 'department', 'createdAt', 'firstName']) {
    for (const sortOrder of ['asc', 'desc']) {
      const seen = []; let cursor;
      do {
        const page = await repo.findWithCursor({ cursor, limit: 4, sortBy, sortOrder });
        seen.push(...page.data.map((u) => String(u._id)));
        cursor = page.pagination.nextCursor;
      } while (cursor && seen.length < 100);
      const dir = sortOrder === 'desc' ? -1 : 1;
      const expected = (await User.find({}).sort({ [sortBy]: dir, _id: dir }).select('_id').lean()).map((u) => String(u._id));
      expect({ sortBy, sortOrder, seen }).toEqual({ sortBy, sortOrder, seen: expected });
    }
  }
});

test('list rows never include password hashes or tokens', async () => {
  await seedUsers();
  const page = await userService.listUsers({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc', search: 'f1' });
  expect(page.data.length).toBeGreaterThan(0);
  expect(JSON.stringify(page)).not.toMatch(/HASH-SECRET|TOKEN-SECRET|passwordHash|activationTokenHash|resetTokenHash/);
});

test('GET /users/stats returns directory-wide KPIs (not the current page) and is not shadowed by /:id', async () => {
  await seedUsers();
  const res = await request(app).get('/api/v1/users/stats').expect(200);
  expect(res.body.data).toEqual({ total: 22, byStatus: { active: 9, pending_activation: 5, deactivated: 4, locked: 4 }, roles: 2, newThisMonth: 5 });
  permissions = [];
  await request(app).get('/api/v1/users/stats').expect(403);
});

test('stats are cached and the generation is bumped by user and role writes', async () => {
  const roles = await seedUsers();
  expect((await userService.getStats()).total).toBe(22);
  await User.collection.insertOne({ email: 'raw@example.com', passwordHash: 'x', firstName: 'R', lastName: 'W', role: roles[0]._id, status: 'active', isDeleted: false, createdAt: new Date() });
  expect((await userService.getStats()).total).toBe(22); // served from cache
  await userService._invalidateListCache(); // what every user write calls
  expect((await userService.getStats())).toMatchObject({ total: 23, newThisMonth: 6 });
  await Role.create({ name: 'Office', permissions: [] });
  expect((await userService.getStats()).roles).toBe(2);
  await roleService._invalidateCache();
  expect((await userService.getStats()).roles).toBe(3);
});

test('self-service profile edits refresh cached list pages', async () => {
  await seedUsers();
  const first = await userService.listUsers({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' });
  const target = first.data.find((u) => u.firstName === 'F1');
  await userService.updateMe(String(target._id), { firstName: 'Renamed' });
  const again = await userService.listUsers({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' });
  expect(again.data.find((u) => String(u._id) === String(target._id)).firstName).toBe('Renamed');
});
