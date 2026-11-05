import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * AI follow-up calling, end to end over the REAL pipeline (only telephony, the queue,
 * audit and notifications are mocked): agent launch → tick → dial → agent tool API →
 * processCallResults → decision engine → persisted dispatcher → follow-up campaign →
 * context-aware follow-up call → CRM update. Plus the safety properties: do-not-contact,
 * global switch, lead-level lock, retry policy, idempotent launch, human controls.
 */
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';

const actor = new mongoose.Types.ObjectId();
const outsider = new mongoose.Types.ObjectId();
const addJob = jest.fn(async () => ({}));
const dial = jest.fn(async () => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: crypto.randomUUID() }));
const notify = jest.fn(async () => ({}));
jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({ default: { addJob, getQueueStats: jest.fn(async () => ({ workers: 1 })) } }));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class { constructor() { this.configured = false; } eligibleFor() { return false; } async health() { return { configured: false, eligible: false }; } },
  default: { configured: true, health: async () => ({ configured: true, eligible: true }), createOutboundCall: (...args) => dial(...args), roomStatus: async () => 'unknown', endCall: async () => ({ ended: true }) },
}));

let db; let agents; let calling; let followUps; let Campaign; let Recipients; let Calls; let Lead; let FollowUp; let inbox; let CallSuppression; let User; let InboundCall;
const always = { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 1, maxAttemptsPerLead: 2, retryDelayMinutes: 1, minMinutesBetweenAttempts: 0 };
const questions = [
  { fieldKey: 'dm', label: 'Decision maker', text: 'Are you the decision maker?', type: 'boolean', required: true, order: 1 },
  { fieldKey: 'timeline', label: 'Timeline', text: 'When would you like to start?', type: 'single_choice', options: ['now', 'later'], required: true, order: 2 },
];
const rules = [{ id: 'qualified', when: { all: [{ field: 'dm', equals: true }, { field: 'timeline', equals: 'now' }] }, action: 'mark_qualified' }];
const agentInput = (extra = {}) => ({
  name: 'Sarah', title: 'Sales Agent', availability: 'active', agentType: 'sales',
  agentConfig: { organizationName: 'Updata', disclosure: 'I am an AI assistant for {company}.', objective: 'Qualify interest', language: 'en' },
  questionnaire: { questions }, statusRules: rules, schedule: always,
  followUp: { enabled: true, autoCall: true, triggers: ['CALLBACK_REQUESTED', 'TEMPORARILY_UNAVAILABLE'], schedule: always, maxRounds: 3 },
  ...extra,
});
const viewer = { id: String(actor), isSupervisor: false };
async function makeLead(extra = {}) {
  return Lead.create({ leadNumber: `L-${crypto.randomUUID()}`, name: 'Müller AG', source: 'manual', mobile: `+4179${Math.floor(1e6 + Math.random() * 8e6)}`, address: { country: 'CH' }, createdBy: actor, status: 'contacted', ...extra });
}
async function tick(campaignId) {
  const c = await Campaign.findById(campaignId).lean();
  return calling.tickCampaign(campaignId, c.tickToken);
}
async function liveCall(campaignId) {
  const call = await Calls.findOne({ campaignId }).sort({ createdAt: -1 }).lean();
  await calling.agentAnswered(call.internalCallId);
  await calling.agentDisclose(call.internalCallId);
  return call;
}

beforeAll(async () => {
  db = await MongoMemoryServer.create(); await mongoose.connect(db.getUri());
  agents = (await import('../../src/modules/aiCalling/callingAgent.service.js')).default;
  calling = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  followUps = (await import('../../src/modules/aiCalling/followUpCalling.service.js')).default;
  Campaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  Recipients = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  Calls = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  FollowUp = (await import('../../src/modules/crm/leadFollowUp.model.js')).default;
  inbox = (await import('../../src/modules/crm/leadFollowUp.service.js')).default;
  User = (await import('../../src/modules/auth/user.model.js')).default;
  InboundCall = (await import('../../src/modules/inboundCalling/inboundCall.model.js')).default;
  await (await import('../../src/migrations/031_calling_agents.js')).up();
  await (await import('../../src/migrations/046_ai_follow_up_calling.js')).up();
}, 60000);
afterAll(async () => { await mongoose.disconnect(); await db?.stop(); });
beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  dial.mockClear(); notify.mockClear(); addJob.mockClear();
  await followUps.setSettings(actor, { enabled: true });
});

/** Sarah calls the lead; the lead answers dm=yes and asks to be called back "in 10 minutes". */
async function initialCallWithCallback({ routeTo = null, when = 'Please call me again in 10 minutes', followUp = {}, human = false, lead: leadExtra = {} } = {}) {
  const lead = await makeLead(leadExtra);
  let sarah = await agents.create(agentInput({ followUp: { ...agentInput().followUp, ...(routeTo ? { routes: { CALLBACK_REQUESTED: String(routeTo) } } : {}), ...followUp } }), actor);
  sarah = await agents.assign(sarah._id, { leadIds: [String(lead._id)], version: sarah.version }, actor);
  const campaign = await agents.launch(sarah._id, { idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true }, actor);
  await tick(campaign._id);
  const call = await liveCall(campaign._id);
  await calling.agentRecordAnswer(call.internalCallId, { fieldKey: 'dm', rawAnswer: 'yes' });
  await calling.agentRequestCallback(call.internalCallId, { when, human });
  await calling.agentEndCall(call.internalCallId, { durationSeconds: 40 });
  return { lead, sarah, campaign, call: await Calls.findById(call._id).lean() };
}

describe('AI follow-up calling — end to end', () => {
  it('callback in 10 minutes → routed follow-up agent → continues the conversation → lead qualified', async () => {
    const david = await agents.create(agentInput({ name: 'David', title: 'Follow-up Agent', agentType: 'follow_up' }), actor);
    const { lead, call, campaign } = await initialCallWithCallback({ routeTo: david._id });
    expect(call.disposition).toBe('callback_requested');

    // 1. One AI follow-up, owned by the routed agent, due 10 minutes after the call ended.
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    expect(fu).toMatchObject({ status: 'open', taskType: 'AI_CALL', channel: 'phone', sourceKey: `ai_call:${call._id}` });
    expect(fu.automation).toMatchObject({ mode: 'ai', state: 'scheduled', reason: 'CALLBACK_REQUESTED', round: 1 });
    expect(String(fu.automation.agentId)).toBe(String(david._id));
    expect(String(fu.automation.previousCallId)).toBe(String(call._id));
    expect(fu.automation.timeResolution).toMatchObject({ kind: 'relative', approximate: false });
    expect(fu.nextDueAt.getTime() - new Date(call.endedAt).getTime()).toBe(10 * 60_000);
    expect(await FollowUp.countDocuments({ leadId: lead._id })).toBe(1); // upgraded, not duplicated
    expect((await Lead.findById(lead._id).lean()).pipelineStage).toBe('FOLLOW_UP');
    // Sarah's own campaign does NOT count as blocked by the follow-up, and the follow-up isn't a "campaign" in history.
    expect((await calling.listCampaigns(actor, { agentId: String(campaign.agentId) })).data).toHaveLength(1);

    // 2. Before it is due nothing launches; when due, the dispatcher launches exactly one follow-up campaign.
    expect((await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() - 60_000) })).launched).toBe(0);
    const due = new Date(fu.nextDueAt.getTime() + 1000);
    const [a, b] = await Promise.all([followUps.sweep({ now: due }), followUps.sweep({ now: due })]);
    expect(a.launched + b.launched).toBe(1); // claim lease: two dispatchers never double-launch
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    expect(fuCampaign).toMatchObject({ status: 'running', runMode: 'scheduled' });
    expect(String(fuCampaign.followUpId)).toBe(String(fu._id));
    expect(String(fuCampaign.agentId)).toBe(String(david._id));
    expect((await FollowUp.findById(fu._id).lean()).automation.state).toBe('queued');

    // 3. The follow-up call: linked, with the earlier answer carried over and the previous call in context.
    await tick(fuCampaign._id);
    expect(dial).toHaveBeenCalledTimes(2);
    expect((await FollowUp.findById(fu._id).lean()).automation.state).toBe('calling');
    const fuCall = await Calls.findOne({ campaignId: fuCampaign._id }).lean();
    expect(String(fuCall.followUpId)).toBe(String(fu._id));
    expect(String(fuCall.previousCallId)).toBe(String(call._id));
    expect(fuCall.conversationState.answers.dm).toMatchObject({ prefilled: true, normalizedValue: true, confirmed: true });
    await calling.agentAnswered(fuCall.internalCallId);
    const ctx = await calling.getCallContext(fuCall.internalCallId);
    expect(ctx.systemPrompt).toMatch(/FOLLOW-UP CALL CONTEXT/);
    expect(ctx.systemPrompt).toMatch(/asked to be called back/);
    expect(ctx.systemPrompt).toMatch(/do NOT ask again[\s\S]*\[dm\]/);
    expect(ctx.systemPrompt).toMatch(/Still missing: \[timeline\]/);
    expect(ctx.systemPrompt).toMatch(/Never restart the interview/);
    expect(ctx.followUp.knownFields).toEqual(['dm']);
    const afterDisclose = await calling.agentDisclose(fuCall.internalCallId);
    expect(afterDisclose.nextAction).toMatchObject({ type: 'ask', question: expect.objectContaining({ fieldKey: 'timeline' }) }); // dm is NOT asked again

    // 4. The lead answers the missing question → qualified; the follow-up closes with a summary.
    await calling.agentRecordAnswer(fuCall.internalCallId, { fieldKey: 'timeline', rawAnswer: 'now' });
    await calling.agentEndCall(fuCall.internalCallId, { durationSeconds: 30 });
    const processed = await Calls.findById(fuCall._id).lean();
    expect(processed).toMatchObject({ disposition: 'answered_completed', qualification: 'qualified' });
    expect(processed.answers.find((x) => x.questionFieldKey === 'dm').source).toBe('previous_call'); // provenance kept
    expect(processed.answers.find((x) => x.questionFieldKey === 'timeline').source).toBe('agent_tool');
    const closed = await FollowUp.findById(fu._id).lean();
    expect(closed).toMatchObject({ status: 'done' });
    expect(closed.automation).toMatchObject({ state: 'completed', outcome: 'COMPLETED' });
    expect(closed.completionNote).toMatch(/AI follow-up call: completed/);
    expect((await Lead.findById(lead._id).lean()).status).toBe('qualified');
    expect(closed.automation.history.map((h) => h.state)).toEqual(['scheduled', 'queued', 'calling', 'completed']);
  });

  it('inbox shows AI-managed follow-ups with agent + state, filters by management, counts AI work', async () => {
    const { lead } = await initialCallWithCallback();
    const page = await inbox.list({ scope: 'mine', bucket: 'open', management: 'ai' }, viewer);
    expect(page.data).toHaveLength(1);
    expect(page.data[0].automation).toMatchObject({ mode: 'ai', state: 'scheduled', reason: 'CALLBACK_REQUESTED', agent: { name: 'Sarah', agentType: 'sales' } });
    expect((await inbox.list({ scope: 'mine', bucket: 'open', management: 'human' }, viewer)).data).toHaveLength(0);
    const summary = await inbox.summary({ scope: 'mine' }, viewer);
    expect(summary).toMatchObject({ aiManaged: 1, aiScheduled: 1, attention: 0 });
    // Mobile legacy endpoint: additive fields only.
    const legacy = await inbox.listLegacy({}, actor);
    expect(legacy[0]).toMatchObject({ leadId: String(lead._id), followUpId: expect.any(String), automation: { mode: 'ai', state: 'scheduled', agentName: 'Sarah' } });
  });

  it('automation OFF: the callback is still recorded for a person, and nothing is ever dialled', async () => {
    await followUps.setSettings(actor, { enabled: false, reason: 'maintenance' });
    const { lead, call } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    expect(fu.automation.mode).toBe('human');
    expect(fu.nextDueAt.getTime() - new Date(call.endedAt).getTime()).toBe(10 * 60_000); // still a real due time
    const r = await followUps.sweep({ now: new Date(Date.now() + 3_600_000) });
    expect(r.disabled).toBe(true);
    expect(dial).toHaveBeenCalledTimes(1);
  });

  it('a lead marked do-not-contact after scheduling is never called; the follow-up is cancelled', async () => {
    const { lead } = await initialCallWithCallback();
    const recipient = await Recipients.findOne({ leadId: lead._id }).lean();
    await CallSuppression.create({ phoneHash: recipient.phoneHash, leadId: lead._id, reason: 'do_not_contact', source: 'admin' });
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    const r = await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    expect(r.results[0]).toMatchObject({ skipped: 'do_not_contact' });
    const after = await FollowUp.findById(fu._id).lean();
    expect(after).toMatchObject({ status: 'cancelled', automation: { state: 'cancelled' } });
    expect(dial).toHaveBeenCalledTimes(1);
    expect(await Campaign.countDocuments({ kind: 'follow_up' })).toBe(0);
  });

  it('do-not-contact said on the follow-up call stops all automation for the lead', async () => {
    const { lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await tick(fuCampaign._id);
    const fuCall = await liveCall(fuCampaign._id);
    await calling.agentDoNotContact(fuCall.internalCallId);
    await calling.agentEndCall(fuCall.internalCallId, {});
    expect((await FollowUp.findById(fu._id).lean()).automation.outcome).toBe('DO_NOT_CONTACT');
    expect(await FollowUp.countDocuments({ leadId: lead._id, 'automation.mode': 'ai', 'automation.state': 'scheduled' })).toBe(0);
    expect(await CallSuppression.countDocuments({ leadId: lead._id })).toBe(1);
  });

  it('no answer: the follow-up follows the retry policy, then schedules the next round (temporarily unavailable)', async () => {
    const { lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await tick(fuCampaign._id);
    let attempt = await Calls.findOne({ campaignId: fuCampaign._id }).sort({ createdAt: -1 }).lean();
    await calling.agentEndCall(attempt.internalCallId, { disposition: 'no_answer' });
    expect((await FollowUp.findById(fu._id).lean()).automation.state).toBe('retry_scheduled');
    await Recipients.updateOne({ campaignId: fuCampaign._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await tick(fuCampaign._id);
    expect((await FollowUp.findById(fu._id).lean()).automation.state).toBe('calling');
    attempt = await Calls.findOne({ campaignId: fuCampaign._id }).sort({ attemptNumber: -1 }).lean();
    expect(attempt.attemptNumber).toBe(2);
    await calling.agentEndCall(attempt.internalCallId, { disposition: 'no_answer' });
    const finished = await FollowUp.findById(fu._id).lean();
    expect(finished.automation).toMatchObject({ state: 'no_answer', outcome: 'TEMPORARILY_UNAVAILABLE' });
    const next = await FollowUp.findOne({ leadId: lead._id, 'automation.round': 2 }).lean();
    expect(next.automation).toMatchObject({ mode: 'ai', state: 'scheduled', reason: 'TEMPORARILY_UNAVAILABLE' });
    expect(String(next.automation.previousFollowUpId)).toBe(String(fu._id));
  });

  it('the same lead is never on two calls at once, across campaigns and agents', async () => {
    const lead = await makeLead();
    const mk = async (name) => {
      let a = await agents.create(agentInput({ name, followUp: { enabled: false } }), actor);
      a = await agents.assign(a._id, { leadIds: [String(lead._id)], version: a.version }, actor);
      return agents.launch(a._id, { idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true }, actor);
    };
    const first = await mk('Alex');
    const second = await mk('Emma');
    await tick(first._id);
    expect(dial).toHaveBeenCalledTimes(1);
    await tick(second._id); // Alex's call is still live
    expect(dial).toHaveBeenCalledTimes(1);
    const parked = await Recipients.findOne({ campaignId: second._id }).lean();
    expect(parked.state).toBe('queued');
    expect(parked.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(parked.attemptCount).toBe(0); // deferral never consumes an attempt
  });

  it('human controls: pause, resume, change agent, call now (manual works while automation is off), assign to a person', async () => {
    const emma = await agents.create(agentInput({ name: 'Emma', agentType: 'appointment' }), actor);
    const { lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();

    await expect(followUps.pause(fu._id, { id: String(outsider), isSupervisor: false })).rejects.toThrow(/owner/);
    expect((await followUps.pause(fu._id, viewer)).automation.state).toBe('paused');
    expect((await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) })).launched).toBe(0);
    expect((await followUps.resume(fu._id, viewer)).automation.state).toBe('scheduled');

    const changed = await followUps.assignAgent(fu._id, { agentId: String(emma._id), instructions: 'Offer Tuesday or Thursday.' }, viewer);
    expect(changed.automation).toMatchObject({ agentId: String(emma._id), state: 'scheduled', instructions: 'Offer Tuesday or Thursday.' });

    await followUps.setSettings(actor, { enabled: false });
    const started = await followUps.callNow(fu._id, viewer);
    expect(started.automation.state).toBe('queued');
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    expect(fuCampaign.runMode).toBe('immediate'); // a deliberate human "Call now"
    expect(fuCampaign.agentConfig.instructions).toMatch(/Offer Tuesday or Thursday/);
    await expect(followUps.callNow(fu._id, viewer)).rejects.toThrow(/in progress/);

    const human = await followUps.assignHuman(fu._id, {}, viewer);
    expect(human.automation).toMatchObject({ mode: 'human', state: 'requires_human' });
    expect((await Campaign.findById(fuCampaign._id).lean()).status).toBe('cancelled');
  });

  it('completing or cancelling the follow-up in the inbox stops its automation', async () => {
    const { lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await inbox.cancel(fu._id, { reason: 'Spoke on WhatsApp' }, { ...viewer, isSupervisor: true });
    expect((await FollowUp.findById(fu._id).lean()).automation.state).toBe('cancelled');
    expect((await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) })).launched).toBe(0);
  });

  it('a lead\'s automation can be paused as a whole', async () => {
    const { lead } = await initialCallWithCallback();
    expect(await followUps.pauseLead(lead._id, viewer)).toEqual({ paused: 1 });
    expect(await followUps.resumeLead(lead._id, viewer)).toEqual({ resumed: 1 });
  });

  it('a restart loses nothing: an expired claim and a stale active state are recovered from persisted data', async () => {
    const { lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    // A dispatcher crashed right after claiming: the lease expires and the next run picks it up.
    await FollowUp.updateOne({ _id: fu._id }, { $set: { 'automation.claimUntil': new Date(Date.now() - 1000) } });
    expect((await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) })).launched).toBe(1);
    // The campaign was cancelled outside the follow-up flow while queued: reconcile closes it.
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await calling.cancelCampaign(fuCampaign._id, actor);
    await FollowUp.updateOne({ _id: fu._id }, { $set: { 'automation.stateChangedAt': new Date(Date.now() - 10 * 60_000) } });
    expect(await followUps.reconcile()).toBe(1);
    expect((await FollowUp.findById(fu._id).lean()).automation.state).toBe('cancelled');
  });

  it('agent summary reports real persisted metrics', async () => {
    const { sarah, lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await tick(fuCampaign._id);
    const fuCall = await liveCall(fuCampaign._id);
    await calling.agentRecordAnswer(fuCall.internalCallId, { fieldKey: 'timeline', rawAnswer: 'now' });
    await calling.agentEndCall(fuCall.internalCallId, { durationSeconds: 30 });
    const s = await followUps.summary(actor, { agentId: sarah._id });
    expect(s).toMatchObject({ total: 1, completed: 1, attempts: 1, connected: 1, qualified: 1, answerRate: 1, qualificationRate: 1, avgAttemptsPerLead: 1, leadsReached: 1 });
    expect(s.automation.enabled).toBe(true);
    const queue = await followUps.listForAgent(sarah._id, actor, {});
    expect(queue[0]).toMatchObject({ lead: { name: 'Müller AG' }, automation: { state: 'completed', call: { qualification: 'qualified' } } });
  });
});

describe('AI follow-up calling — escalation, routing, cross-channel lock, campaign analytics', () => {
  const user = async (status = 'active') => (await User.collection.insertOne({ firstName: 'Sup', lastName: status, email: `${crypto.randomUUID()}@test.local`, status, isDeleted: false })).insertedId;
  const escalationCall = () => notify.mock.calls.map(([payload]) => payload).find((p) => p.type === 'ai_calling.follow_up_human');

  it('escalations go to the configured recipients (active only), in-app + push + email, and the first recipient takes over', async () => {
    const [sup1, sup2, gone] = [await user(), await user(), await user('inactive')];
    const { lead } = await initialCallWithCallback({ human: true, followUp: { escalation: { userIds: [String(gone), String(sup1), String(sup2)], assignTo: 'first_recipient', email: true } } });
    const fu = await FollowUp.findOne({ leadId: lead._id, 'automation.state': 'requires_human' }).lean();
    expect(fu).toMatchObject({ priority: 'HIGH', automation: { mode: 'human', reason: 'HUMAN_FOLLOW_UP_REQUIRED' } });
    expect(String(fu.ownerId)).toBe(String(sup1));
    const sent = escalationCall();
    expect(sent.channels).toEqual(['IN_APP', 'PUSH', 'EMAIL']);
    expect(sent.recipientIds).toEqual(expect.arrayContaining([String(sup1), String(sup2), String(actor)]));
    expect(sent.recipientIds).not.toContain(String(gone));
    expect(sent.priority).toBe('HIGH');
    expect(sent.payload.link).toMatch(/\/leads\/follow-ups\?followUp=/);
  });

  it('without agent recipients the organisation default is told and the owner keeps it', async () => {
    const sup = await user();
    await followUps.setSettings(actor, { escalationUserIds: [String(sup)] });
    const { lead } = await initialCallWithCallback({ human: true });
    const fu = await FollowUp.findOne({ leadId: lead._id, 'automation.state': 'requires_human' }).lean();
    expect(String(fu.ownerId)).toBe(String(actor));
    expect(escalationCall().recipientIds).toEqual(expect.arrayContaining([String(actor), String(sup)]));
    expect(escalationCall().channels).toEqual(['IN_APP', 'PUSH']);
    expect((await followUps.settings({ fresh: true })).escalationUserIds).toEqual([String(sup)]);
  });

  it('routing rules on lead facts pick the agent and are recorded on the follow-up', async () => {
    const emma = await agents.create(agentInput({ name: 'Emma', agentType: 'appointment' }), actor);
    const { lead } = await initialCallWithCallback({ followUp: { routingRules: [
      { name: 'German leads', agentId: String(emma._id), when: { countries: ['DE'] } },
      { name: 'Swiss manual leads', agentId: String(emma._id), when: { countries: ['CH'], leadSources: ['manual'] } },
    ] } });
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    expect(String(fu.automation.agentId)).toBe(String(emma._id));
    expect(fu.automation.routingRule).toBe('Swiss manual leads');
  });

  it('an outbound call never dials a lead who is on an incoming call; it waits and retries without using an attempt', async () => {
    const { lead } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const inbound = await InboundCall.create({ createdBy: actor, internalCallId: `in_${crypto.randomUUID()}`, dedupeKey: crypto.randomUUID(), leadId: lead._id, status: 'AI_ACTIVE' });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    const r = await tick(fuCampaign._id);
    expect(dial).toHaveBeenCalledTimes(1); // only the first, original call
    expect(r).toMatchObject({ dispatched: 0 });
    const recipient = await Recipients.findOne({ campaignId: fuCampaign._id }).lean();
    expect(recipient).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect(await followUps.leadBusy(lead._id)).toBe(true);
    // The incoming call ends → the follow-up call goes ahead.
    await InboundCall.updateOne({ _id: inbound._id }, { $set: { status: 'COMPLETED', processedAt: new Date() } });
    await Recipients.updateOne({ _id: recipient._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await tick(fuCampaign._id);
    expect(dial).toHaveBeenCalledTimes(2);
  });

  it('the inbound side sees a lead the AI is calling outbound (so the receptionist AI never takes it)', async () => {
    const { leadActiveCall } = await import('../../src/modules/aiCalling/leadCallLock.js');
    const lead = await makeLead();
    let a = await agents.create(agentInput({ name: 'Alex', followUp: { enabled: false } }), actor);
    a = await agents.assign(a._id, { leadIds: [String(lead._id)], version: a.version }, actor);
    const campaign = await agents.launch(a._id, { idempotencyKey: crypto.randomUUID(), mode: 'now', continueAcrossDays: true }, actor);
    await tick(campaign._id);
    expect(await leadActiveCall(lead._id)).toMatchObject({ busy: true, kind: 'outbound' });
  });

  it('campaign-level follow-up analytics and CSV export cover every round produced by the campaign', async () => {
    const { lead, campaign } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    expect(String(fu.automation.originCampaignId)).toBe(String(campaign._id));
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await tick(fuCampaign._id);
    const fuCall = await liveCall(fuCampaign._id);
    await calling.agentRecordAnswer(fuCall.internalCallId, { fieldKey: 'timeline', rawAnswer: 'now' });
    await calling.agentEndCall(fuCall.internalCallId, { durationSeconds: 30 });
    const s = await followUps.summary(actor, { campaignId: String(campaign._id) });
    expect(s).toMatchObject({ total: 1, completed: 1, attempts: 1, connected: 1, qualified: 1 });
    const csv = await followUps.exportCsv(actor, { campaignId: String(campaign._id) });
    const [header, row] = csv.replace(/^\uFEFF/, '').split('\n');
    expect(header).toMatch(/^followUpId,leadNumber,leadName/);
    expect(row).toContain('Müller AG');
    expect(row).toContain('COMPLETED');
    expect(row).toContain(String(campaign._id));
    expect(row).toContain('answered_completed');
    await expect(followUps.summary(outsider, { campaignId: String(campaign._id) })).rejects.toThrow(/not found/i);
  });

  it('contact limits: a callback the lead asked for is exempt from the minimum gap; an automatic retry is not', async () => {
    const { ContactPolicySettings } = await import('../../src/modules/contactPolicy/contactPolicy.models.js');
    const { default: policy } = await import('../../src/modules/contactPolicy/contactPolicy.service.js');
    await ContactPolicySettings.create({ key: 'global', enabled: true, minGapMinutes: 60 });
    policy._settingsCache = null;
    const { lead } = await initialCallWithCallback(); // lead was just reached → inside the 60-minute gap
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await tick(fuCampaign._id);
    expect(dial).toHaveBeenCalledTimes(2); // the requested 10-minute callback goes ahead
    // The same lead with an automatic (not lead-requested) follow-up waits for the gap.
    await FollowUp.updateOne({ _id: fu._id }, { $set: { 'automation.reason': 'TEMPORARILY_UNAVAILABLE' } });
    const call = await Calls.findOne({ campaignId: fuCampaign._id }).lean();
    await calling.agentEndCall(call.internalCallId, { disposition: 'no_answer' });
    await Recipients.updateOne({ campaignId: fuCampaign._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    await Lead.updateOne({ _id: lead._id }, { $set: { lastContactedAt: new Date() } });
    await tick(fuCampaign._id);
    expect(dial).toHaveBeenCalledTimes(2);
    const held = await Recipients.findOne({ campaignId: fuCampaign._id }).lean();
    expect(held).toMatchObject({ state: 'queued', attemptCount: 1 }); // deferred by the policy, no attempt used
    expect(held.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 30 * 60_000);
    await ContactPolicySettings.deleteMany({}); policy._settingsCache = null;
  });

  it('the next round keeps pointing at the original campaign', async () => {
    const { lead, campaign } = await initialCallWithCallback();
    const fu = await FollowUp.findOne({ leadId: lead._id }).lean();
    await followUps.sweep({ now: new Date(fu.nextDueAt.getTime() + 1000) });
    const fuCampaign = await Campaign.findOne({ kind: 'follow_up' }).lean();
    await tick(fuCampaign._id);
    const fuCall = await liveCall(fuCampaign._id);
    await calling.agentRequestCallback(fuCall.internalCallId, { when: 'in 2 hours' });
    await calling.agentEndCall(fuCall.internalCallId, {});
    const next = await FollowUp.findOne({ leadId: lead._id, 'automation.round': 2 }).lean();
    expect(String(next.automation.originCampaignId)).toBe(String(campaign._id));
    expect((await followUps.summary(actor, { campaignId: String(campaign._id) })).total).toBe(2);
  });
});
