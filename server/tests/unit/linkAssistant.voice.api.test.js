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
 * Real-time voice on the SMS link page, over HTTP: real routers (campaigns, lead
 * communications, link page, agent tool API), auth, validation and services
 * against an in-memory MongoDB. LiveKit is replaced by a recording fake — these
 * tests prove the session lifecycle, authorisation and persistence, NOT that audio
 * flows (that is verified separately with a real browser call).
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
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => false,
  assertAiConfigured: () => {},
  createChatModel: async () => ({}),
  createOpenAiClient: async () => { throw new Error('no model in voice tests'); },
}));

// LiveKit: records dispatches, join tokens and room deletions.
const lk = {
  ready: true, dispatches: [], ended: [], joins: [], dispatchOutcome: 'accepted', outcomes: [], exists: false,
};
const fakeLivekit = {
  get livekitReady() { return lk.ready; },
  get wsUrl() { return 'wss://unit-test.livekit.cloud'; },
  dispatchAgent: async ({ roomName, metadata }) => {
    lk.dispatches.push({ roomName, metadata });
    const outcome = lk.outcomes.length ? lk.outcomes.shift() : lk.dispatchOutcome;
    if (outcome === 'accepted') return { outcome, providerCallId: roomName };
    if (outcome === 'ambiguous') return { outcome, errorMessage: 'Agent dispatch failed (ECONNRESET)' };
    return { outcome: 'rejected', errorMessage: 'no worker' };
  },
  hasDispatch: async () => lk.exists,
  issueJoinToken: (args) => { lk.joins.push(args); return lk.ready ? `join.${args.roomName}` : null; },
  endCall: async ({ roomName }) => { lk.ended.push(roomName); return { ended: true }; },
  roomStatus: async () => 'unknown',
  health: async () => ({ livekitReady: lk.ready }),
};
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class {},
  default: fakeLivekit,
}));

let mongod; let server;
let Lead; let User; let Role; let Permission; let LinkSession; let LinkSpend; let CallRecord; let CallSuppression; let OptOutEvent;
let linkService; let linkVoice; let generateAccessToken;
let userA; let tokenA; let n = 0;

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const H = { 'X-Requested-With': 'ula' };
const QUESTIONS = [
  { fieldKey: 'interest', label: 'Interest', text: 'Are you interested in a free solar survey?', type: 'boolean', required: true, order: 1 },
  { fieldKey: 'bill', label: 'Monthly bill', text: 'What is your monthly electricity bill?', type: 'integer', required: true, order: 2 },
  { fieldKey: 'email', label: 'Email', text: 'Which email should we use?', type: 'email', required: false, confirmCritical: true, order: 3 },
];

async function makeUser(permIds) {
  const role = await Role.create({ name: `VoiceRole_${randomUUID()}`, permissions: permIds });
  return User.create({
    email: `voice-${randomUUID()}@test.ch`, passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Sales', lastName: 'User', role: role._id, status: 'active',
  });
}

async function makeLead() {
  n += 1;
  return Lead.create({
    leadNumber: `L-${90000 + n}`, name: `Bilal Traders ${n}`, source: 'manual', status: 'new',
    mobile: `+41 79 765 ${String(10 + n).padStart(2, '0')} 21`, address: { country: 'CH' }, createdBy: userA._id,
  });
}

async function makeCampaign(leads, linkConfig = {}) {
  const res = await request(server).post('/api/v1/ai-calling/campaigns').set(auth(tokenA)).send({
    name: `Solar voice ${randomUUID().slice(0, 6)}`, channel: 'web_link',
    questionnaire: { questions: QUESTIONS },
    statusRules: [{ id: 'hot', when: { all: [{ field: 'interest', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { organizationName: 'Sunrise Solar', objective: 'Offer a free solar survey' },
    linkConfig: { reason: 'You asked about solar panels.', faq: [{ question: 'Why do you have my number?', answer: 'You filled in our quote form.' }], ...linkConfig },
    schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
    selection: { mode: 'explicit', leadIds: leads.map((l) => String(l._id)) },
  });
  expect(res.status).toBe(201);
  const id = res.body.data._id || res.body.data.id;
  await request(server).post(`/api/v1/ai-calling/campaigns/${id}/start`).set(auth(tokenA)).send({}).expect(202);
  return id;
}

/** Lead + campaign + issued link, opened on a phone (device registered). */
async function openLink(linkConfig) {
  const lead = await makeLead();
  const campaignId = await makeCampaign([lead], linkConfig);
  const res = await request(server).post(`/api/v1/crm/leads/${lead._id}/communications`).set(auth(tokenA)).send({
    operationId: randomUUID(), channel: 'sms', route: 'sms_direct', mode: 'manual', destinationField: 'mobile', linkCampaignId: campaignId,
  });
  expect(res.status).toBe(201);
  const path = new URL(res.body.data.link.url).pathname;
  const phone = request.agent(server);
  const page = await phone.get(path);
  expect(page.status).toBe(200);
  await phone.post(`${path}/api/open`).set(H).send({}).expect(200);
  const session = await LinkSession.findOne({ leadId: lead._id });
  return { lead, campaignId, path, phone, page, session };
}

/** The worker's view: the agent token LiveKit handed it for the dispatched room. */
function worker(dispatch) {
  const { callId, agentToken } = dispatch.metadata;
  const base = `/api/v1/ai-calling/agent/${callId}`;
  return {
    get: (p) => request(server).get(`${base}${p}`).set(auth(agentToken)),
    post: (p, body = {}) => request(server).post(`${base}${p}`).set(auth(agentToken)).send(body),
  };
}

beforeAll(async () => {
  process.env.LINK_ASSISTANT_BASE_URL = 'https://upd.example';
  process.env.LIVEKIT_URL = 'wss://unit-test.livekit.cloud';
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const leadRoutes = (await import('../../src/modules/crm/lead.routes.js')).default;
  const aiCalling = await import('../../src/modules/aiCalling/aiCalling.routes.js');
  const linkRoutes = (await import('../../src/modules/linkAssistant/linkAssistant.routes.js')).default;
  const linkPublic = (await import('../../src/modules/linkAssistant/linkAssistant.public.routes.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  Role = (await import('../../src/modules/auth/role.model.js')).default;
  Permission = (await import('../../src/modules/auth/permission.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  OptOutEvent = (await import('../../src/modules/linkAssistant/optOutEvent.model.js')).default;
  LinkSession = (await import('../../src/modules/linkAssistant/linkSession.model.js')).default;
  ({ LinkSpend } = await import('../../src/modules/linkAssistant/linkSettings.model.js'));
  linkService = (await import('../../src/modules/linkAssistant/linkAssistant.service.js')).default;
  linkVoice = (await import('../../src/modules/linkAssistant/linkVoice.service.js')).default;
  ({ generateAccessToken } = await import('../../src/shared/utils/crypto.js'));
  for (const model of ['crm/contact', 'crm/site', 'pm/project', 'qop/order', 'deploy/assignment', 'tasks/task', 'crm/leadCommunication']) {
    await import(`../../src/modules/${model}.model.js`);
  }
  await Promise.all([LinkSession.init(), CallRecord.init()]);

  const app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(cookieParser());
  app.use(responseEnvelope);
  app.use('/api/v1/crm/leads', leadRoutes);
  app.use('/api/v1/ai-calling/agent', aiCalling.agentToolRoutes);
  app.use('/api/v1/ai-calling', aiCalling.default);
  app.use('/api/v1/link-assistant', linkRoutes);
  app.use('/c', linkPublic);
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
  Object.assign(lk, { ready: true, dispatches: [], ended: [], joins: [], dispatchOutcome: 'accepted', outcomes: [], exists: false });
  delete process.env.LINK_VOICE_MAX_CONCURRENT;
  linkService._pausedCache = { value: false, at: 0 };
  const perms = await Permission.insertMany([
    { module: 'lead', action: 'read', description: 'r' }, { module: 'lead', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'read', description: 'r' }, { module: 'ai-calling', action: 'write', description: 'w' },
    { module: 'ai-calling', action: 'admin', description: 'a' },
  ]);
  userA = await makeUser(perms.map((p) => p._id));
  tokenA = generateAccessToken({ sub: String(userA._id) });
});

describe('SMS link voice call', () => {
  it('voice-first page → start → the agent drives the SAME conversation → answers saved live → completed', async () => {
    const { path, phone, page, session } = await openLink();
    // The call screen is the landing view; only this page's CSP allows the LiveKit host.
    expect(page.text).toContain('class="mode-voice"');
    expect(page.headers['content-security-policy']).toContain('wss://unit-test.livekit.cloud');

    const start = await phone.post(`${path}/api/voice/start`).set(H).send({});
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ url: 'wss://unit-test.livekit.cloud', maxSeconds: 600, resumed: false });
    expect(start.body.token).toMatch(/^join\.link-voice-/);
    // Nothing secret goes to the browser: no agent token, no API keys.
    expect(JSON.stringify(start.body)).not.toMatch(/agentToken|sk-|secret/i);
    await linkVoice.pendingDispatch;
    expect(lk.dispatches).toHaveLength(1);
    const { metadata, roomName } = lk.dispatches[0];
    expect(metadata).toMatchObject({ mode: 'web', channel: 'web_link', callId: session.internalCallId });
    expect(lk.joins[0]).toMatchObject({ roomName, identity: `lead-${session._id}` });

    // A reload / second tab rejoins the live room instead of starting another agent.
    const again = await phone.post(`${path}/api/voice/start`).set(H).send({});
    expect(again.body.resumed).toBe(true);
    expect(lk.dispatches).toHaveLength(1);

    const agent = worker(lk.dispatches[0]);
    const ctx = await agent.get('/context');
    expect(ctx.status).toBe(200);
    expect(ctx.body.data).toMatchObject({ channel: 'web_link', persistTranscript: true, nextAction: { type: 'disclose' } });
    expect(ctx.body.data.agentConfig.maxCallSeconds).toBe(600);
    expect(ctx.body.data.systemPrompt).toMatch(/Ayesha, an AI voice assistant for Sunrise Solar/);
    expect(ctx.body.data.systemPrompt).toContain('You filled in our quote form.');
    expect(ctx.body.data.systemPrompt).toMatch(/Never claim or imply that you are a human/);
    expect(ctx.body.data.disclosure).toContain('Ayesha');

    await agent.post('/answered').expect(200);
    let s = await LinkSession.findById(session._id);
    expect(s.funnel.voice_started).toBeTruthy();
    expect(s.status).toBe('active');

    await agent.post('/disclose').expect(200);
    const a1 = await agent.post('/record-answer', { fieldKey: 'interest', rawAnswer: 'yes, sure' });
    expect(a1.body.data).toMatchObject({ validation: 'valid', nextAction: { type: 'ask', question: { fieldKey: 'bill' } } });
    // Validation is the server's: a non-number is rejected however the model phrases it.
    const bad = await agent.post('/record-answer', { fieldKey: 'bill', rawAnswer: 'quite a lot' });
    expect(bad.body.data).toMatchObject({ validation: 'invalid', nextAction: { type: 'clarify' } });
    await agent.post('/record-answer', { fieldKey: 'bill', rawAnswer: 'about 12,000 rupees' }).expect(200);
    await agent.post('/record-answer', { fieldKey: 'email', rawAnswer: "It's ali@example.com." }).expect(200);
    // A goodbye is not a confirmation.
    const notYes = await agent.post('/confirm', { fieldKey: 'email', reply: 'thank you, goodbye' });
    expect(notYes.status).toBe(409);
    const yes = await agent.post('/confirm', { fieldKey: 'email', reply: 'Yes, this is my email.' });
    expect(yes.status).toBe(200);
    expect(yes.body.data.nextAction).toMatchObject({ type: 'finish' });

    // Answers are visible to the page (progress poll) while the call is live.
    const live = await phone.get(`${path}/api/state`).set(H);
    expect(live.body.progress).toMatchObject({ answered: 3, total: 3 });
    expect(live.body.summary).toEqual(expect.arrayContaining([{ label: 'Monthly bill', value: '12,000' }, { label: 'Email', value: 'ali@example.com' }]));

    // Transcript: finished utterances, stored once even if the worker retries.
    await agent.post('/transcript', { role: 'customer', text: 'about 12,000 rupees', itemId: 'item_1' }).expect(200);
    await agent.post('/transcript', { role: 'customer', text: 'about 12,000 rupees', itemId: 'item_1' }).expect(200);
    await agent.post('/transcript', { role: 'assistant', text: 'Thanks! Which email should we use?', itemId: 'item_2' }).expect(200);
    s = await LinkSession.findById(session._id);
    expect(s.transcript.filter((t) => t.source === 'voice')).toHaveLength(2);

    // The worker ends the call with real token usage → cost charged once, conversation finished.
    const usage = { modelUsage: [{ type: 'llm_usage', inputAudioTokens: 20000, outputAudioTokens: 3000, inputTextTokens: 4000, outputTextTokens: 600 }] };
    const end = { durationSeconds: 95, roomName, cost: { amount: 0, currency: 'USD', breakdown: { usage } } };
    await agent.post('/end', end).expect(200);
    await agent.post('/end', end).expect(200); // replayed: no double charge
    s = await LinkSession.findById(session._id);
    expect(s.status).toBe('completed');
    expect(s.outcome).toBe('completed');
    expect(s.voice.activeUntil).toBeNull();
    expect(s.voice.seconds).toBe(95);
    expect(s.voice.cost).toBeCloseTo((20000 * 32 + 3000 * 64 + 4000 * 4 + 600 * 16) / 1e6, 6);
    const spend = await LinkSpend.findOne({ campaignId: s.campaignId });
    expect(spend.amount).toBeCloseTo(s.voice.cost, 6);
    const call = await CallRecord.findById(s.callRecordId);
    expect(call.resultsProcessedAt).toBeTruthy();
    expect(call.conversationState.answers.bill.normalizedValue).toBe(12000);

    // The model can no longer change the finished conversation.
    await agent.post('/record-answer', { fieldKey: 'bill', rawAnswer: '1' }).expect(409);
  });

  it('a read-back the person never confirms is asked twice at most, then the call moves on (no loop)', async () => {
    const { path, phone, session } = await openLink();
    await phone.post(`${path}/api/voice/start`).set(H).send({});
    await linkVoice.pendingDispatch;
    const agent = worker(lk.dispatches[0]);
    await agent.post('/disclose');
    await agent.post('/record-answer', { fieldKey: 'interest', rawAnswer: 'yes' });
    await agent.post('/record-answer', { fieldKey: 'bill', rawAnswer: '120' });
    await agent.post('/record-answer', { fieldKey: 'email', rawAnswer: 'ali@example.com' });
    // The model passed the value instead of the person's words: refused once…
    expect((await agent.post('/confirm', { fieldKey: 'email', reply: 'ali@example.com' })).status).toBe(409);
    // …and on the second unconfirmed read-back the call moves on instead of asking forever.
    const second = await agent.post('/confirm', { fieldKey: 'email', reply: 'ali@example.com' });
    expect(second.status).toBe(200);
    expect(second.body.data).toMatchObject({ confirmed: false, nextAction: { type: 'finish' } });
    const call = await CallRecord.findById(session.callRecordId);
    expect(call.conversationState.answers.email).toMatchObject({ confirmed: false, confirmSkipped: true, confirmRejections: 2 });
  });

  it('a partial call stays open: hang up, then continue by voice again from the next question', async () => {
    const { path, phone, session } = await openLink();
    await phone.post(`${path}/api/voice/start`).set(H).send({}).expect(200);
    await linkVoice.pendingDispatch;
    const agent = worker(lk.dispatches[0]);
    await agent.post('/answered');
    await agent.post('/disclose');
    await agent.post('/record-answer', { fieldKey: 'interest', rawAnswer: 'yes' });

    const hangUp = await phone.post(`${path}/api/voice/end`).set(H).send({ reason: 'customer_hangup' });
    expect(hangUp.status).toBe(200);
    expect(hangUp.body).toMatchObject({ status: 'active', progress: { answered: 1 } });
    expect(lk.ended).toEqual([lk.dispatches[0].roomName]);
    const s = await LinkSession.findById(session._id);
    expect(s.voice).toMatchObject({ activeUntil: null, endReason: 'customer_hangup' });

    // Calling again starts a new room; the agent resumes with the next question.
    const next = await phone.post(`${path}/api/voice/start`).set(H).send({});
    expect(next.body.resumed).toBe(false);
    await linkVoice.pendingDispatch;
    expect(lk.dispatches).toHaveLength(2);
    const ctx = await worker(lk.dispatches[1]).get('/context');
    expect(ctx.body.data.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'bill' } });
    expect(ctx.body.data.disclosure).toMatch(/continue where we left off/);
  });

  it('"don\'t contact me" said during the call opts the lead out everywhere', async () => {
    const { lead, path, phone, session } = await openLink();
    await phone.post(`${path}/api/voice/start`).set(H).send({});
    await linkVoice.pendingDispatch;
    const agent = worker(lk.dispatches[0]);
    await agent.post('/answered');
    await agent.post('/do-not-contact').expect(200);
    await agent.post('/end', { durationSeconds: 20, roomName: lk.dispatches[0].roomName }).expect(200);
    const s = await LinkSession.findById(session._id);
    expect(s).toMatchObject({ status: 'opted_out', outcome: 'opted_out' });
    expect(await OptOutEvent.countDocuments({ leadId: lead._id })).toBe(1);
    expect(await CallSuppression.countDocuments({ leadId: lead._id })).toBeGreaterThan(0);
    // The link is closed for good, including voice.
    expect((await phone.post(`${path}/api/voice/start`).set(H).send({})).status).toBe(410);
  });

  it('"Human help" from the call screen records the request and ends the call', async () => {
    const { path, phone, session } = await openLink();
    await phone.post(`${path}/api/voice/start`).set(H).send({});
    await linkVoice.pendingDispatch;
    const res = await phone.post(`${path}/api/voice/human`).set(H).send({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'completed', outcome: 'human_requested' });
    expect(lk.ended).toHaveLength(1);
    const call = await CallRecord.findById(session.callRecordId);
    expect(call.conversationState.control.humanRequested).toBe(true);
  });

  it('refuses honestly: not offered, not configured, unverified device, paused, budget, busy, closed', async () => {
    // Campaign chose the text chat: no call screen, no voice endpoint.
    const off = await openLink({ voiceTier: 'off' });
    expect(off.page.text).toContain('class="mode-chat"');
    expect(off.page.headers['content-security-policy']).not.toContain('livekit');
    expect((await off.phone.post(`${off.path}/api/voice/start`).set(H).send({})).body.code).toBe('VOICE_UNAVAILABLE');

    const { path, phone, session } = await openLink();
    // LiveKit not configured on this server.
    lk.ready = false;
    expect((await phone.post(`${path}/api/voice/start`).set(H).send({})).body.code).toBe('VOICE_UNAVAILABLE');
    lk.ready = true;

    // A device that never opened the link.
    const stranger = await request(server).post(`${path}/api/voice/start`).set(H).send({});
    expect(stranger.status).toBe(403);

    // Global kill switch.
    await linkService.setPaused(true, 'test', userA._id);
    linkService._pausedCache = { value: true, at: Date.now() };
    expect((await phone.post(`${path}/api/voice/start`).set(H).send({})).body.code).toBe('VOICE_PAUSED');
    await linkService.setPaused(false, 'test', userA._id);
    linkService._pausedCache = { value: false, at: 0 };

    // Daily AI budget used up.
    await LinkSpend.create({ campaignId: session.campaignId, day: new Date().toISOString().slice(0, 10), amount: 5 });
    expect((await phone.post(`${path}/api/voice/start`).set(H).send({})).body.code).toBe('VOICE_BUDGET');
    await LinkSpend.deleteMany({});

    // Concurrency limit across all conversations.
    process.env.LINK_VOICE_MAX_CONCURRENT = '1';
    const other = await openLink();
    await other.phone.post(`${other.path}/api/voice/start`).set(H).send({}).expect(200);
    expect((await phone.post(`${path}/api/voice/start`).set(H).send({})).body.code).toBe('VOICE_BUSY');
    delete process.env.LINK_VOICE_MAX_CONCURRENT;

    // Finished conversation.
    await LinkSession.updateOne({ _id: session._id }, { $set: { status: 'completed' } });
    expect((await phone.post(`${path}/api/voice/start`).set(H).send({})).status).toBe(409);
    expect(lk.dispatches).toHaveLength(1); // only the one legitimate call
  });

  it('agent dispatch failure releases the room so the page can say the assistant is unavailable', async () => {
    const { path, phone, session } = await openLink();
    lk.dispatchOutcome = 'rejected';
    const res = await phone.post(`${path}/api/voice/start`).set(H).send({});
    expect(res.status).toBe(200); // the browser joins while the agent is dispatched
    expect(await linkVoice.pendingDispatch).toBe(false);
    const s = await LinkSession.findById(session._id);
    expect(s.voice).toMatchObject({ activeUntil: null, endReason: 'dispatch_failed' });
    expect(lk.ended).toEqual([lk.dispatches[0].roomName]); // the page sees the room close with no agent
  });

  it('a dispatch lost on the network is checked, then retried once — never two agents in a room', async () => {
    const { path, phone } = await openLink();
    // Request lost and LiveKit has no dispatch for the room → retried, the call goes ahead.
    lk.outcomes = ['ambiguous', 'accepted'];
    await phone.post(`${path}/api/voice/start`).set(H).send({}).expect(200);
    expect(await linkVoice.pendingDispatch).toBe(true);
    expect(lk.dispatches).toHaveLength(2);
    expect(lk.dispatches[1].roomName).toBe(lk.dispatches[0].roomName);
    await phone.post(`${path}/api/voice/end`).set(H).send({});

    // Response lost but the dispatch did reach LiveKit → no second agent.
    lk.dispatches = [];
    lk.outcomes = ['ambiguous'];
    lk.exists = true;
    await phone.post(`${path}/api/voice/start`).set(H).send({}).expect(200);
    expect(await linkVoice.pendingDispatch).toBe(true);
    expect(lk.dispatches).toHaveLength(1);
  });

  it('the agent token only reaches its own conversation; phone calls get no link context', async () => {
    const one = await openLink();
    const two = await openLink();
    await one.phone.post(`${one.path}/api/voice/start`).set(H).send({});
    await linkVoice.pendingDispatch;
    const { agentToken } = lk.dispatches[0].metadata;
    const res = await request(server).get(`/api/v1/ai-calling/agent/${two.session.internalCallId}/context`).set(auth(agentToken));
    expect(res.status).toBe(403);
    expect(await linkVoice.contextFor('not-a-link-call')).toBeNull();
  });
});
