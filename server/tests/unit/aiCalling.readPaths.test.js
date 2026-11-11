/**
 * Read paths behind /ai-calling and /incoming-calls: batched agent-card eligibility, single-pass
 * analytics ($facet), the analytics/cost pricing view of env, request validation, and the
 * 054 calling indexes (the list queries are answered by an index, not an in-memory sort).
 */
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

process.env.AI_CALLING_REQUIRE_CONSENT = 'true';
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob: jest.fn(async () => ({})), getQueueStats: jest.fn(async () => ({ workers: 1 })) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/shared/storage/StorageService.js', () => ({ default: { getPresignedUrl: async (key) => `https://storage.test/${key}` } }));

const actor = new mongoose.Types.ObjectId();
const other = new mongoose.Types.ObjectId();
const OID = () => new mongoose.Types.ObjectId();
let db; let agents; let calling; let inbound; let Agent; let Campaign; let CallRecord; let Lead; let Consent; let Suppression; let InboundCall; let Files; let phoneHash; let schemas;

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  agents = (await import('../../src/modules/aiCalling/callingAgent.service.js')).default;
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  inbound = (await import('../../src/modules/inboundCalling/inboundQuery.service.js')).default;
  Agent = (await import('../../src/modules/aiCalling/callingAgent.model.js')).default;
  Campaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Consent = (await import('../../src/modules/aiCalling/callConsent.model.js')).default;
  Suppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  InboundCall = (await import('../../src/modules/inboundCalling/inboundCall.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  Files = (await import('../../src/modules/files/file.model.js')).default;
  ({ phoneHash } = await import('../../src/modules/aiCalling/callAuth.js'));
  schemas = await import('../../src/modules/inboundCalling/inboundCall.validation.js');
  for (const model of [CallRecord, InboundCall, Campaign, Agent]) await model.init();
});
afterAll(async () => { await mongoose.disconnect(); if (db) await db.stop(); });
beforeEach(async () => { for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({}); });

const lead = (extra = {}) => Lead.create({ leadNumber: `R-${crypto.randomUUID()}`, name: 'Fixture', source: 'manual', mobile: `+4179${Math.floor(1000000 + Math.random() * 8999999)}`, address: { country: 'CH' }, createdBy: actor, ...extra });
const agentDoc = (assigned, extra = {}) => Agent.create({
  name: `Agent ${crypto.randomUUID().slice(0, 6)}`, availability: 'active', agentConfig: { organizationName: 'Updata', disclosure: 'AI', objective: 'Qualify' },
  questionnaire: { questions: [{ fieldKey: 'interest', label: 'Interest', text: 'Interested?', type: 'boolean', required: true, order: 1 }] },
  assignedLeadIds: assigned.map((l) => l._id), createdBy: actor, updatedBy: actor, ...extra,
});
const sortByLead = (e) => ({ ...e, leads: [...e.leads].sort((a, b) => a.leadId.localeCompare(b.leadId)) });
const withoutDuplicateChoice = (e) => {
  const sorted = sortByLead(e);
  return { ...sorted, leads: sorted.leads.map((l) => ({ ...l, eligible: null, reasons: l.reasons.filter((r) => r !== 'duplicate_phone') })) };
};

describe('agent cards: batched eligibility', () => {
  it('matches previewEligibility for each agent (missing phone, suppression, consent, duplicate numbers) without a per-agent policy lookup', async () => {
    const shared = '+41790000001';
    const [a, b, c, d, e] = await Promise.all([lead({ mobile: shared }), lead({ mobile: shared }), lead({ mobile: null, phone: null }), lead(), lead()]);
    await Suppression.create({ phoneHash: phoneHash(d.mobile), reason: 'admin', createdBy: actor });
    await Consent.create({ leadId: e._id, phoneHash: phoneHash(e.mobile), status: 'granted', evidence: 'Recorded on the phone today', changedBy: actor, createdBy: other });
    await Consent.create({ leadId: a._id, phoneHash: phoneHash(shared), status: 'granted', evidence: 'Recorded on the phone today', changedBy: actor, createdBy: actor });
    await Consent.create({ leadId: b._id, phoneHash: phoneHash(shared), status: 'granted', evidence: 'Recorded on the phone today', changedBy: actor, createdBy: actor });
    const first = await agentDoc([a, b, c, d, e]);
    const second = await agentDoc([b, e]); // b's number is a duplicate only within the first agent
    const deleted = await lead({ isDeleted: true });
    const third = await agentDoc([deleted, e]);

    const spy = jest.spyOn(calling, 'previewEligibility');
    const { data, summary } = await agents.list(actor, { page: 1, limit: 24 });
    expect(spy).toHaveBeenCalledTimes(1); // one batch for every assigned lead, not one per card
    spy.mockRestore();
    for (const doc of [first, second, third]) {
      const card = data.find((x) => String(x._id) === String(doc._id));
      const expected = await calling.previewEligibility(actor, { leadIds: doc.assignedLeadIds.map(String) });
      // Which of two leads sharing a number is flagged duplicate_phone was query-plan order
      // before; it is now the lower lead id. Everything else must be identical.
      expect(withoutDuplicateChoice(card.eligibility)).toEqual(withoutDuplicateChoice(expected));
      expect(sortByLead((await agents.get(doc._id, actor)).eligibility)).toEqual(sortByLead(card.eligibility));
    }
    const firstCard = data.find((x) => String(x._id) === String(first._id));
    expect(firstCard.eligibility.reasonCounts).toEqual({ missing_phone: 1, suppressed: 1, consent_required: 1, duplicate_phone: 1 });
    expect(firstCard.eligibility.eligible).toBe(2);
    const [low, high] = [String(a._id), String(b._id)].sort();
    expect(firstCard.eligibility.leads.find((l) => l.leadId === high).reasons).toEqual(['duplicate_phone']);
    expect(firstCard.eligibility.leads.find((l) => l.leadId === low).eligible).toBe(true);
    expect(data.find((x) => String(x._id) === String(second._id)).eligibility.reasonCounts.duplicate_phone).toBeUndefined();
    expect(data.find((x) => String(x._id) === String(third._id)).eligibility).toEqual(expect.objectContaining({ total: 2, found: 1, unavailable: 1, eligible: 1 }));
    expect(summary.agents).toBe(3);
  });

  it('loads uploaded avatars for the visible page in one query', async () => {
    const file = await Files.create({ bucket: 'images', originalName: 'a.png', key: 'avatars/a.png', mimeType: 'image/png', sizeBytes: 10, uploadedBy: actor, module: 'ai-calling', entityType: 'calling-avatar', isDeleted: false });
    await agentDoc([], { avatarFileId: file._id });
    await agentDoc([], { avatarFileId: file._id });
    const spy = jest.spyOn(Files, 'find');
    const { data } = await agents.list(actor, {});
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(data.map((x) => x.avatarUrl)).toEqual(['https://storage.test/avatars/a.png', 'https://storage.test/avatars/a.png']);
  });
});

describe('call analytics', () => {
  const call = (campaignId, extra) => ({ campaignId, recipientId: OID(), leadId: OID(), internalCallId: crypto.randomUUID(), attemptNumber: 1, provider: 'livekit_sip', createdBy: actor, ...extra });

  it('computes every block from one aggregation and keeps the most recent 180 days', async () => {
    const campaignId = OID();
    const day = 86_400_000; const now = Date.now();
    const docs = [];
    for (let i = 0; i < 200; i++) docs.push(call(campaignId, { createdAt: new Date(now - i * day), disposition: i % 2 ? 'answered_completed' : 'no_answer', qualification: i % 4 === 1 ? 'qualified' : null, durationSeconds: 10, cost: { amount: 0.5, currency: 'USD' }, reviewRequired: i === 3 }));
    docs.push(call(campaignId, { createdAt: new Date(), provider: 'livekit_web', disposition: 'answered_completed' })); // browser test: excluded
    docs.push(call(campaignId, { createdAt: new Date(), createdBy: other, disposition: 'answered_completed' })); // another owner
    await CallRecord.collection.insertMany(docs);
    const spy = jest.spyOn(CallRecord, 'aggregate');
    const out = await calling.analytics(actor, {});
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(out).toEqual(expect.objectContaining({ totalCalls: 200, answered: 100, qualified: 50, callbacks: 0, reviews: 1, avgCallSeconds: 10, totalCost: 100, answerRate: 0.5, qualificationRate: 0.25 }));
    expect(out.byDisposition.find((r) => r._id === 'no_answer').count).toBe(100);
    expect(out.byDay).toHaveLength(180);
    const today = new Date().toISOString().slice(0, 10);
    expect(out.byDay.at(-1).date).toBe(today); // newest day kept (the oldest 20 are dropped)
    expect(out.byDay.map((d) => d.date)).toEqual([...out.byDay.map((d) => d.date)].sort());
  });

  it('answers the call history list from the owner index without an in-memory sort', async () => {
    const plan = await CallRecord.find({ createdBy: actor, provider: { $nin: ['livekit_web', 'web_link_preview'] }, isTest: { $ne: true } }).sort({ createdAt: -1 }).limit(20).explain('queryPlanner');
    const text = JSON.stringify(plan.queryPlanner.winningPlan);
    expect(text).toContain('owner_recent_calls');
    expect(text).not.toContain('"SORT"');
  });

  it('bounds the call-history and incoming-call list totals', async () => {
    const campaignId = OID();
    await CallRecord.collection.insertMany(Array.from({ length: 3 }, () => call(campaignId, { createdAt: new Date() })));
    const spy = jest.spyOn(CallRecord, 'countDocuments');
    const out = await calling.listCalls(actor, {});
    expect(spy.mock.calls[0][1]).toEqual({ limit: 10000 });
    spy.mockRestore();
    expect(out.pagination).toEqual({ page: 1, limit: 20, total: 3, pages: 1, totalCapped: false });
    const inSpy = jest.spyOn(InboundCall, 'countDocuments');
    const list = await inbound.list({ id: String(actor), seeAll: false }, {});
    expect(inSpy.mock.calls[0][1]).toEqual({ limit: 10000 });
    inSpy.mockRestore();
    expect(list.pagination.totalCapped).toBe(false);
  });

  it('caps a broad call-history search instead of expanding to every matching lead', async () => {
    const spy = jest.spyOn(Lead, 'find');
    await calling.listCalls(actor, { search: 'Fixture' });
    const q = spy.mock.results[0].value;
    spy.mockRestore();
    expect(q.getOptions().limit).toBe(1000);
  });
});

describe('incoming calls analytics', () => {
  const viewer = { id: String(actor), seeAll: false };
  const row = (i, extra = {}) => ({
    createdBy: actor, internalCallId: `in-${crypto.randomUUID()}`, dedupeKey: crypto.randomUUID(), isTest: false, deviceId: OID(), deviceName: 'Phone', simSlot: i % 2,
    caller: { e164: `+41760000${String(i).padStart(3, '0')}`, presentation: 'available' }, match: { status: i % 2 ? 'existing' : 'new' }, status: ['COMPLETED', 'MISSED', 'FAILED'][i % 3],
    answeredBy: i % 3 === 0 ? 'ai' : null, handling: { mode: 'ai', agentId: OID(), agentName: 'Aria' }, intents: { primary: 'pricing' }, qualification: { result: i % 2 ? 'QUALIFIED' : null },
    language: { current: 'en' }, durationSeconds: i % 3 === 0 ? 60 : 0, leadCreated: i % 5 === 0, callback: { requested: i % 4 === 0 }, handoff: { requested: false },
    fields: [{ key: 'service_interest', value: i % 2 ? ' Roof ' : 'roof', explicit: true, supersededAt: null }, { key: 'service_interest', value: 'Old', explicit: true, supersededAt: new Date() }, { key: 'service_interest', value: 'Guess', explicit: false }],
    createdAt: new Date(Date.now() - i * 3_600_000), ...extra,
  });

  it('returns the overview summary and every chart from a single aggregation, identical to /stats', async () => {
    await InboundCall.collection.insertMany([...Array.from({ length: 30 }, (_, i) => row(i)), row(99, { isTest: true }), row(98, { createdBy: other })]);
    const stats = await inbound.stats(viewer, {});
    const spy = jest.spyOn(InboundCall, 'aggregate');
    const out = await inbound.analytics(viewer, { tz: 'Europe/Zurich' });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
    expect(out.summary).toEqual(stats);
    expect(out.summary).toEqual(expect.objectContaining({ total: 30, answeredByAi: 10, missed: 10, failed: 10, completed: 10, qualified: 15, newLeads: 6, callbacks: 8, averageDurationSeconds: 60 }));
    expect(out.topServices).toEqual([{ key: 'roof', count: 30 }]);
    expect(out.series.reduce((s, d) => s + d.total, 0)).toBe(30);
    expect(out.byHour.reduce((s, d) => s + d.count, 0)).toBe(30);
    expect(out.bySim.map((r) => r.label).sort()).toEqual(['SIM 1', 'SIM 2']);
    expect(out.byAgent).toHaveLength(30);
    expect(out.byDevice).toHaveLength(30);
  });

  it('rejects an unknown time zone with a validation error instead of failing the aggregation', () => {
    expect(schemas.filters.query.validate({ tz: 'Mars/Olympus' }).error).toBeTruthy();
    expect(schemas.filters.query.validate({ tz: 'utc' }).value.tz).toBe('UTC');
    expect(schemas.list.query.validate({ tz: 'Europe/Zurich' }).value.tz).toBe('Europe/Zurich');
  });

  it('pages the owner-or-assignee list from indexes (no blocking sort)', async () => {
    const migration = await import('../../src/migrations/054_calling_indexes.js');
    await InboundCall.collection.createIndex({ createdBy: 1, createdAt: -1 }); // the superseded index, as in production
    await migration.up(); await migration.up(); // idempotent
    const names = (await InboundCall.collection.indexes()).map((i) => i.name);
    expect(names).toEqual(expect.arrayContaining(['owner_recent_inbound', 'assignee_recent_inbound']));
    expect(names).not.toContain('createdBy_1_createdAt_-1');
    expect((await CallRecord.collection.indexes()).map((i) => i.name)).toEqual(expect.arrayContaining(['owner_recent_calls', 'owner_campaign_calls']));
    const plan = await InboundCall.find({ $or: [{ createdBy: actor }, { assignedTo: actor }], isTest: { $ne: true } }).sort({ createdAt: -1, _id: -1 }).limit(25).explain('queryPlanner');
    const text = JSON.stringify(plan.queryPlanner.winningPlan);
    expect(text).toContain('SORT_MERGE');
    expect(text).toContain('assignee_recent_inbound');
    expect(text).not.toContain('"SORT"');
  });
});

describe('pricing view of env', () => {
  it('prices with the overridden table while reading every other key from env, without copying env', async () => {
    const { withModelPricing, costDiagnostics } = await import('../../src/modules/aiCalling/engine/costDiagnostics.js');
    const env = { AI_CALLING_MODEL_PRICING: '{"a":1}', AI_CALLING_PLATFORM_COST_PER_MINUTE: '0.02' };
    const view = withModelPricing(env, { m: { audioIn: 1 } });
    expect(view.AI_CALLING_MODEL_PRICING).toBe('{"m":{"audioIn":1}}');
    expect(view.AI_CALLING_PLATFORM_COST_PER_MINUTE).toBe('0.02');
    expect(env.AI_CALLING_MODEL_PRICING).toBe('{"a":1}');
    const viaProcess = withModelPricing(process.env, {});
    expect(viaProcess.NODE_ENV).toBe(process.env.NODE_ENV);
    const diag = costDiagnostics({ source: 'none', tokens: null }, { responseTelemetry: { responses: [] } }, 0);
    expect(diag.responses).toEqual([]);
  });
});
