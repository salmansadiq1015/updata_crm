import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * End-to-end over HTTP for the SMS link assistant: real routers (CRM lead
 * communications, AI calling campaigns, link assistant CRM + public page), real
 * auth/RBAC, validation and services against an in-memory MongoDB. Only the
 * queue, Redis and the OpenAI client are stubbed.
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

// Fake OpenAI: streams a reply word by word and reports usage; classification returns JSON.
const ai = { configured: false, reply: null, calls: [] };
function fakeCreate(params) {
  ai.calls.push(params);
  if (params.stream) {
    const text = typeof ai.reply === 'function' ? ai.reply(params) : (ai.reply ?? 'Thanks! Next question?');
    const words = text.split(/(?<= )/);
    return (async function* stream() {
      for (const w of words) yield { choices: [{ delta: { content: w } }] };
      yield { choices: [], usage: { prompt_tokens: 600, completion_tokens: 40 } };
    }());
  }
  return { choices: [{ message: { content: '{"intent":"unclear","value":null}' } }], usage: { prompt_tokens: 200, completion_tokens: 10 } };
}
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => ai.configured,
  assertAiConfigured: () => {},
  createChatModel: async () => ({}),
  createOpenAiClient: async () => ({ chat: { completions: { create: async (p) => fakeCreate(p) } } }),
}));

let mongod; let server;
let Lead; let User; let Role; let Permission; let LeadCommunication; let MessageSuppression;
let CallRecord; let CallCampaign; let LinkSession; let LinkSpend; let linkService; let generateAccessToken;
let userA; let userB; let tokenA; let tokenB; let n = 0;
let CallSuppression; let OptOutEvent;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const H = { 'X-Requested-With': 'ula' };

async function makeUser(permIds) {
  const role = await Role.create({ name: `LinkRole_${randomUUID()}`, permissions: permIds });
  return User.create({
    email: `link-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Sales', lastName: 'User', role: role._id, status: 'active',
  });
}

async function makeLead(overrides = {}) {
  n += 1;
  return Lead.create({
    leadNumber: `L-${70000 + n}`, name: `Bilal Traders ${n}`, source: 'manual', status: 'new',
    mobile: '+41 79 765 43 21', address: { country: 'CH', city: 'Zürich' }, createdBy: userA._id, ...overrides,
  });
}

const QUESTIONS = [
  { fieldKey: 'interest', label: 'Interest', text: 'Are you interested in a free solar survey?', type: 'boolean', required: true, order: 1 },
  { fieldKey: 'bill', label: 'Monthly bill', text: 'What is your monthly electricity bill?', type: 'integer', required: true, order: 2 },
];

async function makeCampaign(leads, { linkConfig = {}, start = true, schedule } = {}) {
  const res = await request(server).post('/api/v1/ai-calling/campaigns').set(auth(tokenA)).send({
    name: `Solar link ${randomUUID().slice(0, 6)}`,
    channel: 'web_link',
    questionnaire: { questions: QUESTIONS },
    statusRules: [{ id: 'hot', when: { all: [{ field: 'interest', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { organizationName: 'Sunrise Solar', objective: 'Offer a free solar survey' },
    linkConfig: { reason: 'You asked about solar panels.', faq: [{ question: 'Why do you have my number?', answer: 'You filled in our quote form.' }], ...linkConfig },
    schedule: schedule || { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    selection: { mode: 'explicit', leadIds: leads.map((l) => String(l._id)) },
  });
  expect(res.status).toBe(201);
  const id = res.body.data._id || res.body.data.id;
  if (start) await request(server).post(`/api/v1/ai-calling/campaigns/${id}/start`).set(auth(tokenA)).send({}).expect(202);
  return id;
}

async function authorise(lead, campaignId, overrides = {}, token = tokenA) {
  const operationId = overrides.operationId || randomUUID();
  const res = await request(server).post(`/api/v1/crm/leads/${lead._id}/communications`).set(auth(token)).send({
    operationId, channel: 'sms', route: 'sms_direct', mode: 'manual', destinationField: 'mobile', linkCampaignId: campaignId, ...overrides,
  });
  return { res, operationId, url: res.body?.data?.link?.url, path: res.body?.data?.link?.url ? new URL(res.body.data.link.url).pathname : null };
}

const events = (res) => res.text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
async function say(agent, path, body) {
  const res = await agent.post(`${path}/api/message`).set(H).send({ clientMessageId: randomUUID(), ...body });
  return { res, events: res.status === 200 ? events(res) : [], done: res.status === 200 ? events(res).at(-1) : null };
}
async function openPage(path) {
  const agent = request.agent(server);
  const page = await agent.get(path);
  expect(page.status).toBe(200);
  await agent.post(`${path}/api/open`).set(H).send({}).expect(200);
  return { agent, page };
}

beforeAll(async () => {
  process.env.LINK_ASSISTANT_BASE_URL = 'https://upd.example';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  const aiCallingRoutes = (await import('../../src/modules/aiCalling/aiCalling.routes.js')).default;
  const linkRoutes = (await import('../../src/modules/linkAssistant/linkAssistant.routes.js')).default;
  const linkPublic = (await import('../../src/modules/linkAssistant/linkAssistant.public.routes.js')).default;
  const simSmsRoutes = (await import('../../src/modules/simSms/simSms.routes.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  OptOutEvent = (await import('../../src/modules/linkAssistant/optOutEvent.model.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadCommunication = (await import('../../src/modules/crm/leadCommunication.model.js')).default;
  MessageSuppression = (await import('../../src/modules/messaging/suppression.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  LinkSession = (await import('../../src/modules/linkAssistant/linkSession.model.js')).default;
  ({ LinkSpend } = await import('../../src/modules/linkAssistant/linkSettings.model.js'));
  linkService = (await import('../../src/modules/linkAssistant/linkAssistant.service.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await Promise.all([LeadCommunication.init(), LinkSession.init(), CallRecord.init()]);

  const app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(cookieParser());
  app.use(responseEnvelope);
  app.use('/api/v1/crm/leads', leadRoutes);
  app.use('/api/v1/ai-calling', aiCallingRoutes);
  app.use('/api/v1/link-assistant', linkRoutes);
  app.use('/c', linkPublic);
  app.use('/api/v1/sim-sms', simSmsRoutes);
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
  ai.configured = false; ai.reply = null; ai.calls = [];
  linkService._pausedCache = { value: false, at: 0 };
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' }, { module: 'lead', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'read', description: 'r' }, { module: 'ai-calling', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'admin', description: 'a' },
  ]);
  userA = await makeUser(perms.map((p) => p._id));
  userB = await makeUser(perms.map((p) => p._id));
  tokenA = generateAccessToken({ sub: String(userA._id) });
  tokenB = generateAccessToken({ sub: String(userB._id) });
});

describe('SMS link assistant end to end', () => {
  it('authorise SMS → personal link → open → chat → every answer saved immediately → submit → lead qualified', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { res, url, path, operationId } = await authorise(lead, campaignId);
    expect(res.status).toBe(201);
    expect(url).toMatch(/^https:\/\/upd\.example\/c\/[0-9A-Za-z]{22}$/);
    expect(url).not.toMatch(/Bilal|7654321|79/); // no PII in the URL

    // Retried authorisation of the same SMS returns the same link.
    const again = await authorise(lead, campaignId, { operationId });
    expect(again.url).toBe(url);

    // The SMS went out: the funnel records it.
    await request(server).post(`/api/v1/crm/leads/${lead._id}/communications/${operationId}/complete`).set(auth(tokenA)).send({
      outcome: { disposition: 'sent', connected: 'unknown', notes: '' },
      sms: { templateId: null, body: `Hi ${url}`, encoding: 'GSM-7', segments: 1, sendStatus: 'device_sent' },
    }).expect(200);

    const { agent, page } = await openPage(path);
    expect(page.headers['content-security-policy']).toMatch(/default-src 'none'/);
    expect(page.headers['referrer-policy']).toBe('no-referrer');
    expect(page.text).toMatch(/I'm Ayesha, an AI assistant from Sunrise Solar/);
    expect(page.text).toMatch(/You asked about solar panels/);
    expect(page.text).not.toMatch(/7654321|\+41/); // the phone number never reaches the page

    let r = await say(agent, path, { action: '__start' });
    expect(r.done).toMatchObject({ type: 'done', ended: false, progress: { total: 2, answered: 0 } });
    expect(r.done.quickReplies.map((q) => q.value)).toEqual(['yes', 'no']);

    r = await say(agent, path, { action: 'yes' });
    const session = await LinkSession.findOne({}).lean();
    const call = await CallRecord.findById(session.callRecordId).lean();
    expect(call.conversationState.answers.interest).toMatchObject({ validation: 'valid', normalizedValue: true }); // saved immediately
    expect(r.done.inputMode).toBe('numeric');

    r = await say(agent, path, { text: '15000' });
    expect(r.done.reply).toMatch(/what you told me/);
    r = await say(agent, path, { action: '__submit' });
    expect(r.done).toMatchObject({ ended: true, status: 'completed' });

    const done = await LinkSession.findById(session._id).lean();
    expect(done).toMatchObject({ status: 'completed', outcome: 'completed' });
    expect(Object.keys(done.funnel).filter((k) => done.funnel[k])).toEqual(expect.arrayContaining(['link_issued', 'sms_sent', 'link_opened', 'chat_started', 'completed']));
    const processed = await CallRecord.findById(session.callRecordId).lean();
    expect(processed).toMatchObject({ disposition: 'answered_completed', qualification: 'qualified' });
    expect(processed.resultsProcessedAt).toBeTruthy();
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead).toMatchObject({ status: 'qualified', lastContactChannel: 'sms' });

    // Read-only afterwards.
    const closed = await agent.post(`${path}/api/message`).set(H).send({ text: 'hello' });
    expect(closed.status).toBe(409);
  });

  it('streams model-phrased replies token by token and records cost; the daily cap pauses the campaign', async () => {
    ai.configured = true;
    ai.reply = 'Thank you! Could you tell me your monthly electricity bill?';
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead], { linkConfig: { limits: { dailySpendCap: 0.00015 } } });
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    const r = await say(agent, path, { action: 'yes' });
    const tokens = r.events.filter((e) => e.type === 'token');
    expect(tokens.length).toBeGreaterThan(3);
    expect(r.done.reply).toBe('Thank you! Could you tell me your monthly electricity bill?');
    const prompt = ai.calls.find((c) => c.stream).messages[0].content;
    expect(prompt).toMatch(/never a human/);
    const session = await LinkSession.findOne({}).lean();
    expect(session.usage.cost).toBeGreaterThan(0);
    const spend = await LinkSpend.findOne({}).lean();
    expect(spend.capHitAt).toBeTruthy();
    expect((await CallCampaign.findById(campaignId).lean()).status).toBe('paused');
    // A paused campaign issues no more links.
    const blocked = await authorise(await makeLead(), campaignId);
    expect(blocked.res.status).toBe(409);
    expect(blocked.res.body.error?.code || blocked.res.body.code).toBe('CAMPAIGN_NOT_RUNNING');
  });

  it('a model reply that claims to be human is replaced by the deterministic text', async () => {
    ai.configured = true;
    ai.reply = "Don't worry, I'm a real person here to help.";
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    const r = await say(agent, path, { action: 'yes' });
    expect(r.done.reply).not.toMatch(/real person/);
    expect(r.done.reply).toMatch(/monthly electricity bill/);
    expect(r.events.some((e) => e.type === 'replace')).toBe(true);
  });

  it('opt-out in the chat suppresses every future SMS and closes the link', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    const r = await say(agent, path, { text: 'band karo, mujhe contact mat karo' });
    expect(r.done).toMatchObject({ ended: true, status: 'opted_out' });
    expect(await MessageSuppression.countDocuments({ channel: 'sms' })).toBe(1);
    expect((await Lead.findById(lead._id).lean()).status).toBe('unqualified');
    const resend = await authorise(lead, campaignId);
    expect(resend.res.status).toBe(409);
    expect(JSON.stringify(resend.res.body)).toMatch(/SMS_SUPPRESSED/);
    expect((await request(server).get(path)).status).toBe(410);
  });

  it('a second device must confirm the last 4 digits before seeing saved answers', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    await say(agent, path, { action: 'yes' });

    const other = request.agent(server);
    const page = await other.get(path);
    expect(page.text).toMatch(/"view":"verify"/);
    expect(page.text).not.toMatch(/"transcript":\[\{/);
    await other.post(`${path}/api/open`).set(H).send({}).expect(200);
    expect((await other.post(`${path}/api/message`).set(H).send({ text: '100' })).status).toBe(403);
    expect((await other.post(`${path}/api/verify`).set(H).send({ last4: '0000' })).status).toBe(403);
    await other.post(`${path}/api/verify`).set(H).send({ last4: '4321' }).expect(200);
    const resumed = await other.get(path);
    expect(resumed.text).toMatch(/"view":"chat"/);
    const r = await say(other, path, { text: '9000' });
    expect(r.res.status).toBe(200);
  });

  it('a retried message (same clientMessageId) is answered once', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    const id = randomUUID();
    const first = await say(agent, path, { action: 'yes', clientMessageId: id });
    const second = await say(agent, path, { action: 'yes', clientMessageId: id });
    expect(second.done.reply).toBe(first.done.reply);
    expect(second.done.replay).toBe(true);
    const s = await LinkSession.findOne({}).lean();
    expect(s.transcript.filter((t) => t.role === 'customer')).toHaveLength(2); // start + yes, not 3
  });

  it('expired, revoked, unknown and malformed links show a neutral page; link previews never open a session', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const bot = await request(server).get(path).set('User-Agent', 'WhatsApp/2.23.20 A');
    expect(bot.status).toBe(200);
    expect(bot.text).not.toMatch(/Bilal|Ayesha/);
    expect((await LinkSession.findOne({}).lean()).funnel.link_opened).toBeNull();

    expect((await request(server).get('/c/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
    expect((await request(server).get('/c/not-a-token')).status).toBe(404);

    await LinkSession.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000), 'tokens.0.expiresAt': new Date(Date.now() - 1000) } });
    const expired = await request(server).get(path);
    expect(expired.status).toBe(410);
    expect(expired.text).toMatch(/expired/);
    expect((await LinkSession.findOne({}).lean()).status).toBe('expired');

    const second = await authorise(await makeLead(), campaignId);
    const session = await LinkSession.findOne({ status: 'issued' }).lean();
    await request(server).post(`/api/v1/link-assistant/sessions/${session._id}/revoke`).set(auth(tokenA)).send({}).expect(200);
    expect((await request(server).get(second.path)).status).toBe(410);
  });

  it('the kill switch stops new links and AI turns immediately', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await request(server).put('/api/v1/link-assistant/settings/kill-switch').set(auth(tokenA)).send({ paused: true, reason: 'test' }).expect(200);
    const blocked = await authorise(await makeLead(), campaignId);
    expect(blocked.res.status).toBe(503);
    const r = await say(agent, path, { action: '__start' });
    expect(r.done.paused).toBe(true);
    expect((await CallRecord.findOne({}).lean()).conversationState.disclosed).toBe(false);
  });

  it('refuses links outside the campaign\'s sending hours', async () => {
    const lead = await makeLead();
    const now = new Date();
    const closedDay = (now.getUTCDay() + 3) % 7;
    const campaignId = await makeCampaign([lead], { schedule: { timezone: 'UTC', callWindow: { start: '09:00', end: '10:00' }, daysOfWeek: [closedDay] } });
    const r = await authorise(lead, campaignId);
    expect(r.res.status).toBe(409);
    expect(JSON.stringify(r.res.body)).toMatch(/OUTSIDE_CALLING_HOURS/);
  });

  it('"Preview as customer" uses a real page but never touches the lead or campaign numbers', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead], { start: false });
    const preview = await request(server).post(`/api/v1/link-assistant/campaigns/${campaignId}/preview`).set(auth(tokenA)).send({}).expect(200);
    const path = new URL(preview.body.data.url).pathname;
    const { agent, page } = await openPage(path);
    expect(page.text).toMatch(/PREVIEW/);
    await say(agent, path, { action: '__start' });
    await say(agent, path, { action: 'yes' });
    await say(agent, path, { text: '20000' });
    await say(agent, path, { action: '__submit' });
    expect((await Lead.findById(lead._id).lean()).status).toBe('new');
    const analytics = await request(server).get(`/api/v1/link-assistant/campaigns/${campaignId}/analytics`).set(auth(tokenA)).expect(200);
    expect(analytics.body.data.sessions).toBe(0);
  });

  it('CRM views: sessions, transcript, analytics, CSV — scoped to the owner', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    await say(agent, path, { action: 'yes' });
    await say(agent, path, { text: "I don't know" });

    const list = await request(server).get(`/api/v1/link-assistant/sessions?campaignId=${campaignId}`).set(auth(tokenA)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.pagination.total).toBe(1);
    const id = list.body.data[0].id;
    const detail = await request(server).get(`/api/v1/link-assistant/sessions/${id}`).set(auth(tokenA)).expect(200);
    expect(detail.body.data.answers).toEqual([
      expect.objectContaining({ fieldKey: 'interest', value: true, unknown: false }),
      expect.objectContaining({ fieldKey: 'bill', value: null, unknown: true }),
    ]);
    expect(detail.body.data.transcript.length).toBeGreaterThan(3);
    expect((await request(server).get(`/api/v1/link-assistant/sessions/${id}`).set(auth(tokenB))).status).toBe(404);

    const analytics = await request(server).get(`/api/v1/link-assistant/campaigns/${campaignId}/analytics`).set(auth(tokenA)).expect(200);
    expect(analytics.body.data.funnel).toMatchObject({ link_issued: 1, link_opened: 1, chat_started: 1 });
    expect(analytics.body.data.perQuestion.find((q) => q.fieldKey === 'bill')).toMatchObject({ unknown: 1, unknownRate: 100 });
    const csv = await request(server).get(`/api/v1/link-assistant/campaigns/${campaignId}/export`).set(auth(tokenA)).expect(200);
    expect(csv.text.split('\n')[0]).toMatch(/lead,status,outcome/);
    expect(csv.text).toMatch(/unknown/);
  });

  it('abandoned conversations are processed as partial (human review) by the sweep', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    await say(agent, path, { action: 'yes' });
    await LinkSession.updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 25 * 3_600_000) } });
    const result = await linkService.sweep();
    expect(result.abandoned).toBe(1);
    const call = await CallRecord.findOne({}).lean();
    expect(call).toMatchObject({ disposition: 'answered_partial', reviewRequired: true });
    expect((await Lead.findById(lead._id).lean()).status).toBe('new'); // never auto-qualified
  });

  it('reminders: due list, then the reminder SMS reuses the same conversation', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead], { linkConfig: { reminders: { enabled: true, afterHours: 1, max: 1 } } });
    await authorise(lead, campaignId);
    await LinkSession.updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 2 * 3_600_000) } });
    const due = await request(server).get('/api/v1/link-assistant/reminders/due').set(auth(tokenA)).expect(200);
    expect(due.body.data).toHaveLength(1);
    const reminder = await authorise(lead, campaignId, { linkPurpose: 'reminder' });
    expect(reminder.res.status).toBe(201);
    const sessions = await LinkSession.find({}).lean();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].tokens).toHaveLength(2);
    expect(sessions[0].reminders.sent).toBe(1);
    const dueAfter = await request(server).get('/api/v1/link-assistant/reminders/due').set(auth(tokenA)).expect(200);
    expect(dueAfter.body.data).toHaveLength(0);
  });
});

describe('opt-out by SMS reply and by the user (one rule for every path)', () => {
  const DEVICE = 'android-test-device-1';
  const inbound = (from, body, key = randomUUID(), receivedAt = null, token = tokenA) => request(server)
    .post('/api/v1/sim-sms/device/inbound').set(auth(token))
    .send({ deviceId: DEVICE, deviceMessageKey: `inbound-${key}`, from, body, matchedTo: from, receivedAt });

  it('company build: the link number is watched; a STOP reply opts the lead out once, closes the link and blocks every send', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead], { linkConfig: { reminders: { enabled: true, afterHours: 1, max: 2 } } });
    const { path } = await authorise(lead, campaignId);
    const watch = await request(server).get('/api/v1/sim-sms/device/watch-list').set(auth(tokenA)).expect(200);
    expect(watch.body.data.numbers).toContain('+41797654321');

    const first = await inbound('+41 79 765 43 21', '  Stop. ', 'same');
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ matched: true, intent: 'stop', duplicate: false });
    const again = await inbound('+41 79 765 43 21', 'STOP', 'same');
    expect(again.body.data.duplicate).toBe(true);
    expect(await OptOutEvent.countDocuments({ leadId: lead._id })).toBe(1);

    const session = await LinkSession.findOne({ leadId: lead._id }).lean();
    expect(session).toMatchObject({ status: 'opted_out', outcome: 'opted_out' });
    expect(session.tokens.every((t) => t.revokedAt)).toBe(true);
    expect(await MessageSuppression.countDocuments({ channel: 'sms' })).toBe(1);
    expect(await CallSuppression.countDocuments({})).toBeGreaterThanOrEqual(1);
    expect((await request(server).get(path)).status).toBe(410);

    // Every later send is refused; no reminder is due; the CRM shows why.
    await LinkSession.updateMany({}, { $set: { lastActivityAt: new Date(Date.now() - 5 * 3_600_000) } });
    const due = await request(server).get('/api/v1/link-assistant/reminders/due').set(auth(tokenA)).expect(200);
    expect(due.body.data).toHaveLength(0);
    const resend = await authorise(lead, campaignId);
    expect(resend.res.status).toBe(409);
    expect(JSON.stringify(resend.res.body)).toMatch(/SMS_SUPPRESSED/);
    const status = await request(server).get(`/api/v1/link-assistant/leads/${lead._id}/contact-status`).set(auth(tokenA)).expect(200);
    expect(status.body.data).toMatchObject({ optedOut: true, smsBlocked: true, callsBlocked: true, lastOptOut: { source: 'sms_reply_device' } });
  });

  it.each(['band karo', 'BAND KAR DO', 'بند کریں', 'unsubscribe', 'Cancel!', 'QUIT', 'end'])('recognises "%s" as an opt-out', async (word) => {
    const lead = await makeLead({ mobile: `+41 79 ${String(300 + n).padStart(3, '0')} 11 22` });
    const campaignId = await makeCampaign([lead]);
    await authorise(lead, campaignId);
    const res = await inbound(lead.mobile, word);
    expect(res.body.data).toMatchObject({ matched: true, intent: 'stop' });
  });

  it('ordinary replies and unknown numbers are ignored and not stored', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    await authorise(lead, campaignId);
    for (const body of ['ok thanks', 'Stop by tomorrow? I am free', 'please call me']) {
      const res = await inbound('+41 79 765 43 21', body);
      expect(res.body.data).toMatchObject({ matched: false, reason: 'not_an_opt_out' });
    }
    const stranger = await inbound('+41 79 111 22 33', 'STOP');
    expect(stranger.body.data).toMatchObject({ matched: false, reason: 'unknown_number' });
    expect(await OptOutEvent.countDocuments({})).toBe(0);
    expect(await MessageSuppression.countDocuments({})).toBe(0);
    expect((await LinkSession.findOne({}).lean()).status).toBe('issued');
  });

  it('a STOP delivered late (after the chat finished) still blocks every future send', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignId);
    const { agent } = await openPage(path);
    await say(agent, path, { action: '__start' });
    await say(agent, path, { action: 'yes' });
    await say(agent, path, { text: '9000' });
    await say(agent, path, { action: '__submit' });
    const res = await inbound('+41 79 765 43 21', 'STOP', 'late', new Date(Date.now() - 3_600_000).toISOString());
    expect(res.body.data).toMatchObject({ matched: true, intent: 'stop' });
    expect((await LinkSession.findOne({}).lean()).status).toBe('completed'); // results stay
    expect((await authorise(lead, campaignId)).res.status).toBe(409);
  });

  it('client build: the user records a STOP seen in the Messages app (authorised, idempotent)', async () => {
    const lead = await makeLead();
    const campaignId = await makeCampaign([lead]);
    await authorise(lead, campaignId);
    expect((await request(server).post(`/api/v1/link-assistant/leads/${lead._id}/opt-out`).send({})).status).toBe(401);
    const noWriteRole = await Role.create({ name: `ReadOnly_${randomUUID()}`, permissions: (await Permission.find({ action: 'read' })).map((p) => p._id) });
    const reader = await User.create({ email: `ro-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation', firstName: 'R', lastName: 'O', role: noWriteRole._id, status: 'active' });
    const readerToken = generateAccessToken({ sub: String(reader._id) });
    expect((await request(server).post(`/api/v1/link-assistant/leads/${lead._id}/opt-out`).set(auth(readerToken)).send({})).status).toBe(403);

    const body = { source: 'sms_reply_reported', confirm: true };
    expect((await request(server).post(`/api/v1/link-assistant/leads/${lead._id}/opt-out`).set(auth(tokenA)).send({})).status).toBe(400); // explicit confirmation required
    const first = await request(server).post(`/api/v1/link-assistant/leads/${lead._id}/opt-out`).set(auth(tokenA)).send(body).expect(200);
    expect(first.body.data).toMatchObject({ optedOut: true, duplicate: false, effects: { sessionsClosed: 1, smsSuppressed: true } });
    const second = await request(server).post(`/api/v1/link-assistant/leads/${lead._id}/opt-out`).set(auth(tokenA)).send(body).expect(200);
    expect(second.body.data.duplicate).toBe(true);
    expect(await OptOutEvent.countDocuments({ leadId: lead._id, source: 'sms_reply_reported' })).toBe(1);
    expect((await authorise(lead, campaignId)).res.status).toBe(409);
  });

  it('opt-out on the chat page also closes the lead\'s other open link conversations', async () => {
    const lead = await makeLead();
    const campaignA = await makeCampaign([lead]);
    const campaignB = await makeCampaign([lead]);
    const { path } = await authorise(lead, campaignA);
    await authorise(lead, campaignB);
    const { agent } = await openPage(path);
    const r = await say(agent, path, { action: '__opt_out' });
    expect(r.done.status).toBe('opted_out');
    const sessions = await LinkSession.find({ leadId: lead._id }).lean();
    expect(sessions.map((x) => x.status).sort()).toEqual(['opted_out', 'opted_out']);
    expect(await OptOutEvent.countDocuments({ leadId: lead._id, source: 'web_link' })).toBe(1);
  });
});
