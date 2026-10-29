import express from 'express';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';
const actor = new mongoose.Types.ObjectId();
const outsider = new mongoose.Types.ObjectId();
const addJob = jest.fn(async () => ({}));
const dial = jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: crypto.randomUUID() }));
const health = jest.fn(async () => ({ configured: true, eligible: true }));
const queueStats = jest.fn(async () => ({ workers: 1 }));
const audit = jest.fn();
let Files;
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, getQueueStats: queueStats } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: audit } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: req.get('x-owner') || actor }; next(); },
  requirePermission: permission => (req, res, next) => permission === 'ai-calling:write' && req.get('x-read-only') ? res.status(403).json({ forbidden: true }) : next(),
}));
jest.unstable_mockModule('../../src/shared/middleware/rateLimiter.js', () => ({ uploadLimiter: (_req, _res, next) => next() }));
jest.unstable_mockModule('../../src/shared/storage/StorageService.js', () => ({ default: { getPresignedUrl: async key => `https://storage.test/${key}` } }));
jest.unstable_mockModule('../../src/modules/files/file.service.js', () => ({ default: {
  upload: async input => { return Files.create({ ...input, key: `avatars/${crypto.randomUUID()}`, originalName: input.originalName }); },
} }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } eligibleFor() { return false; } async health() { return { configured: false, eligible: false }; } },
  default: { configured: true, health, createOutboundCall: (...args) => dial(...args), roomStatus: async () => 'unknown', endCall: async () => ({ ended: true }) },
}));

let db; let service; let calling; let Campaign; let Calls; let Lead; let app; let migration;
const questions = [{ fieldKey: 'interest', label: 'Interest', text: 'Are you interested?', type: 'boolean', required: true, order: 1 }];
const fullInput = () => ({
  name: 'Sarah Sales', title: 'Qualification Agent', description: 'Qualifies interest', availability: 'active',
  agentConfig: { organizationName: 'Updata', disclosure: 'I am an AI assistant for {company}.', objective: 'Qualify interest', voice: 'coral', language: 'en' },
  questionnaire: { questions }, statusRules: [{ id: 'qualified', when: { all: [{ field: 'interest', equals: true }] }, action: 'mark_qualified' }],
  schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 2 },
});
async function lead(extra = {}) {
  return Lead.create({ leadNumber: `A-${crypto.randomUUID()}`, name: 'Real CRM fixture', source: 'manual', mobile: '+41791234567', address: { country: 'CH' }, createdBy: actor, ...extra });
}
async function ready(extra = {}) {
  let agent = await service.create({ ...fullInput(), ...extra }, actor);
  const selected = await lead();
  agent = await service.assign(agent._id, { leadIds: [String(selected._id)], version: agent.version }, actor);
  return { agent, selected };
}
const launchInput = extra => ({ idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true, ...extra });

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  service = (await import('../../src/modules/aiCalling/callingAgent.service.js')).default;
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  Campaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  Calls = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  Files = (await import('../../src/modules/files/file.model.js')).default;
  migration = await import('../../src/migrations/031_calling_agents.js');
  await migration.up();
  app = express(); app.use(express.json());
  app.use((await import('../../src/shared/middleware/responseEnvelope.js')).default);
  app.use('/ai-calling', (await import('../../src/modules/aiCalling/aiCalling.routes.js')).default);
  app.use((await import('../../src/shared/middleware/errorHandler.js')).default);
});
afterAll(async () => { await mongoose.disconnect(); if (db) await db.stop(); });
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  addJob.mockClear(); dial.mockClear(); health.mockResolvedValue({ configured: true, eligible: true }); queueStats.mockResolvedValue({ workers: 1 });
  process.env.AI_CALLING_REQUIRE_CONSENT = 'false'; process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
});


const usage = { modelUsage: [{
  type: 'llm_usage', provider: 'openai', model: 'gpt-realtime',
  inputTokens: 12000, inputAudioTokens: 10000, inputCachedAudioTokens: 4000, inputTextTokens: 2000, inputCachedTokens: 4000,
  outputTokens: 3000, outputAudioTokens: 2500, outputTextTokens: 500,
}] };
// 6000*32 + 4000*0.4 + 2000*4 + 2500*64 + 500*16 = 192000+1600+8000+160000+8000 = 369600 per 1M → $0.3696
const MODEL_COST = 0.3696;

async function answeredCall({ minutes = 90, behavior = { tone: 'positive', evidence: 'Sounds great' } } = {}) {
  const { agent, selected } = await ready();
  const campaign = await service.launch(agent._id, launchInput(), actor);
  await calling.tickCampaign(campaign._id, campaign.tickToken);
  const record = await Calls.findOne({ campaignId: campaign._id });
  await calling.agentAnswered(record.internalCallId);
  await calling.agentDisclose(record.internalCallId);
  await calling.agentRecordAnswer(record.internalCallId, { fieldKey: 'interest', rawAnswer: 'yes' });
  await calling.agentEndCall(record.internalCallId, {
    durationSeconds: minutes, cost: { amount: 0, currency: 'USD', breakdown: { usage } },
    callNotes: { description: 'Intro call', summary: 'Lead is interested.', blockers: [], behavior },
  });
  return { agent, selected, campaign, record: await Calls.findById(record._id).lean() };
}

describe('per-call cost engine', () => {
  let cost;
  beforeAll(async () => { cost = await import('../../src/modules/aiCalling/engine/callCost.js'); });

  it('prices realtime audio/text tokens at list rates, discounting cached input', () => {
    const out = cost.computeCallCost({ usage, durationSeconds: 90, provider: 'livekit_web', isTest: true }, {});
    expect(out.amount).toBeCloseTo(MODEL_COST, 6);
    expect(out.breakdown).toMatchObject({ source: 'token_usage', estimate: true, model: 'gpt-realtime', pricedAs: 'gpt-realtime', billedMinutes: 2 });
    expect(out.breakdown.tokens).toMatchObject({ inputAudio: 10000, inputCachedAudio: 4000, inputText: 2000, outputAudio: 2500, outputText: 500, total: 15000 });
    expect(out.breakdown.components).toMatchObject({ telephony: 0, platform: 0 });
  });

  it('adds configured carrier minutes only on real carrier legs, and platform minutes always', () => {
    const env = { AI_CALLING_TELEPHONY_COST_PER_MINUTE: '0.02', AI_CALLING_PLATFORM_COST_PER_MINUTE: '0.01' };
    const sip = cost.computeCallCost({ usage, durationSeconds: 61, provider: 'livekit_sip' }, env);
    expect(sip.breakdown.components).toMatchObject({ telephony: 0.04, platform: 0.02 });
    expect(sip.amount).toBeCloseTo(MODEL_COST + 0.06, 6);
    expect(cost.computeCallCost({ usage, durationSeconds: 61, provider: 'paired_phone' }, env).breakdown.components.telephony).toBe(0);
    expect(cost.computeCallCost({ usage, durationSeconds: 61, provider: 'livekit_web', isTest: true }, env).breakdown.components.telephony).toBe(0);
  });

  it('resolves revisions by prefix, honours JSON overrides, and never prices an unknown model', () => {
    expect(cost.resolvePricing('gpt-realtime-2025-08-28').pricedAs).toBe('gpt-realtime');
    expect(cost.resolvePricing('gpt-realtime-mini-2025-10-06').pricedAs).toBe('gpt-realtime-mini');
    const custom = cost.computeCallCost({ usage }, { AI_CALLING_MODEL_PRICING: '{"gpt-realtime":{"audioIn":0,"audioCachedIn":0,"audioOut":0,"textIn":0,"textCachedIn":0,"textOut":1000000}}' });
    expect(custom.amount).toBe(500);
    const unknown = cost.computeCallCost({ usage: { modelUsage: [{ ...usage.modelUsage[0], model: 'other-llm' }] } }, {});
    expect(unknown).toMatchObject({ amount: 0, breakdown: { unpriced: true, tokens: { total: 15000 } } });
  });

  it('derives the text split from totals when LiveKit omitted zero-valued detail fields', () => {
    const s = cost.summarizeUsage({ modelUsage: [{ type: 'llm_usage', model: 'gpt-realtime', inputTokens: 500, outputTokens: 300, outputAudioTokens: 200 }] });
    expect(s.tokens).toMatchObject({ inputAudio: 0, inputText: 500, outputAudio: 200, outputText: 100, total: 800 });
  });
});

describe('agent call analytics', () => {
  it('identifies estimates and scope instead of claiming they are reconciled OpenAI charges', async () => {
    const { agent } = await answeredCall();
    const result = await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).expect(200);
    expect(result.body.data.billing).toMatchObject({ status: 'not_reconciled', timezone: 'UTC', modelEstimate: MODEL_COST, additionalEstimate: 0, unpricedCalls: 0, foreignCurrencyCalls: 0 });
    expect(result.body.data.billing.excludes).toContain('input_transcription');
  });

  it('recalculates old token estimates from evidence while preserving an explicit provider amount', async () => {
    const { pricedCost } = await import('../../src/modules/aiCalling/callAnalytics.service.js');
    const base = { durationSeconds: 90, provider: 'livekit_web', isTest: true };
    expect(pricedCost({ ...base, cost: { amount: 99, breakdown: { estimate: true, source: 'token_usage', usage } } }, {}).amount).toBeCloseTo(MODEL_COST, 6);
    expect(pricedCost({ ...base, cost: { amount: 0.02, currency: 'USD', breakdown: { source: 'provider_reported', usage } } }, {}).amount).toBe(0.02);
  });

  it('previews stored-estimate repair without replacing provider totals or current priced estimates', async () => {
    const { repairedEstimate } = await import('../../scripts/reprice-call-estimates.mjs');
    const original = { durationSeconds: 90, cost: { amount: 99, currency: 'USD', breakdown: { estimate: true, source: 'token_usage', usage } } };
    const fixed = repairedEstimate(original, {});
    expect(fixed.amount).toBeCloseTo(MODEL_COST, 6);
    expect(original.cost.amount).toBe(99);
    expect(fixed.breakdown.usage).toEqual(usage);
    expect(repairedEstimate({ ...original, cost: fixed }, {})).toBeNull();
    expect(repairedEstimate({ ...original, cost: { ...original.cost, breakdown: { source: 'provider_reported', usage } } }, {})).toBeNull();
  });

  it('does not price the photographed legacy usage with the current server default when model metadata is blank', async () => {
    const { pricedCost } = await import('../../src/modules/aiCalling/callAnalytics.service.js');
    const usageWithoutModel = { modelUsage: [{ type: 'llm_usage', model: '', provider: '',
      inputTokens: 101210, inputCachedTokens: 55552, inputAudioTokens: 12937, inputCachedAudioTokens: 5312,
      inputTextTokens: 88273, inputCachedTextTokens: 50240, outputTokens: 2657, outputAudioTokens: 1555, outputTextTokens: 1102 }] };
    const result = pricedCost({ durationSeconds: 208, provider: 'paired_phone', cost: { amount: 0, currency: 'USD', breakdown: { usage: usageWithoutModel } } }, { OPENAI_REALTIME_MODEL: 'gpt-realtime' });
    expect(result).toMatchObject({ amount: 0, unpriced: true, model: null });
    const legacy = pricedCost({ durationSeconds: 208, cost: { amount: 99, breakdown: { usage: usageWithoutModel, tokens: {}, estimate: true, model: 'gpt-realtime', source: 'token_usage' } } }, {});
    expect(legacy).toMatchObject({ amount: 0, unpriced: true, model: null });
  });

  it('does not add another currency to USD totals and uses an exclusive period end', async () => {
    const { agent, record } = await answeredCall();
    await Calls.collection.updateOne({ _id: record._id }, { $set: { createdAt: new Date('2026-10-29T00:00:00Z'), cost: { amount: 100, currency: 'CHF', breakdown: { source: 'provider_reported' } } } });
    let response = await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).expect(200);
    expect(response.body.data.totals.totalCost).toBe(0);
    expect(response.body.data.billing.foreignCurrencyCalls).toBe(1);
    expect(response.body.data.calls[0].cost).toMatchObject({ amount: 100, currency: 'CHF' });
    response = await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics?from=2026-10-28T00:00:00Z&to=2026-10-29T00:00:00Z`).expect(200);
    expect(response.body.data.totals.calls).toBe(0);
  });

  it('stores the priced cost and the agent-observed tone on the call record at /end', async () => {
    const { record } = await answeredCall();
    expect(record.cost.amount).toBeCloseTo(MODEL_COST, 6);
    expect(record.cost.breakdown).toMatchObject({ source: 'token_usage', usage, tokens: { total: 15000 } });
    expect(record.callNotes.behavior).toEqual({ tone: 'positive', evidence: 'Sounds great' });
    expect((await Campaign.findById(record.campaignId).lean()).summary.actualCost).toBeCloseTo(MODEL_COST, 4);
  });

  it('distinguishes a recorded free call from missing billing evidence', async () => {
    const { agent, record } = await answeredCall();
    await Calls.updateOne({ _id: record._id }, { $set: { cost: { amount: 0, currency: 'USD', breakdown: { source: 'provider_reported' } } } });
    let a = (await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).expect(200)).body.data;
    expect(a.billing.unpricedCalls).toBe(0);
    expect(a.totals.callsWithoutCost).toBe(0);
    await Calls.updateOne({ _id: record._id }, { $set: { cost: { amount: 0, currency: 'USD', breakdown: null } } });
    a = (await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).expect(200)).body.data;
    expect(a.billing.unpricedCalls).toBe(1);
    expect(a.calls[0].cost.unpriced).toBe(true);
    expect(a.totals.callsWithoutCost).toBe(1);
  });

  it('reports per-call, per-lead and averaged cost, tokens, duration and behaviour over HTTP', async () => {
    const { agent, selected, record } = await answeredCall();
    const res = await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).expect(200);
    const a = res.body.data;
    expect(a.totals).toMatchObject({ calls: 1, connected: 1, leads: 1, totalSeconds: 90, avgDurationSeconds: 90, callsWithUsage: 1 });
    expect(a.totals.totalCost).toBeCloseTo(MODEL_COST, 6);
    expect(a.totals.avgCostPerCall).toBeCloseTo(MODEL_COST, 6);
    expect(a.totals.avgCostPerLead).toBeCloseTo(MODEL_COST, 6);
    expect(a.totals.costPerMinute).toBeCloseTo(MODEL_COST / 1.5, 6);
    expect(a.totals.tokens.total).toBe(15000); expect(a.totals.avgTokensPerCall).toBe(15000);
    expect(a.tone.positive).toBe(1);
    expect(a.leads[0]).toMatchObject({ leadId: String(selected._id), calls: 1, connected: 1, lastTone: 'positive', lastSummary: 'Lead is interested.' });
    expect(a.calls[0]).toMatchObject({ id: String(record._id), durationSeconds: 90, summary: 'Lead is interested.', behavior: { outcome: expect.any(String), tone: 'positive' } });
    expect(a.calls[0].behavior.participation).toBeDefined();

    const csv = await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics/export`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toContain('totalTokens'); expect(csv.text).toContain('Lead is interested.');
  });

  it('prices calls stored before pricing existed from their raw usage, and keeps test spend out of averages', async () => {
    const { agent, record } = await answeredCall();
    await Calls.updateOne({ _id: record._id }, { $set: { cost: { amount: 0, currency: 'USD', breakdown: { usage } } } });
    await Calls.create({ ...record, _id: undefined, internalCallId: crypto.randomUUID(), attemptNumber: -1, isTest: true, provider: 'livekit_web',
      cost: { amount: 1, currency: 'USD', breakdown: null } });
    const a = (await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).expect(200)).body.data;
    expect(a.totals.calls).toBe(1); expect(a.totals.totalCost).toBeCloseTo(MODEL_COST, 6);
    expect(a.testing).toMatchObject({ calls: 1, totalCost: 1 });
  });

  it('is owner-scoped and validates the date range', async () => {
    const { agent } = await answeredCall();
    await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics`).set('x-owner', String(outsider)).expect(404);
    await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics?from=2026-10-10&to=2026-10-01`).expect(400);
    const empty = (await request(app).get(`/ai-calling/agents/${agent._id}/call-analytics?from=2020-01-01&to=2020-01-02`).expect(200)).body.data;
    expect(empty.totals).toMatchObject({ calls: 0, totalCost: 0, avgCostPerCall: null });
  });
});
