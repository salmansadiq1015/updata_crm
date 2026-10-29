import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

/**
 * Calling intelligence end to end at service + HTTP level: approved knowledge
 * lifecycle → what the agent receives and what each call is stamped with;
 * evidence-linked extraction → lead qualification writes + review queue; human
 * transfer → worker tool contract, target selection, accept/decline/timeout,
 * SIP transfer (mocked LiveKit) and the fallback follow-up.
 */

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
const notify = jest.fn(async () => ({}));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
const mergeAnswers = jest.fn(async () => 1);
jest.unstable_mockModule('../../src/modules/crm/leadQualification.service.js', () => ({ default: { mergeAnswers }, normalizeConfirmedAnswer: jest.fn(a => a) }));
const createTask = jest.fn(async () => ({ _id: new mongoose.Types.ObjectId() }));
jest.unstable_mockModule('../../src/modules/tasks/task.service.js', () => ({ default: { create: createTask } }));
let aiConfigured = true;
jest.unstable_mockModule('../../src/shared/ai/llmFactory.js', () => ({
  isAiConfigured: () => aiConfigured, createOpenAiClient: async () => { throw new Error('no network in tests'); }, assertAiConfigured: () => {},
}));
const twirp = jest.fn(async () => ({ response: { ok: true, status: 200 }, json: {} }));
const issueJoinToken = jest.fn(({ identity }) => `jwt-for-${identity}`);
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } },
  default: {
    configured: true, livekitReady: true, wsUrl: 'wss://voice.example.test', _twirp: twirp, issueJoinToken,
    health: async () => ({ configured: true }), createOutboundCall: async () => ({ outcome: 'rejected' }), dispatchAgent: async () => ({ outcome: 'rejected' }), endCall: async () => ({ ended: true }),
  },
}));

let currentUser;
let admin = true;
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: currentUser }; next(); },
  requirePermission: perm => (req, res, next) => (perm !== 'ai-calling:admin' || admin ? next() : res.status(403).json({ success: false, error: { message: 'Forbidden' } })),
}));

let mongod; let app; let calling; let intelligence; let knowledge; let transfer;
let CallRecord; let CampaignRecipient; let Lead; let CallingAgent; let User; let KnowledgeVersion;
let issueAgentToken;
const emitted = [];
const owner = new mongoose.Types.ObjectId();
currentUser = owner;

async function makeUser(firstName) {
  const _id = new mongoose.Types.ObjectId();
  await User.collection.insertOne({ _id, firstName, lastName: 'Agent', email: `${firstName.toLowerCase()}-${_id}@test.ch`, status: 'active', isDeleted: false, role: new mongoose.Types.ObjectId() });
  return _id;
}

async function setupCall({ provider = 'livekit_sip', transcript = [], ended = false, language = 'ur', transferConfig = null, knowledgeConfig = undefined } = {}) {
  const lead = await Lead.create({ leadNumber: `L-${Math.floor(Math.random() * 1e7)}`, name: 'Karachi Bakers', source: 'manual', mobile: '+923001112233', address: { country: 'PK', city: 'Karachi' }, createdBy: owner });
  const agent = await CallingAgent.create({ name: 'Ayesha', createdBy: owner, updatedBy: owner, ...(transferConfig ? { transfer: transferConfig } : {}), ...(knowledgeConfig ? { knowledge: knowledgeConfig } : {}) });
  const campaign = await calling.createCampaign({
    name: 'Bakery outreach',
    questionnaire: { questions: [{ fieldKey: 'active', label: 'Active', text: 'Still operating?', type: 'boolean', required: true, order: 1 }] },
    statusRules: [{ id: 'q', when: { all: [{ field: 'active', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { agentName: 'Ayesha', organizationName: 'Updata', language },
    schedule: {}, selection: { mode: 'explicit', leadIds: [String(lead._id)] },
  }, owner);
  await mongoose.connection.collection('callcampaigns').updateOne({ _id: campaign._id }, { $set: { agentId: agent._id } });
  const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
  const internalCallId = `call_${recipient._id}_1`;
  const record = await CallRecord.create({
    campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id, internalCallId, attemptNumber: 1, provider,
    state: ended ? 'completed' : 'in_progress', roomName: `crm-call-${internalCallId}`, answeredAt: new Date(Date.now() - 60_000),
    transcript, transcriptVersion: transcript.length, createdBy: owner,
    ...(ended ? { endedAt: new Date(), resultsProcessedAt: new Date(), disposition: 'answered_partial' } : {}),
  });
  return { lead, agent, campaign, record, internalCallId, token: issueAgentToken(internalCallId) };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  global.io = { to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const routes = await import('../../src/modules/aiCalling/aiCalling.routes.js');
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  intelligence = (await import('../../src/modules/aiCalling/callIntelligence.service.js')).default;
  knowledge = (await import('../../src/modules/aiCalling/knowledge.service.js')).default;
  transfer = (await import('../../src/modules/aiCalling/humanTransfer.service.js')).default;
  ({ issueAgentToken } = await import('../../src/modules/aiCalling/callAuth.js'));
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallingAgent = (await import('../../src/modules/aiCalling/callingAgent.model.js')).default;
  ({ KnowledgeVersion } = await import('../../src/modules/aiCalling/knowledge.model.js'));
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;

  app = express();
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/api/v1/ai-calling', routes.default);
  app.use('/api/v1/ai-calling/agent', routes.agentToolRoutes);
  app.use(errorHandler);
});

afterAll(async () => { await mongoose.disconnect(); await mongod.stop(); delete global.io; });
beforeEach(() => { emitted.length = 0; jest.clearAllMocks(); aiConfigured = true; intelligence.complete = null; transfer.now = () => new Date(); });

describe('approved knowledge lifecycle', () => {
  it('draft → submit → approve → publish; edits need re-approval; versions are immutable; rollback appends', async () => {
    const entry = await knowledge.create({ type: 'pricing', title: 'Starter', content: 'Answering service', price: { amount: 49000, currency: 'PKR', unit: 'month' }, allowedPromises: ['Setup within 48 hours'] }, owner);
    expect(entry.status).toBe('draft');
    await expect(knowledge.publish(owner, {})).rejects.toThrow(/Approve at least one/);
    await knowledge.submit(entry._id, owner);
    const approved = await knowledge.approve(entry._id, owner, { revision: 1 });
    expect(approved).toMatchObject({ status: 'approved', approvedRevision: 1 });
    expect(String(approved.approvedBy)).toBe(String(owner));
    const v1 = await knowledge.publish(owner, { note: 'launch' });
    expect(v1.version).toBe(1);
    expect(v1.entries[0]).toMatchObject({ title: 'Starter', revision: 1 });

    const edited = await knowledge.update(entry._id, { price: { amount: 52000, currency: 'PKR', unit: 'month' }, revision: 1 }, owner);
    expect(edited).toMatchObject({ status: 'draft', revision: 2, approvedBy: null });
    await expect(knowledge.update(entry._id, { title: 'x', revision: 1 }, owner)).rejects.toThrow(/changed meanwhile/);
    await knowledge.approve(entry._id, owner, {});
    const v2 = await knowledge.publish(owner, {});
    expect(v2.entries[0].price.amount).toBe(52000);
    const diff = await knowledge.diff(v2._id);
    expect(diff).toMatchObject({ fromVersion: 1, toVersion: 2 });
    expect(diff.changed[0].fields.map(f => f.field)).toEqual(['price']);

    await expect(KnowledgeVersion.updateOne({ _id: v1._id }, { $set: { note: 'tamper' } })).rejects.toThrow(/immutable/);
    const v3 = await knowledge.rollback(v1._id, owner, {});
    expect(v3).toMatchObject({ version: 3, rollbackOf: 1 });
    expect(v3.entries[0].price.amount).toBe(49000);
    expect((await knowledge.getVersion(v1._id)).note).toBe('launch');
  });

  it('approval and publishing require ai-calling:admin over HTTP', async () => {
    const entry = await knowledge.create({ type: 'faq', title: 'Contract', content: 'Monthly' }, owner);
    admin = false;
    try {
      const res = await request(app).post(`/api/v1/ai-calling/knowledge/${entry._id}/approve`).send({});
      expect(res.status).toBe(403);
      expect((await request(app).post('/api/v1/ai-calling/knowledge/versions').send({})).status).toBe(403);
      expect((await request(app).get('/api/v1/ai-calling/knowledge')).status).toBe(200);
    } finally { admin = true; }
    const ok = await request(app).post(`/api/v1/ai-calling/knowledge/${entry._id}/approve`).send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('approved');
  });

  it('the agent receives only the pinned/latest published snapshot, stamped once per call', async () => {
    const versions = (await knowledge.listVersions({})).data;
    const v1 = versions.find(v => v.version === 1);
    const pinned = await setupCall({ knowledgeConfig: { mode: 'pinned', versionId: v1._id } });
    const ctx = await calling.getCallContext(pinned.internalCallId);
    expect(ctx.systemPrompt).toContain('APPROVED BUSINESS KNOWLEDGE (published version 1)');
    expect(ctx.systemPrompt).toContain('49,000 PKR per month');
    expect(ctx.knowledgeVersion).toBe(1);
    expect(ctx.transfer).toEqual({ enabled: false });
    // A newer publish does not change a call already in progress.
    const extra = await knowledge.create({ type: 'faq', title: 'Draft only', content: 'NOT APPROVED TEXT' }, owner);
    await knowledge.publish(owner, {});
    const again = await calling.getCallContext(pinned.internalCallId);
    expect(again.knowledgeVersion).toBe(1);
    expect(again.systemPrompt).not.toContain('NOT APPROVED TEXT');
    expect((await CallRecord.findById(pinned.record._id).lean()).knowledge).toMatchObject({ version: 1, mode: 'pinned', entryCount: 1 });

    const latest = await setupCall();
    const latestCtx = await calling.getCallContext(latest.internalCallId);
    expect(latestCtx.knowledgeVersion).toBeGreaterThanOrEqual(4);
    expect(latestCtx.systemPrompt).not.toContain(extra.content);

    const none = await setupCall({ knowledgeConfig: { mode: 'none' } });
    expect((await calling.getCallContext(none.internalCallId)).systemPrompt).not.toContain('APPROVED BUSINESS KNOWLEDGE');
  });
});

const T = (role, text, s) => ({ itemId: `${role}:${s}`, role, text, at: new Date(Date.UTC(2026, 9, 29, 10, 0, s)) });
const transcript = [
  T('assistant', 'Assalam o alaikum, main Ayesha hoon, Updata ki AI assistant.', 0),
  T('customer', 'Ji, boliye.', 3),
  T('assistant', 'Hamara starter plan 49,000 rupees per month hai. Aap ke liye 39,000 PKR kar dete hain.', 8),
  T('customer', 'Mera budget 50000 hai, lekin abhi price thoda zyada lag raha hai.', 14),
  T('customer', 'ہمیں شام کے بعد کالز مس ہونے کا مسئلہ ہے', 20),
  T('customer', 'Faisla mere partner karte hain.', 25),
];
const modelReply = JSON.stringify({ items: [
  { category: 'budget', value: '50000 PKR', normalized: '50000', quote: 'Mera budget 50000 hai', turnIndex: 3, speaker: 'lead', confidence: 0.92 },
  { category: 'objection', value: 'Price feels high right now', quote: 'abhi price thoda zyada lag raha hai', turnIndex: 3, speaker: 'lead', confidence: 0.9 },
  { category: 'need', value: 'Missed calls after evening', quote: 'ہمیں شام کے بعد کالز مس ہونے کا مسئلہ ہے', turnIndex: 4, speaker: 'lead', confidence: 0.88 },
  { category: 'authority', value: 'Partner decides', normalized: 'influencer', quote: 'Faisla mere partner karte hain.', turnIndex: 5, speaker: 'lead', confidence: 0.6 },
  { category: 'timeline', value: 'Next week', normalized: 'immediate', quote: 'next week we start', turnIndex: 4, speaker: 'lead', confidence: 0.9 },
] });

describe('evidence-linked extraction', () => {
  it('without an AI key the run is skipped gracefully, compliance is still checked', async () => {
    aiConfigured = false;
    const { record } = await setupCall({ transcript, ended: true });
    const result = await intelligence.extractForCall(record._id);
    expect(result.status).toBe('skipped');
    const saved = (await CallRecord.findById(record._id).lean()).intelligence;
    expect(saved).toMatchObject({ status: 'skipped', reason: 'ai_not_configured', items: [] });
    expect(saved.complianceFlags.map(f => f.kind)).toEqual(['unapproved_price', 'unapproved_price']);
    expect(mergeAnswers).not.toHaveBeenCalled();
  });

  it('accepts verbatim lead evidence, writes it to the lead with transcript refs, queues the rest for review', async () => {
    const versions = (await knowledge.listVersions({})).data;
    const v1 = versions.find(v => v.version === 1);
    const { record, lead } = await setupCall({ transcript, ended: true, knowledgeConfig: { mode: 'pinned', versionId: v1._id } });
    await knowledge.forCall(await CallRecord.findById(record._id), await mongoose.connection.collection('callcampaigns').findOne({ _id: record.campaignId }));
    intelligence.complete = async () => modelReply;
    const result = await intelligence.extractForCall(record._id);
    expect(result).toMatchObject({ status: 'partial', items: 4, pendingReview: 1, rejected: 1 });
    const saved = (await CallRecord.findById(record._id).lean()).intelligence;
    expect(saved.rejected).toEqual([expect.objectContaining({ category: 'timeline', reason: 'quote_not_in_turn' })]);
    expect(saved.items.find(i => i.category === 'need').quote).toBe('ہمیں شام کے بعد کالز مس ہونے کا مسئلہ ہے');
    expect(saved.items.find(i => i.category === 'authority')).toMatchObject({ status: 'needs_review', reviewReasons: ['low_confidence'] });
    // 49,000 is approved in version 1; the improvised 39,000 discount is not.
    expect(saved.complianceFlags).toEqual([expect.objectContaining({ kind: 'unapproved_price', turnIndex: 2, quote: '39,000 PKR' })]);

    expect(mergeAnswers).toHaveBeenCalledTimes(3);
    const budget = mergeAnswers.mock.calls.find(c => c[1][0].fieldKey === 'budget');
    expect(String(budget[0])).toBe(String(lead._id));
    expect(budget[1][0]).toMatchObject({ fieldKey: 'budget', value: 50000, status: 'answered', source: 'ai_call_agent', evidence: '"Mera budget 50000 hai"' });
    expect(budget[2]).toMatchObject({ callRecordId: String(record._id), source: 'ai_call_agent', transcriptRef: { callRecordId: String(record._id), turnIndex: 3, quote: 'Mera budget 50000 hai' } });
    expect(saved.items.filter(i => i.leadWrite?.status === 'applied')).toHaveLength(3);

    // Unforced re-run on the same transcript: no-op. Forced: same facts, no duplicate lead writes.
    mergeAnswers.mockClear();
    expect((await intelligence.extractForCall(record._id)).unchanged).toBe(true);
    const rerun = await request(app).post(`/api/v1/ai-calling/calls/${record._id}/intelligence/rerun`).send({});
    expect(rerun.status).toBe(202);
    expect(rerun.body.data.items).toBe(4);
    expect(mergeAnswers).not.toHaveBeenCalled();
    expect((await CallRecord.findById(record._id).lean()).intelligence.runs).toBe(2);
  });

  it('review queue: list, accept / edit (validated) / reject, decisions survive a re-run', async () => {
    const { record } = await setupCall({ transcript, ended: true });
    intelligence.complete = async () => modelReply;
    await intelligence.extractForCall(record._id);
    const queue = await request(app).get('/api/v1/ai-calling/intelligence/review');
    const mine = queue.body.data.filter(r => r.recordId === String(record._id));
    expect(mine).toHaveLength(1);
    expect(mine[0].item.category).toBe('authority');
    expect(mine[0].context.map(c => c.turnIndex)).toEqual([4, 5]);

    const itemId = mine[0].item.id;
    const bad = await request(app).post(`/api/v1/ai-calling/calls/${record._id}/intelligence/items/${itemId}/decision`).send({ decision: 'edit', value: 'Partner', normalized: 'the partner' });
    expect(bad.status).toBe(400);
    mergeAnswers.mockClear();
    const edit = await request(app).post(`/api/v1/ai-calling/calls/${record._id}/intelligence/items/${itemId}/decision`).send({ decision: 'edit', value: 'Partner decides', normalized: 'no_authority', note: 'Heard it on the recording' });
    expect(edit.status).toBe(200);
    expect(edit.body.data).toMatchObject({ status: 'user_edited', leadWrite: { status: 'applied', source: 'user_correction' } });
    expect(mergeAnswers.mock.calls[0][1][0]).toMatchObject({ fieldKey: 'decision_authority', value: 'no_authority', source: 'user_correction' });
    expect(mergeAnswers.mock.calls[0][2]).toMatchObject({ userId: owner, source: 'user_correction' });
    const twice = await request(app).post(`/api/v1/ai-calling/calls/${record._id}/intelligence/items/${itemId}/decision`).send({ decision: 'reject' });
    expect(twice.status).toBe(409);

    const saved = (await CallRecord.findById(record._id).lean()).intelligence;
    expect(saved.pendingReview).toBe(0);
    const decided = saved.items.find(i => i.id === itemId);
    expect(decided.review).toMatchObject({ decision: 'edit', previousValue: { normalized: 'influencer' } });

    await intelligence.extractForCall(record._id, { force: true });
    expect((await CallRecord.findById(record._id).lean()).intelligence.items.find(i => i.id === itemId)).toMatchObject({ status: 'user_edited', normalized: 'no_authority' });

    // Accept + reject on a fresh call.
    const second = await setupCall({ transcript, ended: true });
    await intelligence.extractForCall(second.record._id);
    const item = (await CallRecord.findById(second.record._id).lean()).intelligence.items.find(i => i.status === 'needs_review');
    mergeAnswers.mockClear();
    const accepted = await intelligence.decide(second.record._id, item.id, owner, { decision: 'accept' });
    expect(accepted.leadWrite).toMatchObject({ status: 'applied', source: 'ai_proposed_user_confirmed' });
    const objection = (await CallRecord.findById(second.record._id).lean()).intelligence.items.find(i => i.category === 'objection');
    const rejected = await intelligence.decide(second.record._id, objection.id, owner, { decision: 'reject' });
    expect(rejected).toMatchObject({ status: 'user_rejected', leadFieldUnchanged: true });
  });

  it('test calls never write to the lead; an unparseable reply fails without losing earlier results', async () => {
    const { record } = await setupCall({ transcript, ended: true, provider: 'livekit_web' });
    intelligence.complete = async () => modelReply;
    await intelligence.extractForCall(record._id);
    expect(mergeAnswers).not.toHaveBeenCalled();
    const saved = (await CallRecord.findById(record._id).lean()).intelligence;
    expect(saved.items.filter(i => i.leadWrite?.reason === 'test_call')).toHaveLength(3);
    intelligence.complete = async () => 'I cannot help with that';
    expect((await intelligence.extractForCall(record._id, { force: true })).status).toBe('failed');
    const after = (await CallRecord.findById(record._id).lean()).intelligence;
    expect(after).toMatchObject({ status: 'failed', reason: 'unparseable_model_output' });
    expect(after.items).toHaveLength(4);
  });

  it('a live call is not extracted', async () => {
    const { record } = await setupCall({ transcript });
    await expect(intelligence.extractForCall(record._id)).rejects.toThrow(/not finished/);
  });
});

describe('human transfer', () => {
  let sara; let ali;
  beforeAll(async () => {
    sara = await makeUser('Sara');
    ali = await makeUser('Ali');
  });
  const online = ids => async () => new Set(ids.map(String));
  const config = (targets, extra = {}) => ({ enabled: true, targetUserIds: targets, timeoutSeconds: 20, allowPhoneTransfer: true, ...extra });

  it('worker tool contract: token required; not configured → unavailable with an Urdu fallback script', async () => {
    const { internalCallId, token } = await setupCall();
    expect((await request(app).post(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).send({})).status).toBe(401);
    const res = await request(app).post(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).set('Authorization', `Bearer ${token}`).send({ reason: 'Asked for a person', summary: 'Wants a custom price' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'unavailable', reason: 'NOT_CONFIGURED', fallback: { language: 'ur' } });
    expect(res.body.data.fallback.script).toMatch(/Updata/);
  });

  it('rings only available + online people, first accept wins, joins over web audio', async () => {
    await transfer.setPresence(sara, { available: true, workingHours: { timezone: 'UTC' } });
    await transfer.setPresence(ali, { available: true });
    transfer.presenceProbe = online([sara]); // Ali has no CRM tab open
    const { internalCallId, token, record } = await setupCall({ transferConfig: config([ali, sara]), transcript: transcript.slice(0, 4) });
    const ctx = await calling.getCallContext(internalCallId);
    expect(ctx.transfer).toEqual({ enabled: true });
    expect(ctx.systemPrompt).toContain('request_human_transfer');

    const res = await request(app).post(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).set('Authorization', `Bearer ${token}`).send({ reason: 'Asked for a person', summary: 'Budget 50k, price concern' });
    expect(res.body.data).toMatchObject({ status: 'ringing', offered: 1, timeoutSeconds: 20 });
    const offers = emitted.filter(e => e.event === 'ai-calling:transfer-offer');
    expect(offers.map(o => o.room)).toEqual([`user:${sara}`]);
    expect(offers[0].payload).toMatchObject({ reason: 'Asked for a person', summary: 'Budget 50k, price concern', lead: { name: 'Karachi Bakers' }, modes: { web: true, phone: false } });
    expect(offers[0].payload.transcript).toHaveLength(4);
    const saved = (await CallRecord.findById(record._id).lean()).handoff;
    expect(saved.skipped).toEqual([expect.objectContaining({ reason: 'offline' })]);

    currentUser = ali;
    expect((await request(app).post(`/api/v1/ai-calling/transfer/${record._id}/accept`).send({ mode: 'web' })).status).toBe(409);
    currentUser = sara;
    const listed = await request(app).get('/api/v1/ai-calling/transfer/offers');
    expect(listed.body.data.map(o => o.recordId)).toContain(String(record._id));
    const accepted = await request(app).post(`/api/v1/ai-calling/transfer/${record._id}/accept`).send({ mode: 'web' });
    currentUser = owner;
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.join).toMatchObject({ url: 'wss://voice.example.test', token: `jwt-for-human-${sara}`, roomName: `crm-call-${internalCallId}` });

    const status = await request(app).get(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).set('Authorization', `Bearer ${token}`);
    expect(status.body.data).toMatchObject({ status: 'accepted', mode: 'web', targetName: 'Sara Agent', fallback: null });
    await request(app).post(`/api/v1/ai-calling/agent/${internalCallId}/transfer/joined`).set('Authorization', `Bearer ${token}`).send({});
    // A second request in the same call returns the same outcome (one transfer per call).
    const repeat = await request(app).post(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).set('Authorization', `Bearer ${token}`).send({});
    expect(repeat.body.data).toMatchObject({ status: 'accepted', repeated: true });

    // Long human conversations are not cut off by the max-duration reconciler.
    await CallRecord.updateOne({ _id: record._id }, { $set: { answeredAt: new Date(Date.now() - 3600_000) } });
    await calling.reconcileStuckCalls();
    expect((await CallRecord.findById(record._id).lean()).resultsProcessedAt).toBeNull();
    await CallRecord.updateOne({ _id: record._id }, { $set: { endedAt: new Date() } });
    const after = await transfer.afterCall(record._id);
    expect(after).toEqual({ handoff: true, status: 'accepted' });
    const done = (await CallRecord.findById(record._id).lean()).handoff;
    expect(done.joinedAt).toBeTruthy();
    expect(done.events.map(e => e.type)).toEqual(['requested', 'offered', 'accepted', 'joined', 'completed']);
    expect(createTask).not.toHaveBeenCalled();
  });

  it('nobody accepts in time → timeout, fallback, late accept refused, inbox follow-up + owner notified after the call', async () => {
    transfer.presenceProbe = online([sara, ali]);
    const { internalCallId, token, record } = await setupCall({ transferConfig: config([sara, ali]) });
    await request(app).post(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).set('Authorization', `Bearer ${token}`).send({ reason: 'Needs custom quote' });
    transfer.now = () => new Date(Date.now() + 25_000);
    const status = await request(app).get(`/api/v1/ai-calling/agent/${internalCallId}/transfer`).set('Authorization', `Bearer ${token}`);
    expect(status.body.data).toMatchObject({ status: 'timeout', fallback: { language: 'ur' } });
    expect(emitted.filter(e => e.event === 'ai-calling:transfer-closed')).toHaveLength(2);
    transfer.now = () => new Date();
    currentUser = sara;
    expect((await request(app).post(`/api/v1/ai-calling/transfer/${record._id}/accept`).send({})).status).toBe(409);
    currentUser = owner;

    // The caller asked to be called back tomorrow at 3 pm; the call ends.
    await calling.agentRequestCallback(internalCallId, { when: 'kal 3 baje', note: 'after transfer fallback' });
    await calling.agentEndCall(internalCallId, {});
    const handoff = (await CallRecord.findById(record._id).lean()).handoff;
    expect(handoff.fallback.followUp).toMatchObject({ state: 'created', kind: 'follow_up', preferredTime: 'kal 3 baje · after transfer fallback' });
    const { default: LeadFollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js');
    const followUps = await LeadFollowUp.find({ sourceKey: `ai_call_transfer:${record._id}` }).lean();
    expect(followUps).toHaveLength(1);
    expect(followUps[0]).toMatchObject({ status: 'open', channel: 'phone', source: { type: 'ai_call', requestedTimeText: 'kal 3 baje · after transfer fallback' } });
    expect(String(followUps[0].source.callRecordId)).toBe(String(record._id));
    expect(createTask).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'ai_calling.transfer_fallback', idempotencyKey: `ai-call-transfer-fallback-${record._id}` }), owner);
    // Idempotent: a second post-call pass creates nothing new.
    expect((await transfer.afterCall(record._id)).followUp).toBe('already_handled');
    expect(await LeadFollowUp.countDocuments({ sourceKey: `ai_call_transfer:${record._id}` })).toBe(1);
  });

  it('everyone declines → declined; outside working hours / unavailable → unavailable with reasons', async () => {
    transfer.presenceProbe = online([sara, ali]);
    const a = await setupCall({ transferConfig: config([sara, ali]) });
    await transfer.requestTransfer(a.internalCallId, { reason: 'r' });
    await transfer.decline(a.record._id, sara);
    expect((await CallRecord.findById(a.record._id).lean()).handoff.status).toBe('ringing');
    await transfer.decline(a.record._id, ali);
    expect((await transfer.transferStatus(a.internalCallId)).status).toBe('declined');

    await transfer.setPresence(sara, { workingHours: { timezone: 'UTC', start: '00:00', end: '00:01' } });
    await transfer.setPresence(ali, { available: false });
    const b = await setupCall({ transferConfig: config([sara, ali]) });
    const res = await transfer.requestTransfer(b.internalCallId, {});
    expect(res).toMatchObject({ status: 'unavailable', reason: 'NO_AVAILABLE_HUMAN' });
    expect((await CallRecord.findById(b.record._id).lean()).handoff.skipped.map(s => s.reason)).toEqual(['outside_working_hours', 'not_available']);
    await transfer.setPresence(sara, { workingHours: null });
    await transfer.setPresence(ali, { available: true });
  });

  it('phone mode: SIP REFER via LiveKit after the agent speaks; a rejected transfer falls back', async () => {
    transfer.presenceProbe = online([ali]);
    await transfer.setPresence(ali, { phone: '+923004445566' });
    const ok = await setupCall({ transferConfig: config([ali]) });
    await transfer.requestTransfer(ok.internalCallId, {});
    expect(emitted.find(e => e.event === 'ai-calling:transfer-offer').payload.modes).toEqual({ web: true, phone: true });
    await transfer.accept(ok.record._id, ali, { mode: 'phone' });
    const res = await request(app).post(`/api/v1/ai-calling/agent/${ok.internalCallId}/transfer/execute`).set('Authorization', `Bearer ${ok.token}`).send({});
    expect(res.body.data).toEqual({ status: 'transferred' });
    expect(twirp).toHaveBeenCalledWith('SIP', 'TransferSIPParticipant', { participant_identity: `sip-${ok.internalCallId}`, room_name: `crm-call-${ok.internalCallId}`, transfer_to: 'tel:+923004445566', play_dialtone: false }, `crm-call-${ok.internalCallId}`);

    // While on that transferred call Ali is busy; the SIP leg leaving ends the call and frees him.
    const busy = await setupCall({ transferConfig: config([ali]) });
    expect((await transfer.requestTransfer(busy.internalCallId, {})).status).toBe('unavailable');
    await CallRecord.updateOne({ _id: ok.record._id }, { $set: { endedAt: new Date() } });
    await transfer.afterCall(ok.record._id);

    twirp.mockResolvedValueOnce({ response: { ok: false, status: 412 }, json: { msg: 'trunk does not allow REFER' } });
    const bad = await setupCall({ transferConfig: config([ali]) });
    await transfer.requestTransfer(bad.internalCallId, {});
    await transfer.accept(bad.record._id, ali, { mode: 'phone' });
    const failed = await transfer.executePhoneTransfer(bad.internalCallId);
    expect(failed).toMatchObject({ status: 'failed', failure: 'SIP_TRANSFER_REJECTED', fallback: { language: 'ur' } });
    expect((await CallRecord.findById(bad.record._id).lean()).handoff.failure).toMatchObject({ code: 'SIP_TRANSFER_REJECTED', message: 'trunk does not allow REFER' });

    // Web-only calls cannot be phone-transferred; paired-phone calls cannot be transferred at all.
    const web = await setupCall({ provider: 'livekit_web', transferConfig: config([ali]) });
    await transfer.requestTransfer(web.internalCallId, {});
    await expect(transfer.accept(web.record._id, ali, { mode: 'phone' })).rejects.toThrow(/Phone transfer is not available/);
    const paired = await setupCall({ provider: 'paired_phone', transferConfig: config([ali]) });
    expect(await transfer.requestTransfer(paired.internalCallId, {})).toMatchObject({ status: 'unavailable', reason: 'TRANSPORT_UNSUPPORTED' });
  });

  it('accepted but never joined counts as failed and gets the follow-up', async () => {
    transfer.presenceProbe = online([sara]);
    const { internalCallId, record } = await setupCall({ transferConfig: config([sara]) });
    await transfer.requestTransfer(internalCallId, {});
    await transfer.accept(record._id, sara, { mode: 'web' });
    await CallRecord.updateOne({ _id: record._id }, { $set: { endedAt: new Date() } });
    const after = await transfer.afterCall(record._id);
    expect(after).toMatchObject({ status: 'failed', followUp: 'created' });
    expect((await CallRecord.findById(record._id).lean()).handoff.failure.code).toBe('HUMAN_NEVER_JOINED');
  });

  it('presence + agent transfer settings over HTTP', async () => {
    currentUser = sara;
    const res = await request(app).put('/api/v1/ai-calling/transfer/presence').send({ available: true, phone: '+923001231234', workingHours: { timezone: 'Asia/Karachi', days: ['mon', 'tue'], start: '09:00', end: '18:00' } });
    currentUser = owner;
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ available: true, phone: '+923001231234', online: true });
    const { agent } = await setupCall();
    const bad = await request(app).put(`/api/v1/ai-calling/agents/${agent._id}/transfer`).send({ enabled: true, targetUserIds: [] });
    expect(bad.status).toBe(400);
    const ok = await request(app).put(`/api/v1/ai-calling/agents/${agent._id}/transfer`).send({ enabled: true, targetUserIds: [String(sara)], timeoutSeconds: 45 });
    expect(ok.status).toBe(200);
    expect(ok.body.data.transfer).toMatchObject({ enabled: true, timeoutSeconds: 45 });
    const targets = await request(app).get('/api/v1/ai-calling/transfer/targets');
    expect(targets.body.data.find(t => t._id === String(sara))).toMatchObject({ name: 'Sara Agent', available: true, hasPhone: true });
  });
});
