import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * SIM call campaigns — HTTP-level integration: real routes, authenticate +
 * requirePermission against DB roles, Joi validation, controller, service and the
 * leadCommunication CRM sync. Only infrastructure (queue, Redis, session, cache,
 * notifications) is stubbed. The "phone" is played by the test: it claims, dials,
 * saves answers and completes exactly like the Android app. No real call is placed.
 */
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({})) },
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
const notify = jest.fn(async () => ({}));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));

let mongod; let app; let server; let service;
let Lead; let User; let Role; let Permission; let LeadCommunication; let ContactLog; let CallSuppression;
let SimCallTask; let SimCallCampaign; let SimCallEvent;
let generateAccessToken; let phoneHash; let communicationOutcome; let nextTaskState;
let userA; let userB; let tokenA; let tokenB;
let n = 0;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const DEVICE = 'device-call-1111';
const DEVICE_2 = 'device-call-2222';
const BASE = '/api/v1/sim-calls';
const ALWAYS_OPEN = { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] };

async function makeUser(permIds) {
  const role = await Role.create({ name: `CallRole_${randomUUID()}`, permissions: permIds });
  return User.create({
    email: `call-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Sales', lastName: 'Caller', role: role._id, status: 'active',
  });
}

async function makeLead(overrides = {}) {
  n += 1;
  return Lead.create({
    leadNumber: `L-${80000 + n}`, name: `Garage ${n}`, source: 'manual',
    mobile: `+41 79 666 ${String(1000 + n).padStart(4, '0')}`, address: { country: 'CH', city: 'Bern' },
    createdBy: userA._id, ...overrides,
  });
}

const QUESTIONS = [
  { fieldKey: 'right_contact', label: 'Right contact', text: 'Am I speaking with the owner?', type: 'boolean', required: true, order: 1 },
  { fieldKey: 'interest', label: 'Interest', text: 'How interested are you?', type: 'single_choice', required: true, order: 2, options: ['high', 'medium', 'low'] },
  { fieldKey: 'budget', label: 'Budget', text: 'What budget do you have?', type: 'currency', order: 3,
    condition: { all: [{ field: 'interest', in: ['high', 'medium'] }] } },
];

function body(leads, overrides = {}) {
  return {
    name: 'Garage outreach', description: 'Q4', leadIds: leads.map((l) => String(l._id)),
    questionnaire: { questions: QUESTIONS }, instructions: 'Introduce yourself first.',
    settings: { ...ALWAYS_OPEN, countdownSeconds: 5, maxAttempts: 2, retryDelayMinutes: 30 }, ...overrides,
  };
}

const UNKNOWN_REQUIRED = ['right_contact', 'interest'].map((fieldKey) => ({ fieldKey, status: 'unknown' }));

async function create(leads, overrides, token = tokenA) {
  const res = await request(server).post(`${BASE}/campaigns`).set(auth(token)).send(body(leads, overrides)).expect(201);
  return res.body.data;
}
async function createRunning(leads, overrides) {
  const c = await create(leads, overrides);
  await request(server).post(`${BASE}/campaigns/${c._id}/start`).set(auth(tokenA)).expect(200);
  return c;
}
const claim = (campaignId, deviceId = DEVICE, token = tokenA) => request(server)
  .post(`${BASE}/campaigns/${campaignId}/next`).set(auth(token)).send({ deviceId });
const attemptOf = (task) => task.lock.attemptId;
const dial = (task, deviceId = DEVICE) => request(server).post(`${BASE}/tasks/${task.id}/dial`).set(auth(tokenA))
  .send({ attemptId: attemptOf(task), deviceId, subscriptionId: 2 });
const complete = (task, payload, token = tokenA) => request(server).post(`${BASE}/tasks/${task.id}/complete`).set(auth(token))
  .send({ attemptId: attemptOf(task), ...payload });

/** claim → dial → complete, returning the claimed task. */
async function callOnce(campaignId, payload) {
  const { body: { data } } = await claim(campaignId).expect(200);
  await dial(data.task).expect(200);
  await complete(data.task, payload).expect(200);
  return data.task;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const routes = (await import('../../src/modules/simCall/simCall.routes.js')).default;
  service = (await import('../../src/modules/simCall/simCall.service.js')).default;
  ({ communicationOutcome, nextTaskState } = await import('../../src/modules/simCall/simCall.service.js'));
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  SimCallTask = (await import('../../src/modules/simCall/simCallTask.model.js')).default;
  SimCallCampaign = (await import('../../src/modules/simCall/simCallCampaign.model.js')).default;
  SimCallEvent = (await import('../../src/modules/simCall/simCallEvent.model.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  ({ phoneHash } = await import('../../src/modules/aiCalling/callAuth.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await Promise.all([LeadCommunication.init(), SimCallTask.init(), SimCallCampaign.init()]);

  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use(BASE, routes);
  app.use(errorHandler);
  // One long-lived server for the suite: request(server) listens on a fresh ephemeral port per
  // request, and under parallel load a just-freed port can be reused by another process
  // ("Parse Error: Expected HTTP/").
  server = app.listen(0);
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) {
    if (['leadcommunications', 'simcalltasks'].includes(key)) continue;
    await mongoose.connection.collections[key].deleteMany({});
  }
  await Promise.all([LeadCommunication.deleteMany({}), SimCallTask.deleteMany({})]);
  notify.mockClear();
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' }, { module: 'lead', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'read', description: 'r' }, { module: 'ai-calling', action: 'write', description: 'w' },
  ]);
  userA = await makeUser(perms.map((p) => p._id));
  userB = await makeUser(perms.map((p) => p._id));
  tokenA = generateAccessToken({ sub: String(userA._id) });
  tokenB = generateAccessToken({ sub: String(userB._id) });
});

describe('pure rules', () => {
  it('maps confirmed outcomes to CRM dispositions and never invents "answered"', () => {
    expect(communicationOutcome({ outcome: 'answered', interest: 'interested' })).toEqual({ disposition: 'interested', connected: 'yes' });
    expect(communicationOutcome({ outcome: 'answered' })).toEqual({ disposition: 'unknown', connected: 'yes' });
    expect(communicationOutcome({ outcome: 'no_answer' })).toEqual({ disposition: 'no_answer', connected: 'no' });
    expect(communicationOutcome({ outcome: 'busy' })).toEqual({ disposition: 'busy', connected: 'no' });
    expect(communicationOutcome({ outcome: 'failed' })).toBeNull();
    expect(communicationOutcome({ outcome: 'cancelled' })).toBeNull();
    expect(communicationOutcome({ outcome: 'answered' }, { doNotContact: true }).disposition).toBe('do_not_contact');
  });

  it('retries unreached leads up to maxAttempts, schedules callbacks, closes the rest', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const settings = { maxAttempts: 2, retryDelayMinutes: 30 };
    expect(nextTaskState({ outcome: 'no_answer', attemptCount: 1, failedDials: 0, settings, now }))
      .toEqual({ state: 'pending', notBefore: new Date('2026-10-20T10:30:00Z') });
    expect(nextTaskState({ outcome: 'busy', attemptCount: 2, failedDials: 0, settings, now }).state).toBe('completed');
    const cb = new Date('2026-10-21T10:00:00Z');
    expect(nextTaskState({ outcome: 'callback_requested', attemptCount: 1, failedDials: 0, settings, callbackAt: cb, now }))
      .toEqual({ state: 'scheduled', notBefore: cb });
    expect(nextTaskState({ outcome: 'failed', attemptCount: 0, failedDials: 3, settings, now }).state).toBe('completed');
    expect(nextTaskState({ outcome: 'answered', attemptCount: 1, failedDials: 0, settings, now }).state).toBe('completed');
  });
});

describe('campaign creation, editing and authorization', () => {
  it('creates once for concurrent retries, repairs interrupted task creation, and rejects changed payloads', async () => {
    const lead = await makeLead();
    const payload = body([lead], { creationKey: randomUUID() });
    const responses = await Promise.all([1, 2].map(() => request(server).post(`${BASE}/campaigns`).set(auth(tokenA)).send(payload).expect(201)));
    const id = responses[0].body.data._id;
    expect(responses[1].body.data._id).toBe(id);
    expect(await SimCallCampaign.countDocuments()).toBe(1);
    expect(await SimCallTask.countDocuments({ campaignId: id })).toBe(1);
    await SimCallTask.deleteMany({ campaignId: id }); // interruption before tasks were persisted
    await SimCallCampaign.updateOne({ _id: id }, { $set: { creationInitializedAt: null } });
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA)).send(payload).expect(201);
    expect(await SimCallTask.countDocuments({ campaignId: id })).toBe(1);
    const other = await makeLead();
    await request(server).patch(`${BASE}/campaigns/${id}`).set(auth(tokenA)).send({ leadIds: [String(other._id)] }).expect(200);
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA)).send(payload).expect(201);
    expect((await SimCallTask.find({ campaignId: id }).lean()).map((t) => String(t.leadId))).toEqual([String(other._id)]);
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA)).send({ ...payload, name: 'Different' }).expect(409);
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenB)).send(payload).expect(201);
    expect(await SimCallCampaign.countDocuments()).toBe(2);
  });

  it('applies reliability indexes idempotently and preserves evidence on rollback', async () => {
    const migration = await import('../../src/migrations/029_sim_call_reliability.js');
    await create([await makeLead()]);
    await migration.up(); await migration.up(); await migration.down();
    const indexes = await SimCallCampaign.collection.indexes();
    expect(indexes.find((i) => i.name === 'sim_call_creation_key').unique).toBe(true);
    expect(await SimCallCampaign.countDocuments()).toBe(1);
  });
  it('requires auth and permission; validates questions', async () => {
    await request(server).get(`${BASE}/campaigns`).expect(401);
    const noPerm = await makeUser([]);
    await request(server).get(`${BASE}/campaigns`).set(auth(generateAccessToken({ sub: String(noPerm._id) }))).expect(403);
    const lead = await makeLead();
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA))
      .send(body([lead], { questionnaire: { questions: [{ ...QUESTIONS[1], options: [] }] } })).expect(400);
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA))
      .send(body([lead], { questionnaire: { questions: [QUESTIONS[0], QUESTIONS[0]] } })).expect(400);
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA))
      .send(body([lead], { questionnaire: { questions: [QUESTIONS[2]] } })).expect(400); // skip rule → unknown question
  });

  it('creates one task per lead, flags leads that cannot be called, and keeps CRM lead ids', async () => {
    const ok = await makeLead();
    const noPhone = await makeLead({ mobile: null, phone: null });
    const suppressed = await makeLead();
    await CallSuppression.create({ phoneHash: phoneHash(suppressed.mobile.replace(/\s/g, '')), reason: 'do_not_contact' });
    // Selecting the same lead twice is rejected (no duplicate call tasks).
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA)).send(body([ok, ok])).expect(400);
    const c = await create([ok, noPhone, suppressed]);
    expect(c.status).toBe('draft');
    expect(c.summary).toMatchObject({ total: 3, pending: 1, ineligible: 2 });
    const tasks = (await request(server).get(`${BASE}/campaigns/${c._id}/tasks`).set(auth(tokenA)).expect(200)).body.data;
    expect(tasks.map((t) => t.leadId).sort()).toEqual([ok, noPhone, suppressed].map((l) => String(l._id)).sort());
    const reasons = Object.fromEntries(tasks.map((t) => [t.leadId, t.eligibility.reasons]));
    expect(reasons[String(noPhone._id)]).toContain('NO_DESTINATION');
    expect(reasons[String(suppressed._id)]).toContain('PHONE_SUPPRESSED');
    expect(await Lead.countDocuments()).toBe(3); // no duplicate leads created
  });

  it('edits only drafts: questions bump the version, lead changes rebuild tasks', async () => {
    const [a, b, c] = [await makeLead(), await makeLead(), await makeLead()];
    const camp = await create([a, b]);
    const res = await request(server).patch(`${BASE}/campaigns/${camp._id}`).set(auth(tokenA))
      .send({ questionnaire: { questions: QUESTIONS.slice(0, 2) }, leadIds: [String(b._id), String(c._id)] }).expect(200);
    expect(res.body.data.questionsVersion).toBe(2);
    const tasks = (await request(server).get(`${BASE}/campaigns/${camp._id}/tasks`).set(auth(tokenA))).body.data;
    expect(tasks.map((t) => t.leadId).sort()).toEqual([b, c].map((l) => String(l._id)).sort());
    await request(server).post(`${BASE}/campaigns/${camp._id}/start`).set(auth(tokenA)).expect(200);
    const locked = await request(server).patch(`${BASE}/campaigns/${camp._id}`).set(auth(tokenA)).send({ name: 'x' }).expect(409);
    expect(locked.body.error.code).toBe('SIM_CALL_NOT_EDITABLE');
  });

  it('isolates users: another user cannot read, change or call a campaign', async () => {
    const c = await createRunning([await makeLead()]);
    await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenB)).expect(404);
    await request(server).post(`${BASE}/campaigns/${c._id}/pause`).set(auth(tokenB)).expect(404);
    await claim(c._id, DEVICE, tokenB).expect(404);
    const list = await request(server).get(`${BASE}/campaigns`).set(auth(tokenB)).expect(200);
    expect(list.body.data).toHaveLength(0);
    const { body: { data } } = await claim(c._id).expect(200);
    await complete(data.task, { outcome: 'cancelled' }, tokenB).expect(404);
  });

  it('every endpoint rejects no token (401), no permission (403) and another user (404)', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    const routes = [
      ['get', '/campaigns'], ['post', '/campaigns'], ['get', `/campaigns/${c._id}`], ['patch', `/campaigns/${c._id}`],
      ['post', `/campaigns/${c._id}/start`], ['post', `/campaigns/${c._id}/resume`], ['post', `/campaigns/${c._id}/pause`],
      ['post', `/campaigns/${c._id}/cancel`], ['post', `/campaigns/${c._id}/retry`], ['get', `/campaigns/${c._id}/tasks`],
      ['get', `/campaigns/${c._id}/events`], ['post', `/campaigns/${c._id}/next`], ['get', `/tasks/${task.id}`],
      ['post', `/tasks/${task.id}/dial`], ['post', `/tasks/${task.id}/release`], ['post', `/tasks/${task.id}/skip`],
      ['put', `/tasks/${task.id}/answers`], ['post', `/tasks/${task.id}/complete`], ['post', `/tasks/${task.id}/sync`],
      ['patch', `/tasks/${task.id}/callback`], ['delete', `/tasks/${task.id}/callback`], ['get', '/callbacks'],
      ['get', `/leads/${task.leadId}/tasks`],
    ];
    const noPerm = generateAccessToken({ sub: String((await makeUser([]))._id) });
    for (const [method, path] of routes) {
      await request(server)[method](`${BASE}${path}`).expect(401);
      await request(server)[method](`${BASE}${path}`).set(auth(noPerm)).expect(403);
    }
    // Owner-scoped: user B gets 404 on A's campaign and task, with valid bodies.
    const bodies = {
      [`/tasks/${task.id}/dial`]: { attemptId: task.lock.attemptId, deviceId: DEVICE },
      [`/tasks/${task.id}/complete`]: { attemptId: task.lock.attemptId, outcome: 'cancelled' },
      [`/tasks/${task.id}/answers`]: { attemptId: task.lock.attemptId, answers: [{ fieldKey: 'interest', status: 'unknown' }] },
      [`/tasks/${task.id}/callback`]: { at: new Date(Date.now() + 86400000).toISOString(), timezone: 'UTC' },
      [`/campaigns/${c._id}/next`]: { deviceId: DEVICE_2 },
      [`/campaigns/${c._id}`]: { name: 'hijack' },
      [`/tasks/${task.id}/release`]: { attemptId: task.lock.attemptId, deviceId: DEVICE },
    };
    for (const [method, path] of routes.filter(([, p]) => p.includes(String(c._id)) || p.includes(task.id))) {
      const res = await request(server)[method](`${BASE}${path}`).set(auth(tokenB)).send(bodies[path] || {});
      expect(`${method} ${path} → ${res.status}`).toBe(`${method} ${path} → 404`);
    }
    expect((await SimCallTask.findById(task.id).lean()).state).toBe('in_progress'); // untouched by B
  });

  it('lists with search, status filter and pagination', async () => {
    const lead = await makeLead();
    await create([lead], { name: 'Alpha calls' });
    await createRunning([lead], { name: 'Beta calls' });
    const all = await request(server).get(`${BASE}/campaigns?limit=1`).set(auth(tokenA)).expect(200);
    expect(all.body.pagination).toMatchObject({ total: 2, pages: 2 });
    const beta = await request(server).get(`${BASE}/campaigns?q=beta`).set(auth(tokenA)).expect(200);
    expect(beta.body.data.map((c) => c.name)).toEqual(['Beta calls']);
    const running = await request(server).get(`${BASE}/campaigns?status=running`).set(auth(tokenA)).expect(200);
    expect(running.body.data).toHaveLength(1);
  });
});

describe('state transitions', () => {
  it('only allows valid lifecycle moves', async () => {
    const c = await create([await makeLead()]);
    await request(server).post(`${BASE}/campaigns/${c._id}/pause`).set(auth(tokenA)).expect(409);
    await request(server).post(`${BASE}/campaigns/${c._id}/resume`).set(auth(tokenA)).expect(409);
    await request(server).post(`${BASE}/campaigns/${c._id}/start`).set(auth(tokenA)).expect(200);
    await request(server).post(`${BASE}/campaigns/${c._id}/start`).set(auth(tokenA)).expect(409);
    await request(server).post(`${BASE}/campaigns/${c._id}/pause`).set(auth(tokenA)).expect(200);
    await claim(c._id).expect(409); // paused: nothing is handed out
    await request(server).post(`${BASE}/campaigns/${c._id}/resume`).set(auth(tokenA)).expect(200);
    await request(server).post(`${BASE}/campaigns/${c._id}/cancel`).set(auth(tokenA)).expect(200);
    await request(server).post(`${BASE}/campaigns/${c._id}/resume`).set(auth(tokenA)).expect(409);
    const events = (await request(server).get(`${BASE}/campaigns/${c._id}/events`).set(auth(tokenA))).body.data.map((e) => e.type);
    expect(events).toEqual(expect.arrayContaining(['campaign.created', 'campaign.started', 'campaign.paused', 'campaign.resumed', 'campaign.cancelled']));
  });

  it('refuses to start a campaign with nobody callable', async () => {
    const c = await create([await makeLead({ mobile: null, phone: null })]);
    await request(server).post(`${BASE}/campaigns/${c._id}/start`).set(auth(tokenA)).expect(409);
  });

  it('cancelling stops further calls but lets an in-progress call be recorded', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const { body: { data } } = await claim(c._id).expect(200);
    await dial(data.task).expect(200);
    await request(server).post(`${BASE}/campaigns/${c._id}/cancel`).set(auth(tokenA)).expect(200);
    await claim(c._id).expect(409);
    await dial(data.task).expect(409); // no new dial after cancel
    await complete(data.task, { outcome: 'answered', interest: 'interested', answers: UNKNOWN_REQUIRED }).expect(200);
    const camp = (await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenA))).body.data;
    expect(camp.summary).toMatchObject({ completed: 1, cancelled: 1, answered: 1, attempts: 1 });
  });
});

describe('task queue, locking and dialling safeguards', () => {
  it('hands each lead to one device, resumes a held lead, never doubles up', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const first = (await claim(c._id, DEVICE).expect(200)).body.data;
    const again = (await claim(c._id, DEVICE).expect(200)).body.data;
    expect(again.resumed).toBe(true);
    expect(again.task.id).toBe(first.task.id);
    const other = (await claim(c._id, DEVICE_2).expect(200)).body.data;
    expect(other.task.id).not.toBe(first.task.id);
    const none = (await claim(c._id, 'device-call-3333').expect(200)).body.data;
    expect(none.task).toBeNull();
    // Device 2 cannot act on device 1's lead.
    await dial(first.task, DEVICE_2).expect(409);
    await request(server).post(`${BASE}/tasks/${first.task.id}/skip`).set(auth(tokenA)).send({ attemptId: 'not-the-attempt', deviceId: DEVICE_2 }).expect(409);
  });

  it('returns the number only at dial time, after re-checking eligibility', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    // The claim exposes only the masked number, never the dialable one.
    expect(JSON.stringify(task)).not.toContain(lead.mobile.replace(/\D/g, ''));
    expect(JSON.stringify(task)).not.toContain(lead.mobile);
    expect(task.destinationMasked).toMatch(/^•••• \d{4}$/);
    await CallSuppression.create({ phoneHash: phoneHash(lead.mobile.replace(/\s/g, '')), reason: 'do_not_contact' });
    const blocked = await dial(task).expect(409);
    expect(blocked.body.error.code).toBe('SIM_CALL_NOT_ELIGIBLE');
    await CallSuppression.deleteMany({});
    const ok = await dial(task).expect(200);
    expect(ok.body.data.dialNumber).toBe(lead.mobile);
  });

  it('respects calling hours and a scheduled start', async () => {
    const lead = await makeLead();
    const closed = await createRunning([lead], { settings: { timezone: 'UTC', callWindow: { start: '00:00', end: '00:00' }, daysOfWeek: [0] } });
    const r1 = (await claim(closed._id).expect(200)).body.data;
    expect(r1).toMatchObject({ task: null, reason: 'outside_calling_hours' });
    const later = await createRunning([lead], { startsAt: new Date(Date.now() + 3600_000).toISOString() });
    expect((await claim(later._id).expect(200)).body.data.reason).toBe('not_started');
  });

  it('releases an undialled lead, but a dialled one must get an outcome', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await request(server).post(`${BASE}/tasks/${task.id}/release`).set(auth(tokenA)).send({ attemptId: attemptOf(task), deviceId: DEVICE }).expect(200);
    const again = (await claim(c._id).expect(200)).body.data.task;
    await dial(again).expect(200);
    await request(server).post(`${BASE}/tasks/${again.id}/release`).set(auth(tokenA)).send({ attemptId: attemptOf(again), deviceId: DEVICE }).expect(409);
    await complete(again, { outcome: 'answered', answers: UNKNOWN_REQUIRED }).expect(200);
  });

  it('skips a lead and moves on', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await request(server).post(`${BASE}/tasks/${task.id}/skip`).set(auth(tokenA)).send({ attemptId: attemptOf(task), deviceId: DEVICE, reason: 'duplicate' }).expect(200);
    const next = (await claim(c._id).expect(200)).body.data.task;
    expect(next.id).not.toBe(task.id);
  });
});

describe('answers', () => {
  it('validates conditional required answers against the latest normalized values', async () => {
    const questionnaire = { questions: QUESTIONS.map((q) => ({ ...q, required: true })) };
    const c = await createRunning([await makeLead()], { questionnaire });
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    await complete(task, { outcome: 'answered', answers: [
      { fieldKey: 'right_contact', status: 'answered', value: true },
      { fieldKey: 'interest', status: 'answered', value: 'high' },
    ] }).expect(400);
    await complete(task, { outcome: 'answered', answers: [
      { fieldKey: 'right_contact', status: 'answered', value: true },
      { fieldKey: 'interest', status: 'answered', value: 'low' },
    ] }).expect(200);
  });

  it('rejects cyclic dependencies and invalid explicit numeric/date/time answers', async () => {
    await request(server).post(`${BASE}/campaigns`).set(auth(tokenA)).send(body([await makeLead()], {
      questionnaire: { questions: [{ ...QUESTIONS[0], condition: { all: [{ field: 'right_contact', equals: true }] } }] },
    })).expect(400);
    const c = await createRunning([await makeLead()], { questionnaire: { questions: [
      { ...QUESTIONS[0], type: 'date' }, { ...QUESTIONS[1], type: 'integer' }, { ...QUESTIONS[2], type: 'time', condition: null },
    ] } });
    const { task } = (await claim(c._id).expect(200)).body.data;
    for (const [fieldKey, value] of [['right_contact', '2026-02-30'], ['interest', '1.5'], ['budget', '25:00']]) {
      await request(server).put(`${BASE}/tasks/${task.id}/answers`).set(auth(tokenA))
        .send({ attemptId: attemptOf(task), answers: [{ fieldKey, status: 'answered', value }] }).expect(400);
    }
  });
  it('enforces visible required answers and stores actor/source/question provenance', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    await complete(task, { outcome: 'answered' }).expect(400);
    await request(server).put(`${BASE}/tasks/${task.id}/answers`).set(auth(tokenA))
      .send({ attemptId: attemptOf(task), answers: [{ fieldKey: 'right_contact', status: 'skipped' }] }).expect(400);
    const saved = (await complete(task, { outcome: 'answered', answers: UNKNOWN_REQUIRED }).expect(200)).body.data.task;
    expect(saved.answers[0]).toMatchObject({ source: 'manual', updatedBy: String(userA._id), validation: 'unknown', questionText: QUESTIONS[0].text, questionsVersion: 1 });
    const persisted = await SimCallTask.findById(task.id).lean();
    expect(persisted.attempts[0].answers).toHaveLength(2);
  });

  it('rejects partially matched or invalid choices instead of silently discarding them', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await request(server).put(`${BASE}/tasks/${task.id}/answers`).set(auth(tokenA)).send({ attemptId: attemptOf(task),
      answers: [{ fieldKey: 'interest', status: 'answered', value: 'highly unlikely' }] }).expect(400);
    await request(server).put(`${BASE}/tasks/${task.id}/answers`).set(auth(tokenA)).send({ attemptId: attemptOf(task),
      answers: [{ fieldKey: 'interest', status: 'answered', value: ['high', 'low'] }] }).expect(400);
  });
  it('validates answers and merges partial saves without overwriting earlier ones', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    const put = (answers) => request(server).put(`${BASE}/tasks/${task.id}/answers`).set(auth(tokenA)).send({ attemptId: attemptOf(task), deviceId: DEVICE, answers });
    const bad = await put([{ fieldKey: 'interest', status: 'answered', value: 'purple' }]).expect(400);
    expect(JSON.stringify(bad.body)).toMatch(/interest/);
    await put([{ fieldKey: 'nope', status: 'answered', value: 'x' }]).expect(400);
    await put([{ fieldKey: 'right_contact', status: 'answered', value: 'yes' }]).expect(200);
    const saved = (await put([{ fieldKey: 'interest', status: 'answered', value: 'high' }]).expect(200)).body.data;
    const byKey = Object.fromEntries(saved.answers.map((a) => [a.fieldKey, a]));
    expect(byKey.right_contact).toMatchObject({ status: 'answered', normalizedValue: true });
    expect(byKey.interest).toMatchObject({ status: 'answered', normalizedValue: 'high' });
    await put([{ fieldKey: 'budget', status: 'unknown' }]).expect(200);
    // A stale attempt cannot write.
    await request(server).put(`${BASE}/tasks/${task.id}/answers`).set(auth(tokenA)).send({ attemptId: randomUUID(), answers: [{ fieldKey: 'budget', status: 'skipped' }] }).expect(409);
  });
});

describe('completion, CRM sync and idempotency', () => {
  it('preserves independent qualification fields when multiple CRM operations merge concurrently', async () => {
    const lead = await makeLead();
    const svc = (await import('../../src/modules/crm/leadQualification.service.js')).default;
    await Promise.all(['need', 'role', 'current_solution'].map((fieldKey) => svc.mergeAnswers(String(lead._id), [
      { fieldKey, label: fieldKey, value: fieldKey, status: 'answered', source: 'user' },
    ], { userId: userA._id })));
    const fresh = await Lead.findById(lead._id).lean();
    expect(fresh.qualification.fields.map((f) => f.fieldKey).sort()).toEqual(['current_solution', 'need', 'role']);
  });
  it('saves reviewed extraction with evidence and preserves unrelated CRM qualification', async () => {
    const lead = await makeLead();
    await Lead.updateOne({ _id: lead._id }, { $set: { qualification: { fields: [
      { fieldKey: 'budget', label: 'Budget', value: 900, status: 'answered', source: 'user' },
    ] } } });
    const c = await createRunning([lead]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    const payload = { outcome: 'answered', answers: UNKNOWN_REQUIRED, notes: 'Needs stock tracking',
      qualification: { answers: [{ fieldKey: 'need', label: 'Need', status: 'answered', value: 'stock tracking',
        source: 'ai_proposed_user_confirmed', evidence: 'Needs stock tracking', confidence: null }] },
    };
    await complete(task, { ...payload, notes: 'Different note' }).expect(400);
    await complete(task, payload).expect(200);
    await complete(task, payload).expect(200);
    const fresh = await Lead.findById(lead._id).lean();
    expect(fresh.qualification.fields.find((f) => f.fieldKey === 'budget').value).toBe(900);
    expect(fresh.qualification.fields.find((f) => f.fieldKey === 'need')).toMatchObject({
      value: 'stock tracking', source: 'ai_proposed_user_confirmed', evidence: 'Needs stock tracking', updatedBy: userA._id,
    });
    const persisted = await SimCallTask.findById(task.id).lean();
    expect(persisted.attempts[0].qualificationAnswers).toHaveLength(1);
    expect(await ContactLog.countDocuments({ leadId: lead._id })).toBe(1);
  });

  it('requires lead write permission to merge reviewed extraction', async () => {
    const perms = await Permission.find({ module: 'ai-calling' });
    const user = await makeUser(perms.map((p) => p._id));
    const token = generateAccessToken({ sub: String(user._id) });
    const lead = await makeLead();
    const c = await create([lead], undefined, token);
    await request(server).post(`${BASE}/campaigns/${c._id}/start`).set(auth(token)).expect(200);
    const { task } = (await claim(c._id, DEVICE, token).expect(200)).body.data;
    await complete(task, { outcome: 'failed', qualification: { answers: [
      { fieldKey: 'need', value: 'test', status: 'answered', source: 'user' },
    ] } }, token).expect(403);
    expect((await SimCallTask.findById(task.id)).attempts[0].completedAt).toBeNull();
  });

  it('closes callback work when the caller records an opt-out', async () => {
    const c = await createRunning([await makeLead()]);
    const t = await callOnce(c._id, { outcome: 'callback_requested', doNotContact: true,
      callback: { at: new Date(Date.now() + 86400_000).toISOString(), timezone: 'UTC' },
    });
    const saved = await SimCallTask.findById(t.id).lean();
    expect(saved.state).toBe('completed');
    expect(saved.callback.status).toBe('cancelled');
    const comm = await LeadCommunication.findOne({ operationId: `simcall-${attemptOf(t)}` }).lean();
    expect(comm.outcome.followUpAt).toBeNull();
  });
  it('authorizes at most one concurrent or replayed dial and rejects an expired lease', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    const responses = await Promise.all([dial(task), dial(task)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await dial(task).expect(409)).body.error.code).toBe('SIM_CALL_ALREADY_DIALED');
    const campaign = await createRunning([await makeLead()]);
    const expired = (await claim(campaign._id).expect(200)).body.data.task;
    await SimCallTask.updateOne({ _id: expired.id }, { $set: { 'lock.until': new Date(Date.now() - 1) } });
    await dial(expired).expect(409);
    expect((await SimCallTask.findById(expired.id)).attempts[0].dialedAt).toBeNull();
  });

  it('cannot skip or retry an unresolved dial after its lease expires', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    await SimCallTask.updateOne({ _id: task.id }, { $set: { 'lock.until': new Date(Date.now() - 1) } });
    await service.sweep();
    await request(server).post(`${BASE}/tasks/${task.id}/skip`).set(auth(tokenA)).send({}).expect(409);
    const retried = await request(server).post(`${BASE}/campaigns/${c._id}/retry`).set(auth(tokenA)).send({}).expect(200);
    expect(retried.body.data.retried).toBe(0);
    expect((await SimCallTask.findById(task.id)).state).toBe('needs_review');
  });

  it('keeps opt-out through CRM failure/retry and blocks a second campaign immediately', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    const svc = (await import('../../src/modules/crm/leadCommunication.service.js')).default;
    const spy = jest.spyOn(svc, 'create').mockRejectedValueOnce(new Error('CRM down'));
    try {
      const saved = (await complete(task, { outcome: 'rejected', doNotContact: true }).expect(200)).body.data;
      expect(saved.task.attempts[0].sync.status).toBe('failed');
      // Simulate crash before suppression ledger write: durable attempt still blocks eligibility.
      await CallSuppression.deleteMany({});
      expect((await create([lead])).summary.ineligible).toBe(1);
      await request(server).post(`${BASE}/tasks/${task.id}/sync`).set(auth(tokenA)).expect(200);
      const comm = await LeadCommunication.findOne({ operationId: `simcall-${attemptOf(task)}` }).lean();
      expect(comm.outcome.doNotContact).toBe(true);
      expect(await CallSuppression.countDocuments()).toBeGreaterThan(0);
    } finally { spy.mockRestore(); }
  });

  it('reports a failed CRM receipt as retryable and keeps the original answer snapshot', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    const svc = (await import('../../src/modules/crm/leadCommunication.service.js')).default;
    const spy = jest.spyOn(svc, 'complete').mockResolvedValueOnce({ receipt: { completedAt: null, steps: { contactLog: { status: 'failed' } } } });
    try {
      const result = (await complete(task, { outcome: 'answered', answers: [
        { fieldKey: 'right_contact', status: 'unknown' }, { fieldKey: 'interest', status: 'answered', value: 'high' },
      ] }).expect(200)).body.data;
      expect(result.task.attempts[0].sync.status).toBe('failed');
    } finally { spy.mockRestore(); }
    await SimCallTask.updateOne({ _id: task.id }, { $set: { 'answers.1.value': 'low' } });
    await request(server).post(`${BASE}/tasks/${task.id}/sync`).set(auth(tokenA)).expect(200);
    const log = await ContactLog.findOne({ leadId: lead._id }).lean();
    expect(log.note).toContain('Interest: high');
    expect(log.note).not.toContain('Interest: low');
  });

  it.each(['no_answer', 'callback_requested', 'failed'])('does not reopen a cancelled campaign after an in-flight %s outcome', async (outcome) => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    await request(server).post(`${BASE}/campaigns/${c._id}/cancel`).set(auth(tokenA)).expect(200);
    const result = (await complete(task, { outcome,
      ...(outcome === 'callback_requested' ? { callback: { at: new Date(Date.now() + 86400_000).toISOString(), timezone: 'UTC' } } : {}),
    }).expect(200)).body.data.task;
    expect(result.state).toBe('cancelled');
    expect(result.notBefore).toBeNull();
    if (result.callback) expect(result.callback.status).toBe('cancelled');
    await claim(c._id).expect(409);
  });
  it('records an answered call: answers, notes, transcript → CRM contact log + lead stamp', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    const payload = {
      outcome: 'answered', interest: 'interested', notes: 'Wants a demo', transcript: 'Owner, very interested, budget 5000',
      answers: [
        { fieldKey: 'right_contact', status: 'answered', value: 'yes' },
        { fieldKey: 'interest', status: 'answered', value: 'high' },
        { fieldKey: 'budget', status: 'answered', value: '5000' },
      ],
      call: { evidence: 'call_state', offhookDurationSec: 95 },
    };
    const res = (await complete(task, payload).expect(200)).body.data;
    expect(res.replayed).toBe(false);
    expect(res.task).toMatchObject({ state: 'completed', outcome: 'answered', attemptCount: 1 });
    expect(res.task.attempts[0]).toMatchObject({ outcome: 'answered', evidence: 'call_state', offhookDurationSec: 95, sync: { status: 'ok' } });
    const comm = await LeadCommunication.findOne({ operationId: `simcall-${attemptOf(task)}` }).lean();
    expect(comm).toMatchObject({ route: 'sim_call_campaign', mode: 'assisted', state: 'completed' });
    expect(comm.outcome).toMatchObject({ disposition: 'interested', connected: 'yes' });
    const log = await ContactLog.findOne({ leadId: lead._id }).lean();
    expect(log.note).toMatch(/Interest: high/);
    expect(log.note).toMatch(/Voice note \(transcribed, reviewed by the caller\)/);
    const fresh = await Lead.findById(lead._id).lean();
    expect(fresh.lastContactChannel).toBe('phone');
    expect(fresh.name).toBe(lead.name); // other lead fields untouched

    // Replay with the same outcome is safe; a different outcome is a conflict.
    const replay = (await complete(task, payload).expect(200)).body.data;
    expect(replay.replayed).toBe(true);
    expect(await LeadCommunication.countDocuments({ leadId: lead._id })).toBe(1);
    expect(await ContactLog.countDocuments({ leadId: lead._id })).toBe(1);
    const diff = await complete(task, { ...payload, outcome: 'rejected' }).expect(409);
    expect(diff.body.error.code).toBe('SIM_CALL_OUTCOME_CONFLICT');
  });

  it('refuses "answered" for a lead that was never dialled', async () => {
    const c = await createRunning([await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await complete(task, { outcome: 'answered' }).expect(409);
    await complete(task, { outcome: 'cancelled' }).expect(200);
  });

  it('retries an unanswered lead after the delay, then closes it after maxAttempts', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    const first = await callOnce(c._id, { outcome: 'no_answer' });
    let t = await SimCallTask.findById(first.id).lean();
    expect(t.state).toBe('pending');
    expect(new Date(t.notBefore).getTime()).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect((await claim(c._id).expect(200)).body.data).toMatchObject({ task: null, reason: 'waiting' });
    await SimCallTask.updateOne({ _id: first.id }, { $set: { notBefore: new Date(Date.now() - 1000) } });
    await callOnce(c._id, { outcome: 'busy' });
    t = await SimCallTask.findById(first.id).lean();
    expect(t).toMatchObject({ state: 'completed', outcome: 'busy', attemptCount: 2 });
    const camp = (await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenA))).body.data;
    expect(camp.status).toBe('completed'); // nothing left → campaign completes itself
    expect(await LeadCommunication.countDocuments({ leadId: lead._id })).toBe(2);
  });

  it('a failed sync is kept, visible, and retried', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    await Lead.collection.updateOne({ _id: lead._id }, { $set: { _id: lead._id } }); // no-op, lead still exists
    const realCreate = (await import('../../src/modules/crm/leadCommunication.service.js')).default.create;
    const svc = (await import('../../src/modules/crm/leadCommunication.service.js')).default;
    svc.create = jest.fn(async () => { throw new Error('CRM down'); });
    try {
      const res = (await complete(task, { outcome: 'answered', answers: UNKNOWN_REQUIRED }).expect(200)).body.data;
      expect(res.task.attempts[0].sync).toMatchObject({ status: 'failed', error: 'CRM down' });
      expect((await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenA))).body.data.summary.syncFailed).toBe(1);
    } finally {
      svc.create = realCreate;
    }
    const retried = (await request(server).post(`${BASE}/tasks/${task.id}/sync`).set(auth(tokenA)).expect(200)).body.data;
    expect(retried.attempts[0].sync.status).toBe('ok');
    expect(await LeadCommunication.countDocuments({ leadId: lead._id })).toBe(1);
  });

  it('do-not-contact suppresses the number for every later call', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    await callOnce(c._id, { outcome: 'rejected', doNotContact: true });
    const c2 = await create([lead]);
    expect(c2.summary.ineligible).toBe(1);
  });
});

describe('callbacks', () => {
  const tomorrow = () => new Date(Date.now() + 24 * 3600_000).toISOString();

  it('needs a future time and a timezone; is not requeued before it is due', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await dial(task).expect(200);
    await complete(task, { outcome: 'callback_requested' }).expect(400);
    await complete(task, { outcome: 'callback_requested', callback: { at: new Date(Date.now() - 3600_000).toISOString(), timezone: 'Asia/Karachi' } }).expect(400);
    await complete(task, { outcome: 'callback_requested', callback: { at: tomorrow(), timezone: 'Not/AZone' } }).expect(400);
    const res = (await complete(task, { outcome: 'callback_requested', callback: { at: tomorrow(), timezone: 'Asia/Karachi', reason: 'In a meeting' } }).expect(200)).body.data;
    expect(res.task.state).toBe('scheduled');
    expect(res.task.callback).toMatchObject({ status: 'pending', timezone: 'Asia/Karachi', reason: 'In a meeting' });
    const comm = await LeadCommunication.findOne({ operationId: `simcall-${attemptOf(task)}` }).lean();
    expect(comm.outcome).toMatchObject({ disposition: 'callback_requested', followUpTimezone: 'Asia/Karachi' });
    expect(await ContactLog.countDocuments({ followUpAt: { $ne: null } })).toBe(1); // appears in Follow-ups

    // The other lead is next; the callback is not offered early.
    const next = (await claim(c._id).expect(200)).body.data.task;
    expect(next.id).not.toBe(task.id);
    await complete(next, { outcome: 'cancelled' }).expect(200);
    await SimCallTask.updateOne({ _id: next.id }, { $set: { state: 'completed' } });
    expect((await claim(c._id).expect(200)).body.data.task).toBeNull();
  });

  it('lists pending/overdue, offers due callbacks first, reschedules and cancels', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const cbTask = await callOnce(c._id, { outcome: 'callback_requested', callback: { at: tomorrow(), timezone: 'UTC' } });
    let list = (await request(server).get(`${BASE}/callbacks`).set(auth(tokenA)).expect(200)).body;
    expect(list.data).toHaveLength(1);
    expect(list.data[0]).toMatchObject({ id: cbTask.id, overdue: false, campaign: { name: 'Garage outreach' } });
    expect((await request(server).get(`${BASE}/callbacks`).set(auth(tokenB)).expect(200)).body.data).toHaveLength(0);

    const inTwo = new Date(Date.now() + 2 * 24 * 3600_000).toISOString();
    const moved = (await request(server).patch(`${BASE}/tasks/${cbTask.id}/callback`).set(auth(tokenA)).send({ at: inTwo, timezone: 'Europe/Zurich', reason: 'Asked for Friday' }).expect(200)).body.data;
    expect(moved.callback).toMatchObject({ timezone: 'Europe/Zurich', reason: 'Asked for Friday' });

    // Make it due: overdue list + it is handed out before the remaining pending lead.
    await SimCallTask.updateOne({ _id: cbTask.id }, { $set: { 'callback.at': new Date(Date.now() - 60_000), notBefore: new Date(Date.now() - 60_000) } });
    list = (await request(server).get(`${BASE}/callbacks?status=overdue`).set(auth(tokenA)).expect(200)).body;
    expect(list.data).toHaveLength(1);
    const sweep = await service.sweep();
    expect(sweep.callbacksDue).toBe(1);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'sim_call.callback_due' }), expect.anything());
    const due = (await claim(c._id).expect(200)).body.data.task;
    expect(due.id).toBe(cbTask.id);
    await dial(due).expect(200);
    const done = (await complete(due, { outcome: 'answered', answers: UNKNOWN_REQUIRED }).expect(200)).body.data.task;
    expect(done.callback.status).toBe('done');
  });

  it('cancels a pending callback', async () => {
    const c = await createRunning([await makeLead()]);
    const cbTask = await callOnce(c._id, { outcome: 'callback_requested', callback: { at: tomorrow(), timezone: 'UTC' } });
    const res = (await request(server).delete(`${BASE}/tasks/${cbTask.id}/callback`).set(auth(tokenA)).expect(200)).body.data;
    expect(res).toMatchObject({ state: 'completed', callback: { status: 'cancelled' } });
    await request(server).delete(`${BASE}/tasks/${cbTask.id}/callback`).set(auth(tokenA)).expect(409);
  });
});

describe('recovery', () => {
  it('an expired lock on an undialled lead returns it to the queue; a dialled one needs review (no redial)', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const a = (await claim(c._id, DEVICE).expect(200)).body.data.task;
    const b = (await claim(c._id, DEVICE_2).expect(200)).body.data.task;
    await dial(b, DEVICE_2).expect(200);
    await SimCallTask.updateMany({}, { $set: { 'lock.until': new Date(Date.now() - 1000) } });
    const r = await service.sweep();
    expect(r.staleLocks).toBe(2);
    expect((await SimCallTask.findById(a.id).lean()).state).toBe('pending');
    const reviewed = await SimCallTask.findById(b.id).lean();
    expect(reviewed.state).toBe('needs_review');
    // The device that dialled can still record what happened (e.g. after an app restart).
    const resumed = (await claim(c._id, DEVICE_2).expect(200)).body.data;
    expect(resumed).toMatchObject({ resumed: true });
    expect(resumed.task.id).toBe(b.id);
    await complete(b, { outcome: 'answered', answers: UNKNOWN_REQUIRED }).expect(200);
    const camp = (await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenA))).body.data;
    expect(camp.summary).toMatchObject({ needsReview: 0, completed: 1, answered: 1 });
  });

  it('an undialled lead held when the campaign was cancelled becomes cancelled, not pending', async () => {
    const c = await createRunning([await makeLead(), await makeLead()]);
    const { task } = (await claim(c._id).expect(200)).body.data;
    await request(server).post(`${BASE}/campaigns/${c._id}/cancel`).set(auth(tokenA)).expect(200);
    await SimCallTask.updateOne({ _id: task.id }, { $set: { 'lock.until': new Date(Date.now() - 1000) } });
    await service.sweep();
    expect((await SimCallTask.findById(task.id).lean()).state).toBe('cancelled');
    const camp = (await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenA))).body.data;
    expect(camp.summary).toMatchObject({ pending: 0, inProgress: 0, cancelled: 2 });
  });

  it('retries completed-unreached and skipped leads, never answered ones', async () => {
    const c = await createRunning([await makeLead(), await makeLead()], { settings: { ...ALWAYS_OPEN, maxAttempts: 1 } });
    const answered = await callOnce(c._id, { outcome: 'answered', answers: UNKNOWN_REQUIRED });
    const unreached = await callOnce(c._id, { outcome: 'no_answer' });
    expect((await request(server).get(`${BASE}/campaigns/${c._id}`).set(auth(tokenA))).body.data.status).toBe('completed');
    const res = (await request(server).post(`${BASE}/campaigns/${c._id}/retry`).set(auth(tokenA)).send({}).expect(200)).body.data;
    expect(res.retried).toBe(1);
    expect(res.campaign.status).toBe('paused');
    expect((await SimCallTask.findById(unreached.id).lean()).state).toBe('pending');
    expect((await SimCallTask.findById(answered.id).lean()).state).toBe('completed');
  });

  it('records an activity history without phone numbers', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    await callOnce(c._id, { outcome: 'answered', answers: UNKNOWN_REQUIRED });
    const events = (await request(server).get(`${BASE}/campaigns/${c._id}/events?limit=50`).set(auth(tokenA)).expect(200)).body.data;
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['task.claimed', 'task.dialed', 'task.completed', 'task.synced', 'campaign.completed']));
    expect(JSON.stringify(events)).not.toContain(lead.mobile.slice(-4));
    expect(await SimCallEvent.countDocuments({ campaignId: c._id })).toBe(events.length);
  });

  it('shows a lead its SIM call history', async () => {
    const lead = await makeLead();
    const c = await createRunning([lead]);
    await callOnce(c._id, { outcome: 'answered', answers: [{ fieldKey: 'right_contact', status: 'unknown' }, { fieldKey: 'interest', status: 'answered', value: 'low' }] });
    const res = (await request(server).get(`${BASE}/leads/${lead._id}/tasks`).set(auth(tokenA)).expect(200)).body.data;
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({ outcome: 'answered', campaign: { name: 'Garage outreach' } });
    expect((await request(server).get(`${BASE}/leads/${lead._id}/tasks`).set(auth(tokenB)).expect(200)).body.data).toHaveLength(0);
  });
});

describe('model', () => {
  it('has one task per lead per campaign (unique index)', async () => {
    const c = await create([await makeLead()]);
    const t = await SimCallTask.findOne({ campaignId: c._id }).lean();
    await expect(SimCallTask.create({ campaignId: c._id, leadId: t.leadId, createdBy: userA._id })).rejects.toThrow(/duplicate key/);
    expect(await SimCallCampaign.countDocuments()).toBe(1);
  });
});

describe('mobile calling readiness', () => {
  it('reports SIM calling as available without any cloud telephony, and cloud calling as optional', async () => {
    const res = await request(server).get(`${BASE}/readiness`).set(auth(tokenA)).expect(200);
    expect(res.body.data).toMatchObject({
      simCalling: { available: true },
      simSms: { available: true },
      ai: { configured: expect.any(Boolean) },
      cloudCalling: { configured: expect.any(Boolean), required: false },
    });
    expect(Date.parse(res.body.data.serverTime)).not.toBeNaN();
  });

  it('requires authentication', async () => {
    await request(server).get(`${BASE}/readiness`).expect(401);
  });
});
