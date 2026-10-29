import express from 'express';
import crypto from 'node:crypto';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { serve } from '../helpers/serve.js';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';
const actor = new mongoose.Types.ObjectId();
const outsider = new mongoose.Types.ObjectId();
const addJob = jest.fn(async () => ({}));
const notify = jest.fn(async () => ({}));
const audit = jest.fn();
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, getQueueStats: jest.fn(async () => ({ workers: 1 })) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: audit } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
// x-perms: comma list of granted permissions (default: all).
jest.unstable_mockModule('../../src/shared/middleware/authenticate.js', () => ({
  authenticate: (req, _res, next) => { req.user = { _id: req.get('x-owner') || actor }; next(); },
  requirePermission: permission => (req, res, next) => {
    const granted = req.get('x-perms');
    return granted && !granted.split(',').includes(permission) ? res.status(403).json({ forbidden: permission }) : next();
  },
}));
jest.unstable_mockModule('../../src/shared/middleware/rateLimiter.js', () => ({ uploadLimiter: (_req, _res, next) => next() }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } eligibleFor() { return false; } async health() { return { configured: false, eligible: false }; } },
  default: { configured: true, health: async () => ({ configured: true, eligible: true }), createOutboundCall: async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: crypto.randomUUID() }), roomStatus: async () => 'unknown', endCall: async () => ({ ended: true }) },
}));

let db; let app; let agents; let calling; let quality; let benchmarks; let experiments; let stats; let resolver;
let Calls; let Lead; let Campaign; let Experiment; let Version; let Run; let Case; let issueAgentToken;
const questions = [{ fieldKey: 'interest', label: 'Interest', text: 'Are you interested?', type: 'boolean', required: true, order: 1 }];
const agentInput = () => ({
  name: 'Sarah Sales', title: 'Qualifier', description: 'Qualifies interest', availability: 'active',
  agentConfig: { organizationName: 'Updata', disclosure: 'I am an AI assistant for {company}.', objective: 'Qualify interest', voice: 'coral', language: 'en' },
  questionnaire: { questions }, statusRules: [{ id: 'qualified', when: { all: [{ field: 'interest', equals: true }] }, action: 'mark_qualified' }],
  schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 2 },
});
const newLead = (extra = {}) => Lead.create({ leadNumber: `A-${crypto.randomUUID()}`, name: 'Fixture lead', source: 'manual', mobile: `+4179${Math.floor(1e6 + Math.random() * 8e6)}`, address: { country: 'CH' }, createdBy: actor, ...extra });
const api = () => request(serve(app));

async function readyAgent() {
  let agent = await agents.create(agentInput(), actor);
  const lead = await newLead();
  agent = await agents.assign(agent._id, { leadIds: [String(lead._id)], version: agent.version }, actor);
  return { agent, lead };
}
async function dialOnce(agent) {
  const campaign = await agents.launch(agent._id, { idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true }, actor);
  await calling.tickCampaign(campaign._id, campaign.tickToken);
  return { campaign, record: await Calls.findOne({ campaignId: campaign._id }) };
}
const telemetry = (over = {}) => ({
  version: 1, answered: true,
  latency: { p50Ms: 1, p95Ms: 1, maxMs: 1, samples: 3, samplesMs: [800, 1200, 2600], vadSilenceMs: 600 },
  modelTtft: { p50Ms: 400, p95Ms: 500, samples: 3 },
  interruptions: 1, bargeIns: 1, silenceEvents: 2,
  audioFailures: [{ type: 'room_reconnected', at: new Date().toISOString() }],
  transcript: { turns: 4, leadTurns: 2, agentTurns: 2, emptyTurns: 0, missing: false },
  languageDetected: 'ur', ...over,
});

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  agents = (await import('../../src/modules/aiCalling/callingAgent.service.js')).default;
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  quality = (await import('../../src/modules/aiCalling/callQuality.service.js')).default;
  benchmarks = (await import('../../src/modules/aiCalling/benchmark.service.js')).default;
  experiments = (await import('../../src/modules/aiCalling/scriptExperiment.service.js')).default;
  stats = await import('../../src/modules/aiCalling/engine/experimentStats.js');
  resolver = await import('../../src/modules/aiCalling/scriptVersionResolver.js');
  ({ issueAgentToken } = await import('../../src/modules/aiCalling/callAuth.js'));
  Calls = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Campaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  ({ ScriptExperiment: Experiment, AgentScriptVersion: Version } = await import('../../src/modules/aiCalling/scriptExperiment.model.js'));
  ({ BenchmarkRun: Run, BenchmarkCase: Case } = await import('../../src/modules/aiCalling/benchmark.model.js'));
  await (await import('../../src/migrations/031_calling_agents.js')).up();
  await (await import('../../src/migrations/035_calling_quality.js')).up();
  const routes = await import('../../src/modules/aiCalling/aiCalling.routes.js');
  app = express(); app.use(express.json());
  app.use((await import('../../src/shared/middleware/responseEnvelope.js')).default);
  app.use('/ai-calling/agent', routes.agentToolRoutes);
  app.use('/ai-calling', routes.default);
  app.use((await import('../../src/shared/middleware/errorHandler.js')).default);
});
afterAll(async () => { await mongoose.disconnect(); if (db) await db.stop(); });
beforeEach(async () => {
  for (const collection of Object.values(mongoose.connection.collections)) await collection.deleteMany({});
  addJob.mockClear(); notify.mockClear(); audit.mockClear(); resolver.__test__.clearCache();
});

// ------------------------------------------------------------------ telemetry + dashboard
describe('call quality telemetry', () => {
  it('persists the worker telemetry sent with /end (first report wins) and recomputes percentiles from samples', async () => {
    const { agent } = await readyAgent();
    const { record } = await dialOnce(agent);
    const auth = { Authorization: `Bearer ${issueAgentToken(record.internalCallId)}` };
    await api().post(`/ai-calling/agent/${record.internalCallId}/answered`).set(auth).send({}).expect(200);
    await api().post(`/ai-calling/agent/${record.internalCallId}/end`).set(auth).send({ durationSeconds: 40, quality: telemetry() }).expect(200);
    await calling.agentEndCall(record.internalCallId, {}); // a retried /end without telemetry
    await quality.recordTelemetry(record.internalCallId, telemetry({ interruptions: 9 }));
    const saved = await Calls.findById(record._id).lean();
    expect(saved.quality).toMatchObject({
      source: 'agent_worker', latency: { p50Ms: 1200, p95Ms: 2600, maxMs: 2600, samples: 3, vadSilenceMs: 600 },
      interruptions: 1, silenceEvents: 2, transcript: { leadTurns: 2, missing: false }, languageDetected: 'ur',
    });
    expect(saved.resultsProcessedAt).toBeTruthy();
  });

  it('rejects malformed telemetry at the boundary', async () => {
    const { agent } = await readyAgent();
    const { record } = await dialOnce(agent);
    const auth = { Authorization: `Bearer ${issueAgentToken(record.internalCallId)}` };
    await api().post(`/ai-calling/agent/${record.internalCallId}/end`).set(auth).send({ quality: { latency: { samplesMs: ['fast'] } } }).expect(400);
  });

  it('aggregates over answered calls, counts legacy calls as not recorded, flags problems and excludes tests', async () => {
    const { agent } = await readyAgent();
    const { record, campaign } = await dialOnce(agent);
    await calling.agentAnswered(record.internalCallId);
    await quality.recordTelemetry(record.internalCallId, telemetry({
      latency: { samplesMs: [900, 3500, 4000] }, transcript: { turns: 3, leadTurns: 0, agentTurns: 3, missing: true },
      audioFailures: [{ type: 'track_subscription_failed', at: new Date().toISOString() }],
    }));
    await calling.agentEndCall(record.internalCallId, { durationSeconds: 30 });
    await Calls.updateOne({ _id: record._id }, { $set: { intelligence: { version: 1, status: 'failed', items: [] } } });
    const base = (await Calls.findById(record._id).lean());
    const clone = extra => Calls.create({ ...base, _id: undefined, internalCallId: crypto.randomUUID(), attemptNumber: Math.floor(Math.random() * -1e6) - 1, quality: undefined, intelligence: undefined, ...extra });
    await clone({}); // legacy: no telemetry, no extraction
    await clone({ quality: { ...base.quality, latency: { ...base.quality.latency, samplesMs: [700], p50Ms: 700, p95Ms: 700 }, transcript: { turns: 2, leadTurns: 1, agentTurns: 1, missing: false }, audioFailures: [] }, transcript: [], intelligence: { version: 1, status: 'ok', items: [{ id: 'i1', category: 'budget', quote: 'fifty', turnIndex: 0, speaker: 'lead', status: 'user_rejected' }] } });
    await clone({ isTest: true, provider: 'livekit_web', quality: base.quality }); // test call
    await clone({ answeredAt: null }); // never answered

    const res = await api().get('/ai-calling/quality/summary').query({ campaignId: String(campaign._id), latencyThresholdMs: 3000 }).expect(200);
    const s = res.body.data;
    expect(s.totals).toMatchObject({ calls: 3, withTelemetry: 2, notRecorded: 1, flaggedCalls: 2 });
    expect(s.totals.latency).toMatchObject({ samples: 4, p50Ms: 900, p95Ms: 4000, highLatencyCalls: 1 });
    expect(s.totals.transcripts).toMatchObject({ recorded: 2, missing: 1, notPersisted: 1, missingRate: 0.5 });
    expect(s.totals.audio).toMatchObject({ callsWithFailures: 1, rate: 0.5 });
    expect(s.totals.extraction).toMatchObject({ recorded: 2, notRecorded: 1, errors: 2, rejectedItems: 1 });
    expect(Object.fromEntries(s.failureTypes.map(f => [f.type, f.calls]))).toMatchObject({ high_latency: 1, missing_transcript: 1, transcript_not_persisted: 1, audio_failure: 1, extraction_error: 2 });
    expect(s.breakdown.byLanguage.find(r => r.key === 'ur')).toMatchObject({ calls: 2 });
    expect(s.breakdown.byLanguage.find(r => r.key === 'en')).toMatchObject({ calls: 1, withTelemetry: 0 });
    expect(s.byDay[0]).toMatchObject({ calls: 3, withTelemetry: 2, samples: 4 });

    const flagged = await api().get('/ai-calling/quality/flagged').query({ campaignId: String(campaign._id), reason: 'audio_failure', latencyThresholdMs: 3000 }).expect(200);
    expect(flagged.body.data.calls).toHaveLength(1);
    expect(flagged.body.data.calls[0]).toMatchObject({ id: String(record._id), audioFailures: ['track_subscription_failed'], extraction: { status: 'failed', error: true } });
    expect(flagged.body.data.calls[0].flags).toEqual(expect.arrayContaining(['high_latency', 'missing_transcript', 'audio_failure', 'extraction_error']));
    const ur = await api().get('/ai-calling/quality/summary').query({ language: 'ur' }).expect(200);
    expect(ur.body.data.totals.calls).toBe(2);
    const other = await api().get('/ai-calling/quality/summary').set('x-owner', String(outsider)).expect(200);
    expect(other.body.data.totals.calls).toBe(0);
    expect(other.body.data.totals.latency.p50Ms).toBeNull();
  });
});

// ------------------------------------------------------------------ benchmarks
describe('benchmarks', () => {
  it('seeds an unreviewed SAMPLE suite that produces no official score until a reviewer approves a case', async () => {
    const seeded = (await api().post('/ai-calling/benchmarks/suites/sample').expect(201)).body.data;
    expect(seeded.caseList.length).toBeGreaterThanOrEqual(6);
    expect(seeded.caseList.every(c => c.sample && !c.reviewed)).toBe(true);
    expect((await api().post('/ai-calling/benchmarks/suites/sample').expect(201)).body.data.existing).toBe(true);

    const run = (await api().post(`/ai-calling/benchmarks/suites/${seeded._id}/runs`).send({ label: 'baseline' }).expect(202)).body.data;
    expect(addJob).toHaveBeenCalledWith('ai-calling-benchmark', 'run', { runId: String(run._id) }, expect.any(Object));
    await benchmarks.processRun(run._id);
    expect(await benchmarks.processRun(run._id)).toEqual({ skipped: true });
    const done = (await api().get(`/ai-calling/benchmarks/runs/${run._id}`).expect(200)).body.data;
    expect(done).toMatchObject({ status: 'completed', extractor: 'not requested', metrics: { overall: { cases: 0, fieldAccuracy: null }, unreviewedExcluded: seeded.caseList.length } });
    expect(done.caseResults.every(r => r.scored === false)).toBe(true);

    // Approval needs ai-calling:admin and the exact revision the reviewer saw.
    const english = seeded.caseList.find(c => c.title.includes('English, clean'));
    await api().post(`/ai-calling/benchmarks/cases/${english._id}/review`).set('x-perms', 'ai-calling:read,ai-calling:write').send({ approved: true, revision: 1 }).expect(403);
    await api().post(`/ai-calling/benchmarks/cases/${english._id}/review`).send({ approved: true, revision: 2 }).expect(409);
    await api().post(`/ai-calling/benchmarks/cases/${english._id}/review`).send({ approved: true, revision: 1, note: 'Checked' }).expect(200);
    const urdu = seeded.caseList.find(c => c.title.includes('Roman Urdu'));
    await api().post(`/ai-calling/benchmarks/cases/${urdu._id}/review`).send({ approved: true, revision: 1 }).expect(200);

    const second = (await api().post(`/ai-calling/benchmarks/suites/${seeded._id}/runs`).send({ label: 'reviewed' }).expect(202)).body.data;
    await benchmarks.processRun(second._id);
    const scored = await Run.findById(second._id).lean();
    expect(scored.metrics.overall).toMatchObject({ cases: 2, expectedFields: 10 });
    // English: 5/5; Roman Urdu: 5/5 ("30 hazar" → 30000) → 10/10.
    expect(scored.metrics.overall.fieldAccuracy).toBe(1);
    expect(scored.metrics.byLanguage.en.fieldAccuracy).toBe(1);
    expect(scored.metrics.byLanguage.ur).toMatchObject({ fieldAccuracy: 1, wrongRate: 0 });

    const cmp = (await api().get('/ai-calling/benchmarks/runs/compare').query({ a: String(run._id), b: String(second._id) }).expect(200)).body.data;
    expect(cmp.overall.fieldAccuracy).toEqual({ a: null, b: 1, delta: null });
    expect(cmp.sameSuite).toBe(true);
  });

  it('editing a reviewed case withdraws its approval; validates field keys and ownership', async () => {
    const suite = (await api().post('/ai-calling/benchmarks/suites').send({ name: 'Real calls', questionnaire: { questions: [{ fieldKey: 'interest', type: 'boolean' }] } }).expect(201)).body.data;
    await api().post(`/ai-calling/benchmarks/suites/${suite._id}/cases`).send({ title: 'x', language: 'en', turns: [{ speaker: 'lead', text: 'yes' }], groundTruth: { answers: [{ fieldKey: 'nope', expected: 1 }] } }).expect(400);
    const created = (await api().post(`/ai-calling/benchmarks/suites/${suite._id}/cases`).send({ title: 'Consented call 1', language: 'mixed', conditions: ['noise'], turns: [{ speaker: 'lead', text: 'haan ji' }], groundTruth: { answers: [{ fieldKey: 'interest', expected: true }] } }).expect(201)).body.data;
    await api().post(`/ai-calling/benchmarks/cases/${created._id}/review`).send({ approved: true, revision: 1 }).expect(200);
    const renamed = (await api().patch(`/ai-calling/benchmarks/cases/${created._id}`).send({ title: 'Renamed' }).expect(200)).body.data;
    expect(renamed).toMatchObject({ reviewed: true, revision: 1 });
    const edited = (await api().patch(`/ai-calling/benchmarks/cases/${created._id}`).send({ groundTruth: { answers: [{ fieldKey: 'interest', expected: false }] } }).expect(200)).body.data;
    expect(edited).toMatchObject({ reviewed: false, revision: 2, reviewedAt: null });
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ai_calling.benchmark.case_updated', details: expect.objectContaining({ reviewWithdrawn: true }) }));
    await api().get(`/ai-calling/benchmarks/suites/${suite._id}`).set('x-owner', String(outsider)).expect(404);
    await api().patch(`/ai-calling/benchmarks/cases/${created._id}`).set('x-owner', String(outsider)).send({ title: 'x' }).expect(404);
  });

  it('a failed queue marks the run failed instead of leaving it queued; stale running runs are failed by the sweep', async () => {
    const suite = await benchmarks.seedSampleSuite(actor);
    addJob.mockRejectedValueOnce(new Error('redis down'));
    await api().post(`/ai-calling/benchmarks/suites/${suite._id}/runs`).send({}).expect(409);
    expect((await Run.findOne({ suiteId: suite._id }).lean())).toMatchObject({ status: 'failed' });
    await Run.create({ suiteId: suite._id, status: 'running', startedAt: new Date(Date.now() - 3_600_000), createdBy: actor });
    expect(await benchmarks.failStaleRuns()).toBe(1);
  });

  it('runs the extractor through the injected loader and scores its accepted items', async () => {
    const suite = await benchmarks.seedSampleSuite(actor);
    const english = suite.caseList.find(c => c.title.includes('English, clean'));
    await benchmarks.reviewCase(english._id, { approved: true, revision: 1 }, actor);
    const run = await benchmarks.createRun(suite._id, { includeExtractor: true }, actor);
    await benchmarks.processRun(run._id, { extractorLoader: async () => ({ fn: async () => ({ items: [{ category: 'budget', value: 50000 }] }), name: 'fake' }) });
    const done = await Run.findById(run._id).lean();
    expect(done.extractor).toBe('fake');
    expect(done.metrics.overall.extraction).toEqual({ cases: 1, precision: 1, recall: 1 });
  });

  it('reports the real extractor as unavailable when no AI provider is configured (never faked)', async () => {
    const { loadExtractor } = await import('../../src/modules/aiCalling/benchmark.service.js');
    const extractor = await loadExtractor();
    if (!extractor.fn) { expect(extractor.name).toMatch(/not available|no compatible/); return; }
    expect(extractor.name).toMatch(/^callIntelligence/);
    const llm = await import('../../src/shared/ai/llmFactory.js');
    if (!llm.isAiConfigured()) await expect(extractor.fn({ transcript: [{ role: 'customer', text: 'hi' }] })).rejects.toThrow(/not configured/);
  });
});

// ------------------------------------------------------------------ experiments
describe('script experiments', () => {
  it('assigns leads deterministically and close to the configured split; z-test labels small samples underpowered', () => {
    const arms = [{ key: 'control', weight: 70 }, { key: 'variant_1', weight: 30 }];
    const exp = new mongoose.Types.ObjectId().toString();
    const counts = { control: 0, variant_1: 0 };
    for (let i = 0; i < 4000; i++) counts[stats.assignArm(arms, `lead-${i}`, exp).key] += 1;
    expect(counts.variant_1 / 4000).toBeGreaterThan(0.27);
    expect(counts.variant_1 / 4000).toBeLessThan(0.33);
    expect(stats.assignArm(arms, 'lead-7', exp).key).toBe(stats.assignArm(arms, 'lead-7', exp).key);
    const big = stats.twoProportionTest({ x1: 300, n1: 1000, x2: 360, n2: 1000 });
    expect(big).toMatchObject({ diff: 0.06, underpowered: false, significant: true });
    expect(big.pValue).toBeLessThan(0.01);
    expect(big.ciLow).toBeGreaterThan(0);
    expect(stats.twoProportionTest({ x1: 3, n1: 10, x2: 6, n2: 10 })).toMatchObject({ underpowered: true, significant: false });
    expect(stats.normalCdf(1.96)).toBeCloseTo(0.975, 3);
  });

  async function setupExperiment({ variantWeight = 50, minCallsPerArm = 5 } = {}) {
    const { agent, lead } = await readyAgent();
    const control = (await api().post('/ai-calling/script-versions').send({ agentId: String(agent._id), label: 'v1' }).expect(201)).body.data;
    const variant = (await api().post('/ai-calling/script-versions').send({ agentId: String(agent._id), source: 'variant', basedOnVersionId: String(control._id), agentConfig: { objective: 'Variant objective', voice: 'sage' }, label: 'friendlier' }).expect(201)).body.data;
    const experiment = (await api().post('/ai-calling/experiments').send({
      agentId: String(agent._id), name: 'Objective wording', hypothesis: 'Clearer objective lifts completion',
      arms: [{ key: 'control', versionId: String(control._id), weight: 100 - variantWeight }, { key: 'variant_1', versionId: String(variant._id), weight: variantWeight }],
      guardrails: { minCallsPerArm },
    }).expect(201)).body.data;
    return { agent, lead, control, variant, experiment };
  }

  it('versions snapshot the agent, become active, and a variant must differ from its base', async () => {
    const { agent } = await readyAgent();
    const v1 = (await api().post('/ai-calling/script-versions').send({ agentId: String(agent._id) }).expect(201)).body.data;
    expect(v1).toMatchObject({ number: 1, source: 'agent', existing: false });
    expect((await api().post('/ai-calling/script-versions').send({ agentId: String(agent._id) }).expect(201)).body.data).toMatchObject({ _id: v1._id, existing: true });
    await api().post('/ai-calling/script-versions').send({ agentId: String(agent._id), source: 'variant', basedOnVersionId: v1._id, agentConfig: { objective: 'Qualify interest' } }).expect(400);
    const state = (await api().get(`/ai-calling/script-versions/agents/${agent._id}/state`).expect(200)).body.data;
    expect(state).toMatchObject({ activeVersion: { number: 1 }, liveMatchesActive: true, canRollback: false });
    await expect(Version.updateOne({ _id: v1._id }, { $set: { label: 'x' } })).rejects.toThrow(/immutable/);
  });

  it('stamps the lead\'s arm on dispatched calls and runs that arm\'s script in the call context', async () => {
    const { agent, lead, control, variant, experiment } = await setupExperiment({ variantWeight: 50 });
    await api().post(`/ai-calling/experiments/${experiment._id}/start`).set('x-perms', 'ai-calling:read,ai-calling:write').send({}).expect(403);
    await api().post(`/ai-calling/experiments/${experiment._id}/start`).send({}).expect(200);
    const expected = stats.assignArm(experiment.arms, String(lead._id), String(experiment._id));
    const { record } = await dialOnce(agent);
    expect(record).toMatchObject({ arm: expected.key });
    expect(String(record.experimentId)).toBe(String(experiment._id));
    expect(String(record.scriptVersionId)).toBe(expected.key === 'control' ? String(control._id) : String(variant._id));
    const context = await calling.getCallContext(record.internalCallId);
    expect(context.agentConfig.objective).toBe(expected.key === 'control' ? 'Qualify interest' : 'Variant objective');
    // Only one running experiment per agent.
    const second = await experiments.createExperiment({ agentId: agent._id, name: 'B', arms: experiment.arms.map(a => ({ key: a.key, versionId: a.versionId, weight: a.weight })) }, actor);
    await api().post(`/ai-calling/experiments/${second._id}/start`).send({}).expect(409);
  });

  it('without an experiment, stamps the active version only when it is what the campaign runs', async () => {
    const { agent } = await readyAgent();
    const v1 = await experiments.createVersion({ agentId: agent._id }, actor);
    const { record, campaign } = await dialOnce(agent);
    expect(String(record.scriptVersionId)).toBe(String(v1._id));
    expect(record.experimentId).toBeNull();
    const drifted = await resolver.resolveScriptVersion({ ...campaign, agentId: agent._id, agentConfig: { ...campaign.agentConfig, objective: 'edited in place' } }, new mongoose.Types.ObjectId());
    expect(drifted.stamp).toEqual({});
  });

  it('rejects designs that change the questions, do not add to 100%, or use another agent\'s versions', async () => {
    const { agent, control, variant } = await setupExperiment();
    const arms = [{ key: 'control', versionId: String(control._id), weight: 60 }, { key: 'variant_1', versionId: String(variant._id), weight: 30 }];
    await api().post('/ai-calling/experiments').send({ agentId: String(agent._id), name: 'x', arms }).expect(400);
    await agents.update(agent._id, { version: (await agents.get(agent._id, actor)).version, questionnaire: { questions: [...questions, { fieldKey: 'size', label: 'Size', text: 'How big?', type: 'integer', order: 2 }] } }, actor);
    const changed = await experiments.createVersion({ agentId: agent._id }, actor);
    await api().post('/ai-calling/experiments').send({ agentId: String(agent._id), name: 'x', arms: [{ key: 'control', versionId: String(control._id), weight: 50 }, { key: 'variant_1', versionId: String(changed._id), weight: 50 }] }).expect(400);
    const { agent: other } = await readyAgent();
    await api().post('/ai-calling/experiments').send({ agentId: String(other._id), name: 'x', arms: [{ key: 'control', versionId: String(control._id), weight: 50 }, { key: 'variant_1', versionId: String(variant._id), weight: 50 }] }).expect(400);
  });

  async function seedCalls(experiment, arm, n, { failed = 0, optOut = 0, qualified = 0, missing = 0 } = {}) {
    const docs = [];
    for (let i = 0; i < n; i++) {
      const isFailed = i < failed;
      docs.push({
        campaignId: new mongoose.Types.ObjectId(), recipientId: new mongoose.Types.ObjectId(), leadId: new mongoose.Types.ObjectId(),
        internalCallId: crypto.randomUUID(), attemptNumber: 1, provider: 'livekit_sip', createdBy: actor,
        experimentId: experiment._id, arm, resultsProcessedAt: new Date(), answeredAt: isFailed ? null : new Date(),
        state: isFailed ? 'failed' : 'completed',
        disposition: isFailed ? 'failed' : (i - failed < optOut ? 'do_not_contact' : 'answered_completed'),
        qualification: !isFailed && i - failed >= optOut && i - failed - optOut < qualified ? 'qualified' : null,
        quality: isFailed ? undefined : { latency: { samplesMs: [1000] }, transcript: { missing: i < failed + missing }, audioFailures: [] },
      });
    }
    await Calls.insertMany(docs);
  }

  it('reports per-arm stats with sample sizes, and the guardrail sweep auto-pauses a breaching variant', async () => {
    const { experiment } = await setupExperiment({ minCallsPerArm: 10 });
    await experiments.startExperiment(experiment._id, actor);
    await seedCalls(experiment, 'control', 4);
    await seedCalls(experiment, 'variant_1', 4, { failed: 3 });
    expect(await experiments.evaluateGuardrails()).toEqual({ checked: 1, paused: 0 });
    expect((await Experiment.findById(experiment._id).lean()).guardrailStatus.state).toBe('insufficient_data');

    await seedCalls(experiment, 'control', 16, { qualified: 8 });
    await seedCalls(experiment, 'variant_1', 16, { failed: 2, optOut: 4, qualified: 5 });
    const detail = (await api().get(`/ai-calling/experiments/${experiment._id}`).expect(200)).body.data;
    const [c, v] = detail.stats.arms;
    expect(c).toMatchObject({ key: 'control', calls: 20, connected: 20, qualified: 8, failureRate: 0, underpowered: false });
    expect(v).toMatchObject({ key: 'variant_1', calls: 20, failed: 5, optOuts: 4, failureRate: 0.25 });
    expect(detail.stats.comparisons[0].qualifiedRate).toMatchObject({ n1: 20, n2: 15 });
    // 8/20 vs 5/15: enough samples for the test, but no significant difference.
    expect(detail.stats.comparisons[0].qualifiedRate).toMatchObject({ underpowered: false, significant: false });
    expect(detail.stats.comparisons[0].qualifiedRate.ciLow).toBeLessThan(0);

    const result = await experiments.evaluateGuardrails();
    expect(result).toEqual({ checked: 1, paused: 1 });
    const paused = await Experiment.findById(experiment._id).lean();
    expect(paused).toMatchObject({ status: 'paused', pausedReason: 'guardrail', guardrailStatus: { state: 'breached' } });
    expect(paused.guardrailEvents.map(e => e.metric)).toEqual(expect.arrayContaining(['failureRate', 'optOutRate']));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'ai_calling.experiment_paused' }), actor);
  });

  it('promotes a variant onto the agent and its unfinished campaigns, then rolls back instantly (audit logged)', async () => {
    const { agent, control, variant, experiment } = await setupExperiment();
    const { campaign } = await dialOnce(agent);
    await experiments.startExperiment(experiment._id, actor);
    await api().post(`/ai-calling/experiments/${experiment._id}/promote`).set('x-perms', 'ai-calling:read,ai-calling:write').send({ arm: 'variant_1' }).expect(403);
    const promoted = (await api().post(`/ai-calling/experiments/${experiment._id}/promote`).send({ arm: 'variant_1', reason: 'Won' }).expect(200)).body.data;
    expect(promoted.experiment).toMatchObject({ status: 'completed', promotedArm: 'variant_1' });
    expect(promoted.campaignsUpdated).toBe(1);
    expect((await agents.get(agent._id, actor)).agentConfig).toMatchObject({ objective: 'Variant objective', voice: 'sage' });
    expect((await Campaign.findById(campaign._id).lean()).agentConfig.objective).toBe('Variant objective');
    let state = await experiments.scriptState(agent._id, actor);
    expect(String(state.activeVersion._id)).toBe(String(variant._id));

    await api().post(`/ai-calling/script-versions/agents/${agent._id}/rollback`).set('x-perms', 'ai-calling:read,ai-calling:write').send({}).expect(403);
    const rolled = (await api().post(`/ai-calling/script-versions/agents/${agent._id}/rollback`).send({ reason: 'Complaints' }).expect(200)).body.data;
    expect(String(rolled.restoredVersionId)).toBe(String(control._id));
    expect((await agents.get(agent._id, actor)).agentConfig.objective).toBe('Qualify interest');
    expect((await Campaign.findById(campaign._id).lean()).agentConfig.objective).toBe('Qualify interest');
    state = await experiments.scriptState(agent._id, actor);
    expect(state.activations.map(a => a.action)).toEqual(['rollback', 'promote', 'snapshot']);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'ai_calling.script.rollback', details: expect.objectContaining({ restoredVersionId: String(control._id), reason: 'Complaints' }) }));
  });

  it('rollback pauses a running experiment; there is nothing to roll back to on a fresh agent', async () => {
    const { agent, experiment } = await setupExperiment();
    const { agent: fresh } = await readyAgent();
    await api().post(`/ai-calling/script-versions/agents/${fresh._id}/rollback`).send({}).expect(409);
    await experiments.startExperiment(experiment._id, actor);
    await experiments.createVersion({ agentId: agent._id }, actor); // no change → no new activation
    await agents.update(agent._id, { version: (await agents.get(agent._id, actor)).version, agentConfig: { ...(await agents.get(agent._id, actor)).agentConfig, objective: 'Edited live' } }, actor);
    await experiments.createVersion({ agentId: agent._id }, actor); // new live snapshot becomes active
    const out = await experiments.rollback(agent._id, {}, actor);
    expect(out.experimentsPaused).toBe(1);
    expect((await Experiment.findById(experiment._id).lean())).toMatchObject({ status: 'paused', pausedReason: 'rollback' });
  });

  it('a benchmark run can target a script version, and the version list shows its latest benchmark', async () => {
    const { agent, control } = await setupExperiment();
    const suite = await benchmarks.seedSampleSuite(actor);
    const run = await benchmarks.createRun(suite._id, { scriptVersionId: control._id, knowledgeVersionId: 'kv-1' }, actor);
    await benchmarks.processRun(run._id);
    const done = await Run.findById(run._id).lean();
    expect(done).toMatchObject({ status: 'completed', questionnaireSource: 'script_version', knowledgeVersionId: 'kv-1' });
    const versions = await experiments.listVersions(agent._id, actor);
    expect(String(versions.find(v => String(v._id) === String(control._id)).latestBenchmark.runId)).toBe(String(run._id));
    expect(await Case.countDocuments({ suiteId: suite._id, reviewed: true })).toBe(0);
  });
});
