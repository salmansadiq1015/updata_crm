import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * HTTP-level tests for device-originated lead communications (mobile SIM call /
 * SMS composer) and lead qualification: the real lead router (sub-routes
 * mounted), real authenticate + requirePermission against DB roles, Joi
 * validation, controller and service. Only infrastructure (queue, Redis session
 * + cache) and the OpenAI client are stubbed.
 */

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({})) },
}));
// No Redis in unit tests: getRedisClient throws so rate limiters fall back to
// their in-memory store (their documented degradation path).
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

const ai = { configured: false, create: jest.fn() };
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => ai.configured,
  assertAiConfigured: () => {},
  createChatModel: async () => ({}),
  createOpenAiClient: async () => ({ chat: { completions: { create: ai.create } } }),
}));

const stt = { transcribe: jest.fn() };
jest.unstable_mockModule('../../src/modules/ai/sttGateway.service.js', () => ({ default: stt }));

let mongod;
let app;
let Lead; let User; let Role; let Permission;
let LeadCommunication; let ContactLog; let CallSuppression; let MessageSuppression; let LeadChannelConsent;
let contactLogService; let phoneHash; let destinationHash; let generateAccessToken; let auditService;

let userA; let userB; let tokenA; let tokenB;
let leadCounter = 0;

const base = (leadId) => `/api/v1/crm/leads/${leadId}`;
const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function makeUser(permissionIds) {
  const role = await Role.create({ name: `CommRole_${randomUUID()}`, permissions: permissionIds });
  return User.create({
    email: `comm-${randomUUID()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Field',
    lastName: 'Agent',
    role: role._id,
    status: 'active',
  });
}

async function makeLead(overrides = {}) {
  leadCounter += 1;
  return Lead.create({
    leadNumber: `L-${90000 + leadCounter}`,
    name: `Acme ${leadCounter}`,
    source: 'manual',
    phone: '044 123 45 67',
    mobile: '+41 79 765 43 21',
    address: { country: 'CH', city: 'Zürich' },
    createdBy: userA._id,
    ...overrides,
  });
}

function startBody(overrides = {}) {
  return {
    operationId: randomUUID(),
    channel: 'phone',
    route: 'dialer_handoff',
    mode: 'manual',
    destinationField: 'mobile',
    sim: { subscriptionId: 2, slotIndex: 0, carrierName: 'Swisscom', displayName: 'Work', isEmbedded: false, originNumber: null, originNumberSource: null },
    device: { platform: 'android', osVersion: '14', appVersion: '1.0.0', model: 'Pixel 8' },
    ...overrides,
  };
}

async function start(lead, overrides = {}, token = tokenA) {
  const body = startBody(overrides);
  const res = await request(app).post(`${base(lead._id)}/communications`).set(auth(token)).send(body);
  return { body, res };
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
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  MessageSuppression = (await import('../../src/modules/messaging/suppression.model.js')).default;
  LeadChannelConsent = (await import('../../src/modules/messaging/consent.model.js')).default;
  contactLogService = (await import('../../src/modules/crm/contactLog.service.js')).default;
  auditService = (await import('../../src/modules/auth/audit.service.js')).default;
  ({ phoneHash } = await import('../../src/modules/aiCalling/callAuth.js'));
  ({ destinationHash } = await import('../../src/modules/messaging/destinationHash.js'));
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  // ContactLog entries populate these refs (registered by the full app at boot).
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await LeadCommunication.init();

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
    if (key === 'leadcommunications') continue; // keep its unique index; cleared below
    await mongoose.connection.collections[key].deleteMany({});
  }
  await LeadCommunication.deleteMany({});
  ai.configured = false;
  ai.create.mockReset();
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'Read leads' },
    { module: 'lead', action: 'write', description: 'Write leads' },
  ]);
  const permIds = perms.map((p) => p._id);
  userA = await makeUser(permIds);
  userB = await makeUser(permIds);
  tokenA = generateAccessToken({ sub: String(userA._id) });
  tokenB = generateAccessToken({ sub: String(userB._id) });
});

afterEach(() => { jest.restoreAllMocks(); });

describe('auth + permissions', () => {
  it('rejects unauthenticated and under-privileged callers', async () => {
    const lead = await makeLead();
    await request(app).get(`${base(lead._id)}/communications`).expect(401);
    const reader = await makeUser([]);
    const token = generateAccessToken({ sub: String(reader._id) });
    await request(app).get(`${base(lead._id)}/communications`).set(auth(token)).expect(403);
  });

  it('404s for a soft-deleted lead and 400s for a bad leadId', async () => {
    const lead = await makeLead({ isDeleted: true, deletedAt: new Date() });
    await request(app).get(`${base(lead._id)}/communications`).set(auth(tokenA)).expect(404);
    await request(app).get(`${base('nope')}/communications`).set(auth(tokenA)).expect(400);
  });
});

describe('eligibility + create', () => {
  it('reports eligibility with a masked destination', async () => {
    const lead = await makeLead();
    const res = await request(app).get(`${base(lead._id)}/communications/eligibility`)
      .query({ channel: 'phone', destinationField: 'mobile' }).set(auth(tokenA)).expect(200);
    expect(res.body.data).toEqual({ eligible: true, reasons: [], destinationMasked: '•••• 4321' });

    const empty = await makeLead({ mobile: null });
    const none = await request(app).get(`${base(empty._id)}/communications/eligibility`)
      .query({ channel: 'sms', destinationField: 'mobile' }).set(auth(tokenA)).expect(200);
    expect(none.body.data).toMatchObject({ eligible: false, reasons: ['NO_DESTINATION'] });

    const bad = await makeLead({ phone: 'call reception' });
    const invalid = await request(app).get(`${base(bad._id)}/communications/eligibility`)
      .query({ channel: 'phone', destinationField: 'phone' }).set(auth(tokenA)).expect(200);
    expect(invalid.body.data.reasons).toEqual(['INVALID_NUMBER']);
  });

  it('allows a converted lead (not a block)', async () => {
    const lead = await makeLead({ status: 'converted' });
    const res = await request(app).get(`${base(lead._id)}/communications/eligibility`)
      .query({ channel: 'phone', destinationField: 'phone' }).set(auth(tokenA)).expect(200);
    expect(res.body.data.eligible).toBe(true);
  });

  it('creates 201, then the same operationId returns 200 with the same id; destination comes from the lead', async () => {
    const lead = await makeLead();
    const { body, res } = await start(lead);
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.dialNumber).toBe('+41 79 765 43 21');
    expect(data).toMatchObject({
      operationId: body.operationId, leadId: String(lead._id), channel: 'phone', route: 'dialer_handoff',
      state: 'started', destinationField: 'mobile', destinationMasked: '•••• 4321',
    });
    expect(data.destinationHash).toBeUndefined();
    expect(data.events).toEqual([expect.objectContaining({ seq: 0, type: 'created', source: 'app' })]);
    expect(data.sim).toMatchObject({ subscriptionId: 2, carrierName: 'Swisscom' });

    const stored = await LeadCommunication.findById(data.id).lean();
    expect(stored.destinationHash).toBe(phoneHash('+41797654321'));

    const again = await request(app).post(`${base(lead._id)}/communications`).set(auth(tokenA)).send(body).expect(200);
    expect(again.body.data.id).toBe(data.id);
    expect(again.body.data.dialNumber).toBe('+41 79 765 43 21');
    expect(await LeadCommunication.countDocuments()).toBe(1);

    // A client-sent number is ignored (stripped) — the lead is the only source.
    const withNumber = await request(app).post(`${base(lead._id)}/communications`).set(auth(tokenA))
      .send({ ...startBody({ destinationField: 'phone' }), number: '+41000000000' }).expect(201);
    expect(withNumber.body.data.dialNumber).toBe('044 123 45 67');
  });

  it('409 OPERATION_ID_CONFLICT when the operationId is reused for another lead or channel', async () => {
    const lead = await makeLead();
    const other = await makeLead();
    const { body } = await start(lead);
    const res = await request(app).post(`${base(other._id)}/communications`).set(auth(tokenA)).send(body).expect(409);
    expect(res.body.error.code).toBe('OPERATION_ID_CONFLICT');
    const res2 = await request(app).post(`${base(lead._id)}/communications`).set(auth(tokenA))
      .send({ ...body, channel: 'sms', route: 'sms_composer' }).expect(409);
    expect(res2.body.error.code).toBe('OPERATION_ID_CONFLICT');
  });

  it('409 CONTACT_NOT_ELIGIBLE when the number is call-suppressed, and stores nothing', async () => {
    const lead = await makeLead();
    await CallSuppression.create({ phoneHash: phoneHash('+41797654321'), reason: 'do_not_contact' });
    const { res } = await start(lead);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONTACT_NOT_ELIGIBLE');
    expect(res.body.error.data.reasons).toEqual(['PHONE_SUPPRESSED']);
    expect(res.body.error.details[0]).toMatchObject({ field: 'destination', code: 'PHONE_SUPPRESSED' });
    expect(await LeadCommunication.countDocuments()).toBe(0);
    // The other field is still callable.
    const { res: ok } = await start(lead, { destinationField: 'phone' });
    expect(ok.status).toBe(201);
  });

  it('blocks SMS on messaging suppression and on denied consent', async () => {
    const lead = await makeLead();
    await MessageSuppression.create({ channel: 'sms', destinationHash: destinationHash('sms', '+41797654321'), reason: 'opt_out' });
    await LeadChannelConsent.create({ leadId: lead._id, channel: 'sms', status: 'revoked' });
    const { res } = await start(lead, { channel: 'sms', route: 'sms_composer' });
    expect(res.status).toBe(409);
    expect(res.body.error.data.reasons).toEqual(['SMS_SUPPRESSED', 'SMS_CONSENT_DENIED']);
  });

  it('rejects a route that does not fit the channel', async () => {
    const lead = await makeLead();
    const { res } = await start(lead, { channel: 'sms', route: 'dialer_handoff' });
    expect(res.status).toBe(400);
  });
});

describe('events', () => {
  it('dedupes by seq, derives observed from call states, transitions state, accepts late events', async () => {
    const lead = await makeLead();
    const { body } = await start(lead);
    const url = `${base(lead._id)}/communications/${body.operationId}/events`;
    const t0 = Date.parse('2026-10-16T09:00:00.000Z');
    const at = (s) => new Date(t0 + s * 1000).toISOString();

    const first = await request(app).post(url).set(auth(tokenA)).send({
      events: [
        { seq: 1, type: 'dispatch_requested', at: at(0), source: 'app' },
        { seq: 2, type: 'dispatched', at: at(1), source: 'native', data: { route: 'dialer_handoff' } },
        { seq: 3, type: 'call_state_offhook', at: at(2), source: 'native' },
      ],
    }).expect(200);
    expect(first.body.data.state).toBe('dispatched');
    expect(first.body.data.observed).toMatchObject({ evidence: 'telephony_events', offhookDurationSec: null, ringingObserved: false });

    // Replayed seq 3 (different payload) is ignored; idle arrives out of order.
    const second = await request(app).post(url).set(auth(tokenA)).send({
      events: [
        { seq: 3, type: 'app_backgrounded', at: at(3), source: 'app' },
        { seq: 5, type: 'call_state_idle', at: at(132), source: 'native' },
        { seq: 4, type: 'app_backgrounded', at: at(3), source: 'app' },
      ],
    }).expect(200);
    const comm = second.body.data;
    expect(comm.events.map((e) => e.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(comm.events[3].type).toBe('call_state_offhook');
    expect(comm.observed).toEqual({
      ringingObserved: false, offhookAt: at(2), idleAfterOffhookAt: at(132), offhookDurationSec: 130, evidence: 'telephony_events',
    });

    // Complete, then a late event is still appended without touching the outcome.
    await request(app).post(`${base(lead._id)}/communications/${body.operationId}/complete`).set(auth(tokenA))
      .send({ outcome: { disposition: 'no_answer', connected: 'no', notes: '' } }).expect(200);
    const late = await request(app).post(url).set(auth(tokenA)).send({
      events: [{ seq: 6, type: 'app_foregrounded', at: at(140), source: 'app' }, { seq: 7, type: 'dispatch_failed', at: at(141), source: 'app' }],
    }).expect(200);
    expect(late.body.data.state).toBe('completed');
    expect(late.body.data.outcome.disposition).toBe('no_answer');
    expect(late.body.data.events).toHaveLength(8);
  });

  it('dispatch_failed sets the state', async () => {
    const lead = await makeLead();
    const { body } = await start(lead);
    const res = await request(app).post(`${base(lead._id)}/communications/${body.operationId}/events`).set(auth(tokenA))
      .send({ events: [{ seq: 1, type: 'dispatch_requested', at: new Date().toISOString(), source: 'app' }, { seq: 2, type: 'dispatch_failed', at: new Date().toISOString(), source: 'native', data: { reason: 'no_permission' } }] })
      .expect(200);
    expect(res.body.data.state).toBe('dispatch_failed');
  });

  it("another user cannot append to someone else's operation (404)", async () => {
    const lead = await makeLead();
    const { body } = await start(lead);
    await request(app).post(`${base(lead._id)}/communications/${body.operationId}/events`).set(auth(tokenB))
      .send({ events: [{ seq: 1, type: 'dispatched', at: new Date().toISOString(), source: 'app' }] })
      .expect(404);
    await request(app).post(`${base(lead._id)}/communications/${body.operationId}/complete`).set(auth(tokenB))
      .send({ outcome: { disposition: 'busy', connected: 'no', notes: '' } })
      .expect(404);
  });
});

describe('complete', () => {
  it('happy path: outcome, ContactLog, lead contact, status change, qualification merge, DNC on both channels', async () => {
    const lead = await makeLead({
      status: 'new',
      qualification: {
        fields: [
          { fieldKey: 'budget', label: 'Budget', value: 9000, status: 'answered', source: 'user' },
          { fieldKey: 'role', label: 'Contact role', value: 'CFO', status: 'answered', source: 'user' },
        ],
        updatedAt: new Date('2026-01-01'),
      },
    });
    const { body, res } = await start(lead, { destinationField: 'phone' });
    const audit = jest.spyOn(auditService, 'logEvent');
    const followUpAt = '2026-10-20T08:00:00.000Z';
    const done = await request(app).post(`${base(lead._id)}/communications/${body.operationId}/complete`).set(auth(tokenA))
      .send({
        outcome: {
          disposition: 'do_not_contact', connected: 'yes', notes: 'Asked not to be called again.',
          followUpAt, followUpTimezone: 'Europe/Zurich', statusChange: 'unqualified', doNotContact: true,
        },
        qualification: {
          answers: [
            { fieldKey: 'budget', label: 'Budget', value: null, status: 'unknown', source: 'user', evidence: null, confidence: null },
            { fieldKey: 'interest', label: 'Interest', value: 'none', status: 'answered', source: 'user', evidence: null, confidence: null },
            { fieldKey: 'role', label: 'Role', value: null, status: 'refused', source: 'user', evidence: null, confidence: null },
          ],
        },
      })
      .expect(200);

    const { communication, receipt } = done.body.data;
    expect(communication.state).toBe('completed');
    expect(communication.completedAt).toBeTruthy();
    expect(communication.outcome).toMatchObject({ disposition: 'do_not_contact', connected: 'yes', followUpAt, followUpTimezone: 'Europe/Zurich' });
    expect(Object.fromEntries(Object.entries(receipt.steps).map(([k, v]) => [k, v.status]))).toEqual({
      outcome: 'ok', contactLog: 'ok', leadContact: 'ok', statusChange: 'ok', qualification: 'ok', suppression: 'ok',
    });
    expect(receipt.completedAt).toBeTruthy();
    expect(communication.createdBy).toMatchObject({ firstName: 'Field', lastName: 'Agent' });

    const logs = await ContactLog.find({ leadId: lead._id }).lean();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ channel: 'phone', subject: 'Phone call (mobile) — do_not_contact', note: 'Asked not to be called again.' });
    expect(logs[0].followUpAt.toISOString()).toBe(followUpAt);
    expect(String(communication.contactLogId)).toBe(String(logs[0]._id));

    const updated = await Lead.findById(lead._id).lean();
    expect(updated.status).toBe('unqualified');
    expect(updated.lastContactChannel).toBe('phone');
    expect(updated.lastContactedAt.toISOString()).toBe(res.body.data.createdAt);
    const fields = Object.fromEntries(updated.qualification.fields.map((f) => [f.fieldKey, f]));
    expect(fields.budget.value).toBe(9000); // unknown never overwrites
    expect(fields.budget.status).toBe('answered');
    expect(fields.interest).toMatchObject({ value: 'none', status: 'answered', source: 'user' });
    expect(String(fields.interest.communicationId)).toBe(communication.id);
    expect(String(fields.interest.updatedBy)).toBe(String(userA._id));
    expect(fields.role).toMatchObject({ status: 'refused', value: null });

    expect(await CallSuppression.exists({ phoneHash: phoneHash('+41441234567'), reason: 'do_not_contact' })).toBeTruthy();
    expect(await MessageSuppression.exists({ channel: 'sms', destinationHash: destinationHash('sms', '+41441234567'), reason: 'opt_out' })).toBeTruthy();

    // lead.updated (status via lead service) + completion audit without PII.
    const types = audit.mock.calls.map(([e]) => e.eventType);
    expect(types).toEqual(expect.arrayContaining(['lead.updated', 'lead.communication_completed']));
    const completion = audit.mock.calls.find(([e]) => e.eventType === 'lead.communication_completed')[0];
    expect(completion.module).toBe('lead');
    expect(JSON.stringify(completion.details)).not.toMatch(/Asked not|4567|\+41/);

    // Next attempts on both channels are now blocked.
    expect((await start(lead, { destinationField: 'phone' })).res.status).toBe(409);
    expect((await start(lead, { destinationField: 'phone', channel: 'sms', route: 'sms_composer' })).res.status).toBe(409);

    // GET qualification + lead detail expose the merged fields.
    const q = await request(app).get(`${base(lead._id)}/qualification`).set(auth(tokenA)).expect(200);
    expect(q.body.data.schema.map((f) => f.fieldKey)).toContain('decision_authority');
    expect(q.body.data.fields).toHaveLength(3);
    const detail = await request(app).get(base(lead._id)).set(auth(tokenA)).expect(200);
    expect(detail.body.data.qualification.fields).toHaveLength(3);
  });

  it('identical retry returns stored result; differing outcome → 409 ALREADY_COMPLETED', async () => {
    const lead = await makeLead();
    const { body } = await start(lead);
    const url = `${base(lead._id)}/communications/${body.operationId}/complete`;
    const payload = { outcome: { disposition: 'interested', connected: 'yes', notes: 'Wants a quote.' } };
    const first = await request(app).post(url).set(auth(tokenA)).send(payload).expect(200);
    const again = await request(app).post(url).set(auth(tokenA)).send(payload).expect(200);
    expect(again.body.data.communication.contactLogId).toBe(first.body.data.communication.contactLogId);
    expect(await ContactLog.countDocuments({ leadId: lead._id })).toBe(1);
    const res = await request(app).post(url).set(auth(tokenA))
      .send({ outcome: { disposition: 'not_interested', connected: 'yes', notes: 'Wants a quote.' } }).expect(409);
    expect(res.body.error.code).toBe('ALREADY_COMPLETED');
  });

  it('resumes after a failed contactLog step without duplicating the ContactLog', async () => {
    const lead = await makeLead();
    const { body } = await start(lead);
    const url = `${base(lead._id)}/communications/${body.operationId}/complete`;
    const original = contactLogService.create.bind(contactLogService);
    const spy = jest.spyOn(contactLogService, 'create')
      .mockImplementationOnce(async () => { throw new Error('db hiccup'); })
      .mockImplementation(original);
    const payload = { outcome: { disposition: 'callback_requested', connected: 'yes', notes: 'Call back Monday.', statusChange: 'contacted' } };

    const first = await request(app).post(url).set(auth(tokenA)).send(payload).expect(200);
    expect(first.body.data.receipt.steps.contactLog).toMatchObject({ status: 'failed', error: 'db hiccup' });
    expect(first.body.data.receipt.steps.leadContact.status).toBe('ok');
    expect(first.body.data.receipt.steps.statusChange.status).toBe('ok');
    expect(first.body.data.receipt.completedAt).toBeNull();
    expect(await ContactLog.countDocuments({ leadId: lead._id })).toBe(0);

    const second = await request(app).post(url).set(auth(tokenA)).send(payload).expect(200);
    expect(second.body.data.receipt.steps.contactLog.status).toBe('ok');
    expect(second.body.data.receipt.completedAt).toBeTruthy();
    // statusChange was not re-run (still the first timestamp).
    expect(second.body.data.receipt.steps.statusChange.at).toBe(first.body.data.receipt.steps.statusChange.at);
    expect(spy).toHaveBeenCalledTimes(2);

    await request(app).post(url).set(auth(tokenA)).send(payload).expect(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await ContactLog.countDocuments({ leadId: lead._id })).toBe(1);
  });

  it("protects 'converted' leads from status changes while other steps still run", async () => {
    const lead = await makeLead({ status: 'converted' });
    const { body } = await start(lead);
    const res = await request(app).post(`${base(lead._id)}/communications/${body.operationId}/complete`).set(auth(tokenA))
      .send({ outcome: { disposition: 'interested', connected: 'yes', notes: 'x', statusChange: 'qualified' } }).expect(200);
    expect(res.body.data.receipt.steps.statusChange).toMatchObject({ status: 'failed', error: 'LEAD_CONVERTED_PROTECTED' });
    expect(res.body.data.receipt.steps.contactLog.status).toBe('ok');
    expect((await Lead.findById(lead._id).lean()).status).toBe('converted');

    const lead2 = await makeLead({ status: 'qualified' });
    const { body: b2 } = await start(lead2);
    const res2 = await request(app).post(`${base(lead2._id)}/communications/${b2.operationId}/complete`).set(auth(tokenA))
      .send({ outcome: { disposition: 'interested', connected: 'yes', notes: 'x', statusChange: 'converted' } }).expect(200);
    expect(res2.body.data.receipt.steps.statusChange.error).toBe('LEAD_CONVERTED_PROTECTED');
    expect((await Lead.findById(lead2._id).lean()).status).toBe('qualified');
  });

  it('SMS: stores body/sendStatus, skips leadContact when user reports not sent', async () => {
    const lead = await makeLead();
    const { body } = await start(lead, { channel: 'sms', route: 'sms_composer' });
    const res = await request(app).post(`${base(lead._id)}/communications/${body.operationId}/complete`).set(auth(tokenA))
      .send({
        outcome: { disposition: 'not_sent', connected: 'unknown', notes: '' },
        sms: { templateId: null, body: 'Hallo, kurze Rückfrage', encoding: 'GSM-7', segments: 1, sendStatus: 'user_reported_not_sent' },
      }).expect(200);
    const { communication, receipt } = res.body.data;
    expect(communication.sms).toMatchObject({ body: 'Hallo, kurze Rückfrage', sendStatus: 'user_reported_not_sent' });
    expect(receipt.steps.leadContact.status).toBe('skipped');
    expect(receipt.steps.statusChange.status).toBe('skipped');
    expect(receipt.steps.qualification.status).toBe('skipped');
    expect(receipt.steps.suppression.status).toBe('skipped');
    const log = await ContactLog.findOne({ leadId: lead._id }).lean();
    expect(log).toMatchObject({ channel: 'sms', subject: 'SMS (mobile) — user_reported_not_sent' });
    expect((await Lead.findById(lead._id).lean()).lastContactChannel).toBeNull();
  });

  it('validates followUpTimezone and qualification values', async () => {
    const lead = await makeLead();
    const { body } = await start(lead);
    const url = `${base(lead._id)}/communications/${body.operationId}/complete`;
    await request(app).post(url).set(auth(tokenA))
      .send({ outcome: { disposition: 'interested', connected: 'yes', notes: '', followUpAt: '2026-10-20T08:00:00.000Z' } }).expect(400);
    await request(app).post(url).set(auth(tokenA))
      .send({ outcome: { disposition: 'interested', connected: 'yes', notes: '', followUpAt: '2026-10-20T08:00:00.000Z', followUpTimezone: 'Mars/Base' } }).expect(400);
    await request(app).post(url).set(auth(tokenA))
      .send({ outcome: { disposition: 'interested', connected: 'yes', notes: '' }, qualification: { answers: [{ fieldKey: 'timeline', value: 'someday maybe', status: 'answered' }] } })
      .expect(400);
    expect((await LeadCommunication.findOne({ operationId: body.operationId }).lean()).outcome).toBeNull();
  });
});

describe('list', () => {
  it('lists company-wide, newest first, with cursor pagination', async () => {
    const lead = await makeLead();
    await start(lead);
    await start(lead, {}, tokenB);
    await start(lead, { destinationField: 'phone' });
    const page1 = await request(app).get(`${base(lead._id)}/communications`).query({ limit: 2 }).set(auth(tokenB)).expect(200);
    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.pagination.hasNext).toBe(true);
    expect(page1.body.data[0].destinationHash).toBeUndefined();
    expect(page1.body.data[0].createdBy).toMatchObject({ firstName: 'Field' });
    const page2 = await request(app).get(`${base(lead._id)}/communications`)
      .query({ limit: 2, cursor: page1.body.pagination.nextCursor }).set(auth(tokenB)).expect(200);
    expect(page2.body.data).toHaveLength(1);
    const ids = [...page1.body.data, ...page2.body.data].map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
    const created = [...page1.body.data, ...page2.body.data].map((c) => c.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });
});

describe('qualification propose', () => {
  it('returns available:false when OpenAI is not configured', async () => {
    const lead = await makeLead();
    const res = await request(app).post(`${base(lead._id)}/qualification/propose`).set(auth(tokenA))
      .send({ notes: 'Budget is 5000 CHF.' }).expect(200);
    expect(res.body.data).toEqual({ available: false, reason: 'ai_not_configured', proposals: [] });
    expect(ai.create).not.toHaveBeenCalled();
  });

  it('keeps only proposals with verbatim evidence and valid values; never writes', async () => {
    ai.configured = true;
    const notes = 'Spoke to Anna, she is the decision maker. Budget around CHF 5,000. Wants to start immediately.';
    ai.create.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            proposals: [
              { fieldKey: 'budget', value: '5000', status: 'answered', evidence: 'Budget around CHF 5,000' },
              { fieldKey: 'decision_authority', value: 'decision_maker', status: 'answered', evidence: 'she is the decision maker' },
              { fieldKey: 'timeline', value: 'immediate', status: 'answered', evidence: 'wants to start right away' }, // invented quote
              { fieldKey: 'interest', value: 'high', status: 'answered', evidence: 'very keen on it' }, // invented
              { fieldKey: 'timeline', value: 'eventually', status: 'answered', evidence: 'Wants to start immediately' }, // invalid option
              { fieldKey: 'favourite_colour', value: 'blue', status: 'answered', evidence: 'Anna' }, // unknown field
            ],
          }),
        },
      }],
    });
    const lead = await makeLead();
    const res = await request(app).post(`${base(lead._id)}/qualification/propose`).set(auth(tokenA))
      .send({ notes, language: 'en' }).expect(200);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.promptVersion).toBeTruthy();
    expect(res.body.data.proposals).toEqual([
      { fieldKey: 'budget', label: 'Budget', proposedValue: 5000, status: 'answered', evidence: 'Budget around CHF 5,000', confidence: null },
      { fieldKey: 'decision_authority', label: 'Decision authority', proposedValue: 'decision_maker', status: 'answered', evidence: 'she is the decision maker', confidence: null },
    ]);
    const [requestBody, options] = ai.create.mock.calls[0];
    expect(requestBody.temperature).toBe(0);
    expect(requestBody.messages[0].content).toMatch(/UNTRUSTED DATA/);
    expect(options.timeout).toBe(20000);
    expect((await Lead.findById(lead._id).lean()).qualification).toBeNull();
  });

  it('degrades to ai_unavailable on a provider error', async () => {
    ai.configured = true;
    ai.create.mockRejectedValue(new Error('upstream 500'));
    const lead = await makeLead();
    const res = await request(app).post(`${base(lead._id)}/qualification/propose`).set(auth(tokenA))
      .send({ notes: 'anything' }).expect(200);
    expect(res.body.data).toMatchObject({ available: false, reason: 'ai_unavailable', proposals: [] });
  });
});

describe('voice note transcription (after the call)', () => {
  const audio = Buffer.from('fake-m4a-bytes');

  it('reports unavailable without an AI key, transcribes with one, and rejects non-audio uploads', async () => {
    const lead = await makeLead();
    const url = `${base(lead._id)}/qualification/transcribe`;
    let res = await request(app).post(url).set(auth(tokenA)).attach('audio', audio, { filename: 'note.m4a', contentType: 'audio/mp4' }).expect(200);
    expect(res.body.data).toMatchObject({ available: false, reason: 'ai_not_configured' });

    ai.configured = true;
    stt.transcribe.mockResolvedValueOnce({ text: ' Interested, budget about 20k, call back Friday. ', confidence: 0.9 });
    res = await request(app).post(url).set(auth(tokenA)).field('language', 'en').attach('audio', audio, { filename: 'note.m4a', contentType: 'audio/mp4' }).expect(200);
    expect(res.body.data).toEqual({ available: true, text: 'Interested, budget about 20k, call back Friday.', confidence: 0.9 });
    expect(stt.transcribe).toHaveBeenCalledWith(expect.any(Buffer), { mimeType: 'audio/mp4', language: 'en' });

    await request(app).post(url).set(auth(tokenA)).attach('audio', Buffer.from('x'), { filename: 'evil.exe', contentType: 'application/octet-stream' }).expect(400);

    stt.transcribe.mockRejectedValueOnce(new Error('provider down'));
    res = await request(app).post(url).set(auth(tokenA)).attach('audio', audio, { filename: 'note.m4a', contentType: 'audio/mp4' }).expect(200);
    expect(res.body.data).toMatchObject({ available: false, reason: 'ai_unavailable' });
  });

  it('requires lead:write', async () => {
    const lead = await makeLead();
    const reader = await makeUser([]);
    await request(app).post(`${base(lead._id)}/qualification/transcribe`)
      .set(auth(generateAccessToken({ sub: String(reader._id) })))
      .attach('audio', audio, { filename: 'note.m4a', contentType: 'audio/mp4' }).expect(403);
  });
});
