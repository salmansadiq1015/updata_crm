import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * SIM SMS agent — HTTP-level integration: real routes, authenticate +
 * requirePermission against DB roles, Joi validation, controller, service and
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

let mongod; let app; let server; let service;
let Lead; let User; let Role; let Permission; let LeadCommunication; let ContactLog;
let MessageSuppression; let LeadChannelConsent; let SimSmsMessage; let SimSmsConversation; let SimSmsCampaign;
let generateAccessToken; let destinationHash;
let userA; let userB; let tokenA; let tokenB;
let n = 0;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
/** '+41 79 555 1003' → '+41795551003' / national '079 555 1003'. */
const e164 = (lead) => lead.mobile.replace(/\s/g, '');
const national = (lead) => `0${e164(lead).slice(3)}`;
const DEVICE = 'device-aaaa-1111';

async function makeUser(permIds) {
  const role = await Role.create({ name: `SmsRole_${randomUUID()}`, permissions: permIds });
  return User.create({
    email: `sms-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Sales', lastName: 'Agent', role: role._id, status: 'active',
  });
}

async function makeLead(overrides = {}) {
  n += 1;
  return Lead.create({
    leadNumber: `L-${70000 + n}`, name: `Bäckerei ${n}`, source: 'manual',
    mobile: `+41 79 555 ${String(1000 + n).padStart(4, '0')}`, address: { country: 'CH', city: 'Basel' },
    createdBy: userA._id, ...overrides,
  });
}

async function grantSms(lead) {
  await LeadChannelConsent.create({ leadId: lead._id, channel: 'sms', status: 'granted', evidence: 'Web form opt-in', capturedAt: new Date() });
}

function campaignBody(leads, overrides = {}) {
  return {
    name: 'Bakery qualification',
    leadIds: leads.map((l) => String(l._id)),
    questionnaire: { questions: [
      { fieldKey: 'interest', label: 'Interest level', text: 'How interested are you in a new oven?', type: 'single_choice', required: true, order: 1, options: ['high', 'medium', 'low', 'none'] },
      { fieldKey: 'budget', label: 'Budget', text: 'What budget do you have in CHF?', type: 'currency', required: true, order: 2 },
    ] },
    statusRules: [
      { id: 'hot', when: { all: [{ field: 'interest', equals: 'high' }] }, action: 'mark_qualified' },
      { id: 'cold', when: { all: [{ field: 'interest', equals: 'none' }] }, action: 'mark_not_interested' },
    ],
    agent: { agentName: 'Mia', organizationName: 'Updata Ovens' },
    settings: { timezone: 'UTC', sendWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], minSecondsBetweenSends: 5 },
    ...overrides,
  };
}

/** Let the next lease skip pacing (as if minSecondsBetweenSends had elapsed). */
async function unpace() {
  await SimSmsMessage.updateMany({ attemptedAt: { $ne: null } }, { $set: { attemptedAt: new Date(Date.now() - 3600_000) } });
}

/** The phone: lease → attempting → sent. Returns the leased message. */
async function phoneSendNext(token = tokenA, deviceId = DEVICE) {
  await unpace();
  const res = await request(server).post('/api/v1/sim-sms/device/lease').set(auth(token)).send({ deviceId }).expect(200);
  const msg = res.body.data.message;
  if (!msg) return null;
  await request(server).post(`/api/v1/sim-sms/device/messages/${msg.id}/attempting`).set(auth(token)).send({ deviceId }).expect(200);
  await request(server).post(`/api/v1/sim-sms/device/messages/${msg.id}/result`).set(auth(token)).send({ deviceId, status: 'sent' }).expect(200);
  return msg;
}

async function reply(lead, body, token = tokenA) {
  return request(server).post('/api/v1/sim-sms/device/inbound').set(auth(token)).send({
    deviceId: DEVICE, deviceMessageKey: randomUUID(), from: lead.mobile, body, receivedAt: new Date().toISOString(),
  }).expect(200);
}

async function startCampaign(leads, overrides) {
  const created = await request(server).post('/api/v1/sim-sms/campaigns').set(auth(tokenA)).send(campaignBody(leads, overrides)).expect(201);
  await request(server).post(`/api/v1/sim-sms/campaigns/${created.body.data._id}/start`).set(auth(tokenA)).expect(200);
  return created.body.data;
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const simSmsRoutes = (await import('../../src/modules/simSms/simSms.routes.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  service = (await import('../../src/modules/simSms/simSms.service.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  ContactLog = (await import('../../src/modules/crm/contactLog.model.js')).default;
  MessageSuppression = (await import('../../src/modules/messaging/suppression.model.js')).default;
  LeadChannelConsent = (await import('../../src/modules/messaging/consent.model.js')).default;
  SimSmsMessage = (await import('../../src/modules/simSms/simSmsMessage.model.js')).default;
  SimSmsConversation = (await import('../../src/modules/simSms/simSmsConversation.model.js')).default;
  SimSmsCampaign = (await import('../../src/modules/simSms/simSmsCampaign.model.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  ({ destinationHash } = await import('../../src/modules/messaging/destinationHash.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await Promise.all([LeadCommunication.init(), SimSmsMessage.init(), SimSmsConversation.init()]);

  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/v1/sim-sms', simSmsRoutes);
  app.use('/api/v1/crm/leads', leadRoutes);
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
    if (['leadcommunications', 'simsmsmessages', 'simsmsconversations'].includes(key)) continue;
    await mongoose.connection.collections[key].deleteMany({});
  }
  await Promise.all([LeadCommunication.deleteMany({}), SimSmsMessage.deleteMany({}), SimSmsConversation.deleteMany({})]);
  ai.configured = false; ai.create.mockReset(); notify.mockClear();
  process.env.AI_SMS_REQUIRE_CONSENT = 'true';
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' }, { module: 'lead', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'read', description: 'r' }, { module: 'ai-calling', action: 'write', description: 'w' },
  ]);
  userA = await makeUser(perms.map((p) => p._id));
  userB = await makeUser(perms.map((p) => p._id));
  tokenA = generateAccessToken({ sub: String(userA._id) });
  tokenB = generateAccessToken({ sub: String(userB._id) });
});

describe('campaign creation + eligibility', () => {
  it('requires auth/permission and validates the opt-out wording', async () => {
    await request(server).get('/api/v1/sim-sms/campaigns').expect(401);
    const noPerm = await makeUser([]);
    await request(server).get('/api/v1/sim-sms/campaigns').set(auth(generateAccessToken({ sub: String(noPerm._id) }))).expect(403);
    const lead = await makeLead();
    const bad = campaignBody([lead], { agent: { organizationName: 'X', intro: 'Hi {name}, quick question.' } });
    const res = await request(server).post('/api/v1/sim-sms/campaigns').set(auth(tokenA)).send(bad).expect(400);
    expect(JSON.stringify(res.body)).toMatch(/opt out/i);
  });

  it('flags leads without a number, without SMS consent, suppressed, or duplicated', async () => {
    const ok = await makeLead(); await grantSms(ok);
    const noPhone = await makeLead({ mobile: null, phone: null });
    const noConsent = await makeLead();
    const suppressed = await makeLead(); await grantSms(suppressed);
    await MessageSuppression.create({ channel: 'sms', destinationHash: destinationHash('sms', e164(suppressed)), reason: 'opt_out' });
    const dup = await makeLead({ mobile: ok.mobile }); await grantSms(dup);
    const res = await request(server).post('/api/v1/sim-sms/campaigns').set(auth(tokenA))
      .send(campaignBody([ok, noPhone, noConsent, suppressed, dup])).expect(201);
    expect(res.body.data.summary).toMatchObject({ total: 5, eligible: 1, ineligible: 4 });
    const reasons = Object.fromEntries((await SimSmsConversation.find({}).lean()).map((c) => [String(c.leadId), c.eligibility.reasons]));
    expect(reasons[String(noPhone._id)]).toEqual(['NO_DESTINATION']);
    expect(reasons[String(noConsent._id)]).toEqual(['SMS_CONSENT_REQUIRED']);
    expect(reasons[String(suppressed._id)]).toContain('SMS_SUPPRESSED');
    expect(reasons[String(dup._id)]).toContain('DUPLICATE_NUMBER');
  });

  it('is owner-scoped: another user cannot read or drive the campaign', async () => {
    const lead = await makeLead(); await grantSms(lead);
    const campaign = await startCampaign([lead]);
    await request(server).get(`/api/v1/sim-sms/campaigns/${campaign._id}`).set(auth(tokenB)).expect(404);
    const lease = await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenB)).send({ deviceId: DEVICE }).expect(200);
    expect(lease.body.data.message).toBeNull();
  });
});

describe('device transport: at most once', () => {
  it('leases the opening (identity + STOP + first question), paces, and refuses a second device', async () => {
    const lead = await makeLead(); await grantSms(lead);
    await startCampaign([lead]);
    const res = await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE }).expect(200);
    const msg = res.body.data.message;
    expect(msg.to).toBe(e164(lead));
    expect(msg.body).toMatch(/Mia from Updata Ovens/);
    expect(msg.body).toMatch(/STOP/);
    expect(msg.body).toMatch(/How interested are you in a new oven\? \(high \/ medium \/ low \/ none\)/);

    // A different device can't attempt a message leased to this one.
    await request(server).post(`/api/v1/sim-sms/device/messages/${msg.id}/attempting`).set(auth(tokenA)).send({ deviceId: 'other-device-22' }).expect(409);
    await request(server).post(`/api/v1/sim-sms/device/messages/${msg.id}/attempting`).set(auth(tokenA)).send({ deviceId: DEVICE }).expect(200);
    // Pacing: nothing else is handed out right after an attempt.
    const second = await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE }).expect(200);
    expect(second.body.data.message).toBeNull();
    expect(second.body.data.retryAfterMs).toBeGreaterThan(0);
  });

  it('an expired, never-attempted lease is re-leasable; an attempt with a lost result becomes unknown and is never re-sent', async () => {
    const lead = await makeLead(); await grantSms(lead);
    await startCampaign([lead]);
    const first = (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE })).body.data.message;
    await SimSmsMessage.updateOne({ _id: first.id }, { $set: { leaseUntil: new Date(Date.now() - 1000) } });
    const again = (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: 'phone-two-333' })).body.data.message;
    expect(again.id).toBe(first.id); // never attempted → safe to hand out again
    await request(server).post(`/api/v1/sim-sms/device/messages/${first.id}/attempting`).set(auth(tokenA)).send({ deviceId: DEVICE }).expect(409);

    await request(server).post(`/api/v1/sim-sms/device/messages/${again.id}/attempting`).set(auth(tokenA)).send({ deviceId: 'phone-two-333' }).expect(200);
    await SimSmsMessage.updateOne({ _id: again.id }, { $set: { attemptedAt: new Date(Date.now() - 20 * 60_000) } });
    await service.sweep();
    expect((await SimSmsMessage.findById(again.id).lean()).status).toBe('unknown');
    const conv = await SimSmsConversation.findOne({ leadId: lead._id }).lean();
    expect(conv.state).toBe('needs_attention');
    await unpace();
    const none = (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE })).body.data.message;
    expect(none).toBeNull();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'sim_sms.needs_attention' }), expect.anything());
  });

  it('a transient radio failure is retried as a new message; a permanent one fails the conversation', async () => {
    const lead = await makeLead(); await grantSms(lead);
    await startCampaign([lead]);
    const send = async (errorCode) => {
      await unpace();
      const m = (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE })).body.data.message;
      await request(server).post(`/api/v1/sim-sms/device/messages/${m.id}/attempting`).set(auth(tokenA)).send({ deviceId: DEVICE }).expect(200);
      await request(server).post(`/api/v1/sim-sms/device/messages/${m.id}/result`).set(auth(tokenA)).send({ deviceId: DEVICE, status: 'failed', errorCode }).expect(200);
      return m;
    };
    const m1 = await send('RESULT_ERROR_NO_SERVICE');
    // The retry is held back (phone offline): nothing to lease right now…
    await unpace();
    const held = (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE })).body.data;
    expect(held.message).toBeNull();
    const retry = await SimSmsMessage.findOne({ status: 'pending' }).lean();
    expect(retry.notBefore.getTime() - Date.now()).toBeGreaterThan(60_000);
    // …until the backoff has elapsed.
    await SimSmsMessage.updateOne({ _id: retry._id }, { $set: { notBefore: new Date(Date.now() - 1000) } });
    const summaryAfterFailure = (await SimSmsCampaign.findOne({}).lean()).summary;
    expect(summaryAfterFailure).toMatchObject({ sendFailures: 1, lastSendError: { code: 'RESULT_ERROR_NO_SERVICE' } });
    const m2 = await send('RESULT_ERROR_NULL_PDU');
    expect(m2.id).not.toBe(m1.id);
    expect(m2.body).toBe(m1.body);
    expect((await SimSmsConversation.findOne({ leadId: lead._id }).lean()).state).toBe('failed');
  });
});

describe('conversation → CRM', () => {
  it('runs a full qualification over SMS and syncs answers, status and timeline to the lead', async () => {
    const lead = await makeLead(); await grantSms(lead);
    const campaign = await startCampaign([lead]);
    expect(await phoneSendNext()).toBeTruthy();

    // Reply from the number in national format still matches.
    let res = await request(server).post('/api/v1/sim-sms/device/inbound').set(auth(tokenA)).send({
      deviceId: DEVICE, deviceMessageKey: 'k-1-aaaaaaaa', from: national(lead), body: 'High!', receivedAt: new Date().toISOString(),
    }).expect(200);
    expect(res.body.data).toMatchObject({ matched: true, intent: 'answer' });
    // Duplicate upload of the same SMS is ignored.
    res = await request(server).post('/api/v1/sim-sms/device/inbound').set(auth(tokenA)).send({
      deviceId: DEVICE, deviceMessageKey: 'k-1-aaaaaaaa', from: national(lead), body: 'High!', receivedAt: new Date().toISOString(),
    }).expect(200);
    expect(res.body.data.duplicate).toBe(true);

    const q2 = await phoneSendNext();
    expect(q2.body).toMatch(/budget/);
    await reply(lead, 'depends on the offer');
    const clarify = await phoneSendNext();
    expect(clarify.body).toMatch(/^Sorry, I didn't quite get that/);
    await reply(lead, 'CHF 20000');
    const closing = await phoneSendNext();
    expect(closing.kind).toBe('closing');

    const conv = await SimSmsConversation.findOne({ leadId: lead._id }).lean();
    expect(conv).toMatchObject({ state: 'completed', qualification: 'qualified', disposition: 'answered_completed' });
    expect(conv.resultsProcessedAt).toBeTruthy();

    const fresh = await Lead.findById(lead._id).lean();
    expect(fresh.status).toBe('qualified');
    expect(fresh.lastContactChannel).toBe('sms');
    const fields = Object.fromEntries(fresh.qualification.fields.map((f) => [f.fieldKey, f]));
    expect(fields.interest).toMatchObject({ value: 'high', source: 'sms_agent', evidence: 'High!' });
    expect(fields.budget.value).toBe(20000);

    const comm = await LeadCommunication.findOne({ leadId: lead._id }).lean();
    expect(comm).toMatchObject({ channel: 'sms', route: 'sim_sms_agent', mode: 'ai_agent', state: 'completed' });
    expect(comm.outcome.disposition).toBe('interested');
    expect(comm.outcome.notes).toMatch(/← High!/);
    expect(await ContactLog.countDocuments({ leadId: lead._id })).toBe(1);

    const transcript = await request(server).get(`/api/v1/sim-sms/conversations/${conv._id}`).set(auth(tokenA)).expect(200);
    expect(transcript.body.data.messages.map((m) => m.direction)).toEqual(['outbound', 'inbound', 'outbound', 'inbound', 'outbound', 'inbound', 'outbound']);
    expect(transcript.body.data.answers.map((a) => a.fieldKey)).toEqual(['interest', 'budget']);
    const byLead = await request(server).get(`/api/v1/sim-sms/leads/${lead._id}/conversations`).set(auth(tokenA)).expect(200);
    expect(byLead.body.data).toHaveLength(1);

    // Late inbound after completion is stored but changes nothing; replays don't double-sync.
    await reply(lead, 'thanks');
    await service.processResults(conv._id);
    expect(await LeadCommunication.countDocuments({ leadId: lead._id })).toBe(1);
    const summary = (await SimSmsCampaign.findById(campaign._id).lean()).summary;
    expect(summary).toMatchObject({ completed: 1, qualified: 1, messagesSent: 4, repliesReceived: 4 }); // the duplicate upload is not double-counted
  });

  it('STOP: acknowledges once, suppresses SMS, revokes consent, stops other campaigns and logs DNC on the lead', async () => {
    const lead = await makeLead(); await grantSms(lead);
    await startCampaign([lead]);
    await phoneSendNext();
    // A second campaign to the same lead (another user) is waiting.
    await LeadChannelConsent.updateOne({ leadId: lead._id, channel: 'sms' }, { $set: { status: 'granted' } });
    const other = await request(server).post('/api/v1/sim-sms/campaigns').set(auth(tokenB)).send(campaignBody([lead])).expect(201);

    const res = await reply(lead, ' Stop ');
    expect(res.body.data.intent).toBe('stop');
    const ack = await phoneSendNext();
    expect(ack.kind).toBe('stop_ack');
    expect(await phoneSendNext()).toBeNull();

    expect(await MessageSuppression.exists({ channel: 'sms', destinationHash: destinationHash('sms', e164(lead)) })).toBeTruthy();
    expect((await LeadChannelConsent.findOne({ leadId: lead._id, channel: 'sms' }).lean()).status).toBe('revoked');
    expect((await SimSmsConversation.findOne({ campaignId: other.body.data._id }).lean()).state).toBe('ineligible');
    const comm = await LeadCommunication.findOne({ leadId: lead._id }).lean();
    expect(comm.outcome).toMatchObject({ disposition: 'do_not_contact', doNotContact: true });
  });

  it('no reply → one reminder → expiry, with the attempt logged on the lead', async () => {
    const lead = await makeLead(); await grantSms(lead);
    await startCampaign([lead], { settings: { timezone: 'UTC', sendWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], minSecondsBetweenSends: 5, replyTimeoutHours: 1, maxReminders: 1 } });
    await phoneSendNext();
    await SimSmsConversation.updateMany({}, { $set: { replyDeadlineAt: new Date(Date.now() - 1000) } });
    expect((await service.sweep()).reminders).toBe(1);
    const reminder = await phoneSendNext();
    expect(reminder.kind).toBe('reminder');
    expect(reminder.body).toMatch(/reminder/i);
    await SimSmsConversation.updateMany({}, { $set: { replyDeadlineAt: new Date(Date.now() - 1000) } });
    expect((await service.sweep()).expired).toBe(1);
    const conv = await SimSmsConversation.findOne({ leadId: lead._id }).lean();
    expect(conv).toMatchObject({ state: 'expired', disposition: 'no_answer' });
    const comm = await LeadCommunication.findOne({ leadId: lead._id }).lean();
    expect(comm.outcome).toMatchObject({ disposition: 'no_answer', connected: 'no' });
    expect((await Lead.findById(lead._id).lean()).status).toBe('new'); // silence never changes status
  });

  it('AI interpretation is re-validated: a decline ends politely; an invented value is rejected', async () => {
    const lead = await makeLead(); await grantSms(lead);
    await startCampaign([lead]);
    await phoneSendNext();
    ai.configured = true;
    ai.create.mockResolvedValueOnce({ choices: [{ message: { content: '{"intent":"answer","value":"extreme"}' } }] });
    await reply(lead, 'well it depends on a lot of things');
    const clarify = await phoneSendNext();
    expect(clarify.kind).toBe('clarify'); // "extreme" is not an allowed option
    ai.create.mockResolvedValueOnce({ choices: [{ message: { content: '{"intent":"decline","value":null}' } }] });
    await reply(lead, 'please leave me alone, not interested at all');
    expect((await phoneSendNext()).kind).toBe('closing');
    const conv = await SimSmsConversation.findOne({ leadId: lead._id }).lean();
    expect(conv).toMatchObject({ disposition: 'declined', qualification: 'unqualified' });
    expect((await Lead.findById(lead._id).lean()).status).toBe('unqualified');
  });

  it('pause returns leased-but-unsent messages; cancel stops everything not already transmitting', async () => {
    const lead = await makeLead(); await grantSms(lead);
    const campaign = await startCampaign([lead]);
    const m = (await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE })).body.data.message;
    await request(server).post(`/api/v1/sim-sms/campaigns/${campaign._id}/pause`).set(auth(tokenA)).expect(200);
    await request(server).post(`/api/v1/sim-sms/device/messages/${m.id}/attempting`).set(auth(tokenA)).send({ deviceId: DEVICE }).expect(409);
    expect((await request(server).post('/api/v1/sim-sms/device/lease').set(auth(tokenA)).send({ deviceId: DEVICE })).body.data.message).toBeNull();
    await request(server).post(`/api/v1/sim-sms/campaigns/${campaign._id}/cancel`).set(auth(tokenA)).expect(200);
    expect((await SimSmsMessage.findById(m.id).lean()).status).toBe('cancelled');
    expect((await SimSmsConversation.findOne({ leadId: lead._id }).lean()).state).toBe('cancelled');
    await request(server).post(`/api/v1/sim-sms/campaigns/${campaign._id}/start`).set(auth(tokenA)).expect(409);
  });

  it('replies from numbers that are not in a conversation are not stored', async () => {
    const res = await request(server).post('/api/v1/sim-sms/device/inbound').set(auth(tokenA)).send({
      deviceId: DEVICE, deviceMessageKey: 'k-random-bbbbbbbb', from: '+41 79 999 99 99', body: 'hello', receivedAt: new Date().toISOString(),
    }).expect(200);
    expect(res.body.data.matched).toBe(false);
    expect(await SimSmsMessage.countDocuments({ direction: 'inbound' })).toBe(0);
  });

  it('device-side clients cannot impersonate the agent on the communications API', async () => {
    const lead = await makeLead();
    await request(server).post(`/api/v1/crm/leads/${lead._id}/communications`).set(auth(tokenA)).send({
      operationId: randomUUID(), channel: 'sms', route: 'sim_sms_agent', mode: 'ai_agent', destinationField: 'mobile',
    }).expect(400);
  });
});
