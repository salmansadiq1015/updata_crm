import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * HTTP + service tests for lead quality: explainable scoring (score endpoint,
 * recalculation, versioned config, preview, list sort/filter, event hooks) and
 * duplicate review + merge (detection, dismiss memory, history-preserving merge
 * across every child collection, DNC preservation, undo, crash-resume,
 * concurrency). Real routers, auth, permissions, Joi, services and Mongo; only
 * queue / Redis / session / cache / LLM are stubbed.
 */

const queue = { addJob: jest.fn(async () => ({})) };
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: (...args) => queue.addJob(...args), getQueueStats: jest.fn(async () => ({})) },
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
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => false,
  assertAiConfigured: () => {},
  createChatModel: async () => ({}),
  createOpenAiClient: async () => ({}),
}));

let mongod; let server;
let Lead; let User; let Role; let Permission; let LeadMerge; let LeadDuplicateCandidate; let LeadScoringConfig;
let LeadCommunication; let ContactLog; let CallRecord; let CampaignRecipient; let CallSuppression; let CallCampaign;
let SimSmsConversation; let SimSmsMessage; let SimCallTask; let MessageSuppression; let LeadChannelConsent; let LinkOptOutEvent;
let generateAccessToken; let auditService; let leadScoringService; let leadDuplicateService; let leadMergeService; let hooks;
let admin; let agent; let adminToken; let agentToken;
let counter = 0;

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const oid = () => new mongoose.Types.ObjectId();
const daysAgo = (n) => new Date(Date.now() - n * 86400000);

async function makeUser(permissionIds) {
  const role = await Role.create({ name: `LQRole_${randomUUID()}`, permissions: permissionIds });
  return User.create({
    email: `lq-${randomUUID()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Lead',
    lastName: 'Quality',
    role: role._id,
    status: 'active',
  });
}

async function makeLead(overrides = {}) {
  counter += 1;
  return Lead.create({
    leadNumber: `L-${70000 + counter}`,
    name: `Acme ${counter}`,
    normalizedName: `acme ${counter}`,
    source: 'manual',
    address: { country: 'CH', city: 'Zürich', postalCode: '8001' },
    createdBy: admin._id,
    ...overrides,
  });
}

const raw = (Model, doc) => Model.collection.insertOne({ createdAt: new Date(), updatedAt: new Date(), ...doc });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  const scoringRoutes = (await import('../../src/modules/crm/leadScoring.routes.js')).default;
  const { default: mergeRoutes, leadDuplicateRouter } = await import('../../src/modules/crm/leadMerge.routes.js');
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadMerge = (await import('../../src/modules/crm/leadMerge.model.js')).default;
  LeadDuplicateCandidate = (await import('../../src/modules/crm/leadDuplicateCandidate.model.js')).default;
  LeadScoringConfig = (await import('../../src/modules/crm/leadScoringConfig.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  SimSmsConversation = (await import('../../src/modules/simSms/simSmsConversation.model.js')).default;
  SimSmsMessage = (await import('../../src/modules/simSms/simSmsMessage.model.js')).default;
  SimCallTask = (await import('../../src/modules/simCall/simCallTask.model.js')).default;
  MessageSuppression = (await import('../../src/modules/messaging/suppression.model.js')).default;
  LeadChannelConsent = (await import('../../src/modules/messaging/consent.model.js')).default;
  LinkOptOutEvent = (await import('../../src/modules/linkAssistant/optOutEvent.model.js')).default;
  auditService = (await import('../../src/modules/auth/audit.service.js')).default;
  leadScoringService = (await import('../../src/modules/crm/leadScoring.service.js')).default;
  leadDuplicateService = (await import('../../src/modules/crm/leadDuplicate.service.js')).default;
  leadMergeService = (await import('../../src/modules/crm/leadMerge.service.js')).default;
  hooks = await import('../../src/modules/crm/leadQuality.hooks.js');
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await Promise.all([Lead.init(), LeadDuplicateCandidate.init(), LeadScoringConfig.init(), LeadChannelConsent.init(), SimSmsConversation.init()]);

  const app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/v1/crm/leads', leadRoutes);
  app.use('/api/v1/crm/lead-scoring', scoringRoutes);
  app.use('/api/v1/crm/lead-duplicates', leadDuplicateRouter);
  app.use('/api/v1/crm/lead-merges', mergeRoutes);
  app.use(errorHandler);
  server = app.listen(0);
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  const keep = new Set(['leadduplicatecandidates', 'leadscoringconfigs', 'leadchannelconsents', 'simsmsconversations', 'leads']);
  for (const key in mongoose.connection.collections) {
    if (keep.has(key)) continue;
    await mongoose.connection.collections[key].deleteMany({});
  }
  await Promise.all([Lead.deleteMany({}), LeadDuplicateCandidate.deleteMany({}), LeadScoringConfig.deleteMany({}), LeadChannelConsent.deleteMany({}), SimSmsConversation.deleteMany({})]);
  leadScoringService.invalidateConfigCache();
  queue.addJob.mockReset();
  queue.addJob.mockImplementation(async () => ({}));
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' },
    { module: 'lead', action: 'write', description: 'w' },
    { module: 'lead', action: 'merge', description: 'm' },
    { module: 'lead', action: 'scoring-admin', description: 's' },
  ]);
  admin = await makeUser(perms.map((p) => p._id));
  agent = await makeUser(perms.filter((p) => ['read', 'write'].includes(p.action)).map((p) => p._id));
  adminToken = generateAccessToken({ sub: String(admin._id) });
  agentToken = generateAccessToken({ sub: String(agent._id) });
});

afterEach(() => { jest.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
describe('lead scoring API', () => {
  it('explains a score from recorded data with evidence links, and recalculation persists without bumping updatedAt', async () => {
    const lead = await makeLead({
      phone: '+41 44 123 45 67', email: 'a@acme.ch', website: 'https://acme.ch',
      providerMeta: { rating: 4.6, reviewCount: 120, businessStatus: 'OPERATIONAL' },
      qualification: { fields: [{ fieldKey: 'interest', value: 'high', status: 'answered', source: 'user', updatedAt: daysAgo(1) }], updatedAt: daysAgo(1) },
    });
    const commId = oid();
    await raw(LeadCommunication, {
      _id: commId, leadId: lead._id, channel: 'phone', completedAt: daysAgo(1),
      outcome: { disposition: 'interested', connected: 'yes', doNotContact: false }, receipt: { steps: { outcome: { status: 'ok' } } },
    });

    const res = await request(server).get(`/api/v1/crm/leads/${lead._id}/score`).set(auth(agentToken)).expect(200);
    const data = res.body.data;
    expect(data).toMatchObject({ leadId: String(lead._id), version: 1, stale: true, stored: null });
    const calls = data.factors.find((f) => f.key === 'connected_calls');
    expect(calls).toMatchObject({ points: 6, evidence: { ref: { type: 'lead_communication', id: String(commId) } } });
    expect(data.factors.find((f) => f.key === 'q_interest').evidence).toMatchObject({ field: 'qualification.fields.interest', value: 'high' });
    expect(data.missing.map((m) => m.key)).toEqual(expect.arrayContaining(['q_need', 'sms_replies']));

    const before = (await Lead.findById(lead._id).lean()).updatedAt;
    const rec = await request(server).post(`/api/v1/crm/leads/${lead._id}/score/recalculate`).set(auth(agentToken)).expect(200);
    expect(rec.body.data.stale).toBe(false);
    const stored = await Lead.findById(lead._id).lean();
    expect(stored.score).toMatchObject({ value: data.score, band: data.band, version: 1 });
    expect(stored.scoreValue).toBe(data.score);
    expect(stored.updatedAt.getTime()).toBe(before.getTime());

    const again = await request(server).get(`/api/v1/crm/leads/${lead._id}/score`).set(auth(agentToken)).expect(200);
    expect(again.body.data.stale).toBe(false);
  });

  it('disqualifies a lead with a do-not-contact on record', async () => {
    const lead = await makeLead({ phone: '+41 44 000 00 00', email: 'x@y.ch' });
    const sup = await CallSuppression.create({ phoneHash: randomUUID(), leadId: lead._id, reason: 'do_not_contact', source: 'call_request' });
    const res = await request(server).get(`/api/v1/crm/leads/${lead._id}/score`).set(auth(agentToken)).expect(200);
    expect(res.body.data).toMatchObject({ score: 0, disqualified: true });
    expect(res.body.data.factors[0]).toMatchObject({ key: 'do_not_contact', evidence: { ref: { type: 'call_suppression', id: String(sup._id) } } });
  });

  it('config is admin-only, versioned, queues a bulk recompute, and new scores carry the new version', async () => {
    await request(server).get('/api/v1/crm/lead-scoring/config').set(auth(agentToken)).expect(403);
    const cur = await request(server).get('/api/v1/crm/lead-scoring/config').set(auth(adminToken)).expect(200);
    expect(cur.body.data.config).toMatchObject({ version: 1, source: 'default' });
    expect(cur.body.data.factors.length).toBeGreaterThan(10);

    await request(server).put('/api/v1/crm/lead-scoring/config').set(auth(adminToken))
      .send({ bands: { hot: 30, warm: 60 } }).expect(400);
    const put = await request(server).put('/api/v1/crm/lead-scoring/config').set(auth(adminToken))
      .send({ bands: { hot: 60, warm: 30 }, minEvidence: 1, targetCities: ['Zurich'], factors: { has_email: { maxPoints: 20 } }, note: 'focus Zurich' })
      .expect(200);
    expect(put.body.data.config).toMatchObject({ version: 2, source: 'stored', bands: { hot: 60, warm: 30 }, targetCities: ['Zurich'] });
    expect(queue.addJob).toHaveBeenCalledWith('lead-scoring', 'recompute-all', { version: 2 }, expect.objectContaining({ jobId: 'lead-score-all-2' }));

    const lead = await makeLead({ email: 'a@b.ch' });
    const out = await leadScoringService.recalculate(lead._id);
    expect(out.version).toBe(2);
    expect(out.factors.find((f) => f.key === 'target_location')).toMatchObject({ points: 5 });
    expect(out.factors.find((f) => f.key === 'has_email').maxPoints).toBe(20);

    const all = await leadScoringService.recomputeAll({ version: 2 });
    expect(all).toMatchObject({ processed: 1, failed: 0, version: 2 });
    expect((await LeadScoringConfig.findOne({ version: 2 }).lean()).recompute).toMatchObject({ status: 'done', processed: 1 });
    // A superseded version's job does nothing.
    expect(await leadScoringService.recomputeAll({ version: 1 })).toMatchObject({ superseded: true });
  });

  it('previews a draft config against a sample lead without persisting', async () => {
    const lead = await makeLead({ email: 'a@b.ch', phone: '1234567' });
    const res = await request(server).post('/api/v1/crm/lead-scoring/preview').set(auth(adminToken))
      .send({ leadId: String(lead._id), config: { bands: { hot: 5, warm: 1 }, minEvidence: 0 } }).expect(200);
    expect(res.body.data.preview.band).toBe('hot');
    expect(res.body.data.current.band).toBe('unscored');
    expect((await Lead.findById(lead._id).lean()).score).toBeUndefined();
    await request(server).post('/api/v1/crm/lead-scoring/recompute').set(auth(adminToken)).expect(202);
  });

  it('sorts the lead list by score and filters by band (unscored includes never-scored leads)', async () => {
    const hot = await makeLead({ name: 'Hot', score: { value: 90, band: 'hot', version: 1, computedAt: new Date() }, scoreValue: 90 });
    const cold = await makeLead({ name: 'Cold', score: { value: 10, band: 'cold', version: 1, computedAt: new Date() }, scoreValue: 10 });
    const never = await makeLead({ name: 'Never' });
    const list = await request(server).get('/api/v1/crm/leads').query({ sortBy: 'scoreValue', sortOrder: 'desc', limit: 2 }).set(auth(agentToken)).expect(200);
    expect(list.body.data.map((l) => l.name)).toEqual(['Hot', 'Cold']);
    const page2 = await request(server).get('/api/v1/crm/leads').query({ sortBy: 'scoreValue', sortOrder: 'desc', limit: 2, cursor: list.body.pagination.nextCursor }).set(auth(agentToken)).expect(200);
    expect(page2.body.data.map((l) => l.name)).toEqual(['Never']);
    const hotOnly = await request(server).get('/api/v1/crm/leads').query({ scoreBand: 'hot' }).set(auth(agentToken)).expect(200);
    expect(hotOnly.body.data.map((l) => String(l._id))).toEqual([String(hot._id)]);
    const unscored = await request(server).get('/api/v1/crm/leads').query({ scoreBand: 'unscored' }).set(auth(agentToken)).expect(200);
    expect(unscored.body.data.map((l) => String(l._id))).toEqual([String(never._id)]);
    expect(String(cold._id)).toBeTruthy();
  });

  it('event hooks enqueue a debounced per-lead rescore and duplicate detection; the sweep catches stale leads', async () => {
    const lead = await makeLead({ email: 'a@b.ch' });
    hooks.onLeadSignalsChanged(lead._id, 'communication');
    hooks.onLeadsCreated([lead._id]);
    await new Promise((r) => setTimeout(r, 20));
    expect(queue.addJob).toHaveBeenCalledWith('lead-scoring', 'score-lead', { leadId: String(lead._id), reason: 'communication' }, expect.objectContaining({ jobId: `lead-score-${lead._id}`, delay: expect.any(Number) }));
    expect(queue.addJob).toHaveBeenCalledWith('lead-duplicates', 'detect-leads', { leadIds: [String(lead._id)] }, expect.any(Object));

    // A queue outage never throws into the write path.
    queue.addJob.mockRejectedValue(new Error('down'));
    expect(() => hooks.onLeadSignalsChanged(lead._id)).not.toThrow();
    expect(await leadScoringService.scheduleRecompute(lead._id)).toBe(false);

    const swept = await leadScoringService.sweep();
    expect(swept.processed).toBe(1);
    expect((await Lead.findById(lead._id).lean()).score.version).toBe(1);
    expect((await leadScoringService.sweep()).candidates).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('duplicate detection + review queue', () => {
  it('detects pairs with reasons and combined confidence, groups them, and remembers a dismissal', async () => {
    const a = await makeLead({ normalizedPhone: '+41441234567', email: 'info@acme.ch' });
    const b = await makeLead({ normalizedPhone: '+41441234567', email: 'INFO@acme.ch'.toLowerCase() });
    const c = await makeLead({ websiteDomain: 'acme.ch' });
    await Lead.updateOne({ _id: b._id }, { $set: { websiteDomain: 'acme.ch' } });
    const unrelated = await makeLead({ websiteDomain: 'facebook.com' });
    await makeLead({ websiteDomain: 'facebook.com' });

    const scan = await leadDuplicateService.scanAll();
    expect(scan.pairs).toBe(2); // a~b (phone+email), b~c (website); shared facebook.com ignored

    const res = await request(server).get('/api/v1/crm/lead-duplicates').set(auth(agentToken)).expect(200);
    expect(res.body.data.total).toBe(1);
    const group = res.body.data.groups[0];
    expect(group.leads.map((l) => l._id).sort()).toEqual([a, b, c].map((l) => String(l._id)).sort());
    const ab = group.pairs.find((p) => p.leadIds.includes(String(a._id)));
    expect(ab.reasons.map((r) => r.method).sort()).toEqual(['EMAIL', 'PHONE']);
    expect(ab.confidence).toBeCloseTo(0.995, 3);
    expect(group.leads.some((l) => String(l._id) === String(unrelated._id))).toBe(false);

    await request(server).post(`/api/v1/crm/lead-duplicates/${ab.id}/dismiss`).set(auth(agentToken)).send({}).expect(403);
    await request(server).post(`/api/v1/crm/lead-duplicates/${ab.id}/dismiss`).set(auth(adminToken)).send({ reason: 'branches' }).expect(200);
    await leadDuplicateService.detectForLeads([a._id, b._id]);
    await leadDuplicateService.scanAll();
    expect((await LeadDuplicateCandidate.findById(ab.id).lean()).status).toBe('dismissed');
    const after = await request(server).get('/api/v1/crm/lead-duplicates').set(auth(agentToken)).expect(200);
    expect(after.body.data.groups[0].pairs).toHaveLength(1);
  });

  it('per-lead detection finds name+postal and nearby-name twins, and stales pairs that stop matching', async () => {
    const a = await makeLead({ name: 'Müller AG', normalizedName: 'muller ag', location: { type: 'Point', coordinates: [8.5417, 47.3769] } });
    const b = await makeLead({ name: 'Muller AG', normalizedName: 'muller ag', address: { postalCode: '9999', city: 'X', country: 'CH' }, location: { type: 'Point', coordinates: [8.5419, 47.3770] } });
    const c = await makeLead({ name: 'Müller AG', normalizedName: 'muller ag' });
    const out = await leadDuplicateService.detectForLeads([a._id]);
    expect(out.pairs).toBe(2);
    const pairs = await LeadDuplicateCandidate.find({}).lean();
    const methods = Object.fromEntries(pairs.map((p) => [p.leadIds.map(String).includes(String(b._id)) ? 'b' : 'c', p.reasons.map((r) => r.method)]));
    expect(methods).toEqual({ b: ['NAME_NEARBY'], c: ['NAME_POSTAL'] });
    await Lead.updateOne({ _id: c._id }, { $set: { 'address.postalCode': '1000' } });
    await leadDuplicateService.detectForLeads([a._id]);
    expect((await LeadDuplicateCandidate.findOne({ leadIds: c._id }).lean()).status).toBe('stale');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
async function seedHistory(survivor, loser) {
  const smsCampaign = oid();
  const sharedCampaign = oid();
  const ids = {
    comm: oid(), log: oid(), recipient: oid(), call: oid(), conv: oid(), msg: oid(), task: oid(),
    sharedConv: oid(), sharedMsg: oid(), survivorConv: oid(), callSup: oid(), msgSup: oid(), optOut: oid(), campaign: oid(),
  };
  await raw(LeadCommunication, { _id: ids.comm, leadId: loser._id, channel: 'phone', operationId: randomUUID(), createdBy: admin._id, completedAt: daysAgo(2), outcome: { disposition: 'interested', connected: 'yes' }, receipt: { steps: { outcome: { status: 'ok' } } } });
  await raw(ContactLog, { _id: ids.log, leadId: loser._id, channel: 'phone', isDeleted: true, occurredAt: daysAgo(3) });
  await raw(CampaignRecipient, { _id: ids.recipient, campaignId: oid(), leadId: loser._id, state: 'completed' });
  await raw(CallRecord, { _id: ids.call, campaignId: oid(), recipientId: ids.recipient, leadId: loser._id, internalCallId: randomUUID(), attemptNumber: 1, disposition: 'answered_completed', answeredAt: daysAgo(4) });
  await raw(SimSmsConversation, { _id: ids.conv, campaignId: smsCampaign, leadId: loser._id, createdBy: admin._id });
  await raw(SimSmsMessage, { _id: ids.msg, conversationId: ids.conv, campaignId: smsCampaign, leadId: loser._id, direction: 'inbound', kind: 'inbound', body: 'yes', status: 'received', receivedAt: daysAgo(2) });
  // Both leads were in the same SMS campaign: the loser's conversation cannot move (unique campaign+lead).
  await raw(SimSmsConversation, { _id: ids.survivorConv, campaignId: sharedCampaign, leadId: survivor._id, createdBy: admin._id });
  await raw(SimSmsConversation, { _id: ids.sharedConv, campaignId: sharedCampaign, leadId: loser._id, createdBy: admin._id });
  await raw(SimSmsMessage, { _id: ids.sharedMsg, conversationId: ids.sharedConv, campaignId: sharedCampaign, leadId: loser._id, direction: 'outbound', kind: 'opening', body: 'hi', status: 'sent' });
  await raw(SimCallTask, { _id: ids.task, campaignId: oid(), leadId: loser._id, createdBy: admin._id });
  await CallSuppression.create({ _id: ids.callSup, phoneHash: randomUUID(), leadId: loser._id, reason: 'do_not_contact', source: 'call_request' });
  await MessageSuppression.create({ _id: ids.msgSup, channel: 'sms', destinationHash: randomUUID(), leadId: loser._id, reason: 'opt_out' });
  await LinkOptOutEvent.create({ _id: ids.optOut, leadId: loser._id, source: 'web_link', dedupeKey: randomUUID(), receivedAt: daysAgo(1), recordedBy: admin._id });
  // Consent conflict: survivor granted SMS, loser revoked → stricter (revoked) must win.
  await LeadChannelConsent.create({ leadId: survivor._id, channel: 'sms', status: 'granted', source: 'manual', capturedAt: daysAgo(30) });
  await LeadChannelConsent.create({ leadId: loser._id, channel: 'sms', status: 'revoked', source: 'sms_reply', capturedAt: daysAgo(1) });
  await LeadChannelConsent.create({ leadId: loser._id, channel: 'email', status: 'granted', source: 'manual' });
  await raw(CallCampaign, { _id: ids.campaign, name: 'C', leadIds: [loser._id, oid()] });
  return ids;
}

async function makePair() {
  const history = (key, value, at) => ({ _id: oid(), fieldKey: key, previous: null, current: { fieldKey: key, value, status: 'answered', source: 'user', updatedAt: at }, changedAt: at });
  const survivor = await makeLead({
    name: 'Acme Heating AG', phone: '+41 44 111 11 11', normalizedPhone: '+41441111111', email: null, tags: ['vip'],
    notes: 'Survivor notes',
    qualification: {
      fields: [{ fieldKey: 'need', value: 'Boiler', status: 'answered', source: 'user', updatedAt: daysAgo(5) }],
      updatedAt: daysAgo(5),
      history: [history('need', 'Boiler', daysAgo(5))],
    },
  });
  const loser = await makeLead({
    name: 'ACME Heating', phone: '+41 44 111 11 11', normalizedPhone: '+41441111111', email: 'info@acme.ch', tags: ['vip', 'expo'],
    notes: 'Loser notes', lastContactedAt: daysAgo(1), lastContactChannel: 'phone',
    qualification: {
      fields: [{ fieldKey: 'budget', value: 5000, status: 'answered', source: 'sms_agent', updatedAt: daysAgo(2) }],
      updatedAt: daysAgo(2),
      history: [history('budget', 5000, daysAgo(2))],
    },
  });
  return { survivor, loser };
}

const leadIdOf = async (Model, id) => String((await Model.collection.findOne({ _id: id })).leadId);

describe('lead merge', () => {
  it('previews counts of history to be moved and default field winners', async () => {
    const { survivor, loser } = await makePair();
    await seedHistory(survivor, loser);
    const res = await request(server).get('/api/v1/crm/lead-merges/preview')
      .query({ survivorId: String(survivor._id), loserId: String(loser._id) }).set(auth(adminToken)).expect(200);
    const counts = Object.fromEntries(res.body.data.counts.map((c) => [c.key, c]));
    expect(counts.leadCommunications.move).toBe(1);
    expect(counts.contactLogEntries.move).toBe(1); // soft-deleted rows move too
    expect(counts.simSmsConversations).toMatchObject({ move: 1, retained: 1 });
    expect(counts.simSmsMessages).toMatchObject({ move: 1, retained: 1 });
    expect(counts.channelConsents).toMatchObject({ move: 1, retained: 1, consentUpgrades: 1 });
    expect(counts.callCampaignLeads.move).toBe(1);
    expect(res.body.data.fields.find((f) => f.field === 'email').defaultWinner).toBe('loser');
    expect(res.body.data.fields.find((f) => f.field === 'name').defaultWinner).toBe('survivor');
    expect(res.body.data.qualification.takeoverKeys).toEqual(['budget']);
    expect(res.body.data.tagsToAdd).toEqual(['expo']);
    await request(server).get('/api/v1/crm/lead-merges/preview').query({ survivorId: String(survivor._id), loserId: String(loser._id) }).set(auth(agentToken)).expect(403);
  });

  it('moves every child record, preserves DNC/stricter consent, unions history, then undo restores everything', async () => {
    const { survivor, loser } = await makePair();
    const ids = await seedHistory(survivor, loser);
    await leadDuplicateService.scanAll();
    const candidate = await LeadDuplicateCandidate.findOne({}).lean();
    const audit = jest.spyOn(auditService, 'logEvent');

    const res = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken)).send({
      survivorId: String(survivor._id), loserId: String(loser._id), candidateId: String(candidate._id),
      fieldSelections: { email: 'loser', notes: 'both' },
    }).expect(201);
    const merge = res.body.data;
    expect(merge.status).toBe('completed');
    expect(merge.counts.leadCommunications.moved).toBe(1);

    const S = String(survivor._id);
    const L = String(loser._id);
    for (const [Model, id] of [[LeadCommunication, ids.comm], [ContactLog, ids.log], [CampaignRecipient, ids.recipient], [CallRecord, ids.call],
      [SimSmsConversation, ids.conv], [SimSmsMessage, ids.msg], [SimCallTask, ids.task], [CallSuppression, ids.callSup], [MessageSuppression, ids.msgSup], [LinkOptOutEvent, ids.optOut]]) {
      expect(await leadIdOf(Model, id)).toBe(S);
    }
    // Retained (unique conflict) rows stay on the merged-away lead, with their messages.
    expect(await leadIdOf(SimSmsConversation, ids.sharedConv)).toBe(L);
    expect(await leadIdOf(SimSmsMessage, ids.sharedMsg)).toBe(L);
    expect((await CallCampaign.collection.findOne({ _id: ids.campaign })).leadIds.map(String)).toContain(S);
    // Stricter consent wins; the loser's other channel consent moved.
    expect((await LeadChannelConsent.findOne({ leadId: survivor._id, channel: 'sms' }).lean()).status).toBe('revoked');
    expect((await LeadChannelConsent.findOne({ leadId: survivor._id, channel: 'email' }).lean()).status).toBe('granted');

    const s = await Lead.findById(survivor._id).select('+qualification.history').lean();
    expect(s.email).toBe('info@acme.ch');
    expect(s.notes).toContain('Survivor notes');
    expect(s.notes).toContain('Loser notes');
    expect(s.tags.sort()).toEqual(['expo', 'vip']);
    expect(s.mergedLeadIds.map(String)).toEqual([L]);
    expect(s.qualification.fields.map((f) => f.fieldKey).sort()).toEqual(['budget', 'need']);
    expect(s.qualification.history).toHaveLength(2);
    expect(s.lastContactedAt.getTime()).toBe(loser.lastContactedAt.getTime());
    // DNC moved with the lead → the survivor is now disqualified.
    expect(s.score).toMatchObject({ value: 0, disqualified: true });
    const l = await Lead.findById(loser._id).setOptions({ includeDeleted: true }).lean();
    expect(l).toMatchObject({ isDeleted: true });
    expect(String(l.mergedInto)).toBe(S);
    expect((await LeadDuplicateCandidate.findById(candidate._id).lean()).status).toBe('merged');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.merged', userId: admin._id }));

    // History list shows it.
    const hist = await request(server).get('/api/v1/crm/lead-merges').set(auth(agentToken)).expect(200);
    expect(hist.body.data[0]).toMatchObject({ id: merge.id, status: 'completed' });

    // Undo.
    const undo = await request(server).post(`/api/v1/crm/lead-merges/${merge.id}/undo`).set(auth(adminToken)).expect(200);
    expect(undo.body.data.status).toBe('undone');
    for (const [Model, id] of [[LeadCommunication, ids.comm], [ContactLog, ids.log], [CallRecord, ids.call], [SimSmsMessage, ids.msg], [CallSuppression, ids.callSup], [LinkOptOutEvent, ids.optOut]]) {
      expect(await leadIdOf(Model, id)).toBe(L);
    }
    expect((await CallCampaign.collection.findOne({ _id: ids.campaign })).leadIds.map(String)).toContain(L);
    expect((await LeadChannelConsent.findOne({ leadId: survivor._id, channel: 'sms' }).lean()).status).toBe('granted');
    expect((await LeadChannelConsent.findOne({ leadId: loser._id, channel: 'sms' }).lean()).status).toBe('revoked');
    const s2 = await Lead.findById(survivor._id).select('+qualification.history').lean();
    expect(s2.email).toBeNull();
    expect(s2.notes).toBe('Survivor notes');
    expect(s2.tags).toEqual(['vip']);
    expect(s2.mergedLeadIds).toEqual([]);
    expect(s2.qualification.fields.map((f) => f.fieldKey)).toEqual(['need']);
    expect(s2.qualification.history).toHaveLength(1);
    const l2 = await Lead.findById(loser._id).lean();
    expect(l2).toMatchObject({ isDeleted: false, mergedInto: null });
    expect((await LeadDuplicateCandidate.findById(candidate._id).lean()).status).toBe('open');
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'lead.merge_undone' }));
    await request(server).post(`/api/v1/crm/lead-merges/${merge.id}/undo`).set(auth(adminToken)).expect(409);
  });

  it('refuses an undo that would overwrite a change made after the merge', async () => {
    const { survivor, loser } = await makePair();
    const res = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken))
      .send({ survivorId: String(survivor._id), loserId: String(loser._id), fieldSelections: { email: 'loser' } }).expect(201);
    await Lead.updateOne({ _id: survivor._id }, { $set: { email: 'changed@later.ch' } });
    const undo = await request(server).post(`/api/v1/crm/lead-merges/${res.body.data.id}/undo`).set(auth(adminToken)).expect(409);
    expect(undo.body.error.code).toBe('UNDO_CONFLICT');
    expect(undo.body.error.details.map((d) => d.field)).toContain('email');
    expect((await Lead.findById(loser._id).setOptions({ includeDeleted: true }).lean()).isDeleted).toBe(true);
  });

  it('finishes a merge after a simulated partial failure, without double-moving anything', async () => {
    const { survivor, loser } = await makePair();
    const ids = await seedHistory(survivor, loser);
    const spy = jest.spyOn(SimSmsMessage, 'updateMany').mockRejectedValueOnce(new Error('connection reset'));

    const fail = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken))
      .send({ survivorId: String(survivor._id), loserId: String(loser._id) }).expect(500);
    expect(fail.body.error.code).toBe('MERGE_INTERRUPTED');
    const journal = await LeadMerge.findOne({}).lean();
    expect(journal).toMatchObject({ status: 'in_progress', attempts: 1 });
    expect(journal.steps.children.status).toBe('pending');
    expect(journal.lastError).toContain('connection reset');
    // Rows before the failure point were already moved; the loser is still live.
    expect(await leadIdOf(LeadCommunication, ids.comm)).toBe(String(survivor._id));
    expect(await leadIdOf(SimSmsMessage, ids.msg)).toBe(String(loser._id));
    expect((await Lead.findById(loser._id).lean()).isDeleted).toBe(false);
    // Another merge touching these leads is refused until this one is finished.
    const other = await makeLead();
    const blocked = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken))
      .send({ survivorId: String(survivor._id), loserId: String(other._id) }).expect(409);
    expect(blocked.body.error.code).toBe('MERGE_PENDING');

    spy.mockRestore();
    // Retrying the same request resumes the journal.
    const retry = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken))
      .send({ survivorId: String(survivor._id), loserId: String(loser._id) }).expect(201);
    expect(retry.body.data).toMatchObject({ id: String(journal._id), status: 'completed', attempts: 2 });
    expect(await leadIdOf(SimSmsMessage, ids.msg)).toBe(String(survivor._id));
    expect(await LeadMerge.countDocuments({})).toBe(1);
    const s = await Lead.findById(survivor._id).select('+qualification.history').lean();
    expect(s.mergedLeadIds).toHaveLength(1);
    expect(s.qualification.history).toHaveLength(2);
    expect(retry.body.data.counts.leadCommunications.moved).toBe(1);
  });

  it('the stale-merge recovery sweep finishes a merge whose process died', async () => {
    const { survivor, loser } = await makePair();
    const ids = await seedHistory(survivor, loser);
    const spy = jest.spyOn(LeadChannelConsent, 'updateMany').mockRejectedValueOnce(new Error('boom'));
    await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken))
      .send({ survivorId: String(survivor._id), loserId: String(loser._id) }).expect(500);
    spy.mockRestore();
    const journal = await LeadMerge.findOne({}).lean();
    expect(journal.status).toBe('in_progress');
    // Not stale yet → untouched.
    expect((await leadMergeService.recoverStale()).candidates).toBe(0);
    await LeadMerge.collection.updateOne({ _id: journal._id }, { $set: { updatedAt: new Date(Date.now() - 10 * 60_000) } });
    expect(await leadMergeService.recoverStale()).toEqual({ candidates: 1, resumed: 1 });
    expect((await LeadMerge.findById(journal._id).lean()).status).toBe('completed');
    expect((await LeadChannelConsent.findOne({ leadId: survivor._id, channel: 'email' }).lean())).not.toBeNull();
    expect(await leadIdOf(SimSmsMessage, ids.msg)).toBe(String(survivor._id));
  });

  it('rejects a merge while another merge holds either lead, and serializes concurrent identical requests', async () => {
    const { survivor, loser } = await makePair();
    await Lead.updateOne({ _id: survivor._id }, { $set: { mergeLock: { mergeId: oid(), token: 'other-process', until: new Date(Date.now() + 60_000) } } });
    const locked = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken))
      .send({ survivorId: String(survivor._id), loserId: String(loser._id) }).expect(409);
    expect(locked.body.error.code).toBe('MERGE_IN_PROGRESS');
    await Lead.updateOne({ _id: survivor._id }, { $set: { mergeLock: null } });

    const ids = await seedHistory(survivor, loser);
    const body = { survivorId: String(survivor._id), loserId: String(loser._id) };
    const results = await Promise.all([1, 2, 3].map(() => request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken)).send(body)));
    const statuses = results.map((r) => r.status).sort();
    expect(statuses.filter((st) => st === 201)).toHaveLength(1);
    expect(statuses.every((st) => [201, 404, 409].includes(st))).toBe(true);
    expect(await LeadMerge.countDocuments({ status: 'completed' })).toBe(1);
    expect(await leadIdOf(LeadCommunication, ids.comm)).toBe(String(survivor._id));
    const s = await Lead.findById(survivor._id).lean();
    expect(s.mergedLeadIds).toHaveLength(1);
  });

  it('validates the pair', async () => {
    const { survivor, loser } = await makePair();
    await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken)).send({ survivorId: String(survivor._id), loserId: String(survivor._id) }).expect(400);
    await request(server).post('/api/v1/crm/lead-merges').set(auth(agentToken)).send({ survivorId: String(survivor._id), loserId: String(loser._id) }).expect(403);
    const converted = await makeLead({ status: 'converted' });
    const res = await request(server).post('/api/v1/crm/lead-merges').set(auth(adminToken)).send({ survivorId: String(survivor._id), loserId: String(converted._id) }).expect(409);
    expect(res.body.error.code).toBe('LOSER_CONVERTED');
    expect((await Lead.findById(survivor._id).select('+mergeLock').lean()).mergeLock).toBeNull();
  });
});
