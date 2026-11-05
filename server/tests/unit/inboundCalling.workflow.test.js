/**
 * Incoming calls end to end at the API boundary: the gateway reports a ring, the CRM decides,
 * dispatches the agent, the gateway reports answer/audio/hang-up, the voice agent saves what the
 * caller said, and post-call processing updates the lead, qualification and follow-ups exactly once.
 * Real Mongo (in-memory) + real routes; only LiveKit, the queue, audit and notifications are mocked.
 */
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';
import { serve } from '../helpers/serve.js';

const dispatchAgent = jest.fn(async ({ roomName }) => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: roomName }));
const endCall = jest.fn(async () => ({ ended: true }));
const notify = jest.fn(async () => ({}));

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob: jest.fn(), getQueueStats: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: (...a) => notify(...a) } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class {},
  default: {
    configured: false, livekitReady: true, url: 'wss://test.livekit.cloud', apiKey: 'APIkey', apiSecret: 'secret-secret-secret-secret',
    eligibleFor: () => false, health: async () => ({ configured: false }),
    dispatchAgent: (...a) => dispatchAgent(...a), endCall: (...a) => endCall(...a), roomStatus: async () => 'unknown',
    wsUrl: 'wss://test.livekit.cloud', agentName: 'test-agent', issueJoinToken: ({ identity }) => `join-${identity}`,
  },
}));

let mongod; let app; let svc; let query;
let Lead; let InboundCall; let PairedDevice; let CallingAgent; let LeadFollowUp; let InboundSettings;
const owner = new mongoose.Types.ObjectId();
const stranger = new mongoose.Types.ObjectId();
const TOKEN = 'gw-token-0123456789abcdef0123456789abcdef';
let device; let agent;

const gw = (path) => request(serve(app)).post(`/gw/inbound${path}`).set('Authorization', `Bearer ${TOKEN}`);
const agentApi = (callId, token) => ({
  get: (p) => request(serve(app)).get(`/agent/${callId}${p}`).set('Authorization', `Bearer ${token}`),
  post: (p, body = {}) => request(serve(app)).post(`/agent/${callId}${p}`).set('Authorization', `Bearer ${token}`).send(body),
});
let seq = 0;
const ev = (callId, type, data = {}) => gw(`/calls/${callId}/events`).send({ eventId: `evt_${(seq += 1)}_${crypto.randomBytes(4).toString('hex')}`, type, data });

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const routes = await import('../../src/modules/inboundCalling/inboundCall.routes.js');
  svc = (await import('../../src/modules/inboundCalling/inboundCall.service.js')).default;
  query = (await import('../../src/modules/inboundCalling/inboundQuery.service.js')).default;
  ({ default: Lead } = await import('../../src/modules/crm/lead.model.js'));
  ({ default: InboundCall } = await import('../../src/modules/inboundCalling/inboundCall.model.js'));
  ({ default: InboundSettings } = await import('../../src/modules/inboundCalling/inboundSettings.model.js'));
  ({ default: PairedDevice } = await import('../../src/modules/pairedPhone/pairedDevice.model.js'));
  ({ default: CallingAgent } = await import('../../src/modules/aiCalling/callingAgent.model.js'));
  ({ default: LeadFollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js'));
  const { hashToken } = await import('../../src/modules/pairedPhone/deviceCrypto.js');
  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/gw/inbound', routes.inboundGatewayRoutes);
  app.use('/agent', routes.inboundAgentRoutes);
  app.use(errorHandler);
  device = await PairedDevice.create({ name: 'TECNO bridge', phoneLabel: 'Jazz SIM', tokenHash: hashToken(TOKEN), audioVerifiedAt: new Date(), board: { connected: true, canAnswer: true }, createdBy: owner, lastHeartbeatAt: new Date() });
  agent = await CallingAgent.create({ name: 'Aria', title: 'Receptionist', availability: 'active', agentConfig: { language: 'en', organizationName: 'Updata', maxCallSeconds: 300 }, inbound: { greeting: 'Hello, Updata here. How can I help?' }, createdBy: owner, updatedBy: owner });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  dispatchAgent.mockClear(); endCall.mockClear(); notify.mockClear();
  await InboundSettings.deleteMany({});
  await InboundCall.deleteMany({});
  await svc.updateSettings(owner, { enabled: true, defaultAgentId: agent._id, defaultRegion: 'CH', answerDelaySeconds: 2 });
});

async function aiCall(number, sessionId = `s_${crypto.randomBytes(6).toString('hex')}`) {
  const res = await gw('/ring').send({ sessionId, number, simSlot: 0 }).expect(200);
  return { sessionId, ...res.body.data, token: JSON.parse(dispatchAgent.mock.calls.at(-1)?.[0]?.metadata ? JSON.stringify(dispatchAgent.mock.calls.at(-1)[0].metadata) : '{}').agentToken };
}

describe('incoming call handled by the AI receptionist', () => {
  it('runs ring → answer → conversation → hang-up → lead, qualification, follow-up (once)', async () => {
    const ring = await aiCall('079 555 12 34');
    expect(ring).toMatchObject({ action: 'answer_ai', answerAfterMs: 2000, livekit: { identity: `sip-${ring.callId}` } });
    expect(ring.livekit.token).toBeTruthy();
    expect(dispatchAgent).toHaveBeenCalledTimes(1);
    expect(dispatchAgent.mock.calls[0][0].metadata).toMatchObject({ direction: 'inbound', callId: ring.callId });

    // A retried ring report is the same session and never a second agent.
    const again = await gw('/ring').send({ sessionId: ring.sessionId, number: '079 555 12 34' }).expect(200);
    expect(again.body.data.callId).toBe(ring.callId);
    expect(dispatchAgent).toHaveBeenCalledTimes(1);
    expect(await InboundCall.countDocuments({ dedupeKey: `${device._id}:${ring.sessionId}` })).toBe(1);

    const a = agentApi(ring.callId, ring.token);
    const ctx = (await a.get('/context').expect(200)).body.data;
    expect(ctx).toMatchObject({ direction: 'inbound', greeting: 'Hello, Updata here. How can I help?', participantIdentity: `sip-${ring.callId}` });
    expect(ctx.systemPrompt).toContain('Never invent prices');

    await ev(ring.callId, 'answering').expect(200);
    await ev(ring.callId, 'answered').expect(200);
    let call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(call.status).toBe('CONNECTING_AUDIO');
    expect(call.aiStatus).toBe('connecting'); // not "connected" without audio + agent
    expect(call.leadId).toBeTruthy(); // created early: survives an interrupted call
    const lead = await Lead.findById(call.leadId).lean();
    expect(lead).toMatchObject({ source: 'incoming_call', normalizedPhone: '+41795551234', name: 'Caller +41795551234' });

    await a.post('/answered').expect(200);
    expect((await InboundCall.findOne({ internalCallId: ring.callId }).lean()).aiStatus).toBe('connecting');
    await ev(ring.callId, 'audio_opened', { codec: 'cvsd' }).expect(200);
    call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(call).toMatchObject({ status: 'AI_ACTIVE', aiStatus: 'connected', audioStatus: 'connected' });
    // Live monitor (all read endpoints must run against a live call, not only an empty DB).
    const liveRows = await query.live({ id: String(owner) });
    expect(liveRows).toHaveLength(1);
    expect(liveRows[0]).toMatchObject({ callId: ring.callId, aiStatus: 'connected', audioStatus: 'connected' });

    await a.post('/transcript', { role: 'assistant', text: 'Hello, Updata here. How can I help?', itemId: 'i1' }).expect(200);
    await a.post('/transcript', { role: 'customer', text: 'I want to build a CRM. How much does it cost?', itemId: 'i2' }).expect(200);
    await a.post('/transcript', { role: 'customer', text: 'I want to build a CRM. How much does it cost?', itemId: 'i2' }).expect(200); // replay
    await a.post('/caller-question', { text: 'How much does a CRM cost?', category: 'PRICING_INQUIRY', answerStatus: 'deferred', requestId: 'q1' }).expect(200);
    await a.post('/caller-question', { text: 'How much does a CRM cost?', category: 'PRICING_INQUIRY', requestId: 'q1' }).expect(200); // replay
    const info = await a.post('/caller-info', { fields: [
      { key: 'full_name', value: 'Sara Keller' }, { key: 'email', value: 'sara at example dot com' },
      { key: 'service_interest', value: 'Custom CRM development', askedQuestion: 'What would you like to build?' },
      { key: 'requirements', value: 'Lead tracking and AI calling' }, { key: 'timeline', value: 'Start in January' },
      { key: 'budget', value: 'around 20k', explicit: false }, { key: 'social_security', value: '123' },
    ] }).expect(200);
    expect(info.body.data.rejected.map((r) => r.key).sort()).toEqual(['email', 'social_security']);
    await a.post('/caller-info', { fields: [{ key: 'email', value: 'sara@example.com' }] }).expect(200);
    await a.post('/intent', { primary: 'SERVICE_INQUIRY', secondary: ['PRICING_INQUIRY'] }).expect(200);
    const lang = (await a.post('/language', { language: 'de', explicit: true, confidence: 1, evidence: 'Können wir Deutsch sprechen?' }).expect(200)).body.data;
    expect(lang).toEqual({ language: 'de', revision: 1 });
    // One ASR guess does not flip the language; the same language on two caller turns does.
    expect((await a.post('/language', { language: 'fr', source: 'asr', evidence: 'oui' }).expect(200)).body.data).toEqual({ language: 'de', revision: 1 });
    expect((await a.post('/language', { language: 'fr', source: 'asr', evidence: 'je voudrais un CRM' }).expect(200)).body.data).toEqual({ language: 'fr', revision: 2 });

    await a.post('/end', { callNotes: { reason: 'Wants a CRM', summary: 'Sara wants a custom CRM with lead tracking and AI calling; asked about price.', requirements: ['lead tracking'], unresolved_questions: ['Exact price'] }, cost: { amount: 0.12, currency: 'USD' } }).expect(200);
    expect(endCall).toHaveBeenCalled(); // agent done → room closed → the gateway hangs up
    await ev(ring.callId, 'ended', { reason: 'local_hangup' }).expect(200);

    call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(call).toMatchObject({ status: 'COMPLETED', outcome: 'handled_by_ai', answeredBy: 'ai' });
    expect(call.processedAt).toBeTruthy();
    expect(call.transcript).toHaveLength(2);
    expect(call.questions).toHaveLength(1);
    expect(call.language).toMatchObject({ initial: 'en', current: 'fr' });
    expect(call.language.switches.map((x) => x.to)).toEqual(['de', 'fr']);
    expect(call.qualification).toMatchObject({ result: 'QUALIFIED' });
    expect(call.intents).toMatchObject({ primary: 'SERVICE_INQUIRY' });
    expect(call.recommendations.map((r) => r.action)).toEqual(expect.arrayContaining(['SEND_PRICING', 'SEND_SERVICE_INFO', 'ASSIGN_SALES_REP']));
    const budget = call.fields.find((f) => f.key === 'budget');
    expect(budget.explicit).toBe(false);
    expect(budget.appliedToLead).toBe(false); // inferred values never become lead facts
    const updated = await Lead.findById(call.leadId).lean();
    expect(updated).toMatchObject({ name: 'Sara Keller', email: 'sara@example.com', status: 'qualified', lastContactChannel: 'phone' });
    const fus = await LeadFollowUp.find({ leadId: call.leadId }).lean();
    expect(fus).toHaveLength(1);
    expect(fus[0].source).toMatchObject({ type: 'inbound_call', recommendedAction: 'SEND_PRICING' });
    expect(call.work).toMatchObject({ status: 'follow_up', source: 'agent', reason: 'follow_up_created' });

    // Replays after processing change nothing.
    await ev(ring.callId, 'ended', { reason: 'local_hangup' }).expect(200);
    await svc.finalize(call._id);
    expect(await LeadFollowUp.countDocuments({ leadId: call.leadId })).toBe(1);
    await a.post('/caller-info', { fields: [{ key: 'full_name', value: 'Mallory' }] }).expect(409);

    // The same caller again: recognised, no duplicate lead.
    const second = await aiCall('+41 79 555 12 34');
    const doc = await InboundCall.findOne({ internalCallId: second.callId }).lean();
    expect(doc.match.status).toBe('existing');
    expect(String(doc.leadId)).toBe(String(call.leadId));
    expect(await Lead.countDocuments({ normalizedPhone: '+41795551234' })).toBe(1);

    // Owner isolation + read model.
    const detail = await query.get({ id: String(owner) }, String(call._id));
    expect(detail.qa.callerQuestions).toHaveLength(1);
    expect(detail.qa.aiQuestions[0]).toMatchObject({ question: 'What would you like to build?', answer: 'Custom CRM development' });
    await expect(query.get({ id: String(stranger) }, String(call._id))).rejects.toThrow();
    await a.post('/request-human', { reason: 'asked for a person', summary: 'CRM' }).expect(409); // processed calls are read-only
    expect(await query.live({ id: String(owner) })).toHaveLength(1); // the second call is still ringing
    for (const fn of ['list', 'analytics', 'devices', 'exportCsv']) await expect(query[fn]({ id: String(owner) }, {})).resolves.toBeTruthy();
    const stats = await query.stats({ id: String(owner) });
    expect(stats).toMatchObject({ answeredByAi: 1, qualified: 1, newLeads: 1 });
  });

  it('rejects an agent token from another call and keeps outbound tokens out', async () => {
    const one = await aiCall('079 111 22 33');
    const two = await aiCall('079 111 22 44');
    await agentApi(two.callId, one.token).get('/context').expect(403);
    const { issueAgentToken } = await import('../../src/modules/aiCalling/callAuth.js');
    await agentApi(one.callId, issueAgentToken(one.callId)).get('/context').expect(401);
  });
});

describe('calls that the AI does not take', () => {
  it('lets a call ring for a person when AI answering is off and logs a missed call with a return-call task', async () => {
    const existing = await Lead.create({ leadNumber: 'L-90001', name: 'Known Customer', source: 'manual', mobile: '+41790001122', normalizedPhone: '+41790001122', createdBy: owner });
    await svc.updateSettings(owner, { enabled: false });
    const res = (await gw('/ring').send({ sessionId: 'sess_missed_1', number: '0790001122' }).expect(200)).body.data;
    expect(res.action).toBe('let_ring');
    expect(dispatchAgent).not.toHaveBeenCalled();
    await ev(res.callId, 'ended', { reason: 'not_answered' }).expect(200);
    const call = await InboundCall.findOne({ internalCallId: res.callId }).lean();
    expect(call).toMatchObject({ status: 'MISSED', outcome: 'missed', answeredBy: null });
    expect(String(call.leadId)).toBe(String(existing._id));
    expect(call.handling).toMatchObject({ mode: 'human', aiBlockedBy: 'ai_answering_disabled' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'inbound_calls.missed' }), owner);
    const fu = await LeadFollowUp.findOne({ leadId: existing._id }).lean();
    expect(fu.source.recommendedAction).toBe('RETURN_MISSED_CALL');
  });

  it('records a call answered on the handset as human-handled', async () => {
    const res = (await gw('/ring').send({ sessionId: 'sess_human_1', number: '079 333 44 55' }).expect(200)).body.data;
    expect(res.action).toBe('answer_ai');
    await ev(res.callId, 'answered_elsewhere').expect(200);
    expect(endCall).toHaveBeenCalled(); // the agent room is closed: the AI never joins a human call
    await ev(res.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    await svc.finalize((await InboundCall.findOne({ internalCallId: res.callId }))._id);
    const call = await InboundCall.findOne({ internalCallId: res.callId }).lean();
    expect(call).toMatchObject({ status: 'COMPLETED', outcome: 'handled_by_human', answeredBy: 'human' });
    expect(call.leadId).toBeNull(); // policy ai_answered: no lead for a human-handled call
  });

  it('never AI-answers a blocked number or a withheld number creates no lead', async () => {
    await svc.updateSettings(owner, { blockedNumbers: ['079 999 88 77'] });
    const blocked = (await gw('/ring').send({ sessionId: 'sess_block_1', number: '+41799998877' }).expect(200)).body.data;
    expect(blocked.action).toBe('let_ring');
    const priv = (await gw('/ring').send({ sessionId: 'sess_priv_1', number: '' }).expect(200)).body.data;
    expect(priv.action).toBe('answer_ai');
    await ev(priv.callId, 'answered').expect(200);
    expect((await InboundCall.findOne({ internalCallId: priv.callId }).lean()).leadId).toBeNull();
  });

  it('keeps everything collected when the call is interrupted and recovers stuck sessions in the sweep', async () => {
    const ring = await aiCall('079 777 66 55');
    const a = agentApi(ring.callId, ring.token);
    await ev(ring.callId, 'answered').expect(200);
    await a.post('/caller-info', { fields: [{ key: 'full_name', value: 'Lena Roth' }, { key: 'service_interest', value: 'Website' }] }).expect(200);
    await ev(ring.callId, 'outcome_unknown', { detail: 'ESP32 link lost' }).expect(200);
    const call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(call).toMatchObject({ status: 'INTERRUPTED', outcome: 'interrupted' });
    expect(call.summary.text).toContain('Lena Roth');
    expect((await Lead.findById(call.leadId).lean()).name).toBe('Lena Roth');

    // A ring whose end never arrived (gateway crashed): the sweep marks it missed, once.
    const stale = (await gw('/ring').send({ sessionId: 'sess_stale_1', number: '079 101 01 01' }).expect(200)).body.data;
    const past = new Date(Date.now() - 10 * 60_000);
    await InboundCall.updateOne({ internalCallId: stale.callId }, { $set: { detectedAt: past, lastEventAt: past } });
    const stats = await svc.sweep();
    expect(stats.missed).toBeGreaterThanOrEqual(1);
    expect((await InboundCall.findOne({ internalCallId: stale.callId }).lean()).status).toBe('MISSED');
  });

  it('owner controls are delivered with the gateway heartbeat and guarded by state', async () => {
    const ring = await aiCall('079 202 02 02');
    const call = await InboundCall.findOne({ internalCallId: ring.callId });
    await expect(svc.control(owner, String(call._id), 'takeover')).rejects.toThrow(/Cannot takeover/);
    await svc.control(owner, String(call._id), 'reject');
    expect(await svc.pendingCommands(device._id)).toEqual([{ type: 'reject', callId: ring.callId, inbound: true }]);
    await expect(svc.control(stranger, String(call._id), 'reject')).rejects.toThrow();
    await ev(ring.callId, 'command_done', { type: 'reject' }).expect(200);
    await ev(ring.callId, 'ended', { reason: 'rejected' }).expect(200);
    expect((await InboundCall.findById(call._id).lean()).status).toBe('REJECTED');
    expect(await svc.pendingCommands(device._id)).toEqual([]);
  });

  it('leaves the call for a person when the board firmware cannot answer, and after a refused answer', async () => {
    await PairedDevice.updateOne({ _id: device._id }, { $set: { 'board.canAnswer': null } });
    const old = (await gw('/ring').send({ sessionId: 'sess_oldfw_1', number: '079 404 04 04' }).expect(200)).body.data;
    expect(old.action).toBe('let_ring');
    expect((await InboundCall.findOne({ internalCallId: old.callId }).lean()).handling.aiBlockedBy).toBe('firmware_no_answer');
    await PairedDevice.updateOne({ _id: device._id }, { $set: { 'board.canAnswer': true } });
    await InboundCall.deleteMany({});
    const ring = await aiCall('079 404 04 05');
    await ev(ring.callId, 'answering').expect(200);
    await ev(ring.callId, 'agent_unavailable', { code: 'answer_failed' }).expect(200);
    const call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(call).toMatchObject({ status: 'RINGING', aiStatus: 'unavailable', handling: expect.objectContaining({ mode: 'human', aiBlockedBy: 'answer_failed' }) });
    await ev(ring.callId, 'answered_elsewhere').expect(200);
    expect((await InboundCall.findOne({ internalCallId: ring.callId }).lean()).status).toBe('HUMAN_ACTIVE');
  });

  it('records a second caller while the AI is on a call, and lets the AI take it once the first call ends', async () => {
    const first = await aiCall('079 505 05 05');
    await ev(first.callId, 'answered').expect(200);
    dispatchAgent.mockClear();
    // Same phone rings again during the AI call (HFP call waiting): recorded, never AI-answered.
    const waiting = (await gw('/ring').send({ sessionId: 'sess_wait_1', number: '079 606 06 06', waiting: true }).expect(200)).body.data;
    expect(waiting.action).toBe('let_ring');
    expect(dispatchAgent).not.toHaveBeenCalled();
    let w = await InboundCall.findOne({ internalCallId: waiting.callId }).lean();
    expect(w).toMatchObject({ callWaiting: true, status: 'RINGING', handling: expect.objectContaining({ mode: 'human', aiBlockedBy: 'call_waiting' }) });
    // A plain new ring on the busy phone is blocked too (one audio link per phone).
    const busy = (await gw('/ring').send({ sessionId: 'sess_busy_1', number: '079 707 07 07' }).expect(200)).body.data;
    expect((await InboundCall.findOne({ internalCallId: busy.callId }).lean()).handling.aiBlockedBy).toBe('device_busy');
    // First call ends; the waiting call keeps ringing and is re-reported with the SAME session.
    await ev(first.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    await ev(busy.callId, 'ended', { reason: 'not_answered' }).expect(200);
    const released = (await gw('/ring').send({ sessionId: 'sess_wait_1', number: '079 606 06 06', waiting: false }).expect(200)).body.data;
    expect(released).toMatchObject({ callId: waiting.callId, action: 'answer_ai' });
    expect(dispatchAgent).toHaveBeenCalledTimes(1);
    w = await InboundCall.findOne({ internalCallId: waiting.callId }).lean();
    expect(w).toMatchObject({ callWaiting: false, handling: expect.objectContaining({ mode: 'ai' }) });
    expect(await InboundCall.countDocuments({ dedupeKey: `${device._id}:sess_wait_1` })).toBe(1);
  });

  it('a waiting caller who gives up is a missed call with a busy-phone notification', async () => {
    const first = await aiCall('079 515 15 15');
    await ev(first.callId, 'answered').expect(200);
    const waiting = (await gw('/ring').send({ sessionId: 'sess_wait_2', number: '079 616 16 16', waiting: true }).expect(200)).body.data;
    await ev(waiting.callId, 'ended', { reason: 'not_answered' }).expect(200);
    const w = await InboundCall.findOne({ internalCallId: waiting.callId }).lean();
    expect(w).toMatchObject({ status: 'MISSED', outcome: 'missed' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'inbound_calls.missed', priority: 'HIGH', payload: expect.objectContaining({ title: 'Missed call while the phone was busy' }) }), owner);
  });

  it('stores the phone SIMs reported by the app and fills the SIM on single-SIM phones', async () => {
    await expect(svc.reportSims(stranger, String(device._id), { sims: [{ slot: 0, label: 'Jazz' }] })).rejects.toThrow();
    await svc.reportSims(owner, String(device._id), { sims: [{ slot: 1, label: 'Telenor', carrier: 'Telenor PK' }] });
    const res = (await gw('/ring').send({ sessionId: 'sess_sim_1', number: '079 818 18 18' }).expect(200)).body.data;
    expect(await InboundCall.findOne({ internalCallId: res.callId }).lean()).toMatchObject({ simSlot: 1, simLabel: 'Telenor' });
    const devices = await query.devices({ id: String(owner) });
    expect(devices[0].sims).toEqual([{ slot: 1, label: 'Telenor', carrier: 'Telenor PK' }]);
    await svc.reportSims(owner, String(device._id), { sims: [] });
  });

  it('browser test of an incoming agent: real receptionist flow, recorded as a test, never touches CRM data', async () => {
    const leadsBefore = await Lead.countDocuments();
    const started = svc.startBrowserTest(owner, String(agent._id));
    let session;
    for (let i = 0; i < 40 && !session; i += 1) {
      session = await InboundCall.findOne({ isTest: true, agentContextAt: null }).lean();
      if (!session) await new Promise((r) => { setTimeout(r, 25); });
    }
    const token = dispatchAgent.mock.calls.at(-1)[0].metadata.agentToken;
    expect(dispatchAgent.mock.calls.at(-1)[0].metadata).toMatchObject({ direction: 'inbound', mode: 'web' });
    const a = agentApi(session.internalCallId, token);
    const ctx = (await a.get('/context').expect(200)).body.data;
    expect(ctx.participantIdentity).toBe(`admin-${owner}`);
    const res = await started;
    expect(res).toMatchObject({ callId: session.internalCallId, url: 'wss://test.livekit.cloud', token: `join-admin-${owner}` });
    await a.post('/answered').expect(200);
    expect((await InboundCall.findById(res.id).lean())).toMatchObject({ status: 'AI_ACTIVE', aiStatus: 'connected' });
    await a.post('/caller-info', { fields: [{ key: 'full_name', value: 'Test Tester' }] }).expect(200);
    await a.post('/end', { callNotes: { reason: 'test', summary: 'Browser test call' } }).expect(200);
    const done = await InboundCall.findById(res.id).lean();
    expect(done).toMatchObject({ status: 'COMPLETED', outcome: 'handled_by_ai', isTest: true, leadId: null });
    expect(done.processedAt).toBeTruthy();
    expect(await Lead.countDocuments()).toBe(leadsBefore);
    expect((await query.list({ id: String(owner) }, {})).data.find((r) => r.id === res.id)).toBeUndefined();
    expect((await query.get({ id: String(owner) }, res.id)).transcriptStats).toBeTruthy();
  });

  it('answers the ring without waiting for LiveKit; a refused dispatch falls back to a person', async () => {
    let release;
    dispatchAgent.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const res = (await gw('/ring').send({ sessionId: 'sess_slow_dispatch', number: '079 919 19 19' }).expect(200)).body.data;
    expect(res.action).toBe('answer_ai'); // decided while CreateDispatch is still in flight
    release({ outcome: 'rejected', errorMessage: 'LiveKit unavailable' });
    for (let i = 0; i < 40; i += 1) {
      if ((await InboundCall.findOne({ internalCallId: res.callId }).lean()).status === 'RINGING') break;
      await new Promise((r) => { setTimeout(r, 25); });
    }
    const call = await InboundCall.findOne({ internalCallId: res.callId }).lean();
    expect(call).toMatchObject({ status: 'RINGING', aiStatus: 'unavailable', handling: expect.objectContaining({ mode: 'human', aiBlockedBy: 'agent_dispatch_failed' }) });
    expect(endCall).toHaveBeenCalled();
  });

  it('review workflow: agent routing assigns the call, people update status and assignee, assignees see their calls', async () => {
    const users = mongoose.connection.db.collection('users');
    const rep = new mongoose.Types.ObjectId();
    await users.insertOne({ _id: rep, email: 'rep@example.com', firstName: 'Rana', lastName: 'Rep', isDeleted: false });
    await users.updateOne({ _id: owner }, { $setOnInsert: { email: 'owner@example.com', firstName: 'Salma', lastName: 'Owner', isDeleted: false } }, { upsert: true });
    await CallingAgent.updateOne({ _id: agent._id }, { $set: { 'inbound.assignToUserId': rep, 'inbound.statusByResult': { UNRESOLVED: 'in_progress' } } });
    const ring = await aiCall('079 828 28 28');
    await ev(ring.callId, 'answered').expect(200);
    await agentApi(ring.callId, ring.token).post('/transcript', { role: 'customer', text: 'Hello?', itemId: 'w1' }).expect(200);
    await ev(ring.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    await svc.finalize((await InboundCall.findOne({ internalCallId: ring.callId }))._id);
    let call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(String(call.assignedTo)).toBe(String(rep));
    expect(call.work).toMatchObject({ status: 'in_progress', source: 'agent' });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'inbound_calls.assigned', recipientIds: [rep] }), rep);
    // The assignee sees the call; a stranger does not.
    await expect(query.get({ id: String(rep) }, String(call._id))).resolves.toBeTruthy();
    expect((await query.list({ id: String(rep) }, { assignedTo: 'me' })).data.map((r) => r.id)).toContain(String(call._id));
    await expect(query.get({ id: String(stranger) }, String(call._id))).rejects.toThrow();
    // A person resolves it with a note; history keeps every change with who made it.
    const detail = await query.updateWork({ id: String(owner) }, String(call._id), { status: 'resolved', assignedTo: String(owner), note: 'Called back, all good' });
    expect(detail.work).toMatchObject({ status: 'resolved', source: 'user', assignee: { id: String(owner) } });
    expect(detail.work.history.map((h) => [h.source, h.to])).toEqual([['agent', 'in_progress'], ['user', 'resolved']]);
    expect(detail.work.history[1]).toMatchObject({ note: 'Called back, all good', assignedFrom: { id: String(rep), name: 'Rana Rep' } });
    // Re-processing never overrides a person's decision.
    await InboundCall.updateOne({ _id: call._id }, { $set: { processedAt: null } });
    await svc.finalize(call._id);
    call = await InboundCall.findById(call._id).lean();
    expect(call.work.status).toBe('resolved');
    expect((await query.list({ id: String(owner) }, { workStatus: 'open' })).data.map((r) => r.id)).not.toContain(String(call._id));
    await CallingAgent.updateOne({ _id: agent._id }, { $set: { 'inbound.assignToUserId': null, 'inbound.statusByResult': {} } });
  });

  it('follow-ups on a number that matches several leads: pick a lead or create a new one in the same step', async () => {
    const mk = (n) => Lead.create({ leadNumber: `L-${n}`, name: `Shared ${n}`, source: 'manual', mobile: '+41790003344', createdBy: owner });
    const [a1] = [await mk(81), await mk(82)];
    const ring = await aiCall('079 000 33 44');
    await ev(ring.callId, 'ended', { reason: 'not_answered' }).expect(200);
    const c = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    expect(c.match.status).toBe('ambiguous');
    const due = new Date(Date.now() + 3_600_000).toISOString();
    await expect(query.scheduleFollowUp({ id: String(owner) }, String(c._id), { dueAt: due })).rejects.toThrow(/choose the right lead or create a new one/);
    // Execute "Review the caller match" by picking a lead.
    let d = await query.decideRecommendation({ id: String(owner) }, String(c._id), 'REVIEW_CALLER_MATCH', { decision: 'execute', leadId: String(a1._id) });
    expect(d.lead.id).toBe(String(a1._id));
    expect(d.recommendations.find((r) => r.id === 'REVIEW_CALLER_MATCH').status).toBe('executed');
    const out = await query.scheduleFollowUp({ id: String(owner) }, String(c._id), { dueAt: due, note: 'testing' });
    expect(out.followUpId).toBeTruthy();
    expect(out.call.work).toMatchObject({ status: 'follow_up', source: 'user' });
    // A second ambiguous call: none of the leads is this caller → create a new lead in the same step.
    const ring2 = await aiCall('079 000 33 44');
    await ev(ring2.callId, 'ended', { reason: 'not_answered' }).expect(200);
    const c2 = await InboundCall.findOne({ internalCallId: ring2.callId }).lean();
    expect(c2.match.status).toBe('ambiguous');
    const before = await Lead.countDocuments();
    const out2 = await query.scheduleFollowUp({ id: String(owner) }, String(c2._id), { dueAt: due, createLead: true });
    expect(await Lead.countDocuments()).toBe(before + 1);
    expect(out2.call).toMatchObject({ lead: expect.objectContaining({ created: true }), match: expect.objectContaining({ status: 'existing' }) });
  });

  it('closing questions: custom keys saved and validated, refusals kept, everything lands in the call and the lead', async () => {
    await CallingAgent.updateOne({ _id: agent._id }, { $set: { 'inbound.closingQuestions': [
      { key: 'email', label: 'Email', question: 'Your email?', type: 'email', required: true },
      { key: 'alternate_phone', label: 'Alternate number', question: 'Another number?', type: 'phone' },
      { key: 'address', label: 'Address', question: 'Your address?', type: 'address' },
      { label: 'Party size', question: 'For how many people?', type: 'number' },
      { label: 'Allergies', question: 'Any allergies?', type: 'long_text' },
    ] } });
    const ring = await aiCall('079 838 38 38');
    const a = agentApi(ring.callId, ring.token);
    const ctx = (await a.get('/context').expect(200)).body.data;
    expect(ctx.systemPrompt).toMatch(/key=custom_party_size/);
    expect(ctx.conversationMemory.closingQuestions).toEqual(['email', 'alternate_phone', 'address', 'custom_party_size', 'custom_allergies']);
    await ev(ring.callId, 'answered').expect(200);
    await a.post('/transcript', { role: 'customer', text: 'Table for four please', itemId: 'c1' }).expect(200);
    let r = (await a.post('/caller-info', { fields: [
      { key: 'full_name', value: 'Amina Khan' }, { key: 'custom_party_size', value: 'four people', explicit: true },
      { key: 'alternate_phone', value: '12' }, { key: 'custom_unknown', value: 'x' },
    ] }).expect(200)).body.data;
    expect(r.saved.map((x) => x.key)).toEqual(['full_name']);
    expect(r.rejected).toEqual(expect.arrayContaining([{ key: 'custom_party_size', reason: 'invalid_number' }, { key: 'alternate_phone', reason: 'invalid_phone' }, { key: 'custom_unknown', reason: 'unknown_field' }]));
    expect(r.instruction).toMatch(/phone number was incomplete/);
    r = (await a.post('/caller-info', { fields: [
      { key: 'custom_party_size', value: '4' }, { key: 'alternate_phone', value: '079 222 33 44' }, { key: 'email', value: 'amina@example.com' },
      { key: 'address', value: 'Bahnhofstrasse 10, 8001 Zurich' }, { key: 'custom_allergies', value: '', declined: true },
    ] }).expect(200)).body.data;
    expect(r.pendingClosingQuestions).toEqual([]);
    expect(r.declined).toEqual([{ key: 'custom_allergies' }]);
    await ev(ring.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    await svc.finalize((await InboundCall.findOne({ internalCallId: ring.callId }))._id);
    const call = await InboundCall.findOne({ internalCallId: ring.callId }).lean();
    const detail = await query.get({ id: String(owner) }, String(call._id));
    expect(detail.qa.closingQuestions.map((x) => [x.key, x.status, x.value])).toEqual([
      ['email', 'answered', 'amina@example.com'], ['alternate_phone', 'answered', '+41792223344'], ['address', 'answered', 'Bahnhofstrasse 10, 8001 Zurich'],
      ['custom_party_size', 'answered', '4'], ['custom_allergies', 'declined', null],
    ]);
    expect(detail.fields.find((f) => f.key === 'custom_party_size')).toMatchObject({ label: 'Party size', value: '4' });
    const lead = await Lead.findById(call.leadId).lean();
    expect(lead).toMatchObject({ name: 'Amina Khan', email: 'amina@example.com', phone: '+41792223344' });
    expect(lead.address.street).toBe('Bahnhofstrasse 10, 8001 Zurich');
    expect(lead.notes).toMatch(/Party size: 4/);
    expect(lead.notes).toMatch(new RegExp(`incoming call ${ring.callId}`));
    await CallingAgent.updateOne({ _id: agent._id }, { $set: { 'inbound.closingQuestions': [] } });
  });

  it('dry-runs the rules without creating anything', async () => {
    await svc.saveRule(owner, { name: 'SIM 2 → people', priority: 10, action: 'human', conditions: { simSlots: [1] } });
    const before = await InboundCall.countDocuments();
    const out = await svc.testRules(owner, { number: '079 303 03 03', deviceId: String(device._id), simSlot: 1 });
    expect(out.decision).toMatchObject({ action: 'human', ruleName: 'SIM 2 → people' });
    expect((await svc.testRules(owner, { number: '079 303 03 03', deviceId: String(device._id), simSlot: 0 })).decision.action).toBe('ai_answer');
    expect(await InboundCall.countDocuments()).toBe(before);
  });
});
