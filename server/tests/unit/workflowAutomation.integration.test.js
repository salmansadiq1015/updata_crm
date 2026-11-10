import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Workflow Automation end to end over the REAL existing pipelines (only telephony, the queue
 * transport, audit and notifications are mocked):
 *   workflow → publish → enrollment → ai.call → aiCalling campaign (kind 'workflow') → dial →
 *   agent tools → processCallResults → domain event → run resumes → branch → CRM / messaging.
 * Plus: retries/delays, loop limits, idempotency, crash replay, leases, opt-out, tracked links,
 * webhooks, versions, manual controls and regression checks on the calling module.
 */
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';

const actor = new mongoose.Types.ObjectId();
const addJob = jest.fn(async () => ({}));
const dial = jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: crypto.randomUUID() }));
const notify = jest.fn(async () => ({}));
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, addJobs: jest.fn(), addScheduledJob: jest.fn(async () => ({})), registerQueue: jest.fn(), getQueueStats: jest.fn(async () => ({ workers: 1 })) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } eligibleFor() { return false; } async health() { return { configured: false, eligible: false }; } },
  default: { configured: true, health: async () => ({ configured: true, eligible: true }), createOutboundCall: (...args) => dial(...args), roomStatus: async () => 'unknown', endCall: async () => ({ ended: true }) },
}));

let db; let agents; let calling; let wf; let runner; let M; let Lead; let Calls; let CallCampaign; let LeadEvent; let MessageRecipient; let links; let messaging; let leadService; let hooks; let events; let eventBus; let EVENT_TYPES;
const always = { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 1, maxAttemptsPerLead: 2, retryDelayMinutes: 1, minMinutesBetweenAttempts: 0 };
const questions = [
  { fieldKey: 'dm', label: 'Decision maker', text: 'Are you the decision maker?', type: 'boolean', required: true, order: 1 },
  { fieldKey: 'timeline', label: 'Timeline', text: 'When would you like to start?', type: 'single_choice', options: ['now', 'later'], required: true, order: 2 },
];
const rules = [{ id: 'qualified', when: { all: [{ field: 'dm', equals: true }, { field: 'timeline', equals: 'now' }] }, action: 'mark_qualified' }];
const agentInput = (extra = {}) => ({
  name: 'Sarah', title: 'Sales Agent', availability: 'active', agentType: 'sales',
  agentConfig: { organizationName: 'Updata', disclosure: 'I am an AI assistant for {company}.', objective: 'Qualify interest', language: 'en' },
  questionnaire: { questions }, statusRules: rules, schedule: always, ...extra,
});

async function makeLead(extra = {}) {
  return (await Lead.create({ leadNumber: `L-${crypto.randomUUID()}`, name: 'Müller AG', source: 'manual', mobile: `+4179${Math.floor(1e6 + Math.random() * 8e6)}`, address: { country: 'CH' }, createdBy: actor, status: 'new', ...extra })).toObject();
}
async function waitFor(fn, { timeout = 8000, label = 'condition' } = {}) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}
const runOf = (leadId, extra = {}) => M.WorkflowRun.findOne({ leadId, ...extra }).sort({ createdAt: -1 }).lean();
const n = (id, type, config = {}, label = id) => ({ id, type, position: { x: 0, y: 0 }, data: { label, config } });
const e = (source, sourceHandle, target) => ({ id: `${source}-${sourceHandle}-${target}`, source, sourceHandle, target });

async function createPublished(graph, { name = 'Test workflow', settings } = {}) {
  const created = await wf.create({ name, graph, settings }, actor);
  return wf.publish(created._id, {}, actor);
}
async function startCampaign(workflowId, leadIds) {
  const c = await wf.createCampaign({ name: 'Batch', workflowId: String(workflowId), selection: { mode: 'explicit', leadIds: leadIds.map(String) } }, actor);
  return wf.startCampaign(c._id, actor);
}
async function workflowCall(runId) {
  const campaign = await waitFor(() => CallCampaign.findOne({ workflowRunId: runId }).sort({ createdAt: -1 }).lean(), { label: 'workflow call campaign' });
  await calling.tickCampaign(campaign._id, (await CallCampaign.findById(campaign._id).lean()).tickToken);
  const call = await waitFor(() => Calls.findOne({ campaignId: campaign._id }).sort({ createdAt: -1 }).lean(), { label: 'call record' });
  return { campaign, call };
}
async function answerCall(call, answers) {
  await calling.agentAnswered(call.internalCallId);
  await calling.agentDisclose(call.internalCallId);
  for (const [fieldKey, rawAnswer] of Object.entries(answers)) await calling.agentRecordAnswer(call.internalCallId, { fieldKey, rawAnswer });
  await calling.agentEndCall(call.internalCallId, { durationSeconds: 42 });
}

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  agents = (await import('../../src/modules/aiCalling/callingAgent.service.js')).default;
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  Calls = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  LeadEvent = (await import('../../src/modules/crm/leadEvent.model.js')).default;
  MessageRecipient = (await import('../../src/modules/messaging/messageRecipient.model.js')).default;
  messaging = (await import('../../src/modules/messaging/messaging.service.js')).default;
  leadService = (await import('../../src/modules/crm/lead.service.js')).default;
  hooks = await import('../../src/modules/crm/leadQuality.hooks.js');
  wf = (await import('../../src/modules/workflowAutomation/workflow.service.js')).default;
  runner = (await import('../../src/modules/workflowAutomation/workflow.runner.js')).default;
  links = (await import('../../src/modules/workflowAutomation/workflowLink.service.js')).default;
  events = await import('../../src/modules/workflowAutomation/workflow.events.js');
  M = await import('../../src/modules/workflowAutomation/workflow.models.js');
  eventBus = (await import('../../src/shared/events/EventBus.js')).default;
  EVENT_TYPES = (await import('../../src/shared/events/eventTypes.js')).default;
  await (await import('../../src/migrations/031_calling_agents.js')).up();
  await (await import('../../src/migrations/046_ai_follow_up_calling.js')).up();
  await (await import('../../src/migrations/050_workflow_automation.js')).up();
  events.registerWorkflowEvents();
  runner.inline = true;
}, 120000);
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });
beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  events.invalidateTriggerCache();
  dial.mockClear(); notify.mockClear(); addJob.mockClear();
});

describe('Workflow Automation — AI calling end to end', () => {
  it('new lead → AI call → qualified answers → analysis branch → CRM update + rep notified', async () => {
    const sarah = await agents.create(agentInput(), actor);
    const created = await wf.create({ name: 'Qualification', templateKey: 'ai-lead-qualification' }, actor);
    const graph = created.draft;
    graph.nodes.find((x) => x.id === 'call').data.config.agentId = String(sarah._id);
    graph.nodes.find((x) => x.id === 'analyze').data.config.waitForIntelligenceMinutes = 0;
    await wf.update(created._id, { graph, baseRevision: created.draftRevision }, actor);
    const published = await wf.publish(created._id, { notes: 'v1' }, actor);
    expect(published).toMatchObject({ status: 'published', publishedVersion: 1, triggerType: 'trigger.lead_created' });

    // The REAL lead-created hook (single create + imports) enrolls the lead.
    const lead = await makeLead();
    hooks.onLeadsCreated([lead._id]);
    const waiting = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'waiting' && r; }, { label: 'run waiting on call' });
    expect(waiting.wait).toMatchObject({ kind: 'ai_call', nodeId: 'call' });
    expect(waiting.version).toBe(1);

    // The call is an ordinary single-lead campaign of kind 'workflow' — same dial pipeline.
    const { campaign, call } = await workflowCall(waiting._id);
    expect(campaign).toMatchObject({ kind: 'workflow', channel: 'voice' });
    expect(String(campaign.agentId)).toBe(String(sarah._id));
    expect(campaign.launchKey).toMatch(/^wf-[a-f0-9]{40}$/);
    expect(dial).toHaveBeenCalledTimes(1);
    // Regression: workflow calls are not "campaigns" in the agent UI and never block a normal launch.
    expect((await calling.listCampaigns(actor, {})).data).toHaveLength(0);
    expect((await calling.listCampaigns(actor, { kind: 'workflow' })).data).toHaveLength(1);
    const other = await makeLead();
    const assigned = await agents.assign(sarah._id, { leadIds: [String(other._id)], version: (await agents.get(sarah._id, actor)).version }, actor);
    await expect(agents.launch(assigned._id, { idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true }, actor)).resolves.toBeTruthy();

    await answerCall(call, { dm: 'yes', timeline: 'now' });
    const done = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'run completed' });
    expect(done.outcome).toBe('qualified');
    expect(done.steps.map((s) => `${s.nodeId}:${s.port || ''}`)).toEqual(['trigger:out', 'call:answered', 'analyze:qualified', 'mark:out', 'notify:out', 'endQ:']);
    expect(done.context.call).toMatchObject({ outcome: 'answered', disposition: 'answered_completed', qualification: 'qualified', answers: { dm: true, timeline: 'now' } });
    expect((await Lead.findById(lead._id).lean()).status).toBe('qualified');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'workflow_automation', idempotencyKey: expect.stringMatching(/^wf-/) }), expect.anything(), expect.anything());
    // Unified timeline: workflow events + the lead's existing timeline (LeadEvent).
    const types = (await M.WorkflowEvent.find({ runId: done._id }).lean()).map((x) => x.type);
    expect(types).toEqual(expect.arrayContaining(['run.enrolled', 'node.waiting', 'node.completed', 'run.completed']));
    expect((await LeadEvent.find({ leadId: lead._id }).lean()).map((x) => x.type)).toEqual(expect.arrayContaining(['automation.enrolled', 'automation.action', 'automation.completed']));

    // Duplicate event → no second enrollment (idempotent enrollment key).
    hooks.onLeadsCreated([lead._id]);
    await new Promise((r) => setTimeout(r, 150));
    expect(await M.WorkflowRun.countDocuments({ leadId: lead._id })).toBe(1);
  });

  it('unanswered → wait → retry loop → max attempts → unreachable (each attempt is a new call, never a duplicate)', async () => {
    const sarah = await agents.create(agentInput(), actor);
    const graph = (await wf.create({ name: 'tmp', templateKey: 'unanswered-call-recovery' }, actor)).draft;
    graph.nodes.find((x) => x.id === 'call').data.config.agentId = String(sarah._id);
    const published = await createPublished(graph, { name: 'Recovery' });
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.wait?.kind === 'ai_call' && r.visits.call === attempt && r; }, { label: `attempt ${attempt}` });
      const { call } = await workflowCall(run._id);
      await calling.processCallResults(call._id, { disposition: 'no_answer', source: 'webhook' });
      if (attempt < 3) {
        const delayed = await waitFor(async () => { const r = await runOf(lead._id); return r?.wait?.kind === 'timer' && r; }, { label: `delay ${attempt}` });
        expect(delayed.steps.at(-2)).toMatchObject({ nodeId: 'check', port: 'yes' });
        // Business-hours delay: due later; nothing happens until it is due.
        await runner.sweep();
        expect((await runOf(lead._id)).wait.kind).toBe('timer');
        await M.WorkflowRun.updateOne({ _id: delayed._id }, { $set: { 'wait.until': new Date(Date.now() - 1000), nextRunAt: new Date(Date.now() - 1000) } });
        await runner.sweep();
      }
    }
    const done = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'unreachable' });
    expect(done.outcome).toBe('unreachable');
    expect(done.steps.filter((s) => s.nodeId === 'call').map((s) => s.port)).toEqual(['unanswered', 'unanswered', 'unanswered']);
    const launches = await CallCampaign.find({ kind: 'workflow' }).select('launchKey').lean();
    expect(new Set(launches.map((c) => c.launchKey)).size).toBe(3);
    expect((await Lead.findById(lead._id).lean()).tags).toContain('unreachable');
  });
});

describe('Workflow Automation — reliability', () => {
  async function delayWorkflow() {
    return createPublished({
      nodes: [n('t', 'trigger.manual'), n('note', 'crm.add_note', { text: 'Started {{workflow.name}} for {{lead.name}}' }), n('d', 'logic.delay', { mode: 'duration', amount: 1, unit: 'days' }), n('end', 'end', { outcome: 'completed' })],
      edges: [e('t', 'out', 'note'), e('note', 'out', 'd'), e('d', 'out', 'end')],
    }, { name: 'Delay' });
  }

  it('crash replay re-uses the same idempotency key (no duplicate call) and concurrent advances never double-execute', async () => {
    const sarah = await agents.create(agentInput(), actor);
    const published = await createPublished({ nodes: [n('t', 'trigger.manual'), n('c', 'ai.call', { agentId: String(sarah._id) }), n('end', 'end', { outcome: 'completed' })], edges: [e('t', 'out', 'c'), e('c', 'answered', 'end')] });
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'waiting' && r; });
    // Simulate a crash right after the side-effect: step still 'running', no wait recorded.
    const idx = run.steps.length - 1;
    await M.WorkflowRun.updateOne({ _id: run._id }, { $set: { status: 'running', [`steps.${idx}.status`]: 'running', 'wait.kind': null, lockToken: null, lockUntil: null } });
    const [a, b] = await Promise.all([runner.advance(run._id), runner.advance(run._id)]);
    expect([a, b].filter((r) => r.skipped === 'locked_or_inactive')).toHaveLength(1);
    expect(await CallCampaign.countDocuments({ kind: 'workflow' })).toBe(1);
    expect((await runOf(lead._id)).steps.filter((s) => s.nodeId === 'c')).toHaveLength(1);
    expect(dial).toHaveBeenCalledTimes(0); // the dial itself only happens on the campaign tick
  });

  it('pause / resume / stop, then re-enrollment after the run ended; notes are non-destructive', async () => {
    const published = await delayWorkflow();
    const lead = await makeLead({ notes: 'Written by a person' });
    await startCampaign(published._id, [lead._id]);
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'waiting' && r; });
    expect((await Lead.findById(lead._id).lean()).notes).toMatch(/^Written by a person\n\[.+\] Started Delay for Müller AG$/);
    await wf.controlRun(run._id, 'pause', {}, actor);
    expect((await runOf(lead._id)).status).toBe('paused');
    await M.WorkflowRun.updateOne({ _id: run._id }, { $set: { 'wait.until': new Date(Date.now() - 1000), nextRunAt: new Date(Date.now() - 1000) } });
    await runner.sweep();
    expect((await runOf(lead._id)).status).toBe('paused'); // a paused run never advances
    await wf.controlRun(run._id, 'resume', {}, actor);
    expect((await runOf(lead._id)).status).toBe('completed');
    await expect(wf.controlRun(run._id, 'stop', {}, actor)).rejects.toThrow(/cannot be stopped/);

    const again = await startCampaign(published._id, [lead._id]);
    const second = await waitFor(async () => { const r = await M.WorkflowRun.findOne({ campaignId: again._id }).lean(); return r?.status === 'waiting' && r; });
    await wf.controlRun(second._id, 'stop', {}, actor);
    expect((await M.WorkflowRun.findById(second._id).lean())).toMatchObject({ status: 'cancelled', outcome: 'stopped' });
    expect((await M.WorkflowEvent.find({ runId: second._id }).lean()).map((x) => x.type)).toEqual(expect.arrayContaining(['manual.stop', 'run.cancelled']));
  });

  it('one active run per lead: duplicate enrollment is skipped and reported on the campaign', async () => {
    const published = await delayWorkflow();
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);
    await waitFor(async () => (await runOf(lead._id))?.status === 'waiting');
    const second = await startCampaign(published._id, [lead._id]);
    const c = await M.WorkflowCampaign.findById(second._id).lean();
    expect(c.counts).toMatchObject({ selected: 1, skipped: 1 });
    expect(c.skipped[0].reason).toBe('already_active');
    expect(await M.WorkflowRun.countDocuments({ leadId: lead._id })).toBe(1);
  });

  it('a failing step fails the run; retry re-runs it with a new key, skip continues on a chosen branch', async () => {
    const ghost = new mongoose.Types.ObjectId();
    const published = await createPublished({
      nodes: [n('t', 'trigger.manual'), n('assign', 'crm.assign', { userId: String(ghost) }), n('end', 'end', { outcome: 'completed' })],
      edges: [e('t', 'out', 'assign'), e('assign', 'out', 'end')],
    }).catch((err) => err);
    // Publishing is refused: the user does not exist.
    expect(published.data.errors).toContainEqual({ nodeId: 'assign', field: 'userId', code: 'user_missing' });

    // A user that is deactivated AFTER publishing makes the step fail at run time.
    const User = (await import('../../src/modules/auth/user.model.js')).default;
    const user = await User.create({ firstName: 'Ann', lastName: 'Rep', email: `ann-${crypto.randomUUID()}@x.ch`, passwordHash: 'x'.repeat(60), status: 'active', role: new mongoose.Types.ObjectId() });
    const ok = await createPublished({
      nodes: [n('t', 'trigger.manual'), n('assign', 'crm.assign', { userId: String(user._id) }), n('end', 'end', { outcome: 'completed' })],
      edges: [e('t', 'out', 'assign'), e('assign', 'out', 'end')],
    });
    await User.updateOne({ _id: user._id }, { $set: { status: 'inactive' } });
    const lead = await makeLead();
    await startCampaign(ok._id, [lead._id]);
    const failed = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'failed' && r; });
    expect(failed.error).toMatchObject({ code: 'user_unavailable', nodeId: 'assign' });
    const firstKey = failed.steps.at(-1).actionKey;
    await wf.controlRun(failed._id, 'retry', {}, actor);
    const retried = await runOf(lead._id);
    expect(retried.status).toBe('failed');
    expect(retried.steps.filter((s) => s.nodeId === 'assign').map((s) => s.manual)).toEqual(['retried', null]);
    expect(retried.steps.at(-1).actionKey).not.toBe(firstKey);
    await wf.controlRun(failed._id, 'skip', { port: 'out' }, actor);
    expect(await runOf(lead._id)).toMatchObject({ status: 'completed', outcome: 'completed' });
  });

  it('runs keep their published version; rollback publishes a new version; stale draft saves are refused', async () => {
    const published = await delayWorkflow();
    const lead1 = await makeLead();
    await startCampaign(published._id, [lead1._id]);
    const run1 = await waitFor(async () => { const r = await runOf(lead1._id); return r?.status === 'waiting' && r; });

    const current = await wf.get(published._id);
    const graph = current.draft;
    graph.nodes.find((x) => x.id === 'end').data.config.outcome = 'qualified';
    await wf.update(published._id, { graph, baseRevision: current.draftRevision }, actor);
    await expect(wf.update(published._id, { graph, baseRevision: current.draftRevision }, actor)).rejects.toThrow(/changed by someone else/);
    const v2 = await wf.publish(published._id, {}, actor);
    expect(v2.publishedVersion).toBe(2);

    await M.WorkflowRun.updateOne({ _id: run1._id }, { $set: { 'wait.until': new Date(Date.now() - 1000), nextRunAt: new Date(Date.now() - 1000) } });
    await runner.sweep();
    expect(await runOf(lead1._id)).toMatchObject({ status: 'completed', outcome: 'completed', version: 1 }); // v1 graph, not v2

    const lead2 = await makeLead();
    await startCampaign(published._id, [lead2._id]);
    const run2 = await waitFor(async () => { const r = await runOf(lead2._id); return r?.status === 'waiting' && r; });
    expect(run2.version).toBe(2);

    const rolled = await wf.rollback(published._id, 1, actor);
    expect(rolled.publishedVersion).toBe(3);
    expect(rolled.versions.map((v) => [v.version, v.rolledBackFrom])).toEqual([[3, 1], [2, null], [1, null]]);
  });

  it('refuses to publish invalid graphs (unsafe loop, unreachable node, missing agent)', async () => {
    const created = await wf.create({ name: 'Broken', graph: {
      nodes: [n('t', 'trigger.manual'), n('a', 'crm.add_tags', { add: ['x'] }), n('q', 'logic.condition', { rules: { op: 'and', rules: [{ field: 'lead.status', operator: 'equals', value: 'new' }] } }), n('c', 'ai.call', {}), n('lost', 'end', { outcome: 'completed' })],
      edges: [e('t', 'out', 'a'), e('a', 'out', 'q'), e('q', 'yes', 'a'), e('q', 'no', 'c')],
    } }, actor);
    const err = await wf.publish(created._id, {}, actor).catch((x) => x);
    expect(err.statusCode).toBe(400);
    expect(err.data.errors.map((x) => `${x.nodeId}:${x.code}`)).toEqual(expect.arrayContaining(['a:unsafe_loop', 'lost:node_unreachable', 'c:required']));
    expect((await M.Workflow.findById(created._id).lean()).status).toBe('draft');
  });
});

describe('Workflow Automation — messaging, links, opt-out, triggers', () => {
  async function smsWorkflow() {
    return createPublished({
      nodes: [
        n('t', 'trigger.manual'),
        n('sms', 'msg.sms', { body: 'Hi {{firstName}}, details: {{link}}', purpose: 'transactional', trackedLinkUrl: 'https://updata.example/offer' }),
        n('w', 'logic.wait_event', { events: ['link.clicked'], timeoutHours: 1 }),
        n('hot', 'end', { outcome: 'qualified', updateLeadStatus: true }), n('cold', 'end', { outcome: 'completed' }), n('skip', 'end', { outcome: 'opted_out', updateLeadStatus: false }),
      ],
      edges: [e('t', 'out', 'sms'), e('sms', 'sent', 'w'), e('sms', 'blocked', 'skip'), e('w', 'matched', 'hot'), e('w', 'timeout', 'cold')],
    }, { name: 'SMS + link' });
  }
  const fakeReq = (headers, method = 'GET') => ({ method, get: (h) => headers[h.toLowerCase()] });

  it('SMS through the messaging module with a tracked link; scanner hits ignored; first human click resumes the run', async () => {
    const published = await smsWorkflow();
    const lead = await makeLead({ firstName: 'Anna' });
    await startCampaign(published._id, [lead._id]);
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.wait?.kind === 'event' && r; }, { label: 'waiting for click' });
    expect(run.steps.find((s) => s.nodeId === 'sms')).toMatchObject({ port: 'sent', output: expect.objectContaining({ channel: 'sms' }) });
    const recipient = await MessageRecipient.findById(run.context.message.recipientId).lean();
    expect(recipient.status).toBe('queued');
    const link = await M.WorkflowLink.findOne({ runId: run._id }).lean();
    expect(recipient.rendered.bodyText).toContain(`/t/${link.token}`);
    expect(addJob).toHaveBeenCalledWith('outbound-messaging', expect.any(String), { recipientId: String(recipient._id) }, expect.anything());

    const browser = { 'user-agent': 'Mozilla/5.0 (Android 14) Chrome/130 Mobile', 'accept-language': 'de-CH' };
    expect(await links.click(link.token, fakeReq({ 'user-agent': 'Mozilla/5.0 Proofpoint', 'accept-language': 'en' }))).toMatchObject({ human: false, url: 'https://updata.example/offer' });
    expect(await links.click(link.token, fakeReq(browser))).toMatchObject({ human: false, reason: 'too_fast' });
    expect((await runOf(lead._id)).status).toBe('waiting');
    // createdAt is timestamp-managed (Mongoose ignores $set on it) → write through the driver.
    await M.WorkflowLink.collection.updateOne({ _id: link._id }, { $set: { createdAt: new Date(Date.now() - 60_000) } });
    expect(await links.click(link.token, fakeReq(browser))).toMatchObject({ human: true, first: true });
    expect(await links.click(link.token, fakeReq(browser))).toMatchObject({ human: true, first: false });
    const done = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'click resumed run' });
    expect(done.outcome).toBe('qualified');
    expect((await Lead.findById(lead._id).lean()).status).toBe('qualified');
    expect(await M.WorkflowLink.findById(link._id).lean()).toMatchObject({ clicks: 4, humanClicks: 2, scannerHits: 2 });
    expect(await links.click('nope-nope-nope-nope', fakeReq(browser))).toBeNull();
  });

  it('opt-out mid-run cancels active runs; an opted-out lead is skipped before any message is created', async () => {
    const published = await smsWorkflow();
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);
    await waitFor(async () => (await runOf(lead._id))?.wait?.kind === 'event');
    await messaging.suppressInbound({ channel: 'sms', from: lead.mobile, provider: 'twilio', messageId: 'stop-1', text: 'STOP' });
    const cancelled = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'cancelled' && r; }, { label: 'opt-out cancel' });
    expect(cancelled.error.code).toBe('opted_out_sms');

    const before = await MessageRecipient.countDocuments({ leadId: lead._id });
    await startCampaign(published._id, [lead._id]);
    const skipped = await waitFor(async () => { const r = await runOf(lead._id, { status: { $ne: 'cancelled' } }); return r && ['completed', 'skipped'].includes(r.status) && r; }, { label: 'blocked run' });
    expect(skipped.steps.find((s) => s.nodeId === 'sms')).toMatchObject({ port: 'blocked', output: expect.objectContaining({ blocked: true }) });
    expect(skipped.outcome).toBe('opted_out');
    expect(await MessageRecipient.countDocuments({ leadId: lead._id })).toBe(before); // nothing sent
  });

  it('wait_event times out onto its timeout branch', async () => {
    const published = await smsWorkflow();
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.wait?.kind === 'event' && r; });
    await M.WorkflowRun.updateOne({ _id: run._id }, { $set: { 'wait.until': new Date(Date.now() - 1000), nextRunAt: new Date(Date.now() - 1000) } });
    await runner.sweep();
    expect(await runOf(lead._id)).toMatchObject({ status: 'completed', outcome: 'completed' });
  });

  it('lead-updated trigger with a status filter; a workflow never re-triggers itself', async () => {
    await createPublished({
      nodes: [n('t', 'trigger.lead_updated', { toStatus: 'qualified' }), n('tag', 'crm.add_tags', { add: ['hot'] }), n('back', 'crm.update_lead', { status: 'contacted' }), n('end', 'end', { outcome: 'completed' })],
      edges: [e('t', 'out', 'tag'), e('tag', 'out', 'back'), e('back', 'out', 'end')],
    }, { name: 'On qualified', settings: { reentry: 'always' } });
    const lead = await makeLead();
    await leadService.update(String(lead._id), { notes: 'irrelevant change' }, { userId: actor });
    await new Promise((r) => setTimeout(r, 150));
    expect(await M.WorkflowRun.countDocuments({ leadId: lead._id })).toBe(0);
    await leadService.update(String(lead._id), { status: 'qualified' }, { userId: actor });
    await waitFor(async () => (await runOf(lead._id))?.status === 'completed', { label: 'lead_updated run' });
    await new Promise((r) => setTimeout(r, 200));
    expect(await M.WorkflowRun.countDocuments({ leadId: lead._id })).toBe(1); // its own writes did not loop
    expect((await Lead.findById(lead._id).lean())).toMatchObject({ tags: ['hot'], status: 'contacted' });
  });

  it('call-completed trigger fires from the calling event with outcome filters and per-call dedupe', async () => {
    await createPublished({
      nodes: [n('t', 'trigger.call_completed', { outcome: 'callback_requested' }), n('cb', 'ai.callback', { delayMinutes: 60 }), n('end', 'end', { outcome: 'callback_scheduled' })],
      edges: [e('t', 'out', 'cb'), e('cb', 'out', 'end')],
    });
    const lead = await makeLead();
    const payload = { callId: String(new mongoose.Types.ObjectId()), leadId: String(lead._id), disposition: 'callback_requested', reached: true, callbackRequested: true, qualification: 'callback' };
    eventBus.publish(EVENT_TYPES.AI_CALL_PROCESSED, { ...payload, disposition: 'no_answer', reached: false, callbackRequested: false });
    eventBus.publish(EVENT_TYPES.AI_CALL_PROCESSED, payload);
    eventBus.publish(EVENT_TYPES.AI_CALL_PROCESSED, payload); // duplicate delivery
    const done = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; });
    await new Promise((r) => setTimeout(r, 150));
    expect(await M.WorkflowRun.countDocuments({ leadId: lead._id })).toBe(1);
    const FollowUp = (await import('../../src/modules/crm/leadFollowUp.model.js')).default;
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    expect(fu).toMatchObject({ status: 'open', channel: 'phone', source: expect.objectContaining({ type: 'workflow' }) });
    expect(done.steps.find((s) => s.nodeId === 'cb').output.followUpId).toBe(String(fu._id));
  });

  it('webhook trigger: secret token, lead lookup, idempotent per event id', async () => {
    const published = await createPublished({ nodes: [n('t', 'trigger.webhook'), n('tag', 'crm.add_tags', { add: ['webhook'] }), n('end', 'end', { outcome: 'completed' })], edges: [e('t', 'out', 'tag'), e('tag', 'out', 'end')] }, { settings: { reentry: 'always' } });
    const token = published.triggerConfig.token;
    expect(token).toMatch(/^[A-Za-z0-9_-]{24,64}$/);
    const lead = await makeLead({ email: 'hook@example.ch' });
    const { hookRouter } = await import('../../src/modules/workflowAutomation/workflow.public.routes.js');
    const app = express(); app.use(express.json()); app.use('/hooks', hookRouter);
    await request(app).post(`/hooks/${published._id}/${'x'.repeat(32)}`).send({ leadId: String(lead._id) }).expect(404);
    await request(app).post(`/hooks/${published._id}/${token}`).send({ email: 'nobody@example.ch' }).expect(422);
    const ok = await request(app).post(`/hooks/${published._id}/${token}`).send({ email: 'HOOK@example.ch', eventId: 'evt-1', data: { plan: 'pro' } }).expect(202);
    expect(ok.body.data.runId).toBeTruthy();
    const dup = await request(app).post(`/hooks/${published._id}/${token}`).send({ email: 'hook@example.ch', eventId: 'evt-1' }).expect(202);
    expect(dup.body.data).toMatchObject({ runId: null, skipped: 'duplicate_event' });
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; });
    expect(run.trigger.data).toEqual({ plan: 'pro' });
  });

  it('dry-run test walks the draft on a real lead without side effects', async () => {
    const sarah = await agents.create(agentInput(), actor);
    const created = await wf.create({ name: 'Dry', templateKey: 'ai-lead-qualification' }, actor);
    const lead = await makeLead();
    const result = await wf.test(created._id, { leadId: String(lead._id), options: { callOutcome: 'answered', analysis: 'callback' } });
    expect(result.valid).toBe(false); // agent not chosen yet — reported, but the path is still simulated
    expect(result.steps.map((s) => `${s.nodeId}:${s.port || ''}`)).toEqual(['trigger:out', 'call:answered', 'analyze:callback', 'callback:out', 'endC:']);
    expect(result.outcome).toBe('callback_scheduled');
    expect(await CallCampaign.countDocuments({})).toBe(0);
    expect(await M.WorkflowRun.countDocuments({})).toBe(0);
    expect(String(sarah._id)).toBeTruthy();
  });

  it('analytics and campaign progress reflect executions', async () => {
    const published = await createPublished({ nodes: [n('t', 'trigger.manual'), n('end', 'end', { outcome: 'qualified', updateLeadStatus: false })], edges: [e('t', 'out', 'end')] });
    const leads = [await makeLead(), await makeLead(), await makeLead()];
    const c = await startCampaign(published._id, leads.map((l) => l._id));
    await runner.sweep(); // campaign completion
    const campaign = await wf.getCampaign(c._id);
    expect(campaign).toMatchObject({ status: 'completed', counts: { selected: 3, enrolled: 3, skipped: 0 } });
    expect(campaign.progress.byOutcome).toEqual({ qualified: 3 });
    const a = await wf.analytics({ days: 30 });
    expect(a.executions).toMatchObject({ total: 3, completed: 3, failed: 0, successRate: 100 });
    expect(a.contacts).toBe(3);
    expect(a.conversionRate).toBe(100);
    expect(a.timeline).toHaveLength(30);
    const list = await wf.list({});
    expect(list.items[0].stats).toMatchObject({ total: 3, completed: 3, successRate: 100 });
  });
});

describe('Workflow Automation — custom fields, schedules, fallbacks, email signals', () => {
  const fakeReq = (headers, method = 'GET') => ({ method, get: (h) => headers[h.toLowerCase()] });
  const waitingFor = (event) => createPublished({
    nodes: [n('t', 'trigger.manual'), n('w', 'logic.wait_event', { events: [event], timeoutHours: 1 }), n('hit', 'end', { outcome: 'interested', updateLeadStatus: false }), n('miss', 'end', { outcome: 'completed' })],
    edges: [e('t', 'out', 'w'), e('w', 'matched', 'hit'), e('w', 'timeout', 'miss')],
  }, { name: `Wait ${event}` });

  it('sets lead custom fields (templated, merged, removable) and branches on them', async () => {
    const published = await createPublished({
      nodes: [
        n('t', 'trigger.manual'),
        n('cf', 'crm.custom_fields', { set: [{ key: 'tier', value: 'gold' }, { key: 'company', value: '{{lead.name}}' }], remove: ['legacy'] }),
        n('q', 'logic.condition', { rules: { op: 'and', rules: [{ field: 'lead.customFields.tier', operator: 'equals', value: 'gold' }] } }),
        n('yes', 'end', { outcome: 'qualified', updateLeadStatus: false }), n('no', 'end', { outcome: 'completed' }),
      ],
      edges: [e('t', 'out', 'cf'), e('cf', 'out', 'q'), e('q', 'yes', 'yes'), e('q', 'no', 'no')],
    }, { name: 'Custom fields' });
    const lead = await makeLead({ customFields: { legacy: 'x', keep: 'y' } });
    await startCampaign(published._id, [lead._id]);
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'custom fields run' });
    expect(run.outcome).toBe('qualified');
    const stored = await Lead.findById(lead._id);
    expect(stored.toJSON().customFields).toEqual({ keep: 'y', tier: 'gold', company: 'Müller AG' });
    expect(await LeadEvent.exists({ leadId: lead._id, type: 'automation.action', 'details.kind': 'custom_fields' })).toBeTruthy();
    const { validateGraph } = await import('../../src/modules/workflowAutomation/engine/graph.js');
    const bad = validateGraph({ nodes: [n('t', 'trigger.manual'), n('cf', 'crm.custom_fields', { set: [{ key: '1bad key', value: 'x' }] }), n('z', 'end', { outcome: 'completed' })], edges: [e('t', 'out', 'cf'), e('cf', 'out', 'z')] });
    expect(bad.errors).toEqual(expect.arrayContaining([expect.objectContaining({ nodeId: 'cf', field: 'set', code: 'invalid_key' })]));
  });

  it('schedule trigger fires once per occurrence for the matching segment only', async () => {
    const published = await createPublished({
      nodes: [n('t', 'trigger.schedule', { time: '09:00', days: [0, 1, 2, 3, 4, 5, 6], timezone: 'UTC', limit: 10, segment: { statuses: ['new'], tags: ['vip'], sources: [] } }), n('end', 'end', { outcome: 'completed', updateLeadStatus: false })],
      edges: [e('t', 'out', 'end')],
    }, { name: 'Daily VIP' });
    const vip = await makeLead({ tags: ['vip'] });
    await makeLead({ tags: ['other'] });
    await makeLead({ tags: ['vip'], status: 'contacted' });
    await M.Workflow.updateOne({ _id: published._id }, { $set: { nextFireAt: new Date(Date.now() - 60_000) } });
    const first = await runner.sweep();
    expect(first.schedules).toBe(1);
    expect((await M.WorkflowRun.find({ workflowId: published._id }).lean()).map((r) => String(r.leadId))).toEqual([String(vip._id)]);
    const wfDoc = await M.Workflow.findById(published._id).lean();
    expect(wfDoc.nextFireAt.getTime()).toBeGreaterThan(Date.now());
    expect((await runner.sweep()).schedules).toBe(0); // not yet due again
    expect(await M.WorkflowRun.countDocuments({ workflowId: published._id })).toBe(1);
  });

  it('falls back to in-process advancing when the queue (Redis) is down', async () => {
    const published = await createPublished({ nodes: [n('t', 'trigger.manual'), n('end', 'end', { outcome: 'qualified', updateLeadStatus: false })], edges: [e('t', 'out', 'end')] });
    const lead = await makeLead();
    runner.inline = false;
    addJob.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:6379'));
    try {
      await startCampaign(published._id, [lead._id]);
      const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'fallback advance' });
      expect(run.outcome).toBe('qualified');
      expect(addJob).toHaveBeenCalled();
    } finally { runner.inline = true; addJob.mockReset(); addJob.mockImplementation(async () => ({})); }
  });

  it('email unsubscribe link cancels the lead\'s active runs', async () => {
    process.env.MESSAGE_UNSUBSCRIBE_SECRET = 'test-unsub-secret';
    const { createUnsubscribeToken } = await import('../../src/modules/messaging/unsubscribeToken.js');
    const { destinationHash } = await import('../../src/modules/messaging/destinationHash.js');
    const published = await waitingFor('message.replied');
    const lead = await makeLead({ email: 'anna@example.com' });
    await startCampaign(published._id, [lead._id]);
    await waitFor(async () => (await runOf(lead._id))?.wait?.kind === 'event');
    await messaging.unsubscribeEmail(createUnsubscribeToken({ leadId: String(lead._id), destinationHash: destinationHash('email', 'anna@example.com') }));
    const cancelled = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'cancelled' && r; }, { label: 'unsubscribe cancel' });
    expect(cancelled.error.code).toBe('opted_out_email');
  });

  it('an inbound email starts "message received (email)" workflows and resumes runs waiting for a reply', async () => {
    const { publishInboundEmail } = await import('../../src/modules/email/email.service.js');
    await createPublished({
      nodes: [n('t', 'trigger.message_received', { channel: 'email', keyword: 'pricing' }), n('end', 'end', { outcome: 'interested', updateLeadStatus: false })],
      edges: [e('t', 'out', 'end')],
    }, { name: 'Email reply', settings: { reentry: 'always' } });
    const lead = await makeLead({ email: 'Kunde@Example.ch' });
    const mail = (id, subject) => ({ _id: new mongoose.Types.ObjectId(), ownerId: actor, from: 'Kunde <kunde@example.ch>', subject, text: 'Hallo', id });
    await publishInboundEmail(mail(1, 'Just saying hi'));
    await new Promise((r) => setTimeout(r, 150));
    expect(await M.WorkflowRun.countDocuments({ leadId: lead._id })).toBe(0); // keyword filter
    await publishInboundEmail(mail(2, 'Pricing question'));
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'email trigger' });
    expect(run).toMatchObject({ outcome: 'interested', trigger: expect.objectContaining({ type: 'trigger.message_received' }) });
    await publishInboundEmail({ _id: new mongoose.Types.ObjectId(), ownerId: actor, from: 'stranger@nowhere.test', subject: 'pricing' });
    await new Promise((r) => setTimeout(r, 100));
    expect(await M.WorkflowRun.countDocuments({})).toBe(1); // unknown sender → no lead → nothing

    const waiting = await waitingFor('message.replied');
    const lead2 = await makeLead({ email: 'b@example.ch' });
    await startCampaign(waiting._id, [lead2._id]);
    await waitFor(async () => (await runOf(lead2._id))?.wait?.kind === 'event');
    await publishInboundEmail({ _id: new mongoose.Types.ObjectId(), ownerId: actor, from: 'b@example.ch', subject: 'Re: offer', text: 'yes' });
    expect(await waitFor(async () => { const r = await runOf(lead2._id); return r?.status === 'completed' && r; }, { label: 'reply resume' })).toMatchObject({ outcome: 'interested' });
  });

  it('event retention purges old events but keeps those of active runs', async () => {
    const published = await waitingFor('message.replied');
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);
    const active = await waitFor(async () => { const r = await runOf(lead._id); return r?.wait?.kind === 'event' && r; });
    const old = new Date(Date.now() - 400 * 86400000);
    await M.WorkflowEvent.collection.insertMany([
      { type: 'run.completed', at: old, runId: new mongoose.Types.ObjectId() },
      { type: 'schedule.fired', at: old, runId: null },
      { type: 'run.started', at: old, runId: active._id },
      { type: 'run.completed', at: new Date(Date.now() - 10 * 86400000), runId: new mongoose.Types.ObjectId() },
    ]);
    const before = await M.WorkflowEvent.countDocuments({});
    expect(await runner.purgeOldEvents({ days: 365 })).toMatchObject({ deleted: 2, keepDays: 365 });
    expect(await M.WorkflowEvent.countDocuments({})).toBe(before - 2);
    expect(await M.WorkflowEvent.exists({ runId: active._id, at: old })).toBeTruthy();
    expect(await runner.purgeOldEvents({ days: 0 })).toEqual({ deleted: 0, disabled: true });
    expect((await runner.purgeOldEvents({ days: 1 })).keepDays).toBe(30); // floor
  });

  it('email open pixel: always serves a GIF, ignores scanners, first real open resumes the run once', async () => {
    const { linkRouter } = await import('../../src/modules/workflowAutomation/workflow.public.routes.js');
    const app = express(); app.use('/t', linkRouter);
    const published = await waitingFor('message.opened');
    const lead = await makeLead();
    await startCampaign(published._id, [lead._id]);
    const run = await waitFor(async () => { const r = await runOf(lead._id); return r?.wait?.kind === 'event' && r; });
    const pixel = await links.ensure({ actionKey: `${run._id}:mail:1:0:open`, run, nodeId: 'mail', kind: 'open' });
    expect(pixel.trackedUrl).toMatch(new RegExp(`/t/o/${pixel.token}\\.gif$`));
    const gif = await request(app).get(`/t/o/${pixel.token}.gif`).set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/130');
    expect(gif.status).toBe(200);
    expect(gif.headers['content-type']).toBe('image/gif');
    expect((await runOf(lead._id)).status).toBe('waiting'); // instant load = scanner/prefetch
    expect((await request(app).get('/t/o/unknown-token-unknown.gif')).status).toBe(200); // never broken images
    await M.WorkflowLink.collection.updateOne({ _id: pixel._id }, { $set: { createdAt: new Date(Date.now() - 60_000) } });
    expect(await links.open(pixel.token, fakeReq({ 'user-agent': 'Mozilla/5.0 (compatible; Proofpoint)' }))).toEqual({ human: false });
    await request(app).get(`/t/o/${pixel.token}.gif`).set('User-Agent', 'Mozilla/5.0 (via ggpht.com GoogleImageProxy)');
    expect(await waitFor(async () => { const r = await runOf(lead._id); return r?.status === 'completed' && r; }, { label: 'open resumed run' })).toMatchObject({ outcome: 'interested' });
    expect(await links.open(pixel.token, fakeReq({ 'user-agent': 'Mozilla/5.0 GoogleImageProxy' }))).toEqual({ human: true, first: false });
    expect(await M.WorkflowLink.findById(pixel._id).lean()).toMatchObject({ humanClicks: 2, scannerHits: 2 });
    // The open pixel is not a link: /t/<token> must not redirect for it.
    expect((await request(app).get(`/t/${pixel.token}`).set('User-Agent', 'Mozilla/5.0').set('Accept-Language', 'de')).status).toBe(404);
    expect(await M.WorkflowEvent.exists({ type: 'link.clicked' })).toBeNull();
  });
});
