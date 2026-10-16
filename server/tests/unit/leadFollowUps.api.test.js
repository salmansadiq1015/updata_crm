import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * GET /api/v1/crm/leads/follow-ups — the follow-ups agenda across leads, served
 * by the real lead router (auth + permission against DB roles, Joi validation,
 * controller, service aggregation) on an in-memory MongoDB.
 */

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/config/redis.js', () => {
  const unavailable = () => { throw new Error('Redis disabled in unit tests'); };
  const api = {
    createRedisClient: unavailable, getRedisClient: unavailable, disconnectRedis: async () => {}, isRedisConnected: () => false,
  };
  return { ...api, default: api };
});
jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: { isSessionActive: jest.fn(async () => true), touchSession: jest.fn() },
}));
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: async (_key, fn) => fn(),
    get: async () => null,
    set: async () => {},
    del: async () => {},
    invalidate: async () => {},
    invalidatePattern: async () => {},
    l1: { flush: () => {} },
  },
}));

const URL = '/api/v1/crm/leads/follow-ups';
const DAY = 24 * 60 * 60 * 1000;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

let mongod;
let app;
let Lead; let User; let Role; let Permission; let ContactLog; let LeadCommunication;
let generateAccessToken;
let userA; let userB; let tokenA; let tokenB;
let counter = 0;

async function makeUser(permissionIds) {
  const role = await Role.create({ name: `FollowUpRole_${randomUUID()}`, permissions: permissionIds });
  return User.create({
    email: `fu-${randomUUID()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Field',
    lastName: 'Agent',
    role: role._id,
    status: 'active',
  });
}

async function makeLead(overrides = {}) {
  counter += 1;
  return Lead.create({
    leadNumber: `L-${80000 + counter}`,
    name: `Follow ${counter}`,
    source: 'manual',
    createdBy: userA._id,
    ...overrides,
  });
}

function makeLog(lead, followUpAt, overrides = {}) {
  const owner = overrides.createdBy ?? userA._id;
  return ContactLog.create({
    leadId: lead._id,
    channel: 'phone',
    subject: 'Phone call (mobile) — callback_requested',
    note: 'Call back about the offer',
    occurredAt: new Date(),
    followUpAt,
    employeeId: owner,
    createdBy: owner,
    editableUntil: new Date(Date.now() + DAY),
    ...overrides,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));

  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/v1/crm/leads', leadRoutes);
  app.use(errorHandler);
}, 120000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) {
    await mongoose.connection.collections[key].deleteMany({});
  }
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'Read leads' },
  ]);
  const permIds = perms.map((p) => p._id);
  userA = await makeUser(permIds);
  userB = await makeUser(permIds);
  tokenA = generateAccessToken({ sub: String(userA._id) });
  tokenB = generateAccessToken({ sub: String(userB._id) });
});

describe('GET /crm/leads/follow-ups', () => {
  it('requires authentication and lead:read', async () => {
    await request(app).get(URL).expect(401);
    const noPerms = await makeUser([]);
    await request(app).get(URL).set(auth(generateAccessToken({ sub: String(noPerms._id) }))).expect(403);
  });

  it('is a named route, not read as a lead id', async () => {
    const res = await request(app).get(URL).set(auth(tokenA)).expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('returns rows sorted ascending with the documented shape and a ≤140-char note excerpt', async () => {
    const lead = await makeLead({ name: 'Acme AG' });
    const now = Date.now();
    const later = await makeLog(lead, new Date(now + 2 * DAY), { note: `Long ${'x'.repeat(300)}` });
    const overdue = await makeLog(lead, new Date(now - DAY), { channel: 'sms', subject: null });
    const soon = await makeLog(lead, new Date(now + 60 * 60 * 1000));
    await LeadCommunication.collection.insertOne({
      contactLogId: soon._id, outcome: { followUpTimezone: 'Europe/Zurich' },
    });

    const res = await request(app).get(URL).set(auth(tokenA)).expect(200);
    expect(res.body.data.map((row) => row.contactLogId)).toEqual([
      String(overdue._id), String(soon._id), String(later._id),
    ]);
    expect(res.body.data[0]).toEqual({
      contactLogId: String(overdue._id),
      leadId: String(lead._id),
      leadNumber: lead.leadNumber,
      leadName: 'Acme AG',
      followUpAt: overdue.followUpAt.toISOString(),
      followUpTimezone: null,
      channel: 'sms',
      subject: null,
      note: 'Call back about the offer',
    });
    expect(res.body.data[1].followUpTimezone).toBe('Europe/Zurich');
    expect(res.body.data[2].note.length).toBeLessThanOrEqual(140);
    expect(res.body.data[2].note.endsWith('…')).toBe(true);
  });

  it('scope=mine (default) keeps entries the caller created or is the employee on; scope=all shows everyone', async () => {
    const lead = await makeLead();
    const at = new Date(Date.now() + DAY);
    const mine = await makeLog(lead, at);
    const theirs = await makeLog(lead, at, { createdBy: userB._id, employeeId: userB._id });
    const onMyBehalf = await makeLog(lead, at, { createdBy: userB._id, employeeId: userA._id });

    const ids = (res) => res.body.data.map((row) => row.contactLogId).sort();
    const resMine = await request(app).get(URL).set(auth(tokenA)).expect(200);
    expect(ids(resMine)).toEqual([String(mine._id), String(onMyBehalf._id)].sort());

    const resB = await request(app).get(URL).query({ scope: 'mine' }).set(auth(tokenB)).expect(200);
    expect(ids(resB)).toEqual([String(theirs._id), String(onMyBehalf._id)].sort());

    const resAll = await request(app).get(URL).query({ scope: 'all' }).set(auth(tokenA)).expect(200);
    expect(resAll.body.data).toHaveLength(3);

    await request(app).get(URL).query({ scope: 'team' }).set(auth(tokenA)).expect(400);
  });

  it('honours from/to and rejects to < from', async () => {
    const lead = await makeLead();
    const base = new Date('2026-11-01T00:00:00.000Z').getTime();
    await makeLog(lead, new Date(base - DAY));
    const inside = await makeLog(lead, new Date(base + 2 * DAY));
    await makeLog(lead, new Date(base + 10 * DAY));

    const res = await request(app).get(URL)
      .query({ from: new Date(base).toISOString(), to: new Date(base + 5 * DAY).toISOString() })
      .set(auth(tokenA)).expect(200);
    expect(res.body.data.map((row) => row.contactLogId)).toEqual([String(inside._id)]);

    await request(app).get(URL)
      .query({ from: new Date(base + DAY).toISOString(), to: new Date(base).toISOString() })
      .set(auth(tokenA)).expect(400);
    await request(app).get(URL).query({ from: 'yesterday' }).set(auth(tokenA)).expect(400);
  });

  it('excludes soft-deleted leads, soft-deleted entries, customer entries and entries without a follow-up', async () => {
    const live = await makeLead();
    const deleted = await makeLead({ isDeleted: true, deletedAt: new Date() });
    const at = new Date(Date.now() + DAY);
    const kept = await makeLog(live, at);
    await makeLog(deleted, at);
    await makeLog(live, at, { isDeleted: true, deletedAt: new Date() });
    await makeLog(live, null);
    await ContactLog.collection.insertOne({
      customerId: new mongoose.Types.ObjectId(), leadId: null, channel: 'phone', note: 'customer',
      followUpAt: at, employeeId: userA._id, createdBy: userA._id, isDeleted: false,
    });

    const res = await request(app).get(URL).set(auth(tokenA)).expect(200);
    expect(res.body.data.map((row) => row.contactLogId)).toEqual([String(kept._id)]);
  });
});
