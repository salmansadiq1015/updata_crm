import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Workflow Automation read paths (overview / executions / campaigns / events / analytics):
 * response shapes, the analytics window fix, the short-lived read cache and its write
 * invalidation, and migration 056 (idempotent indexes the list/analytics queries use).
 */
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob: jest.fn(async () => ({})), addJobs: jest.fn(), addScheduledJob: jest.fn(async () => ({})), registerQueue: jest.fn(), getQueueStats: jest.fn(async () => ({ workers: 1 })) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));

const DAY = 86_400_000;
const actor = new mongoose.Types.ObjectId();
let db; let wf; let M; let Lead; let MessageRecipient; let cacheManager; let migration;

beforeAll(async () => {
  db = await MongoMemoryServer.create();
  await mongoose.connect(db.getUri());
  M = await import('../../src/modules/workflowAutomation/workflow.models.js');
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  await import('../../src/modules/auth/user.model.js');
  MessageRecipient = (await import('../../src/modules/messaging/messageRecipient.model.js')).default;
  wf = (await import('../../src/modules/workflowAutomation/workflow.service.js')).default;
  cacheManager = (await import('../../src/shared/cache/CacheManager.js')).default;
  migration = await import('../../src/migrations/056_workflow_read_indexes.js');
  await (await import('../../src/migrations/050_workflow_automation.js')).up();
}, 120000);
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });
beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  cacheManager.l1.flush();
});

const oid = () => new mongoose.Types.ObjectId();
async function seedWorkflow(name = 'Flow') {
  const doc = { _id: oid(), name, description: '', status: 'published', draft: { nodes: [], edges: [] }, draftRevision: 0, latestVersion: 1, publishedVersion: 1, createdBy: actor, archivedAt: null, settings: {}, tags: [], isTemplate: false, createdAt: new Date(), updatedAt: new Date() };
  await M.Workflow.collection.insertOne(doc);
  return doc;
}
async function seedLead(i = 0) {
  const doc = { _id: oid(), leadNumber: `L-${i}-${oid()}`, name: `Lead ${i}`, source: 'manual', status: 'new', isDeleted: false, createdBy: actor };
  await Lead.collection.insertOne(doc);
  return doc;
}
function step(type, port, extra = {}) {
  return { _id: oid(), nodeId: `n-${type}`, type, label: type, visit: 1, attempt: 1, status: 'completed', port, actionKey: String(oid()), startedAt: new Date(), endedAt: new Date(), output: { secret: 'big output' }, ...extra };
}
async function seedRun(workflow, lead, { status = 'completed', outcome = null, createdAt = new Date(), updatedAt = createdAt, steps = [], campaignId = null, completedAt = null } = {}) {
  const _id = oid();
  await M.WorkflowRun.collection.insertOne({ _id, workflowId: workflow._id, versionId: oid(), version: 1, leadId: lead._id, campaignId, ownerId: actor, status, enrollmentKey: String(_id), trigger: { type: 'manual', eventId: null, data: null }, wait: { kind: null }, visits: { a: 1 }, context: { private: true }, steps, stepCount: steps.length, outcome, error: { code: status === 'failed' ? 'boom' : null }, createdAt, updatedAt, completedAt });
  return _id;
}

describe('workflow management', () => {
  it('paginates and filters workflows with stable totals and keeps published history after deletion', async () => {
    const draft = await wf.create({ name: 'Unused draft' }, actor);
    const published = await seedWorkflow('Published flow');
    const lead = await seedLead();
    const runId = await seedRun(published, lead, { status: 'waiting' });
    const first = await wf.list({ limit: 1, sortBy: 'name', sortOrder: 'asc' });
    expect(first.pagination).toEqual({ page: 1, limit: 1, total: 2, pages: 2 });
    expect(first.items[0].name).toBe('Published flow');
    expect((await wf.list({ page: 2, limit: 1, sortBy: 'name', sortOrder: 'asc' })).items[0]._id).toEqual(draft._id);
    expect((await wf.list({ search: 'Unused', status: 'draft' })).pagination.total).toBe(1);
    expect(await wf.remove(draft._id, actor)).toEqual({ deleted: true });
    expect(await M.Workflow.findById(draft._id)).toBeNull();
    expect(await wf.remove(published._id, actor)).toEqual({ archived: true });
    expect((await wf.list()).pagination.total).toBe(0);
    expect((await wf.list({ status: 'archived' })).items[0].name).toBe('Published flow');
    expect((await M.WorkflowRun.findById(runId).lean()).status).toBe('waiting');
  });
});

describe('listRuns', () => {
  it('returns the last step and step count without step outputs, context or visits', async () => {
    const w = await seedWorkflow(); const lead = await seedLead();
    await seedRun(w, lead, { steps: [step('msg.sms', 'sent'), step('ai.call', 'answered')], updatedAt: new Date(Date.now() - 1000) });
    await seedRun(w, lead, { status: 'waiting', steps: [] });
    const r = await wf.listRuns({ limit: 10 });
    expect(r.pagination).toEqual({ page: 1, limit: 10, total: 2, pages: 1 });
    const [empty, full] = r.items;
    expect(empty).toMatchObject({ status: 'waiting', stepTotal: 0, currentStep: null });
    expect(full).toMatchObject({ stepTotal: 2, currentStep: { type: 'ai.call', port: 'answered' } });
    expect(full.currentStep.output).toBeUndefined();
    for (const item of r.items) {
      expect(item.steps).toBeUndefined(); expect(item.context).toBeUndefined(); expect(item.visits).toBeUndefined();
      expect(item.workflowId).toMatchObject({ name: 'Flow' });
      expect(item.leadId).toMatchObject({ name: 'Lead 0', leadNumber: lead.leadNumber });
    }
  });

  it('filters by workflow, campaign, lead and status (incl. "active") with exact totals', async () => {
    const a = await seedWorkflow('A'); const b = await seedWorkflow('B'); const lead = await seedLead(); const other = await seedLead(1);
    const campaignId = oid();
    for (let i = 0; i < 5; i += 1) await seedRun(a, lead, { status: i % 2 ? 'failed' : 'waiting', campaignId, updatedAt: new Date(Date.now() - i * 1000) });
    await seedRun(b, other, { status: 'completed' });
    expect((await wf.listRuns({ workflowId: String(a._id), limit: 2 })).pagination).toMatchObject({ total: 5, pages: 3 });
    const page2 = await wf.listRuns({ workflowId: String(a._id), page: 2, limit: 2 });
    expect(page2.items.map((x) => new Date(x.updatedAt).getTime())).toEqual([...page2.items.map((x) => new Date(x.updatedAt).getTime())].sort((x, y) => y - x));
    expect((await wf.listRuns({ campaignId: String(campaignId) })).pagination.total).toBe(5);
    expect((await wf.listRuns({ leadId: String(other._id) })).items.map((x) => x.status)).toEqual(['completed']);
    expect((await wf.listRuns({ status: 'active' })).pagination.total).toBe(3);
    expect((await wf.listRuns({ status: 'failed', workflowId: String(a._id) })).pagination.total).toBe(2);
  });
});

describe('listEvents', () => {
  it('counts unfiltered and prefix-filtered events', async () => {
    const w = await seedWorkflow();
    const at = Date.now();
    await M.WorkflowEvent.collection.insertMany([
      { type: 'run.started', workflowId: w._id, at: new Date(at - 3000) }, { type: 'run.completed', workflowId: w._id, at: new Date(at - 2000) }, { type: 'step.completed', workflowId: w._id, at: new Date(at - 1000) },
    ]);
    const all = await wf.listEvents({});
    expect(all.pagination.total).toBe(3);
    expect(all.items[0]).toMatchObject({ type: 'step.completed', workflowId: { name: 'Flow' } });
    expect((await wf.listEvents({ type: 'run.*' })).items.map((e) => e.type)).toEqual(['run.completed', 'run.started']);
  });
});

describe('analytics', () => {
  it('timeline covers exactly the window, so it adds up to the execution totals', async () => {
    const w = await seedWorkflow(); const lead = await seedLead();
    const startOfToday = Math.floor(Date.now() / DAY) * DAY;
    await seedRun(w, lead, { createdAt: new Date(startOfToday - 29 * DAY + 60_000) }); // first day of a 30-day window
    await seedRun(w, lead, { createdAt: new Date(startOfToday - 29 * DAY - 60_000) }); // just before it
    await seedRun(w, lead, { status: 'failed', createdAt: new Date(), completedAt: new Date() });
    const a = await wf.analytics({ days: 30 });
    expect(a.timeline).toHaveLength(30);
    expect(a.timeline[0].date).toBe(new Date(startOfToday - 29 * DAY).toISOString().slice(0, 10));
    expect(a.timeline.at(-1).date).toBe(new Date(startOfToday).toISOString().slice(0, 10));
    expect(a.executions.total).toBe(2);
    expect(a.timeline.reduce((s, d) => s + d.started, 0)).toBe(a.executions.total);
    expect(a.recentFailures).toHaveLength(1);
  });

  it('computes calls, messages, delivery, contacts, outcomes and top workflows in one pass', async () => {
    const a = await seedWorkflow('Alpha'); const b = await seedWorkflow('Beta');
    const l1 = await seedLead(1); const l2 = await seedLead(2);
    const delivered = oid(); const failed = oid();
    await MessageRecipient.collection.insertMany([{ _id: delivered, campaignId: oid(), leadId: oid(), status: 'delivered' }, { _id: failed, campaignId: oid(), leadId: oid(), status: 'failed' }]);
    await seedRun(a, l1, { outcome: 'qualified', steps: [step('ai.call', 'answered'), step('msg.sms', 'sent', { output: { recipientId: String(delivered) } }), step('logic.condition', 'yes')] });
    await seedRun(a, l2, { outcome: 'not_qualified', steps: [step('ai.call', 'unanswered'), step('ai.call', 'blocked'), step('msg.email', 'sent', { output: { recipientId: String(failed) } }), step('msg.whatsapp', 'blocked')] });
    await seedRun(b, l1, { status: 'failed', completedAt: new Date(), steps: [step('ai.call', null, { status: 'running' })] });
    await M.WorkflowLink.collection.insertMany([
      { token: 't1', kind: 'link', actionKey: 'k1', workflowId: a._id, runId: oid(), leadId: l1._id, nodeId: 'n', humanClicks: 2, scannerHits: 1, createdAt: new Date() },
      { token: 't2', kind: 'open', actionKey: 'k2', workflowId: a._id, runId: oid(), leadId: l1._id, nodeId: 'n', humanClicks: 0, scannerHits: 0, createdAt: new Date() },
    ]);
    const r = await wf.analytics({ days: 7 });
    expect(r.executions).toMatchObject({ total: 3, completed: 2, failed: 1, successRate: 66.7 });
    expect(r.contacts).toBe(2);
    expect(r.calls).toEqual({ initiated: 2, answered: 1, unanswered: 1, answerRate: 50 });
    expect(r.messages).toEqual({ sent: 2, delivered: 1, blocked: 1 });
    expect(r.links).toEqual({ issued: 1, clicked: 1, humanClicks: 2, scannerHits: 1 });
    expect(r.opens).toEqual({ tracked: 1, opened: 0 });
    expect(r.outcomes).toEqual({ qualified: 1, not_qualified: 1 });
    expect(r.conversionRate).toBe(33.3);
    expect(r.workflows).toMatchObject({ total: 2, published: 2 });
    expect(r.topWorkflows.map((t) => [t.name, t.runs, t.completed, t.failed])).toEqual([['Alpha', 2, 2, 0], ['Beta', 1, 0, 1]]);
    expect(r.recentFailures[0]).toMatchObject({ workflowId: { name: 'Beta' }, leadId: { name: 'Lead 1' } });
    const scoped = await wf.analytics({ days: 7, workflowId: String(b._id) });
    expect(scoped.executions.total).toBe(1);
    expect(scoped.workflows.total).toBe(1);
  });

  it('serves repeat reads from the cache and drops it on a service write', async () => {
    const w = await seedWorkflow(); const lead = await seedLead();
    await seedRun(w, lead);
    expect((await wf.analytics({ days: 7 })).executions.total).toBe(1);
    await seedRun(w, lead); // background (runner) progress is allowed to lag by the TTL
    expect((await wf.analytics({ days: 7 })).executions.total).toBe(1);
    await wf.setStatus(w._id, 'paused', actor); // an audited write bumps the read generation
    const fresh = await wf.analytics({ days: 7 });
    expect(fresh.executions.total).toBe(2);
    expect(fresh.workflows).toMatchObject({ paused: 1, published: 0 });
  });
});

describe('list run stats', () => {
  it('attaches per-workflow stats and refreshes them after a write', async () => {
    const w = await seedWorkflow(); const lead = await seedLead();
    await seedRun(w, lead, { status: 'completed' });
    await seedRun(w, lead, { status: 'failed' });
    expect((await wf.list({})).items[0].stats).toMatchObject({ total: 2, completed: 1, failed: 1, successRate: 50 });
    await seedRun(w, lead, { status: 'waiting' });
    await wf.update(w._id, { name: 'Renamed' }, actor);
    const item = (await wf.list({})).items[0];
    expect(item.name).toBe('Renamed');
    expect(item.stats).toMatchObject({ total: 3, active: 1 });
  });
});

describe('migration 056', () => {
  const keys = async (model) => (await model.collection.indexes()).map((i) => JSON.stringify(i.key));
  it('creates the read indexes idempotently and the queries use them', async () => {
    for (const model of [M.WorkflowRun, M.WorkflowCampaign, M.WorkflowLink]) {
      for (const i of await model.collection.indexes()) if (i.name !== '_id_') await model.collection.dropIndex(i.name);
    }
    await migration.up();
    await migration.up();
    const runKeys = await keys(M.WorkflowRun);
    for (const k of [{ createdAt: -1 }, { workflowId: 1, createdAt: -1 }, { campaignId: 1, updatedAt: -1 }, { status: 1, completedAt: -1 }]) expect(runKeys).toContain(JSON.stringify(k));
    expect(await keys(M.WorkflowCampaign)).toContain(JSON.stringify({ status: 1, createdAt: -1 }));
    expect(await keys(M.WorkflowLink)).toContain(JSON.stringify({ createdAt: -1 }));

    const plan = await M.WorkflowRun.find({ campaignId: oid() }).sort({ updatedAt: -1 }).limit(20).explain('queryPlanner');
    expect(JSON.stringify(plan.queryPlanner.winningPlan)).toContain('campaignId_1_updatedAt_-1');
    const failures = await M.WorkflowRun.find({ status: 'failed', completedAt: { $gte: new Date(0) } }).sort({ completedAt: -1 }).limit(8).explain('queryPlanner');
    expect(JSON.stringify(failures.queryPlanner.winningPlan)).toContain('status_1_completedAt_-1_failed');

    await migration.down();
    expect(await keys(M.WorkflowLink)).not.toContain(JSON.stringify({ createdAt: -1 }));
    await M.WorkflowRun.syncIndexes(); await M.WorkflowCampaign.syncIndexes(); await M.WorkflowLink.syncIndexes();
  });
});
