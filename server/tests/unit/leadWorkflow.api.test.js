import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * Lead workflow (Leads-A): unified timeline, answer history + corrections,
 * follow-up inbox, automatic assignment / first-response SLA / escalation.
 * Real routers, authenticate + requirePermission against DB roles, Joi, services
 * and an in-memory MongoDB; only queue / Redis / sessions / cache are stubbed.
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

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const auth = (token) => ({ Authorization: `Bearer ${token}` });
const LEADS = '/api/v1/crm/leads';
const FU = '/api/v1/crm/follow-ups';
const POLICY = '/api/v1/crm/lead-assignment-policy';

let mongod; let server;
let Lead; let User; let Role; let Permission; let LeadCommunication; let ContactLog; let CallRecord;
let SimSmsMessage; let MessageRecipient; let LeadFollowUp; let LeadEvent; let Notification; let CallSuppression;
let leadQualificationService; let leadFollowUpService; let leadSlaService; let leadService; let leadAssignmentService;
let generateAccessToken; let setContactPolicy; let migration032;
let perms;
let userA; let userB; let boss; let tokenA; let tokenB; let tokenBoss;
let counter = 0;

async function makeUser(permissionKeys, extra = {}) {
  const ids = permissionKeys.map((k) => perms[k]);
  const role = await Role.create({ name: `WfRole_${randomUUID()}`, permissions: ids });
  return User.create({
    email: `wf-${randomUUID()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: extra.firstName || 'Sales',
    lastName: extra.lastName || 'Rep',
    role: role._id,
    status: extra.status || 'active',
    department: extra.department || null,
  });
}

async function makeLead(overrides = {}) {
  counter += 1;
  return Lead.create({
    leadNumber: `L-${70000 + counter}`,
    name: `Workflow ${counter}`,
    source: 'manual',
    phone: '044 123 45 67',
    mobile: '+41 79 765 43 21',
    address: { country: 'CH', city: 'Zürich' },
    createdBy: userA._id,
    ...overrides,
  });
}

async function collectTimeline(leadId, token, query = {}, limit = 3) {
  const all = [];
  let cursor = null;
  for (let i = 0; i < 50; i += 1) {
    const res = await request(server).get(`${LEADS}/${leadId}/timeline`).query({ ...query, limit, ...(cursor ? { cursor } : {}) }).set(auth(token)).expect(200);
    all.push(...res.body.data);
    if (!res.body.pagination.hasNext) break;
    cursor = res.body.pagination.nextCursor;
  }
  return all;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  const followUpRoutes = (await import('../../src/modules/crm/leadFollowUp.routes.js')).default;
  const policyRoutes = (await import('../../src/modules/crm/leadAssignmentPolicy.routes.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  SimSmsMessage = (await import('../../src/modules/simSms/simSmsMessage.model.js')).default;
  MessageRecipient = (await import('../../src/modules/messaging/messageRecipient.model.js')).default;
  LeadFollowUp = (await import('../../src/modules/crm/leadFollowUp.model.js')).default;
  LeadEvent = (await import('../../src/modules/crm/leadEvent.model.js')).default;
  Notification = (await import('../../src/modules/notifications/notification.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  leadQualificationService = (await import('../../src/modules/crm/leadQualification.service.js')).default;
  leadFollowUpService = (await import('../../src/modules/crm/leadFollowUp.service.js')).default;
  leadSlaService = (await import('../../src/modules/crm/leadSla.service.js')).default;
  leadService = (await import('../../src/modules/crm/lead.service.js')).default;
  leadAssignmentService = (await import('../../src/modules/crm/leadAssignment.service.js')).default;
  ({ __setContactPolicyForTests: setContactPolicy } = await import('../../src/modules/crm/leadContactSuppression.js'));
  migration032 = await import('../../src/migrations/032_lead_workflow.js');
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await LeadCommunication.init();
  await LeadFollowUp.init();
  await LeadEvent.init();

  const app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use(LEADS, leadRoutes);
  app.use(FU, followUpRoutes);
  app.use(POLICY, policyRoutes);
  app.use(errorHandler);
  server = app.listen(0);
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) {
    if (['leadcommunications', 'leadfollowups', 'leadevents'].includes(key)) continue;
    await mongoose.connection.collections[key].deleteMany({});
  }
  await LeadCommunication.deleteMany({});
  await LeadFollowUp.deleteMany({});
  await LeadEvent.deleteMany({});
  // Deterministic suppression: the local checks (no contact-policy settings involved).
  setContactPolicy(null);
  const docs = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' },
    { module: 'lead', action: 'write', description: 'w' },
    { module: 'lead', action: 'assign-policy', description: 'p' },
  ]);
  perms = Object.fromEntries(docs.map((p) => [`${p.module}:${p.action}`, p._id]));
  userA = await makeUser(['lead:read', 'lead:write'], { firstName: 'Anna', department: 'Sales' });
  userB = await makeUser(['lead:read', 'lead:write'], { firstName: 'Ben', department: 'Sales' });
  boss = await makeUser(['lead:read', 'lead:write', 'lead:assign-policy'], { firstName: 'Boss', department: 'Mgmt' });
  tokenA = generateAccessToken({ sub: String(userA._id) });
  tokenB = generateAccessToken({ sub: String(userB._id) });
  tokenBoss = generateAccessToken({ sub: String(boss._id) });
});

afterEach(() => { jest.restoreAllMocks(); setContactPolicy(undefined); });

// ─────────────────────────────────────────────────────────────── timeline
describe('GET /crm/leads/:leadId/timeline', () => {
  async function seedAllSources(lead, t0, owner = userA) {
    const oid = () => new mongoose.Types.ObjectId();
    const comm = await LeadCommunication.collection.insertOne({
      operationId: randomUUID(), leadId: lead._id, createdBy: owner._id, channel: 'phone', direction: 'outbound', route: 'dialer_handoff',
      mode: 'manual', destinationField: 'mobile', destinationHash: 'h', state: 'completed', events: [],
      outcome: { disposition: 'interested', connected: 'yes', notes: 'Talked', followUpAt: null, doNotContact: false },
      createdAt: new Date(t0 + 1000), updatedAt: new Date(),
    });
    const linkedLog = await ContactLog.create({
      leadId: lead._id, channel: 'phone', note: 'from the communication', occurredAt: new Date(t0 + 1000),
      employeeId: owner._id, createdBy: owner._id, editableUntil: new Date(t0 + DAY),
    });
    await LeadCommunication.collection.updateOne({ _id: comm.insertedId }, { $set: { contactLogId: linkedLog._id } });
    await ContactLog.create({
      leadId: lead._id, channel: 'email', subject: 'Offer', note: 'Sent the offer', occurredAt: new Date(t0 + 2000),
      employeeId: owner._id, createdBy: owner._id, editableUntil: new Date(t0 + DAY),
    });
    const call = await CallRecord.collection.insertOne({
      campaignId: oid(), recipientId: oid(), leadId: lead._id, internalCallId: randomUUID(), attemptNumber: 1, isTest: false,
      createdBy: owner._id, state: 'completed', disposition: 'answered_completed', durationSeconds: 95, answeredAt: new Date(t0 + 3000),
      transcript: [
        { itemId: 'a1', role: 'assistant', text: 'Hello, is this Acme?', at: new Date(t0 + 3000) },
        { itemId: 'c1', role: 'customer', text: 'Yes, our budget is 5000.', at: new Date(t0 + 3500) },
      ],
      callNotes: { summary: 'Interested, budget 5000' },
      createdAt: new Date(t0 + 3000), updatedAt: new Date(),
    });
    await SimSmsMessage.collection.insertOne({
      conversationId: oid(), campaignId: oid(), leadId: lead._id, createdBy: owner._id, direction: 'inbound', kind: 'inbound',
      body: 'Call me tomorrow', status: 'received', createdAt: new Date(t0 + 4000), updatedAt: new Date(),
    });
    await SimSmsMessage.collection.insertOne({
      conversationId: oid(), campaignId: oid(), leadId: lead._id, createdBy: owner._id, direction: 'outbound', kind: 'opening',
      body: 'queued only', status: 'pending', createdAt: new Date(t0 + 4100), updatedAt: new Date(),
    });
    await MessageRecipient.collection.insertOne({
      campaignId: oid(), leadId: lead._id, channel: 'whatsapp', destination: '+41790000000', destinationHash: 'x',
      status: 'delivered', eligibility: { eligible: true, reasons: [] }, rendered: { subject: '', bodyText: 'Hi from WhatsApp' },
      createdBy: owner._id, createdAt: new Date(t0 + 5000), updatedAt: new Date(),
    });
    await MessageRecipient.collection.insertOne({
      campaignId: oid(), leadId: lead._id, channel: 'email', destination: 'a@b.ch', destinationHash: 'y',
      status: 'draft', eligibility: { eligible: true, reasons: [] }, rendered: { subject: 'draft' }, createdBy: owner._id,
      createdAt: new Date(t0 + 5100), updatedAt: new Date(),
    });
    await LeadFollowUp.create({
      leadId: lead._id, ownerId: owner._id, createdBy: owner._id, dueAt: new Date(t0 + DAY), nextDueAt: new Date(t0 + DAY),
      status: 'open', source: { type: 'manual' }, createdAt: new Date(t0 + 6000),
    });
    await LeadEvent.create({ leadId: lead._id, type: 'assignment.auto', at: new Date(t0 + 7000), details: { assignedTo: String(owner._id) } });
    return { callId: call.insertedId, linkedLogId: linkedLog._id };
  }

  it('merges every source newest-first across cursor pages without gaps or repeats', async () => {
    const lead = await makeLead();
    const t0 = Date.now() - HOUR;
    const { linkedLogId } = await seedAllSources(lead, t0);
    await leadQualificationService.mergeAnswers(lead._id, [{ fieldKey: 'budget', label: 'Budget', status: 'answered', value: 5000, source: 'ai_call_agent' }], { userId: null, source: 'ai_call_agent' });

    const entries = await collectTimeline(lead._id, tokenA, {}, 3);
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const types = entries.map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['communication', 'contact_log', 'ai_call', 'sms_message', 'provider_message', 'qualification', 'follow_up', 'workflow']));
    // pending SIM SMS and draft provider messages are not conversation history
    expect(entries.filter((e) => e.type === 'sms_message')).toHaveLength(1);
    expect(entries.filter((e) => e.type === 'provider_message')).toHaveLength(1);
    // the contact log written by a communication is shown through the communication only
    expect(ids).not.toContain(`contact_log:${linkedLogId}`);
    const times = entries.map((e) => Date.parse(e.at));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(entries.find((e) => e.type === 'communication').actor.name).toContain('Anna');
  });

  it('keeps a total order when timestamps tie across sources', async () => {
    const lead = await makeLead();
    const at = new Date(Date.now() - HOUR);
    for (let i = 0; i < 3; i += 1) {
      await LeadEvent.create({ leadId: lead._id, type: 'sla.started', at });
      await ContactLog.create({ leadId: lead._id, channel: 'other', note: `n${i}`, occurredAt: at, employeeId: userA._id, createdBy: userA._id, editableUntil: new Date(Date.now() + DAY) });
    }
    const one = await collectTimeline(lead._id, tokenA, {}, 1);
    const all = await collectTimeline(lead._id, tokenA, {}, 50);
    expect(one.map((e) => e.id)).toEqual(all.map((e) => e.id));
    expect(all).toHaveLength(6);
  });

  it('filters by type and channel', async () => {
    const lead = await makeLead();
    await seedAllSources(lead, Date.now() - HOUR);
    const phone = await collectTimeline(lead._id, tokenA, { channel: 'phone' }, 50);
    expect(phone.length).toBeGreaterThan(0);
    expect(phone.every((e) => e.channel === 'phone')).toBe(true);
    const onlyCalls = await collectTimeline(lead._id, tokenA, { types: 'ai_call,sms_message' }, 50);
    expect([...new Set(onlyCalls.map((e) => e.type))].sort()).toEqual(['ai_call', 'sms_message']);
    await request(server).get(`${LEADS}/${lead._id}/timeline`).query({ types: 'bogus' }).set(auth(tokenA)).expect(400);
    await request(server).get(`${LEADS}/${lead._id}/timeline`).query({ cursor: 'not-a-cursor' }).set(auth(tokenA)).expect(400);
  });

  it('includes records of leads merged into this one, flagged mergedFrom', async () => {
    const survivor = await makeLead();
    const merged = await makeLead({ isDeleted: true, deletedAt: new Date() });
    await ContactLog.collection.insertOne({
      leadId: merged._id, channel: 'phone', note: 'old call on the duplicate', occurredAt: new Date(Date.now() - DAY),
      employeeId: userA._id, createdBy: userA._id, editableUntil: new Date(), isDeleted: false,
    });
    await Lead.collection.updateOne({ _id: survivor._id }, { $set: { mergedLeadIds: [merged._id] } });
    const entries = await collectTimeline(survivor._id, tokenA, {}, 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].mergedFrom).toBe(String(merged._id));
  });

  it('shows AI-call transcripts only to the call owner (or an AI-calling admin)', async () => {
    const lead = await makeLead();
    const { callId } = await seedAllSources(lead, Date.now() - HOUR, userA);
    const mine = (await collectTimeline(lead._id, tokenA, { types: 'ai_call' }, 10))[0];
    expect(mine.transcript.excerpt).toHaveLength(2);
    expect(mine.transcript.restricted).toBe(false);
    const theirs = (await collectTimeline(lead._id, tokenB, { types: 'ai_call' }, 10))[0];
    expect(theirs.transcript.excerpt).toEqual([]);
    expect(theirs.transcript.restricted).toBe(true);
    expect(theirs.summary).toBe('Interested, budget 5000');

    const res = await request(server).get(`${LEADS}/${lead._id}/timeline/calls/${callId}/transcript`).set(auth(tokenA)).expect(200);
    expect(res.body.data.turns.map((t) => t.index)).toEqual([0, 1]);
    await request(server).get(`${LEADS}/${lead._id}/timeline/calls/${callId}/transcript`).set(auth(tokenB)).expect(403);
    const other = await makeLead();
    await request(server).get(`${LEADS}/${other._id}/timeline/calls/${callId}/transcript`).set(auth(tokenA)).expect(404);
  });

  it('requires lead:read', async () => {
    const lead = await makeLead();
    const nobody = await makeUser([]);
    await request(server).get(`${LEADS}/${lead._id}/timeline`).expect(401);
    await request(server).get(`${LEADS}/${lead._id}/timeline`).set(auth(generateAccessToken({ sub: String(nobody._id) }))).expect(403);
  });
});

// ──────────────────────────────────────────────── answer history + corrections
describe('qualification history, mergeAnswers contract and corrections', () => {
  it('records source, call/SMS evidence and transcript references; retries are idempotent per evidence record', async () => {
    const lead = await makeLead();
    const callRecordId = new mongoose.Types.ObjectId();
    const opts = { callRecordId, transcriptRef: { callRecordId, turnIndex: 1, startMs: 3500, quote: 'our budget is 5000' }, source: 'ai_call_agent', userId: null };
    const answers = [{ fieldKey: 'budget', label: 'Budget', status: 'answered', value: 5000 }];
    expect(await leadQualificationService.mergeAnswers(lead._id, answers, opts)).toBe(1);
    expect(await leadQualificationService.mergeAnswers(lead._id, answers, opts)).toBe(0);
    const smsMessageId = new mongoose.Types.ObjectId();
    await leadQualificationService.mergeAnswers(lead._id, [{ fieldKey: 'timeline', status: 'answered', value: 'immediate', evidence: 'asap' }], { smsMessageId, source: 'sms_agent', userId: null });

    const res = await request(server).get(`${LEADS}/${lead._id}/qualification/history`).query({ fieldKey: 'budget' }).set(auth(tokenA)).expect(200);
    expect(res.body.data).toHaveLength(1);
    const [entry] = res.body.data;
    expect(entry.source).toBe('ai_call_agent');
    expect(entry.callRecordId).toBe(String(callRecordId));
    expect(entry.transcriptRef).toMatchObject({ turnIndex: 1, startMs: 3500, quote: 'our budget is 5000' });
    expect(entry.current.evidence).toBe('our budget is 5000');
    const all = await request(server).get(`${LEADS}/${lead._id}/qualification/history`).set(auth(tokenA)).expect(200);
    expect(all.body.data.map((h) => h.fieldKey)).toEqual(['timeline', 'budget']);
    expect(all.body.data[0].smsMessageId).toBe(String(smsMessageId));
    await expect(leadQualificationService.mergeAnswers(lead._id, answers, { source: 'robot', userId: null })).rejects.toThrow(/source/);
  });

  it('corrects a field with a mandatory reason, linking the corrected version; stale corrections are refused', async () => {
    const lead = await makeLead();
    await leadQualificationService.mergeAnswers(lead._id, [{ fieldKey: 'budget', status: 'answered', value: 5000 }], { source: 'ai_call_agent', userId: null });
    const before = await request(server).get(`${LEADS}/${lead._id}/qualification/history`).set(auth(tokenA)).expect(200);
    const original = before.body.data[0];

    await request(server).post(`${LEADS}/${lead._id}/qualification/corrections`).set(auth(tokenA))
      .send({ fieldKey: 'budget', status: 'answered', value: 3000 }).expect(400);
    const res = await request(server).post(`${LEADS}/${lead._id}/qualification/corrections`).set(auth(tokenA))
      .send({ fieldKey: 'budget', status: 'answered', value: 3000, reason: 'Lead said 3000, agent misheard', correctionOf: original._id }).expect(201);
    expect(res.body.data).toMatchObject({ source: 'user_correction', correctionOf: original._id, reason: 'Lead said 3000, agent misheard' });
    expect(res.body.data.previous.value).toBe(5000);
    expect(res.body.data.current.value).toBe(3000);
    expect(res.body.data.changedByName).toContain('Anna');

    // correcting the old version again is stale
    const stale = await request(server).post(`${LEADS}/${lead._id}/qualification/corrections`).set(auth(tokenB))
      .send({ fieldKey: 'budget', status: 'answered', value: 4000, reason: 'x', correctionOf: original._id }).expect(409);
    expect(stale.body.error?.code ?? stale.body.code).toBe('QUALIFICATION_STALE');
    // wrong field
    await request(server).post(`${LEADS}/${lead._id}/qualification/corrections`).set(auth(tokenA))
      .send({ fieldKey: 'need', status: 'answered', value: 'x', reason: 'y', correctionOf: original._id }).expect(400);
    const q = await request(server).get(`${LEADS}/${lead._id}/qualification`).set(auth(tokenA)).expect(200);
    expect(q.body.data.fields.find((f) => f.fieldKey === 'budget')).toMatchObject({ value: 3000, source: 'user_correction' });
    const reader = await makeUser(['lead:read']);
    await request(server).post(`${LEADS}/${lead._id}/qualification/corrections`).set(auth(generateAccessToken({ sub: String(reader._id) })))
      .send({ fieldKey: 'budget', status: 'answered', value: 1, reason: 'r' }).expect(403);
  });
});

// ──────────────────────────────────────────────────────────── follow-ups
describe('follow-up inbox', () => {
  async function completeComm(lead, outcome, token = tokenA) {
    const operationId = randomUUID();
    await request(server).post(`${LEADS}/${lead._id}/communications`).set(auth(token)).send({
      operationId, channel: 'phone', route: 'dialer_handoff', mode: 'manual', destinationField: 'mobile',
      sim: { subscriptionId: 1, slotIndex: 0, carrierName: 'X', displayName: 'W', isEmbedded: false, originNumber: null, originNumberSource: null },
      device: { platform: 'android', osVersion: '14', appVersion: '1.0.0', model: 'P' },
    }).expect(201);
    const body = { outcome: { disposition: 'callback_requested', connected: 'yes', notes: 'Call back', followUpAt: null, followUpTimezone: null, statusChange: null, doNotContact: false, ...outcome }, qualification: { answers: [] } };
    await request(server).post(`${LEADS}/${lead._id}/communications/${operationId}/complete`).set(auth(token)).send(body).expect(200);
    // identical retry
    await request(server).post(`${LEADS}/${lead._id}/communications/${operationId}/complete`).set(auth(token)).send(body).expect(200);
    return operationId;
  }

  it('creates one follow-up per completed communication (with its timezone) and keeps the legacy agenda shape', async () => {
    const lead = await makeLead();
    const due = new Date(Date.now() + 2 * DAY);
    await completeComm(lead, { followUpAt: due.toISOString(), followUpTimezone: 'Europe/Zurich' });
    const rows = await LeadFollowUp.find({ leadId: lead._id }).lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ timezone: 'Europe/Zurich', channel: 'phone', status: 'open' });
    expect(rows[0].source.type).toBe('communication');
    expect(String(rows[0].ownerId)).toBe(String(userA._id));

    const legacy = await request(server).get(`${LEADS}/follow-ups`).set(auth(tokenA)).expect(200);
    expect(legacy.body.data).toHaveLength(1);
    expect(legacy.body.data[0]).toEqual({
      contactLogId: String(rows[0].source.contactLogId), leadId: String(lead._id), leadNumber: lead.leadNumber, leadName: lead.name,
      followUpAt: due.toISOString(), followUpTimezone: 'Europe/Zurich', channel: 'phone', subject: 'Phone call (mobile) — callback_requested', note: 'Call back',
    });
  });

  it('a callback disposition without a time becomes a follow-up due now (no guessed time)', async () => {
    const lead = await makeLead();
    const before = Date.now();
    await completeComm(lead, {});
    const [row] = await LeadFollowUp.find({ leadId: lead._id }).lean();
    expect(row.dueAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(row.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(row.note).toMatch(/no time was recorded/);
  });

  it('AI call callbacks: only an exact ISO time is used; free text stays as the lead said it', async () => {
    const lead = await makeLead({ assignedTo: userB._id });
    const call = { _id: new mongoose.Types.ObjectId(), endedAt: new Date() };
    const campaign = { createdBy: userA._id };
    const fu1 = await leadFollowUpService.fromAiCall({ call, lead, campaign, outcome: { action: 'schedule_callback', callback: { requestedAt: 'tomorrow after lunch', note: 'busy' } } });
    expect(fu1.source.requestedTimeText).toBe('tomorrow after lunch');
    expect(String(fu1.ownerId)).toBe(String(userB._id));
    const again = await leadFollowUpService.fromAiCall({ call, lead, campaign, outcome: { action: 'schedule_callback', callback: { requestedAt: 'tomorrow after lunch' } } });
    expect(String(again._id)).toBe(String(fu1._id));
    const call2 = { _id: new mongoose.Types.ObjectId(), endedAt: new Date() };
    const fu2 = await leadFollowUpService.fromAiCall({ call: call2, lead, campaign, outcome: { action: 'schedule_callback', callback: { requestedAt: '2026-11-03T09:30:00+01:00' } } });
    expect(fu2.dueAt.toISOString()).toBe('2026-11-03T08:30:00.000Z');
  });

  it('buckets by the viewer timezone, paginates, and scopes mine/team/all', async () => {
    const lead = await makeLead();
    const now = Date.now();
    const mk = (owner, offset, extra = {}) => LeadFollowUp.create({
      leadId: lead._id, ownerId: owner._id, createdBy: owner._id, dueAt: new Date(now + offset), nextDueAt: new Date(now + offset),
      status: 'open', source: { type: 'manual' }, ...extra,
    });
    await mk(userA, -HOUR);
    await mk(userA, -2 * HOUR);
    await mk(userA, 10 * DAY);
    await mk(userB, -HOUR);
    await mk(userA, -DAY, { status: 'done', closedAt: new Date(now - HOUR) });

    const overdue = await request(server).get(FU).query({ bucket: 'overdue', limit: 1 }).set(auth(tokenA)).expect(200);
    expect(overdue.body.data).toHaveLength(1);
    expect(overdue.body.pagination.hasNext).toBe(true);
    const page2 = await request(server).get(FU).query({ bucket: 'overdue', limit: 1, cursor: overdue.body.pagination.nextCursor }).set(auth(tokenA)).expect(200);
    expect(page2.body.data[0].id).not.toBe(overdue.body.data[0].id);
    expect(page2.body.pagination.hasNext).toBe(false);
    expect(Date.parse(overdue.body.data[0].nextDueAt)).toBeLessThan(Date.parse(page2.body.data[0].nextDueAt));

    const summary = await request(server).get(`${FU}/summary`).query({ tz: 'Asia/Karachi' }).set(auth(tokenA)).expect(200);
    expect(summary.body.data).toMatchObject({ overdue: 2, upcoming: 1, done: 1, timezone: 'Asia/Karachi' });
    const done = await request(server).get(FU).query({ bucket: 'done' }).set(auth(tokenA)).expect(200);
    expect(done.body.data).toHaveLength(1);
    const team = await request(server).get(`${FU}/summary`).query({ scope: 'team' }).set(auth(tokenA)).expect(200);
    expect(team.body.data.overdue).toBe(3);
    await request(server).get(FU).query({ scope: 'all' }).set(auth(tokenA)).expect(403);
    const all = await request(server).get(`${FU}/summary`).query({ scope: 'all' }).set(auth(tokenBoss)).expect(200);
    expect(all.body.data.overdue).toBe(3);
    await request(server).get(FU).query({ tz: 'Mars/Base' }).set(auth(tokenA)).expect(400);
  });

  it('counts distinct visible leads and actual email delivery, and filters/sorts lifecycle results', async () => {
    const lead = await makeLead({ email: 'qualified@example.com', latestCall: { qualificationStatus: 'QUALIFIED', callStatus: 'CALL_COMPLETED' } });
    const other = await makeLead({ latestCall: { qualificationStatus: 'PARTIALLY_QUALIFIED' } });
    const now = Date.now();
    for (const [leadId, offset] of [[lead._id, HOUR], [lead._id, 2 * HOUR], [other._id, 3 * HOUR]]) {
      await LeadFollowUp.create({ leadId, ownerId: userA._id, status: 'open', source: { type: 'manual' }, dueAt: new Date(now + offset), nextDueAt: new Date(now + offset) });
    }
    for (const status of ['accepted', 'sent', 'delivered', 'failed', 'undelivered']) {
      await MessageRecipient.create({ campaignId: new mongoose.Types.ObjectId(), leadId: lead._id, channel: 'email', destination: lead.email,
        destinationHash: `metric-${status}`, status, eligibility: { eligible: true, reasons: [] }, createdBy: userA._id,
        sentAt: ['sent', 'delivered'].includes(status) ? new Date() : null, deliveredAt: status === 'delivered' ? new Date() : null });
    }
    const summary = await request(server).get(`${FU}/summary`).set(auth(tokenA)).expect(200);
    expect(summary.body.data).toMatchObject({ totalLeads: 2, qualifiedLeads: 1, pending: 3, emailsSent: 2, emailsDelivered: 1, emailsFailed: 2 });
    const filtered = await request(server).get(FU).query({ qualification: 'QUALIFIED', order: 'desc', limit: 1, q: lead.email }).set(auth(tokenA)).expect(200);
    expect(filtered.body.data).toHaveLength(1);
    expect(filtered.body.data[0].lead.latestCall.qualificationStatus).toBe('QUALIFIED');
    const next = await request(server).get(FU).query({ qualification: 'QUALIFIED', order: 'desc', limit: 1, q: lead.email, cursor: filtered.body.pagination.nextCursor }).set(auth(tokenA)).expect(200);
    expect(Date.parse(filtered.body.data[0].nextDueAt)).toBeGreaterThan(Date.parse(next.body.data[0].nextDueAt));
    expect(next.body.pagination.hasNext).toBe(false);
  });

  it('persists scheduling options and sends a planned reminder only once per due time', async () => {
    const lead = await makeLead();
    const dueAt = new Date(Date.now() + 30 * MIN);
    const created = await request(server).post(FU).set(auth(tokenA)).send({
      leadId: String(lead._id), dueAt: dueAt.toISOString(), channel: 'email', taskType: 'EMAIL', priority: 'HIGH', reminderMinutes: 60,
    }).expect(201);
    expect(created.body.data).toMatchObject({ taskType: 'EMAIL', priority: 'HIGH', reminderMinutes: 60 });
    await leadSlaService.sweep();
    await leadSlaService.sweep();
    expect(await Notification.countDocuments({ type: 'lead.follow_up_reminder' })).toBe(1);
    const stored = await LeadFollowUp.findById(created.body.data.id).lean();
    expect(stored.reminderNotifiedFor.toISOString()).toBe(dueAt.toISOString());
    await request(server).post(`${FU}/${created.body.data.id}/snooze`).set(auth(tokenA)).send({ until: new Date(Date.now() + 45 * MIN).toISOString() }).expect(200);
    await leadSlaService.sweep();
    expect(await Notification.countDocuments({ type: 'lead.follow_up_reminder' })).toBe(2);
  });

  it('searches literal lead names, numbers and notes before pagination and combines channel/owner filters', async () => {
    const lead = await makeLead({ name: 'Acme (Europe)' });
    const other = await makeLead({ name: 'Other company' });
    const now = Date.now();
    const mk = (leadId, channel, note, offset, owner = userA) => LeadFollowUp.create({
      leadId, ownerId: owner._id, createdBy: owner._id, dueAt: new Date(now - offset), nextDueAt: new Date(now - offset),
      status: 'open', channel, note, source: { type: 'manual' },
    });
    await mk(other._id, 'phone', 'Unrelated', 5 * HOUR);
    await mk(lead._id, 'email', 'First proposal', 3 * HOUR);
    await mk(lead._id, 'email', 'Second proposal', 2 * HOUR);
    await mk(lead._id, 'phone', 'Call', HOUR);
    await mk(lead._id, 'email', 'Hidden owner', HOUR, userB);
    const query = { bucket: 'overdue', q: '(Europe)', channel: 'email', limit: 1 };
    const first = await request(server).get(FU).query(query).set(auth(tokenA)).expect(200);
    expect(first.body.data).toHaveLength(1);
    expect(first.body.data[0].note).toBe('First proposal');
    expect(first.body.pagination.hasNext).toBe(true);
    const second = await request(server).get(FU).query({ ...query, cursor: first.body.pagination.nextCursor }).set(auth(tokenA)).expect(200);
    expect(second.body.data[0].note).toBe('Second proposal');
    expect(second.body.pagination.hasNext).toBe(false);
    const notes = await request(server).get(FU).query({ bucket: 'overdue', q: 'second PROPOSAL' }).set(auth(tokenA)).expect(200);
    expect(notes.body.data).toHaveLength(1);
    const number = await request(server).get(FU).query({ bucket: 'overdue', q: lead.leadNumber }).set(auth(tokenA)).expect(200);
    expect(number.body.data).toHaveLength(3);
    const regex = await request(server).get(FU).query({ bucket: 'overdue', q: '.*' }).set(auth(tokenA)).expect(200);
    expect(regex.body.data).toEqual([]);
    await request(server).get(FU).query({ channel: 'invalid' }).set(auth(tokenA)).expect(400);
    await request(server).get(FU).query({ q: 'x'.repeat(201) }).set(auth(tokenA)).expect(400);
    await request(server).get(FU).query({ ownerId: String(userB._id) }).set(auth(tokenA)).expect(403);
    const boss = await request(server).get(FU).query({ scope: 'all', ownerId: String(userB._id), bucket: 'overdue', channel: 'email' }).set(auth(tokenBoss)).expect(200);
    expect(boss.body.data).toHaveLength(1);
    const cancelled = await LeadFollowUp.create({ leadId: lead._id, ownerId: userA._id, dueAt: new Date(now - DAY), nextDueAt: new Date(now - DAY), status: 'cancelled', closedAt: new Date(), source: { type: 'manual' } });
    const summary = await request(server).get(`${FU}/summary`).set(auth(tokenA)).expect(200);
    expect(summary.body.data).toMatchObject({ overdue: 4, done: 1 });
    expect(cancelled.status).toBe('cancelled');
  });

  it('complete / snooze / cancel / reassign with ownership rules', async () => {
    const lead = await makeLead();
    const created = await request(server).post(FU).set(auth(tokenA)).send({ leadId: String(lead._id), dueAt: new Date(Date.now() + HOUR).toISOString(), timezone: 'Europe/Zurich', channel: 'phone', note: 'Call' }).expect(201);
    const id = created.body.data.id;
    expect(created.body.data.timezone).toBe('Europe/Zurich');

    await request(server).post(`${FU}/${id}/complete`).set(auth(tokenB)).send({}).expect(403);
    await request(server).post(`${FU}/${id}/snooze`).set(auth(tokenA)).send({ until: new Date(Date.now() - HOUR).toISOString() }).expect(400);
    const until = new Date(Date.now() + DAY);
    const snoozed = await request(server).post(`${FU}/${id}/snooze`).set(auth(tokenA)).send({ until: until.toISOString() }).expect(200);
    expect(snoozed.body.data).toMatchObject({ status: 'snoozed', nextDueAt: until.toISOString(), snoozeCount: 1 });

    const inactive = await makeUser(['lead:read'], { status: 'deactivated' });
    await request(server).post(`${FU}/${id}/reassign`).set(auth(tokenA)).send({ ownerId: String(inactive._id) }).expect(400);
    const moved = await request(server).post(`${FU}/${id}/reassign`).set(auth(tokenA)).send({ ownerId: String(userB._id) }).expect(200);
    expect(moved.body.data.owner.id).toBe(String(userB._id));
    expect(await Notification.countDocuments({ type: 'lead.follow_up_assigned' })).toBe(1);

    await request(server).post(`${FU}/${id}/cancel`).set(auth(tokenB)).send({}).expect(400);
    const done = await request(server).post(`${FU}/${id}/complete`).set(auth(tokenB)).send({ note: 'Reached them' }).expect(200);
    expect(done.body.data).toMatchObject({ status: 'done', completionNote: 'Reached them', bucket: 'done' });
    const again = await request(server).post(`${FU}/${id}/cancel`).set(auth(tokenBoss)).send({ reason: 'dup' }).expect(409);
    expect(again.body.error?.code ?? again.body.code).toBe('FOLLOW_UP_CLOSED');
    const actions = (await LeadFollowUp.findById(id).lean()).actions.map((a) => a.action);
    expect(actions).toEqual(['created', 'snoozed', 'reassigned', 'completed']);
  });

  it('shows suppression on open items and blocks contact at action time', async () => {
    const lead = await makeLead();
    const created = await request(server).post(FU).set(auth(tokenA)).send({ leadId: String(lead._id), dueAt: new Date(Date.now() + HOUR).toISOString(), channel: 'phone' }).expect(201);
    expect(created.body.data.suppression.suppressed).toBe(false);
    await request(server).get(`${FU}/${created.body.data.id}/contact-check`).set(auth(tokenA)).expect(200);

    await CallSuppression.create({ phoneHash: `h-${randomUUID()}`, leadId: lead._id, reason: 'do_not_contact' });
    const list = await request(server).get(FU).set(auth(tokenA)).expect(200);
    expect(list.body.data[0].suppression).toMatchObject({ suppressed: true, reason: 'do_not_contact' });
    const blocked = await request(server).get(`${FU}/${created.body.data.id}/contact-check`).set(auth(tokenA)).expect(409);
    expect(blocked.body.error?.code ?? blocked.body.code).toBe('CONTACT_SUPPRESSED');

    // The shared contact policy wins when it is deployed (soft limit = warning only).
    setContactPolicy({ check: async () => ({ allowed: false, blocked: false, blockers: [], reason: 'daily_limit', nextAllowedAt: '2030-01-01T00:00:00.000Z' }) });
    const limited = await request(server).get(FU).set(auth(tokenA)).expect(200);
    expect(limited.body.data[0].suppression).toMatchObject({ suppressed: false, limited: true, reason: 'daily_limit' });
  });

  it('contact-log follow-up dates sync into the inbox (create, edit, delete) and migration 032 backfills older ones idempotently', async () => {
    const lead = await makeLead();
    const contactLogService = (await import('../../src/modules/crm/contactLog.service.js')).default;
    const entry = await contactLogService.create(null, { leadId: lead._id, channel: 'email', note: 'Mail', followUpAt: new Date(Date.now() + DAY) }, userA._id);
    expect(await LeadFollowUp.countDocuments({ 'source.contactLogId': entry._id, status: 'open' })).toBe(1);
    const moved = new Date(Date.now() + 3 * DAY);
    await contactLogService.update(entry._id, { followUpAt: moved }, userA._id);
    expect((await LeadFollowUp.findOne({ 'source.contactLogId': entry._id }).lean()).nextDueAt.toISOString()).toBe(moved.toISOString());
    await contactLogService.delete(entry._id, userA._id);
    expect((await LeadFollowUp.findOne({ 'source.contactLogId': entry._id }).lean()).status).toBe('cancelled');

    // Older entries (direct writes) are backfilled by the migration, once.
    const old = await ContactLog.create({ leadId: lead._id, channel: 'phone', note: 'old', followUpAt: new Date(Date.now() - 2 * DAY), employeeId: userB._id, createdBy: userB._id, editableUntil: new Date() });
    await migration032.up();
    await migration032.up();
    const backfilled = await LeadFollowUp.find({ 'source.contactLogId': old._id }).lean();
    expect(backfilled).toHaveLength(1);
    expect(String(backfilled[0].ownerId)).toBe(String(userB._id));
    expect(backfilled[0].overdueNotifiedFor).toEqual(backfilled[0].nextDueAt); // no alert storm for history
    const legacy = await request(server).get(`${LEADS}/follow-ups`).query({ scope: 'all' }).set(auth(tokenA)).expect(200);
    expect(legacy.body.data.filter((r) => r.contactLogId === String(old._id))).toHaveLength(1);
    await migration032.down();
    expect(await LeadFollowUp.countDocuments({ 'source.contactLogId': old._id })).toBe(0);
  });
});

// ───────────────────────────────────────────── assignment, SLA, escalation
describe('assignment policy, first-response SLA and escalation', () => {
  function setPolicy(body, token = tokenBoss) {
    return request(server).put(POLICY).set(auth(token)).send(body);
  }

  it('policy endpoints require lead:assign-policy and validate input', async () => {
    await request(server).get(POLICY).set(auth(tokenA)).expect(403);
    await setPolicy({ enabled: true }, tokenA).expect(403);
    await setPolicy({ sla: { businessHours: { timezone: 'Nowhere/City' } } }).expect(400);
    await setPolicy({ eligibleUserIds: [String(new mongoose.Types.ObjectId())] }).expect(400);
    const res = await setPolicy({ enabled: true, strategy: 'round_robin', eligibleUserIds: [String(userA._id), String(userB._id)], sla: { enabled: true, firstResponseMinutes: 30 } }).expect(200);
    expect(res.body.data).toMatchObject({ enabled: true, strategy: 'round_robin' });
    expect(res.body.data.rrCounters).toBeUndefined();
    const got = await request(server).get(POLICY).set(auth(tokenBoss)).expect(200);
    expect(got.body.data.sla.firstResponseMinutes).toBe(30);
  });

  it('round-robins new unassigned leads, never reassigns a given owner, and starts the SLA clock', async () => {
    await setPolicy({ enabled: true, eligibleUserIds: [String(userA._id), String(userB._id)], sla: { enabled: true, firstResponseMinutes: 30 } }).expect(200);
    const owners = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(server).post(LEADS).set(auth(tokenA)).send({ name: `RR ${i}`, source: 'manual' }).expect(201);
      const lead = await Lead.findById(res.body.data._id ?? res.body.data.id).lean();
      owners.push(String(lead.assignedTo));
      expect(lead).toMatchObject({ assignmentSource: 'auto', slaStatus: 'pending', escalationLevel: 0 });
      expect(lead.firstResponseDueAt.getTime() - lead.assignedAt.getTime()).toBe(30 * MIN);
    }
    expect(owners[0]).not.toBe(owners[1]);
    expect(owners[0]).toBe(owners[2]);
    expect(owners[1]).toBe(owners[3]);
    const given = await request(server).post(LEADS).set(auth(tokenA)).send({ name: 'Given', source: 'manual', assignedTo: String(boss._id) }).expect(201);
    const givenLead = await Lead.findById(given.body.data._id ?? given.body.data.id).lean();
    expect(String(givenLead.assignedTo)).toBe(String(boss._id));
    expect(givenLead.assignmentSource).toBe('manual');
    expect(await LeadEvent.countDocuments({ type: 'assignment.auto' })).toBe(4);
    expect(await Notification.countDocuments({ type: 'lead.assigned' })).toBe(5);
  });

  it('least-loaded + rules pick the right pool; bulk import assigns in one pass', async () => {
    await Lead.create([1, 2, 3].map((i) => ({ leadNumber: `L-6000${i}`, name: `Busy ${i}`, createdBy: userA._id, assignedTo: userA._id })));
    await setPolicy({
      enabled: true, strategy: 'least_loaded', eligibleUserIds: [String(userA._id), String(userB._id)],
      rules: [{ name: 'Geneva', match: { city: 'genève' }, userIds: [String(boss._id)] }],
    }).expect(200);
    const res = await request(server).post(LEADS).set(auth(tokenA)).send({ name: 'Fresh', source: 'manual' }).expect(201);
    expect(String((await Lead.findById(res.body.data._id ?? res.body.data.id).lean()).assignedTo)).toBe(String(userB._id));
    const geneva = await request(server).post(LEADS).set(auth(tokenA)).send({ name: 'GE', source: 'manual', address: { city: 'Genève', country: 'CH' } }).expect(201);
    expect(String((await Lead.findById(geneva.body.data._id ?? geneva.body.data.id).lean()).assignedTo)).toBe(String(boss._id));

    const result = await leadService.bulkCreate([1, 2, 3, 4].map((i) => ({ leadNumber: `L-6100${i}`, name: `Imp ${i}`, source: 'import', createdBy: userA._id })));
    const counts = result.created.reduce((m, l) => m.set(String(l.assignedTo), (m.get(String(l.assignedTo)) || 0) + 1), new Map());
    // userB had 1 open lead, userA 3: B gets the first two, then they alternate.
    expect(counts.get(String(userB._id))).toBe(3);
    expect(counts.get(String(userA._id))).toBe(1);
  });

  it('reassignment restarts the SLA only when the owner changes; first response resolves met/late', async () => {
    await setPolicy({ sla: { enabled: true, firstResponseMinutes: 60 } }).expect(200);
    const lead = await makeLead();
    await request(server).patch(`${LEADS}/${lead._id}`).set(auth(tokenA)).send({ assignedTo: String(userB._id) }).expect(200);
    const first = await Lead.findById(lead._id).lean();
    expect(first.slaStatus).toBe('pending');
    await request(server).patch(`${LEADS}/${lead._id}`).set(auth(tokenA)).send({ assignedTo: String(userB._id), name: 'Renamed' }).expect(200);
    expect((await Lead.findById(lead._id).lean()).firstResponseDueAt).toEqual(first.firstResponseDueAt);

    await leadSlaService.recordFirstResponse(lead._id, { at: new Date(), channel: 'phone' });
    expect((await Lead.findById(lead._id).lean())).toMatchObject({ slaStatus: 'met', firstResponseChannel: 'phone' });
    expect(await leadSlaService.recordFirstResponse(lead._id, { at: new Date() })).toBe(false);

    const late = await makeLead({ assignedTo: userA._id, assignedAt: new Date(Date.now() - 2 * HOUR), firstResponseDueAt: new Date(Date.now() - HOUR), slaStatus: 'overdue' });
    await leadSlaService.recordFirstResponse(late._id, { at: new Date(), channel: 'sms' });
    expect((await Lead.findById(late._id).lean()).slaStatus).toBe('late');

    // bulk assign stamps only leads whose owner changed
    const l2 = await makeLead();
    await request(server).post(`${LEADS}/bulk-assign`).set(auth(tokenA)).send({ leadIds: [String(l2._id)], assignedTo: String(userA._id) }).expect(200);
    expect((await Lead.findById(l2._id).lean()).slaStatus).toBe('pending');
    await request(server).post(`${LEADS}/bulk-assign`).set(auth(tokenA)).send({ leadIds: [String(l2._id)], assignedTo: null }).expect(200);
    expect((await Lead.findById(l2._id).lean())).toMatchObject({ slaStatus: 'none', firstResponseDueAt: null });
  });

  it('the sweep marks breaches, alerts once, escalates per level and is safe to re-run', async () => {
    await setPolicy({ escalation: { enabled: true, afterMinutes: 30, maxLevel: 2, userIds: [String(boss._id)], followUpAfterMinutes: 60 } }).expect(200);
    const due = new Date(Date.now() - 45 * MIN);
    const lead = await makeLead({ assignedTo: userA._id, assignedAt: new Date(Date.now() - 2 * HOUR), firstResponseDueAt: due, slaStatus: 'pending' });

    const r1 = await leadSlaService.sweep();
    expect(r1).toMatchObject({ breached: 1, escalated: 1 });
    const r2 = await leadSlaService.sweep();
    expect(r2).toMatchObject({ breached: 0, escalated: 0 });
    const after = await Lead.findById(lead._id).lean();
    expect(after).toMatchObject({ slaStatus: 'overdue', escalationLevel: 1 });
    expect(await Notification.countDocuments({ type: 'lead.sla_breached' })).toBe(1);
    expect(await Notification.countDocuments({ type: 'lead.sla_escalated' })).toBe(1);
    expect(await LeadEvent.countDocuments({ leadId: lead._id, type: { $in: ['sla.breached', 'sla.escalated'] } })).toBe(2);

    // level 2 only once the second threshold has passed
    const r3 = await leadSlaService.sweep(new Date(due.getTime() + 61 * MIN));
    expect(r3.escalated).toBe(1);
    expect((await Lead.findById(lead._id).lean()).escalationLevel).toBe(2);
    expect((await leadSlaService.sweep(new Date(due.getTime() + 10 * HOUR))).escalated).toBe(0); // maxLevel

    // follow-ups: one overdue alert per due time; a snooze re-arms it
    const fu = await LeadFollowUp.create({ leadId: lead._id, ownerId: userA._id, createdBy: userA._id, dueAt: new Date(Date.now() - 2 * HOUR), nextDueAt: new Date(Date.now() - 2 * HOUR), status: 'open', source: { type: 'manual' } });
    const f1 = await leadSlaService.sweep();
    expect(f1).toMatchObject({ followUpsOverdue: 1, followUpsEscalated: 1 });
    expect((await leadSlaService.sweep()).followUpsOverdue).toBe(0);
    await LeadFollowUp.updateOne({ _id: fu._id }, { $set: { nextDueAt: new Date(Date.now() - MIN), status: 'snoozed' } });
    expect((await leadSlaService.sweep()).followUpsOverdue).toBe(1);
    expect(await Notification.countDocuments({ type: 'lead.follow_up_overdue' })).toBe(2);

    // the timeline shows the workflow events
    const events = await collectTimeline(lead._id, tokenA, { types: 'workflow' }, 50);
    expect(events.map((e) => e.meta.eventType)).toEqual(expect.arrayContaining(['sla.breached', 'sla.escalated', 'follow_up.overdue']));
  });

  it('the list filters by slaStatus', async () => {
    await makeLead({ slaStatus: 'overdue', assignedTo: userA._id });
    await makeLead({ slaStatus: 'pending', assignedTo: userA._id });
    const res = await request(server).get(LEADS).query({ slaStatus: 'overdue' }).set(auth(tokenA)).expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].slaStatus).toBe('overdue');
  });

  it('assignment failures never block lead creation', async () => {
    await setPolicy({ enabled: true, eligibleUserIds: [String(userA._id)] }).expect(200);
    jest.spyOn(leadAssignmentService, '_poolFor').mockRejectedValue(new Error('boom'));
    const res = await request(server).post(LEADS).set(auth(tokenA)).send({ name: 'Still created', source: 'manual' }).expect(201);
    expect((await Lead.findById(res.body.data._id ?? res.body.data.id).lean()).assignedTo).toBeNull();
  });
});
