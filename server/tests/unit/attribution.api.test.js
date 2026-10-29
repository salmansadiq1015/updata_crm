import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * GET /api/v1/analytics/attribution[/export] against real models: recorded AI
 * call cost, recorded invoice revenue of the converted customer, recorded
 * exchange rate, permission gate, team-mode lead scope and CSV export audit.
 */
const audit = [];
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async (_q, _n, data) => { audit.push(data); return {}; }), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/config/redis.js', () => {
  const unavailable = () => { throw new Error('Redis disabled in unit tests'); };
  const api = { createRedisClient: unavailable, getRedisClient: unavailable, disconnectRedis: async () => {}, isRedisConnected: () => false };
  return { ...api, default: api };
});
jest.unstable_mockModule('../../src/modules/auth/session.service.js', () => ({
  default: { isSessionActive: jest.fn(async () => true), touchSession: jest.fn() },
}));
jest.unstable_mockModule('../../src/shared/cache/CacheManager.js', () => ({
  default: {
    getOrSet: async (_k, fn) => fn(), get: async () => null, set: async () => {}, del: async () => {},
    invalidate: async () => {}, invalidatePattern: async () => {}, l1: { flush: () => {} },
  },
}));

let mongod; let server;
let User; let Role; let Permission; let Lead; let generateAccessToken;
let perms;
const auth = (user) => ({ Authorization: `Bearer ${generateAccessToken({ sub: String(user._id) })}` });
const URL = '/api/v1/analytics/attribution';

async function makeUser(keys) {
  const role = await Role.create({ name: `AttrRole_${randomUUID()}`, permissions: keys.map((k) => perms[k]._id) });
  return User.create({
    email: `attr-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Attr', lastName: 'User', role: role._id, status: 'active',
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const analyticsRoutes = (await import('../../src/modules/analytics/analytics.routes.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  const app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/v1/analytics', analyticsRoutes);
  app.use(errorHandler);
  server = app.listen(0);
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  delete process.env.LEAD_ACCESS_MODE;
});

let owner; let campaignId; let leadA; let leadB;
beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  audit.length = 0;
  process.env.LEAD_ACCESS_MODE = 'company';
  const created = await Permission.insertMany([
    { module: 'analytics', action: 'attribution:read', description: 'x' },
    { module: 'lead', action: 'read', description: 'x' },
  ]);
  perms = Object.fromEntries(created.map((p) => [`${p.module}:${p.action}`, p]));
  owner = await makeUser(['analytics:attribution:read', 'lead:read']);
  const customerId = new mongoose.Types.ObjectId();
  leadA = await Lead.create({
    leadNumber: 'L-80001', name: 'Converted AG', source: 'manual', createdBy: owner._id, status: 'converted',
    convertedCustomerId: customerId, convertedAt: new Date('2026-10-20T00:00:00Z'),
  });
  leadB = await Lead.create({ leadNumber: 'L-80002', name: 'Qualified GmbH', source: 'manual', createdBy: owner._id, status: 'qualified' });
  campaignId = new mongoose.Types.ObjectId();
  const db = mongoose.connection.db;
  await db.collection('callcampaigns').insertOne({ _id: campaignId, name: 'October AI wave', createdBy: owner._id });
  const call = (leadId, at, amount, extra = {}) => ({
    campaignId, recipientId: new mongoose.Types.ObjectId(), leadId, internalCallId: randomUUID(), attemptNumber: 1,
    provider: 'livekit_sip', initiatedAt: at, answeredAt: at, durationSeconds: 60, state: 'completed',
    cost: { amount, currency: 'USD', breakdown: { source: 'token_usage', components: { model: amount, telephony: 0, platform: 0 } } },
    createdBy: owner._id, ...extra,
  });
  await db.collection('callrecords').insertMany([
    call(leadA._id, new Date('2026-10-10T09:00:00Z'), 0.5),
    call(leadB._id, new Date('2026-10-11T09:00:00Z'), 0.3),
    call(leadB._id, new Date('2026-10-12T09:00:00Z'), 9, { isTest: true }), // test call: excluded
  ]);
  await db.collection('invoices').insertMany([
    { customerId, invoiceType: 'STANDARD', status: 'PAID', subtotal: 1200, currency: 'CHF', isDeleted: false },
    { customerId, invoiceType: 'STANDARD', status: 'DRAFT', subtotal: 9999, currency: 'CHF', isDeleted: false },
    { customerId, invoiceType: 'CREDIT_NOTE', status: 'FINALIZED', subtotal: 200, currency: 'CHF', isDeleted: false },
  ]);
  await db.collection('exchangerates').insertOne({
    baseCurrency: 'USD', quoteCurrency: 'CHF', rate: 0.9, rateDate: new Date('2026-10-01T00:00:00Z'), source: 'MANUAL',
  });
});

describe('GET /analytics/attribution', () => {
  it('requires analytics:attribution:read', async () => {
    const plain = await makeUser(['lead:read']);
    await request(server).get(URL).set(auth(plain)).expect(403);
    await request(server).get(URL).expect(401);
  });

  it('reports recorded spend, revenue, cost per qualified lead and profit per campaign', async () => {
    const res = await request(server).get(`${URL}?from=2026-10-01T00:00:00Z&to=2026-10-31T00:00:00Z&groupBy=campaign&model=last&currency=CHF`)
      .set(auth(owner)).expect(200);
    const row = res.body.data.rows.find((r) => r.key === `ai_call:${campaignId}`);
    expect(row).toMatchObject({
      label: 'October AI wave', touches: 2, leadsTouched: 2, qualifiedCredit: 2, convertedCredit: 1,
      spend: 0.72, revenue: 1000, profit: 999.28, costPerQualifiedLead: 0.36, costPerConversion: 0.72,
    });
    expect(row.excluded).toMatchObject({ touchesCostNotRecorded: 0, conversionsRevenueNotRecorded: 0, currenciesWithoutRate: [] });
    expect(res.body.data.exchangeRates[0]).toMatchObject({ from: 'USD', to: 'CHF', rate: 0.9 });
  });

  it('without a recorded exchange rate spend is not computed', async () => {
    await mongoose.connection.db.collection('exchangerates').deleteMany({});
    const res = await request(server).get(`${URL}?from=2026-10-01T00:00:00Z&to=2026-10-31T00:00:00Z&currency=CHF`).set(auth(owner)).expect(200);
    expect(res.body.data.totals.spend).toBeNull();
    expect(res.body.data.totals.excluded.currenciesWithoutRate).toEqual(['USD']);
  });

  it('team mode limits the report to the caller\'s leads', async () => {
    process.env.LEAD_ACCESS_MODE = 'team';
    const stranger = await makeUser(['analytics:attribution:read']);
    const res = await request(server).get(`${URL}?from=2026-10-01T00:00:00Z&to=2026-10-31T00:00:00Z`).set(auth(stranger)).expect(200);
    expect(res.body.data.totals.touches).toBe(0);
    expect(res.body.data.excluded.touchesOutsideLeadScope).toBe(2);
  });

  it('exports CSV and audits the export', async () => {
    const res = await request(server).get(`${URL}/export?from=2026-10-01T00:00:00Z&to=2026-10-31T00:00:00Z&groupBy=channel`)
      .set(auth(owner)).expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('ai_call');
    expect(res.text).toContain('TOTAL');
    expect(audit.some((e) => e.eventType === 'analytics.attribution.exported')).toBe(true);
  });

  it('rejects an inverted date range', async () => {
    await request(server).get(`${URL}?from=2026-10-31T00:00:00Z&to=2026-10-01T00:00:00Z`).set(auth(owner)).expect(400);
  });
});
