import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * SMS operations — HTTP-level integration (device dashboard, cross-channel contact
 * policy, multi-answer + review queue, recovery inbox, SMS callbacks). Real routes,
 * the leadCommunication CRM sync. Only infrastructure (queue, Redis, session,
 * cache, notifications) and the LLM client are stubbed. The "phone" is played
 * by the test: it leases, marks attempting, reports results and uploads replies
 * exactly like the Android app.
 */
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';

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
const ai = { configured: false, create: jest.fn() };
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => ai.configured,
  assertAiConfigured: () => {},
  createChatModel: async () => ({}),
  createOpenAiClient: async () => ({ chat: { completions: { create: ai.create } } }),
}));


let mongod; let app; let server;
let Lead; let User; let Role; let Permission; let LeadCommunication; let LeadChannelConsent; let CallSuppression;
let SimSmsMessage; let SimSmsConversation; let RecoveryItem; let SmsAnswerReview; let SmsDevice; let LeadFollowUp;
let contactPolicyService; let ContactPolicySettings; let ContactTouch; let ContactLedger;
let generateAccessToken; let phoneHash;
let userA; let tokenA; let adminToken;
let n = 0;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const DEVICE = 'device-ops-1111';

async function makeUser(permIds) {
  const role = await Role.create({ name: `OpsRole_${randomUUID()}`, permissions: permIds });
  return User.create({
    email: `ops-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Ops', lastName: 'User', role: role._id, status: 'active',
  });
}
async function makeLead(overrides = {}) {
  n += 1;
  const lead = await Lead.create({
    leadNumber: `L-${80000 + n}`, name: `Ops Lead ${n}`, source: 'manual',
    mobile: `+41 79 666 ${String(1000 + n).padStart(4, '0')}`, address: { country: 'CH', city: 'Basel' },
    createdBy: userA._id, ...overrides,
  });
  await LeadChannelConsent.create({ leadId: lead._id, channel: 'sms', status: 'granted', evidence: 'opt-in', capturedAt: new Date() });
  return lead;
}
const QUESTIONS = [
  { fieldKey: 'interest', label: 'Interest level', text: 'How interested are you?', type: 'single_choice', required: true, order: 1, options: ['high', 'medium', 'low', 'none'] },
  { fieldKey: 'budget', label: 'Budget', text: 'What budget do you have in CHF?', type: 'currency', required: true, order: 2 },
  { fieldKey: 'timing', label: 'Timing', text: 'When do you plan to buy?', type: 'short_text', required: false, order: 3 },
];
async function startCampaign(leads) {
  const created = await request(server).post('/api/v1/sim-sms/campaigns').set(auth(tokenA)).send({
    name: 'Ops campaign', leadIds: leads.map((l) => String(l._id)), questionnaire: { questions: QUESTIONS },
    agent: { agentName: 'Mia', organizationName: 'Updata Ovens' },
    settings: { timezone: 'UTC', sendWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], minSecondsBetweenSends: 5 },
  }).expect(201);
  await request(server).post(`/api/v1/sim-sms/campaigns/${created.body.data._id}/start`).set(auth(tokenA)).expect(200);
  return created.body.data;
}
async function unpace() {
  await SimSmsMessage.updateMany({ attemptedAt: { $ne: null } }, { $set: { attemptedAt: new Date(Date.now() - 3600_000) } });
}
async function lease() {
  await unpace();
  return (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE }).expect(200)).body.data.message;
}
async function attempt(id) {
  return (await request(server).post(`/api/v1/sim-sms/device/messages/${id}/attempting`).set(auth(tokenA)).send({ deviceId: DEVICE }).expect(200)).body.data;
}
async function result(id, status, errorCode = null) {
  return request(server).post(`/api/v1/sim-sms/device/messages/${id}/result`).set(auth(tokenA)).send({ deviceId: DEVICE, status, errorCode }).expect(200);
}
async function sendNext() { const m = await lease(); await attempt(m.id); await result(m.id, 'sent'); return m; }
async function reply(from, body, key = randomUUID()) {
  return (await request(server).post('/api/v1/sim-sms/device/inbound').set(auth(tokenA)).send({
    deviceId: DEVICE, deviceMessageKey: key, from, body, receivedAt: new Date().toISOString(),
  }).expect(200)).body.data;
}
const e164 = (lead) => lead.mobile.replace(/\s/g, '');
async function policy(settings) {
  await ContactPolicySettings.deleteMany({});
  if (settings) await ContactPolicySettings.create({ key: 'global', ...settings });
  contactPolicyService._invalidate();
}
const NO_LIMITS = { enabled: true, maxTouchesPerDay: 0, maxTouchesPerWeek: 0, minGapMinutes: 0, quietHours: { enabled: false }, channels: { voice: { perDay: 0, perWeek: 0 }, sms: { perDay: 0, perWeek: 0 }, email: { perDay: 0, perWeek: 0 }, whatsapp: { perDay: 0, perWeek: 0 } } };

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const simSmsRoutes = (await import('../../src/modules/simSms/simSms.routes.js')).default;
  const contactPolicyRoutes = (await import('../../src/modules/contactPolicy/contactPolicy.routes.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  LeadChannelConsent = (await import('../../src/modules/messaging/consent.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  LeadFollowUp = (await import('../../src/modules/crm/leadFollowUp.model.js')).default;
  SimSmsMessage = (await import('../../src/modules/simSms/simSmsMessage.model.js')).default;
  SimSmsConversation = (await import('../../src/modules/simSms/simSmsConversation.model.js')).default;
  RecoveryItem = (await import('../../src/modules/simSms/recoveryItem.model.js')).default;
  SmsAnswerReview = (await import('../../src/modules/simSms/smsAnswerReview.model.js')).default;
  SmsDevice = (await import('../../src/modules/simSms/smsDevice.model.js')).default;
  contactPolicyService = (await import('../../src/modules/contactPolicy/contactPolicy.service.js')).default;
  ({ ContactPolicySettings, ContactTouch, ContactLedger } = await import('../../src/modules/contactPolicy/contactPolicy.models.js'));
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  ({ phoneHash } = await import('../../src/modules/aiCalling/callAuth.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task', 'crm/contactLog']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await Promise.all([LeadCommunication.init(), SimSmsMessage.init(), SimSmsConversation.init(), RecoveryItem.init(), SmsAnswerReview.init(), SmsDevice.init(), ContactTouch.init(), ContactLedger.init(), LeadFollowUp.init()]);

  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/v1/sim-sms', simSmsRoutes);
  app.use('/api/v1/contact-policy', contactPolicyRoutes);
  app.use(errorHandler);
  server = app.listen(0);
}, 120000);

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  contactPolicyService._invalidate();
  ai.configured = false; ai.create.mockReset(); notify.mockClear();
  process.env.AI_SMS_REQUIRE_CONSENT = 'true';
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' }, { module: 'lead', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'read', description: 'r' }, { module: 'ai-calling', action: 'write', description: 'w' },
  ]);
  const admin = await Permission.create({ module: 'ai-calling', action: 'admin', description: 'a' });
  userA = await makeUser(perms.map((p) => p._id));
  tokenA = generateAccessToken({ sub: String(userA._id) });
  adminToken = generateAccessToken({ sub: String((await makeUser([...perms.map((p) => p._id), admin._id]))._id) });
});

describe('contact policy service', () => {
  it('without a settings document only hard blockers apply (legacy behaviour)', async () => {
    const lead = await makeLead();
    for (let i = 0; i < 5; i += 1) {
      expect((await contactPolicyService.reserve({ leadId: lead._id, channel: 'voice', source: 'ai_calling', refId: `r${i}`, campaignId: new mongoose.Types.ObjectId() })).allowed).toBe(true);
    }
    await CallSuppression.create({ phoneHash: phoneHash(e164(lead)), leadId: lead._id, reason: 'do_not_contact' });
    expect(await contactPolicyService.reserve({ leadId: lead._id, channel: 'sms', source: 'sim_sms', refId: 'x' })).toMatchObject({ allowed: false, reason: 'do_not_contact' });
  });

  it('reserves atomically under concurrency, idempotently per ref, and release frees the slot', async () => {
    await policy({ ...NO_LIMITS, maxTouchesPerDay: 1 });
    const lead = await makeLead();
    const campaignId = new mongoose.Types.ObjectId();
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => contactPolicyService.reserve({ leadId: lead._id, channel: i % 2 ? 'voice' : 'sms', source: 'messaging', refId: `p${i}`, campaignId })));
    expect(results.filter((r) => r.allowed)).toHaveLength(1);
    const winner = results.find((r) => r.allowed);
    expect((await ContactLedger.findOne({ leadId: lead._id }).lean()).events).toHaveLength(1);
    // Same ref again: the same reservation, not a second touch.
    const again = await contactPolicyService.reserve({ leadId: lead._id, channel: 'sms', source: 'messaging', refId: `p${results.indexOf(winner)}`, campaignId });
    expect(again).toMatchObject({ allowed: true, duplicate: true, reservationId: winner.reservationId });
    const skips = await contactPolicyService.campaignSkips('messaging', campaignId);
    expect(skips).toMatchObject({ skipped: 1, skippedContactLimit: 1 });
    expect(skips.byReason.daily_limit.attempts).toBe(7);
    await contactPolicyService.release(winner.reservationId);
    expect((await contactPolicyService.reserve({ leadId: lead._id, channel: 'voice', source: 'messaging', refId: 'later', campaignId })).allowed).toBe(true);
  });

  it('records a manual contact over the limit with a warning instead of blocking', async () => {
    await policy({ ...NO_LIMITS, minGapMinutes: 60 });
    const lead = await makeLead();
    await contactPolicyService.reserve({ leadId: lead._id, channel: 'voice', source: 'ai_calling', refId: 'a' });
    const manual = await contactPolicyService.reserve({ leadId: lead._id, channel: 'sms', source: 'manual', refId: 'm', force: true });
    expect(manual).toMatchObject({ allowed: true, warning: 'min_gap' });
    expect(await ContactTouch.countDocuments({ leadId: lead._id, manual: true, policyWarning: 'min_gap' })).toBe(1);
  });

  it('exposes next-allowed contact per lead and admin-only settings over HTTP', async () => {
    await policy({ ...NO_LIMITS, minGapMinutes: 120 });
    const lead = await makeLead();
    await contactPolicyService.reserve({ leadId: lead._id, channel: 'voice', source: 'sim_call', refId: 't' });
    const status = (await request(server).get(`/api/v1/contact-policy/leads/${lead._id}`).set(auth(tokenA)).expect(200)).body.data;
    expect(status.channels.sms).toMatchObject({ allowed: false, reason: 'min_gap' });
    expect(new Date(status.nextAllowedAt).getTime()).toBeGreaterThan(Date.now() + 100 * 60_000);
    await request(server).put('/api/v1/contact-policy/settings').set(auth(tokenA)).send({ minGapMinutes: 5 }).expect(403);
    const saved = (await request(server).put('/api/v1/contact-policy/settings').set(auth(adminToken)).send({ minGapMinutes: 5 }).expect(200)).body.data;
    expect(saved.minGapMinutes).toBe(5);
  });
});

describe('dispatch gates (AI calling, SIM calls)', () => {
  it('AI call: defers a recipient over the limit instead of dialling; test calls are exempt', async () => {
    await policy({ ...NO_LIMITS, maxTouchesPerDay: 1 });
    const lead = await makeLead();
    await contactPolicyService.reserve({ leadId: lead._id, channel: 'sms', source: 'sim_sms', refId: 'earlier' });
    const hooks = await import('../../src/modules/contactPolicy/contactPolicy.hooks.js');
    const svc = { _releaseClaim: jest.fn(async () => {}) };
    const campaign = { _id: new mongoose.Types.ObjectId(), isTest: false };
    const recipient = { _id: new mongoose.Types.ObjectId(), leadId: lead._id, attemptCount: 0 };
    const out = await hooks.aiCallGate(svc, campaign, recipient);
    expect(out).toMatchObject({ deferred: 'contact_policy', reason: 'daily_limit' });
    expect(svc._releaseClaim.mock.calls[0][1].deferMs).toBeGreaterThan(60_000);
    expect(await hooks.aiCallGate(svc, { ...campaign, isTest: true }, recipient)).toBeNull();
  });

  it('SIM call: dial is refused and the lead put back; a lead-requested callback is exempt from limits', async () => {
    await policy({ ...NO_LIMITS, minGapMinutes: 60 });
    const lead = await makeLead();
    await contactPolicyService.reserve({ leadId: lead._id, channel: 'sms', source: 'sim_sms', refId: 'earlier' });
    const hooks = await import('../../src/modules/contactPolicy/contactPolicy.hooks.js');
    const task = { _id: new mongoose.Types.ObjectId(), leadId: lead._id, campaignId: new mongoose.Types.ObjectId() };
    expect(await hooks.simCallDialGate(task, 'att-1')).toMatchObject({ details: { reasons: ['CONTACT_POLICY_MIN_GAP'] } });
    const callback = { ...task, _id: new mongoose.Types.ObjectId(), callback: { at: new Date(), status: 'pending' } };
    expect(await hooks.simCallDialGate(callback, 'att-2')).toBeNull();
    expect(await ContactTouch.findOne({ refId: `${callback._id}:att-2` }).lean()).toMatchObject({ manual: true, policyWarning: 'min_gap' });
  });
});

describe('SIM SMS + contact policy', () => {
  it('defers an opening when the lead was just contacted on another channel, then sends it', async () => {
    await policy({ ...NO_LIMITS, minGapMinutes: 60 });
    const lead = await makeLead();
    await contactPolicyService.reserve({ leadId: lead._id, channel: 'voice', source: 'ai_calling', refId: 'call-1' });
    const campaign = await startCampaign([lead]);
    expect(await lease()).toBeNull();
    const msg = await SimSmsMessage.findOne({ campaignId: campaign._id, kind: 'opening' }).lean();
    expect(msg.status).toBe('pending');
    expect(msg.notBefore.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    const skips = (await request(server).get(`/api/v1/contact-policy/campaigns/sim_sms/${campaign._id}/skips`).set(auth(tokenA)).expect(200)).body.data;
    expect(skips.skippedContactLimit).toBe(0); // a lease-time check is read-only; only reservations record skips

    await ContactLedger.updateMany({}, { $set: { 'events.$[].at': new Date(Date.now() - 2 * 3_600_000) } });
    await SimSmsMessage.updateOne({ _id: msg._id }, { $set: { notBefore: null } });
    const sent = await sendNext();
    expect(sent.kind).toBe('opening');
    expect(await ContactTouch.findOne({ source: 'sim_sms', refId: sent.id }).lean()).toMatchObject({ status: 'committed', channel: 'sms' });
  });

  it('releases the reservation on a definite failure and files a permanent failure in the recovery inbox', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    const m = await lease();
    await attempt(m.id);
    await result(m.id, 'failed', 'RESULT_ERROR_NULL_PDU');
    expect(await ContactTouch.findOne({ refId: m.id }).lean()).toMatchObject({ status: 'released' });
    const inbox = (await request(server).get('/api/v1/sim-sms/recovery?type=delivery_failure').set(auth(tokenA)).expect(200)).body.data;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]).toMatchObject({ type: 'delivery_failure', allowedActions: ['retry_other_sim', 'dismiss'] });
    const retried = (await request(server).post(`/api/v1/sim-sms/recovery/${inbox[0]._id}/actions`).set(auth(tokenA)).send({ action: 'retry_other_sim', subscriptionId: 2 }).expect(200)).body.data;
    expect(retried.status).toBe('resolved');
    expect(await SimSmsMessage.findOne({ status: 'pending', subscriptionId: 2 }).lean()).toBeTruthy();
  });
});

describe('recovery inbox', () => {
  it('unknown send: never re-sent automatically; resend only after a human marks it not sent', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    const m = await lease();
    await attempt(m.id);
    await result(m.id, 'unknown', 'PARTIAL_MULTIPART');
    const [item] = (await request(server).get('/api/v1/sim-sms/recovery').set(auth(tokenA)).expect(200)).body.data;
    expect(item).toMatchObject({ type: 'unknown_send', severity: 'high', allowedActions: ['mark_sent', 'mark_not_sent', 'dismiss'] });
    expect(await SimSmsMessage.countDocuments({ status: 'pending' })).toBe(0);
    await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'resend' }).expect(409);
    const marked = (await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'mark_not_sent', note: 'phone shows failed' }).expect(200)).body.data;
    expect(marked.allowedActions).toEqual(['resend']);
    expect(await ContactTouch.findOne({ refId: m.id }).lean()).toMatchObject({ status: 'released' });
    const resent = (await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'resend' }).expect(200)).body.data;
    expect(resent.allowedActions).toEqual([]);
    expect(await SimSmsMessage.countDocuments({ status: 'pending', kind: 'opening' })).toBe(1);
    await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'resend' }).expect(409);
    expect((await request(server).get('/api/v1/sim-sms/recovery/counts').set(auth(tokenA)).expect(200)).body.data.open).toBe(0);
  });

  it('retains an unmatched reply and processes it once linked to a lead', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    await sendNext();
    const out = await reply('+41 79 000 9999', 'high');
    expect(out).toMatchObject({ matched: false, retained: true });
    const [item] = (await request(server).get('/api/v1/sim-sms/recovery?type=unmatched_reply').set(auth(tokenA)).expect(200)).body.data;
    expect(item.details).toMatchObject({ body: 'high', fromMasked: '•••• 9999' });
    expect(item.details.from).toBeUndefined();
    const linked = (await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'link_lead', leadId: String(lead._id) }).expect(200)).body.data;
    expect(linked.resolution.result).toMatchObject({ linked: true, processed: true });
    const conv = await SimSmsConversation.findOne({ leadId: lead._id }).lean();
    expect(conv.conversationState.answers.interest.normalizedValue).toBe('high');
  });

  it('bulk-dismisses and audits', async () => {
    const ids = [];
    for (let i = 0; i < 3; i += 1) ids.push(String((await reply(`+41 79 000 900${i}`, 'hello')) && (await RecoveryItem.findOne({ 'details.fromMasked': `•••• 900${i}` }).lean())._id));
    const res = (await request(server).post('/api/v1/sim-sms/recovery/bulk-dismiss').set(auth(tokenA)).send({ ids, note: 'spam' }).expect(200)).body.data;
    expect(res.dismissed).toBe(3);
  });
});

describe('multiple answers in one SMS + review', () => {
  it('records several answers from one reply and does not re-ask them', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    await sendNext();
    const out = await reply(lead.mobile, 'high, budget 5000 CHF');
    expect(out.next.queued).toBe('question');
    const next = await SimSmsMessage.findOne({ direction: 'outbound', status: 'pending' }).lean();
    expect(next.questionFieldKey).toBe('timing');
    const inbound = await SimSmsMessage.findOne({ direction: 'inbound' }).lean();
    expect(inbound.interpretation.extras[0]).toMatchObject({ fieldKey: 'budget', value: 5000, decision: 'record' });
  });

  it('queues an uncertain mapping for review; accepting it writes the qualification and skips the question', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    await sendNext();
    await reply(lead.mobile, 'high, 5000');
    const pendingQ = await SimSmsMessage.findOne({ direction: 'outbound', status: 'pending' }).lean();
    expect(pendingQ.questionFieldKey).toBe('budget'); // not assumed: still asked
    const [review] = (await request(server).get('/api/v1/sim-sms/answer-reviews').set(auth(tokenA)).expect(200)).body.data;
    expect(review).toMatchObject({ reply: 'high, 5000', lead: { name: lead.name } });
    expect(review.proposals[0]).toMatchObject({ fieldKey: 'budget', proposedValue: 5000, reason: 'no_question_keyword' });
    await request(server).post(`/api/v1/sim-sms/answer-reviews/${review._id}/resolve`).set(auth(tokenA)).send({ decisions: [{ fieldKey: 'budget', action: 'edit', value: 'not a number' }] }).expect(400);
    const done = (await request(server).post(`/api/v1/sim-sms/answer-reviews/${review._id}/resolve`).set(auth(tokenA)).send({ decisions: [{ fieldKey: 'budget', action: 'edit', value: '5500' }] }).expect(200)).body.data;
    expect(done).toMatchObject({ status: 'resolved', writtenFields: ['budget'] });
    const updated = await Lead.findById(lead._id).lean();
    expect(updated.qualification.fields.find((f) => f.fieldKey === 'budget').value).toBe(5500);
    const conv = await SimSmsConversation.findOne({ leadId: lead._id }).lean();
    expect(conv.conversationState.answers.budget).toMatchObject({ validation: 'valid', normalizedValue: 5500 });
    await request(server).post(`/api/v1/sim-sms/answer-reviews/${review._id}/resolve`).set(auth(tokenA)).send({ decisions: [{ fieldKey: 'budget', action: 'reject' }] }).expect(409);
  });
});

describe('callbacks from SMS replies', () => {
  it('creates a timed callback follow-up and notifies the owner (Roman Urdu)', async () => {
    const lead = await makeLead({ address: { country: 'PK', city: 'Lahore' }, mobile: '+92 300 1234567' });
    await startCampaign([lead]);
    await sendNext();
    const out = await reply(lead.mobile, 'kal shaam 5 baje call karein');
    expect(out.intent).toBe('callback');
    // The conversation ended on the callback: ONE follow-up, from the CRM completion, carrying the parsed time.
    expect(await LeadFollowUp.countDocuments({ leadId: lead._id })).toBe(1);
    const fu = await LeadFollowUp.findOne({ leadId: lead._id }).lean();
    expect(fu).toMatchObject({ ownerId: userA._id, timezone: 'Asia/Karachi', source: { type: 'sim_sms' } });
    expect(new Date(fu.dueAt).getTime()).toBeGreaterThan(Date.now());
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'sim_sms.callback_requested', channels: ['IN_APP', 'PUSH'] }), userA._id);
    const list = (await request(server).get('/api/v1/sim-sms/callbacks').set(auth(tokenA)).expect(200)).body.data;
    expect(list[0]).toMatchObject({ leadName: lead.name, needsTime: false });
  });

  it('a callback asked mid-conversation creates its own follow-up with the lead\'s words', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    await sendNext();
    const out = await reply(lead.mobile, 'high, baad mein call karein');
    expect(out.intent).toBe('answer'); // the conversation continues
    const fu = await LeadFollowUp.findOne({ leadId: lead._id, sourceKey: /^sim_sms_callback:/ }).lean();
    expect(fu).toMatchObject({ channel: 'phone', source: { type: 'sim_sms', requestedTimeText: 'high, baad mein call karein' } });
    expect(fu.note).toMatch(/no time given/);
  });

  it('a callback without a time is flagged "needs a time" (Urdu script), never given an invented hour', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    await sendNext();
    await reply(lead.mobile, 'بعد میں فون کریں');
    const [item] = (await request(server).get('/api/v1/sim-sms/callbacks').set(auth(tokenA)).expect(200)).body.data;
    expect(item).toMatchObject({ needsTime: true });
    const detail = (await request(server).get(`/api/v1/sim-sms/conversations/${(await SimSmsConversation.findOne({}).lean())._id}`).set(auth(tokenA)).expect(200)).body.data;
    expect(detail.smsInsights).toMatchObject({ language: 'ur', intent: 'callback' });
  });
});

describe('device dashboard', () => {
  const beat = (overrides = {}) => ({
    deviceId: DEVICE, model: 'KJ5', manufacturer: 'TECNO', osVersion: '13', sdkInt: 33, appVersion: '0.1.4', buildProfile: 'private',
    permissions: { smsDeclared: true, sendSms: true, receiveSms: true, readPhoneState: true, postNotifications: false, batteryOptimizationIgnored: true },
    simState: 'ready', sims: [{ subscriptionId: 1, slotIndex: 0, carrierName: 'Jazz', isDefaultSms: true, selected: true, numberMasked: '+923001234567' }],
    network: { type: 'cellular', connected: true, airplaneMode: false }, queue: { pending: 0, attempting: 0, unknown: 0, failed: 0 },
    ...overrides,
  });

  it('upserts heartbeats, masks numbers, derives health and keeps a status history', async () => {
    process.env.SIM_SMS_MIN_APP_VERSION = '0.1.5';
    const res = (await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send(beat()).expect(200)).body.data;
    expect(res.health.status).toBe('warning');
    expect(res.health.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(['missing_permission_notifications', 'outdated_app']));
    await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send(beat({ appVersion: '0.1.9', permissions: { sendSms: true, postNotifications: true } })).expect(200);
    const [device] = (await request(server).get('/api/v1/sim-sms/devices').set(auth(tokenA)).expect(200)).body.data;
    expect(device).toMatchObject({ model: 'KJ5', health: { status: 'online' } });
    expect(device.sims[0].numberMasked).toBe('•••• 4567');
    const detail = (await request(server).get(`/api/v1/sim-sms/devices/${DEVICE}`).set(auth(tokenA)).expect(200)).body.data;
    expect(detail.statusHistory.map((h) => h.status)).toEqual(['online', 'warning']);
    delete process.env.SIM_SMS_MIN_APP_VERSION;
  });

  it('alerts once when a phone carrying a running campaign goes silent', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send(beat()).expect(200);
    await SmsDevice.updateOne({ deviceId: DEVICE }, { $set: { lastHeartbeatAt: new Date(Date.now() - 25 * 60_000) } });
    const { default: devices } = await import('../../src/modules/simSms/smsDevice.service.js');
    expect(await devices.sweep()).toMatchObject({ offline: 1, alerts: 1 });
    expect(await devices.sweep()).toMatchObject({ offline: 0, alerts: 0 });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'sim_sms.device_offline' }), userA._id);
  });

  it('turns a journal/CRM mismatch into a sync failure, and a resync request round-trips', async () => {
    const lead = await makeLead();
    await startCampaign([lead]);
    const m = await lease();
    await attempt(m.id);
    const old = new Date(Date.now() - 30 * 60_000).toISOString();
    await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send(beat({ journal: [{ messageId: m.id, status: 'sent', finishedAt: old }] })).expect(200);
    const [item] = (await request(server).get('/api/v1/sim-sms/recovery?type=sync_failure').set(auth(tokenA)).expect(200)).body.data;
    expect(item).toMatchObject({ details: { cause: 'journal_mismatch', deviceStatus: 'sent', serverStatus: 'attempting' }, allowedActions: ['request_resync', 'dismiss'] });
    await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'request_resync' }).expect(200);
    const hb = (await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send(beat()).expect(200)).body.data;
    expect(hb.resyncRequested).toBe(true);
    const done = (await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send(beat({ resyncCompleted: true })).expect(200)).body.data;
    expect(done.resyncRequested).toBe(false);
    expect((await RecoveryItem.findById(item._id).lean()).status).toBe('resolved');
  });
});

describe('recovery inbox ordering and action results', () => {
  it('lists the most severe items first (high → medium → low), newest first within a severity', async () => {
    const recovery = (await import('../../src/modules/simSms/recovery.service.js')).default;
    const mk = (key, severity) => recovery.record({ key, type: 'provider_failure', severity, ownerId: userA._id, source: 'messaging' });
    await mk('p-low', 'low');
    await mk('p-medium', 'medium');
    await mk('p-high-old', 'high');
    await RecoveryItem.updateOne({ key: 'p-high-old' }, { $set: { createdAt: new Date(Date.now() - 3600_000) } });
    await mk('p-high-new', 'high');
    const rows = (await request(server).get('/api/v1/sim-sms/recovery').set(auth(tokenA)).expect(200)).body.data;
    expect(rows.map((r) => r.key)).toEqual(['p-high-new', 'p-high-old', 'p-medium', 'p-low']);
    expect(rows.map((r) => r.severityRank)).toEqual([3, 3, 2, 1]);
    const typed = (await request(server).get('/api/v1/sim-sms/recovery?type=provider_failure').set(auth(tokenA)).expect(200)).body.data;
    expect(typed.map((r) => r.key)).toEqual(['p-high-new', 'p-high-old', 'p-medium', 'p-low']);
    expect((await request(server).get('/api/v1/sim-sms/recovery/counts').set(auth(tokenA)).expect(200)).body.data)
      .toEqual({ open: 4, byType: { provider_failure: 4 } });
  });

  it('returns the lead summary with an action result (same shape as the list)', async () => {
    const lead = await makeLead();
    const recovery = (await import('../../src/modules/simSms/recovery.service.js')).default;
    const item = await recovery.record({ key: 'p-lead', type: 'provider_failure', ownerId: userA._id, source: 'messaging', leadId: lead._id });
    const res = (await request(server).post(`/api/v1/sim-sms/recovery/${item._id}/actions`).set(auth(tokenA)).send({ action: 'dismiss' }).expect(200)).body.data;
    expect(res).toMatchObject({ status: 'dismissed', lead: { _id: String(lead._id), name: lead.name } });
  });
});

describe('device dashboard campaigns', () => {
  it('lists the campaigns each phone sent for in the last 7 days', async () => {
    const lead = await makeLead();
    const campaign = await startCampaign([lead]);
    await sendNext();
    await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send({ deviceId: DEVICE, platform: 'android' }).expect(200);
    await request(server).post('/api/v1/sim-sms/devices/heartbeat').set(auth(tokenA)).send({ deviceId: 'other-phone-0001', platform: 'android' }).expect(200);
    await request(server).post(`/api/v1/sim-sms/campaigns/${campaign._id}/pause`).set(auth(tokenA)).expect(200);
    const devices = (await request(server).get('/api/v1/sim-sms/devices').set(auth(tokenA)).expect(200)).body.data;
    const byId = Object.fromEntries(devices.map((d) => [d.deviceId, d]));
    expect(byId[DEVICE].campaigns).toEqual([{ id: String(campaign._id), name: 'Ops campaign', status: 'paused' }]);
    expect(byId['other-phone-0001'].campaigns).toEqual([]);
  });
});
