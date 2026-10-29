import express from 'express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';
import { serve } from '../helpers/serve.js';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

/**
 * HTTP-level test of the agent tool API — exactly how the LiveKit voice-agent
 * worker reaches the CRM during a live call: a per-call bearer token, JSON body,
 * the real routes + validation + controller + service. Proves the constrained
 * tool surface is correctly wired and authenticated end to end.
 */

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
const listenerToken = jest.fn(() => null);
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class MockLiveKitSipProvider {
    constructor() { this.configured = false; this.enabled = false; }
    eligibleFor() { return false; }
    async health() { return { configured: false, eligible: false, reason: 'not_configured' }; }
  },
  default: { configured: false, health: async () => ({ configured: false }), createOutboundCall: async () => ({ outcome: 'rejected' }), dispatchAgent: async () => ({ outcome: 'rejected' }), wsUrl: 'wss://voice.example.test', issueJoinToken: listenerToken, endCall: async () => ({ ended: false }) },
}));

let mongod;
let app;
let service;
let CallCampaign;
let CampaignRecipient;
let CallRecord;
let Lead;
let issueAgentToken;

const actor = new mongoose.Types.ObjectId();

async function setupCall() {
  const lead = await Lead.create({
    leadNumber: `L-${Math.floor(Math.random() * 1e6)}`, name: 'Acme GmbH', source: 'manual',
    mobile: '+41791234567', address: { country: 'CH', city: 'Zürich' }, createdBy: actor,
  });
  const campaign = await service.createCampaign({
    name: 'HTTP agent test',
    questionnaire: { questions: [{ fieldKey: 'active', label: 'Active', text: 'Operating?', type: 'boolean', required: true, order: 1 }] },
    statusRules: [{ id: 'q', when: { all: [{ field: 'active', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { agentName: 'Tess', organizationName: 'Acme' },
    schedule: {}, selection: { mode: 'explicit', leadIds: [String(lead._id)] },
  }, actor);
  const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
  const internalCallId = `call_${recipient._id}_1`;
  await CallRecord.create({
    campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
    internalCallId, attemptNumber: 1, state: 'ringing', roomName: `crm-call-${internalCallId}`, createdBy: actor,
  });
  return { internalCallId, lead };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const { agentToolRoutes } = await import('../../src/modules/aiCalling/aiCalling.routes.js');
  service = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  ({ issueAgentToken } = await import('../../src/modules/aiCalling/callAuth.js'));
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;

  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/agent', agentToolRoutes);
  app.use(errorHandler);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  listenerToken.mockReset(); listenerToken.mockReturnValue(null);
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
});

describe('agent tool API over HTTP', () => {
  it('provides recognition with questionnaire context without supplying lead answers', async () => {
    const { internalCallId } = await setupCall();
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const response = await request(serve(app)).get(`/agent/${internalCallId}/context`).set(auth).expect(200);
    expect(response.body.data.transcriptionContext).toEqual({ questions: [{ text: 'Operating?', type: 'boolean' }] });
    expect(response.body.data.systemPrompt).toContain('Validate the meaning of every reply');
  });

  it('keeps misrecognized contact details unresolved, explains the missing information, and accepts corrections', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $set: { 'questionnaire.questions': [
      { fieldKey: 'dob', label: 'Birth date', text: 'What is your date of birth?', type: 'short_text', required: true, order: 1 },
      { fieldKey: 'email', label: 'Email', text: 'What is your email address?', type: 'short_text', required: true, order: 2 },
    ] } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const post = (path, body) => request(serve(app)).post(`/agent/${internalCallId}/${path}`).set(auth).send(body);
    await post('disclose', {}).expect(200);
    let response = await post('record-answer', { fieldKey: 'dob', rawAnswer: 'Why are you' }).expect(200);
    expect(response.body.data).toMatchObject({ accepted: false, validation: 'invalid', reason: 'birth_year_required', nextAction: { type: 'clarify', question: { fieldKey: 'dob', answerType: 'date' } } });
    expect(response.body.data.nextAction.question.answerHint).toContain('full four-digit year');
    expect((await service.getCall(record._id, actor)).callContext.answered).toBe(0);
    response = await post('record-answer', { fieldKey: 'dob', rawAnswer: '15 March 1992' }).expect(200);
    expect(response.body.data).toMatchObject({ accepted: true, validation: 'valid', nextAction: { type: 'ask', question: { fieldKey: 'email' } } });
    response = await post('record-answer', { fieldKey: 'email', rawAnswer: 'M-O-E-Z' }).expect(200);
    expect(response.body.data).toMatchObject({ accepted: false, validation: 'invalid', reason: 'invalid_email', nextAction: { type: 'clarify', question: { fieldKey: 'email' } } });
    await post('record-answer', { fieldKey: 'email', rawAnswer: 'moez595 at example dot com' }).expect(200);
    const state = (await CallRecord.findOne({ internalCallId })).conversationState;
    expect(state.answers.dob).toMatchObject({ validation: 'valid', normalizedValue: '1992-03-15' });
    expect(state.answers.email).toMatchObject({ validation: 'valid', normalizedValue: 'moez595@example.com' });
    expect((await service.getCall(record._id, actor)).callContext.answered).toBe(2);
  });

  it('validates volunteered batch answers independently without advancing past a rejected answer', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $push: { 'questionnaire.questions': {
      fieldKey: 'email', label: 'Email', text: 'What is your email address?', type: 'email', required: true, order: 2,
    } } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    const response = await request(serve(app)).post(`/agent/${internalCallId}/record-answers`).set(auth).send({ answers: [
      { fieldKey: 'active', rawAnswer: 'yes' }, { fieldKey: 'email', rawAnswer: 'my email address' },
    ] }).expect(200);
    expect(response.body.data.validations).toEqual([
      { fieldKey: 'active', accepted: true, validation: 'valid' },
      { fieldKey: 'email', accepted: false, validation: 'invalid', reason: 'invalid_email' },
    ]);
    expect(response.body.data.nextAction).toMatchObject({ type: 'clarify', question: { fieldKey: 'email' } });
  });

  it('requires paired gateways to advertise passive-listener support before issuing a speaker token', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    const Device = mongoose.model('PairedDevice');
    const device = await Device.create({ name: 'Bridge', createdBy: actor, lastHeartbeatAt: new Date() });
    await CallRecord.updateOne({ _id: record._id }, { $set: { provider: 'paired_phone', pairedDeviceId: device._id } });
    listenerToken.mockReturnValue('safe-listener');
    await expect(service.monitorCall(record._id, actor)).rejects.toThrow(/Update or reconnect/);
    await Device.updateOne({ _id: device._id }, { $set: { 'gateway.monitorSafe': true } });
    expect((await service.monitorCall(record._id, actor)).token).toBe('safe-listener');
    await Device.updateOne({ _id: device._id }, { $set: { lastHeartbeatAt: new Date(Date.now() - 60_000) } });
    await expect(service.monitorCall(record._id, actor)).rejects.toThrow(/Update or reconnect/);
  });

  it('orders delayed transcript uploads by speech time and deduplicates repeated deliveries', async () => {
    const { internalCallId } = await setupCall();
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const now = Date.now();
    await request(serve(app)).post(`/agent/${internalCallId}/transcript`).set(auth).send({ role: 'customer', text: 'My name is Ali.', itemId: 'lead-turn', at: new Date(now).toISOString() }).expect(200);
    const earlier = { role: 'assistant', text: 'What is your name?', itemId: 'agent-turn', at: new Date(now - 1000).toISOString() };
    await request(serve(app)).post(`/agent/${internalCallId}/transcript`).set(auth).send(earlier).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/transcript`).set(auth).send(earlier).expect(200);
    const record = await CallRecord.findOne({ internalCallId });
    expect(record.transcript.map(turn => turn.role)).toEqual(['assistant', 'customer']);
    expect(record.transcriptVersion).toBe(2);
  });

  it('repeats an unanswered question exactly three times, advances on the fourth miss, and preserves missing answers for review', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $push: { 'questionnaire.questions': { fieldKey: 'backup', label: 'Backup', text: 'Need support?', type: 'boolean', required: true, order: 2 } } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    await request(serve(app)).post(`/agent/${internalCallId}/answered`).set(auth).send({}).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    let last;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const body = { fieldKey: 'active', requestId: randomUUID(), reason: attempt % 2 ? 'silence' : 'unrelated' };
      last = body;
      const response = await request(serve(app)).post(`/agent/${internalCallId}/no-response`).set(auth).send(body).expect(200);
      expect(response.body.data.nextAction).toMatchObject(attempt <= 3 ? { type: 'clarify', question: { fieldKey: 'active' } } : { type: 'ask', question: { fieldKey: 'backup' } });
      await request(serve(app)).post(`/agent/${internalCallId}/no-response`).set(auth).send(body).expect(200);
      expect((await CallRecord.findOne({ internalCallId })).conversationState.answers.active.noResponseCount).toBe(attempt);
    }
    await request(serve(app)).post(`/agent/${internalCallId}/no-response`).set(auth).send({ ...last, requestId: randomUUID() }).expect(409);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set(auth).send({ fieldKey: 'backup', rawAnswer: 'yes' }).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/end`).set(auth).send({}).expect(200);
    const detail = await service.getCall(record._id, actor);
    expect(detail.answers).toHaveLength(2);
    expect(detail.answers[0]).toMatchObject({ validation: 'invalid', normalizedValue: null, noResponseCount: 4 });
    expect(detail.questionCoverage.questions[0].status).toBe('not_answered');
    expect(detail.questionCoverage.questions[1].status).toBe('answered');
    expect(detail.reviewRequired).toBe(true);
    await request(serve(app)).post(`/agent/${internalCallId}/no-response`).set(auth).send(last).expect(409);
  });

  it('does not confirm a critical answer without explicit affirmative speech', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $set: { 'questionnaire.questions.0.confirmCritical': true } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set(auth).send({ fieldKey: 'active', rawAnswer: 'yes' }).expect(200);
    const unclear = await request(serve(app)).post(`/agent/${internalCallId}/confirm`).set(auth).send({ fieldKey: 'active', reply: null }).expect(200);
    expect(unclear.body.data).toMatchObject({ confirmed: false, skipped: false, nextAction: { type: 'confirm' } });
    expect((await CallRecord.findOne({ internalCallId })).conversationState.answers.active.confirmed).toBe(false);
    await request(serve(app)).post(`/agent/${internalCallId}/confirm`).set(auth).send({ fieldKey: 'active', reply: 'yes' }).expect(200);
  });

  it('shares three read-back repeats across silence and unclear speech and deduplicates lost acknowledgements', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $set: { 'questionnaire.questions.0.confirmCritical': true } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const post = (path, body) => request(serve(app)).post(`/agent/${internalCallId}/${path}`).set(auth).send(body);
    await post('disclose', {}).expect(200);
    await post('record-answer', { fieldKey: 'active', rawAnswer: 'yes' }).expect(200);
    const unclear = { fieldKey: 'active', reply: 'I did not hear you', requestId: randomUUID() };
    await Promise.all([1, 2, 3].map(() => post('confirm', unclear).expect(200)));
    expect((await CallRecord.findOne({ internalCallId })).conversationState.answers.active.confirmRejections).toBe(1);
    for (let attempt = 2; attempt <= 4; attempt++) {
      const res = attempt === 3
        ? await post('confirm', { ...unclear, requestId: randomUUID() }).expect(200)
        : await post('no-response', { fieldKey: 'active', reason: 'silence', requestId: randomUUID() }).expect(200);
      expect(res.body.data.nextAction.type).toBe(attempt < 4 ? 'confirm' : 'finish');
    }
    await post('confirm', unclear).expect(200); // delivery replay remains safe after advancing
    const entry = (await CallRecord.findOne({ internalCallId })).conversationState.answers.active;
    expect(entry).toMatchObject({ normalizedValue: true, confirmed: false, confirmSkipped: true, confirmRejections: 2, noResponseCount: 2 });
    await post('confirm', { fieldKey: 'active', reply: 'yes', requestId: randomUUID() }).expect(409);
    await post('record-answer', { fieldKey: 'active', rawAnswer: 'no' }).expect(200);
    await post('confirm', unclear).expect(200); // an old reply cannot consume the corrected answer's budget
    expect((await CallRecord.findOne({ internalCallId })).conversationState.answers.active.confirmRejections).toBeUndefined();
    await post('confirm', { fieldKey: 'active', reply: 'yes', requestId: randomUUID() }).expect(200);
    expect((await CallRecord.findOne({ internalCallId })).conversationState.answers.active).toMatchObject({ normalizedValue: false, confirmed: true });
  });

  it('rejects out-of-order confirmations without changing the retry budget', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $set: { 'questionnaire.questions.0.confirmCritical': true } });
    await CallCampaign.updateOne({ _id: record.campaignId }, { $push: { 'questionnaire.questions': { fieldKey: 'backup', label: 'Backup', text: 'Need support?', type: 'boolean', order: 2 } } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const post = (path, body) => request(serve(app)).post(`/agent/${internalCallId}/${path}`).set(auth).send(body);
    await post('confirm', { fieldKey: 'active', reply: null }).expect(409);
    await post('disclose', {}).expect(200);
    await post('record-answer', { fieldKey: 'active', rawAnswer: 'yes' }).expect(200);
    const version = (await CallRecord.findOne({ internalCallId })).stateVersion;
    for (const fieldKey of ['active', 'backup', 'invented']) await post('confirm', { fieldKey, reply: 'maybe' }).expect(409);
    expect((await CallRecord.findOne({ internalCallId })).stateVersion).toBe(version);
  });

  it('mints an owner-scoped receive-only listener token and rejects ended, taken-over or unconfigured calls', async () => {
    const { internalCallId } = await setupCall();
    const record = await CallRecord.findOne({ internalCallId });
    listenerToken.mockReturnValue('listener-token');
    const monitor = await service.monitorCall(record._id, actor);
    expect(monitor.token).toBe('listener-token');
    expect(listenerToken).toHaveBeenCalledWith(expect.objectContaining({ canPublish: false, roomName: record.roomName, ttlSeconds: 120, identity: expect.stringMatching(/^monitor-/) }));
    await expect(service.monitorCall(record._id, new mongoose.Types.ObjectId())).rejects.toThrow(/not found/);
    listenerToken.mockReturnValue(null);
    await expect(service.monitorCall(record._id, actor)).rejects.toThrow(/not configured/);
    listenerToken.mockReturnValue('listener-token');
    await CallRecord.updateOne({ _id: record._id }, { $set: { 'gateway.takenOverAt': new Date() } });
    await expect(service.monitorCall(record._id, actor)).rejects.toThrow(/unavailable/);
    await CallRecord.updateOne({ _id: record._id }, { $set: { state: 'completed', endedAt: new Date() } });
    await expect(service.monitorCall(record._id, actor)).rejects.toThrow(/no longer live/);
  });

  it('collects volunteered answers together, validates conditions, and resets critical confirmation on corrections', async () => {
    const { internalCallId } = await setupCall();
    const call = await CallRecord.findOne({ internalCallId });
    await CallCampaign.updateOne({ _id: call.campaignId }, { $set: { 'questionnaire.questions': [
      { fieldKey: 'active', label: 'Active', text: 'Operating?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'budget', label: 'Budget', text: 'Budget?', type: 'currency', required: true, confirmCritical: true, order: 2 },
      { fieldKey: 'office', label: 'Office', text: 'Which office?', type: 'short_text', condition: { all: [{ field: 'active', equals: true }] }, order: 3 },
    ] } });
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const body = { answers: [{ fieldKey: 'budget', rawAnswer: '2000' }, { fieldKey: 'active', rawAnswer: 'no' }, { fieldKey: 'office', rawAnswer: 'Upstairs' }] };
    await request(serve(app)).post(`/agent/${internalCallId}/record-answers`).set(auth).send(body).expect(409);
    await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    const result = await request(serve(app)).post(`/agent/${internalCallId}/record-answers`).set(auth).send(body).expect(200);
    expect(result.body.data.validations).toEqual([
      { fieldKey: 'active', accepted: true, validation: 'valid' }, { fieldKey: 'budget', accepted: true, validation: 'valid' }, { fieldKey: 'office', accepted: false, reason: 'condition_not_met' },
    ]);
    expect(result.body.data.nextAction).toMatchObject({ type: 'confirm', question: { fieldKey: 'budget' } });
    await request(serve(app)).post(`/agent/${internalCallId}/confirm`).set(auth).send({ fieldKey: 'budget', reply: 'yes' }).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set(auth).send({ fieldKey: 'budget', rawAnswer: '3000' }).expect(200);
    const after = await CallRecord.findOne({ internalCallId }).lean();
    expect(after.conversationState.answers.budget).toMatchObject({ normalizedValue: 3000, confirmed: false });
    expect(after.conversationState.answers).not.toHaveProperty('office');
    const version = after.stateVersion;
    await request(serve(app)).post(`/agent/${internalCallId}/record-answers`).set(auth).send({ answers: [{ fieldKey: 'active', rawAnswer: 'yes' }, { fieldKey: 'invented', rawAnswer: 'made up' }] }).expect(400);
    expect((await CallRecord.findOne({ internalCallId })).stateVersion).toBe(version);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answers`).set(auth).send({ answers: [body.answers[0], body.answers[0]] }).expect(400);
    await request(serve(app)).post(`/agent/${internalCallId}/decline`).set(auth).send({}).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answers`).set(auth).send(body).expect(409);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set(auth).send(body.answers[0]).expect(409);
  });

  it('streams both speakers once per speech item and exposes live answers only to the call owner', async () => {
    const { internalCallId } = await setupCall();
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const ctx = await request(serve(app)).get(`/agent/${internalCallId}/context`).set(auth).expect(200);
    expect(ctx.body.data.persistTranscript).toBe(true);
    await request(serve(app)).post(`/agent/${internalCallId}/answered`).set(auth).send({}).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/transcript`).set(auth).send({ role: 'assistant', text: 'Are you operating?', itemId: 'a1', interrupted: true }).expect(200);
    const body = { role: 'customer', text: 'Yes, we are open.', itemId: 'c1' };
    const received = await Promise.all([1, 2].map(() => request(serve(app)).post(`/agent/${internalCallId}/transcript`).set(auth).send(body).expect(200)));
    expect(received.filter(r => r.body.data.stored)).toHaveLength(1);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set(auth).send({ fieldKey: 'active', rawAnswer: 'yes' }).expect(200);
    await request(serve(app)).post(`/agent/${internalCallId}/activity`).set(auth).send({ agentState: 'listening', speaker: 'customer' }).expect(200);
    const stored = await CallRecord.findOne({ internalCallId }).lean();
    expect(stored.transcript.map(t => t.role)).toEqual(['assistant', 'customer']);
    expect(stored.transcript[0].interrupted).toBe(true);
    expect(stored.transcriptVersion).toBe(2);
    expect(stored.answers).toHaveLength(0); // post-call evidence remains untouched while live
    const detail = await service.getCall(stored._id, actor);
    expect(detail.answers).toEqual([expect.objectContaining({ questionFieldKey: 'active', normalizedValue: true, validation: 'valid' })]);
    expect(detail.callContext).toMatchObject({ agentName: 'Tess', answered: 1, total: 1 });
    expect(detail.questionCoverage).toMatchObject({ total: 1, answered: 1, requiredGaps: [] });
    expect(detail.questionCoverage.questions[0]).toMatchObject({ fieldKey: 'active', status: 'answered', rawAnswer: 'yes' });
    expect(detail.conversationInsights.participation).toMatchObject({ agentTurns: 1, leadTurns: 1 });
    expect(detail.agentActivity.speaker).toBe('customer');
    const active = await service.activeCalls(stored.campaignId, actor);
    expect(active[0].transcriptPreview).toHaveLength(2);
    expect(active[0].recordId).toBe(String(stored._id));
    await expect(service.getCall(stored._id, new mongoose.Types.ObjectId())).rejects.toThrow(/not found/);
    await request(serve(app)).post('/agent/some-other-call/transcript').set(auth).send(body).expect(403);
  });

  it('bounds speech history, accepts final hang-up utterances and hides expired transcripts', async () => {
    const { internalCallId } = await setupCall();
    const auth = { Authorization: `Bearer ${issueAgentToken(internalCallId)}` };
    const now = new Date();
    await CallRecord.updateOne({ internalCallId }, { $set: {
      transcript: Array.from({ length: 300 }, (_, i) => ({ itemId: `old-${i}`, role: 'customer', text: `Turn ${i}`, at: now })),
      endedAt: now, state: 'completed',
    } });
    await request(serve(app)).post(`/agent/${internalCallId}/transcript`).set(auth).send({ role: 'assistant', text: 'Goodbye.', itemId: 'final' }).expect(200);
    let stored = await CallRecord.findOne({ internalCallId }).lean();
    expect(stored.transcript).toHaveLength(300);
    expect(stored.transcript[0].itemId).toBe('old-1');
    expect(stored.transcript.at(-1).text).toBe('Goodbye.');
    await CallRecord.updateOne({ internalCallId }, { $set: { transcriptExpiresAt: new Date(Date.now() - 1000) } });
    expect((await service.getCall(stored._id, actor)).transcript).toEqual([]);
    await service.reconcileStuckCalls();
    stored = await CallRecord.findOne({ internalCallId }).lean();
    expect(stored.transcript).toEqual([]);
  });

  it('rejects a request with no / bad token (401)', async () => {
    const { internalCallId } = await setupCall();
    await request(serve(app)).get(`/agent/${internalCallId}/context`).expect(401);
    await request(serve(app)).get(`/agent/${internalCallId}/context`).set('Authorization', 'Bearer nonsense').expect(401);
  });

  it('runs the full tool flow with a valid per-call token', async () => {
    const { internalCallId, lead } = await setupCall();
    const token = issueAgentToken(internalCallId);
    const auth = { Authorization: `Bearer ${token}` };

    const ctx = await request(serve(app)).get(`/agent/${internalCallId}/context`).set(auth).expect(200);
    expect(ctx.body.data.nextAction.type).toBe('disclose');
    expect(ctx.body.data.leadContext.businessName).toBe('Acme GmbH');

    const disclosed = await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).send({}).expect(200);
    expect(disclosed.body.data.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'active' } });

    const answered = await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set(auth)
      .send({ fieldKey: 'active', rawAnswer: 'yes we are open' }).expect(200);
    expect(answered.body.data.validation).toBe('valid');
    expect(answered.body.data.nextAction.type).toBe('finish');

    const callNotes = { description: 'Confirmed operating status', summary: 'The lead confirmed the business is open.', blockers: [] };
    const ended = await request(serve(app)).post(`/agent/${internalCallId}/end`).set(auth).send({ durationSeconds: 30, callNotes }).expect(200);
    expect(ended.body.data).toMatchObject({ processed: true, qualification: 'qualified' });
    expect((await CallRecord.findOne({ internalCallId }).lean()).callNotes).toMatchObject({ ...callNotes, source: 'ai_agent' });

    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('qualified');
  });

  it('/answered marks the call connected; /end only accepts telephony-level dispositions', async () => {
    const { internalCallId } = await setupCall();
    const token = issueAgentToken(internalCallId);
    const auth = { Authorization: `Bearer ${token}` };
    const answered = await request(serve(app)).post(`/agent/${internalCallId}/answered`).set(auth).expect(200);
    expect(answered.body.data.changed).toBe(true);
    expect((await CallRecord.findOne({ internalCallId }).lean()).state).toBe('in_progress');
    // The worker cannot assert a business outcome.
    await request(serve(app)).post(`/agent/${internalCallId}/end`).set(auth).send({ disposition: 'answered_completed' }).expect(400);
    const end = await request(serve(app)).post(`/agent/${internalCallId}/end`).set(auth).send({ disposition: 'voicemail' }).expect(200);
    expect(end.body.data.disposition).toBe('voicemail');
    // Tool calls after the end are refused.
    await request(serve(app)).post(`/agent/${internalCallId}/disclose`).set(auth).expect(409);
  });

  it('validates the body (missing fieldKey → 400)', async () => {
    const { internalCallId } = await setupCall();
    const token = issueAgentToken(internalCallId);
    await request(serve(app)).post(`/agent/${internalCallId}/record-answer`).set('Authorization', `Bearer ${token}`)
      .send({ rawAnswer: 'hi' }).expect(400);
  });

  it('a token for one call cannot drive another call', async () => {
    const a = await setupCall();
    const b = await setupCall();
    const tokenForA = issueAgentToken(a.internalCallId);
    // Token is bound to call A; naming call B in the path is refused outright.
    await request(serve(app)).get(`/agent/${b.internalCallId}/context`).set('Authorization', `Bearer ${tokenForA}`).expect(403);
    await request(serve(app)).post(`/agent/${b.internalCallId}/record-answer`).set('Authorization', `Bearer ${tokenForA}`)
      .send({ fieldKey: 'active', rawAnswer: 'yes' }).expect(403);
    // A token in the query string is not accepted (it would leak into access logs).
    await request(serve(app)).get(`/agent/${a.internalCallId}/context?agentToken=${tokenForA}`).expect(401);
  });
});
