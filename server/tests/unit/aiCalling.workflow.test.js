import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// Existing workflow fixtures predate the consent ledger; dedicated consent
// tests exercise enforcement, while these retain their original focus.
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
// Pin the recipient's local calling window so the tests do not depend on the wall clock.
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';

const addJob = jest.fn();
const logEvent = jest.fn();
const notify = jest.fn(async () => ({}));
const roomStatusMock = jest.fn(async () => 'unknown');

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob, getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
// Keep the telephony provider offline so dispatch returns an honest rejection.
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class MockLiveKitSipProvider {
    constructor() { this.configured = false; this.enabled = false; }
    eligibleFor() { return false; }
    async health() { return { configured: false, eligible: false, reason: 'not_configured' }; }
  },
  default: {
    configured: false,
    health: async () => ({ configured: false, eligible: false, reason: 'not_configured' }),
    createOutboundCall: async () => ({ provider: 'livekit_sip', outcome: 'rejected', errorCode: 'NOT_CONFIGURED', errorMessage: 'not configured', safeToRetry: false }),
    endCall: async () => ({ ended: false }),
    roomStatus: (...args) => roomStatusMock(...args),
  },
}));

let mongod;
let service;
let CampaignRecipient;
let CallRecord;
let CallSuppression;
let LeadCallTransition;
let Lead;
let CallCampaign;

const actor = new mongoose.Types.ObjectId();

function baseInput(overrides = {}) {
  return {
    name: 'Qualification run',
    questionnaire: { questions: [
      { fieldKey: 'active', label: 'Active', text: 'Operating?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'interest', label: 'Interest', text: 'Interested?', type: 'single_choice', required: true, order: 2, options: ['yes', 'no', 'later'] },
    ] },
    statusRules: [
      { id: 'q', when: { all: [{ field: 'active', equals: true }, { field: 'interest', equals: 'yes' }] }, action: 'mark_qualified' },
    ],
    agentConfig: { agentName: 'Tess', organizationName: 'Acme' },
    // Tests that exercise dispatch must not depend on the wall clock or day of
    // week. Production campaigns still retain their configured call windows.
    schedule: {
      timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' },
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 1, maxAttemptsPerLead: 2,
    },
    selection: { mode: 'explicit', leadIds: [] },
    ...overrides,
  };
}

async function makeLead(overrides = {}) {
  return Lead.create({
    leadNumber: `L-${Math.floor(Math.random() * 1e6)}`,
    name: 'Müller AG', type: 'business', source: 'manual',
    mobile: '+41791234567', address: { country: 'CH', city: 'Basel' },
    createdBy: actor, ...overrides,
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  service = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  LeadCallTransition = (await import('../../src/modules/aiCalling/leadCallEvent.model.js')).LeadCallTransition;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  addJob.mockClear(); logEvent.mockClear(); notify.mockClear();
  roomStatusMock.mockReset(); roomStatusMock.mockResolvedValue('unknown');
});

describe('aiCalling campaign creation + eligibility', () => {
  it('resolves explicit leads and flags missing phone / suppressed / duplicates', async () => {
    const good = await makeLead();
    const noPhone = await makeLead({ mobile: null, phone: null });
    const dupe = await makeLead({ mobile: '+41791234567' }); // same number as good

    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [good._id, noPhone._id, dupe._id].map(String) } }),
      actor,
    );
    expect(campaign.summary.total).toBe(3);
    expect(campaign.summary.missingPhone).toBe(1);

    const recips = await CampaignRecipient.find({ campaignId: campaign._id }).lean();
    const byLead = Object.fromEntries(recips.map((r) => [String(r.leadId), r]));
    expect(byLead[String(good._id)].state).toBe('draft');
    expect(byLead[String(noPhone._id)].state).toBe('ineligible');
    expect(byLead[String(dupe._id)].eligibility.reasons).toContain('duplicate_phone');
  });

  it('previews eligibility before a campaign is created (same reasons as the real recipients)', async () => {
    const good = await makeLead({ mobile: '+41791110021' });
    const noPhone = await makeLead({ mobile: null, phone: null });
    const dupe = await makeLead({ mobile: '+41791110021' }); // same number as good

    const preview = await service.previewEligibility(actor, { leadIds: [good._id, noPhone._id, dupe._id].map(String), channel: 'voice' });
    expect(preview).toMatchObject({ total: 3, found: 3, unavailable: 0, eligible: 1 });
    expect(preview.reasonCounts).toMatchObject({ missing_phone: 1, duplicate_phone: 1 });
    const byLead = Object.fromEntries(preview.leads.map((l) => [l.leadId, l]));
    expect(byLead[String(good._id)]).toMatchObject({ eligible: true, phone: '+41791110021' });
    expect(byLead[String(noPhone._id)].reasons).toContain('missing_phone');
    expect(byLead[String(dupe._id)].reasons).toContain('duplicate_phone');
  });

  it('deletes a campaign and its recipients/calls, but refuses a running one', async () => {
    const lead = await makeLead({ mobile: '+41791110031' });
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    await CallRecord.create({
      campaignId: campaign._id, recipientId: (await CampaignRecipient.findOne({ campaignId: campaign._id }))._id,
      leadId: lead._id, internalCallId: `del_${campaign._id}_1`, attemptNumber: 1, state: 'completed', createdBy: actor,
    });

    // Running → refused.
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'running' } });
    await expect(service.deleteCampaign(campaign._id, actor)).rejects.toThrow(/Pause or cancel the campaign before deleting/);

    // Paused → deleted, with its recipients and calls gone.
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'paused' } });
    expect(await service.deleteCampaign(campaign._id, actor)).toMatchObject({ deleted: true });
    expect(await CallCampaign.findById(campaign._id)).toBeNull();
    expect(await CampaignRecipient.countDocuments({ campaignId: campaign._id })).toBe(0);
    expect(await CallRecord.countDocuments({ campaignId: campaign._id })).toBe(0);
  });

  it('bulk-deletes the deletable campaigns and reports the ones it skipped', async () => {
    const [a, b] = await Promise.all([
      service.createCampaign(baseInput({ name: 'Del A', selection: { mode: 'explicit', leadIds: [String((await makeLead({ mobile: '+41791110041' }))._id)] } }), actor),
      service.createCampaign(baseInput({ name: 'Del B', selection: { mode: 'explicit', leadIds: [String((await makeLead({ mobile: '+41791110042' }))._id)] } }), actor),
    ]);
    await CallCampaign.updateOne({ _id: b._id }, { $set: { status: 'running' } }); // not deletable

    const result = await service.deleteCampaigns([String(a._id), String(b._id)], actor);
    expect(result.deleted).toBe(1);
    expect(result.skipped).toEqual([{ id: String(b._id), reason: 'Pause or cancel the campaign before deleting it' }]);
    expect(await CallCampaign.findById(a._id)).toBeNull();
    expect(await CallCampaign.findById(b._id)).not.toBeNull();
  });

  it('rejects a questionnaire with duplicate field keys', async () => {
    const lead = await makeLead();
    const input = baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } });
    input.questionnaire.questions[1].fieldKey = 'active';
    await expect(service.createCampaign(input, actor)).rejects.toThrow(/Duplicate question fieldKey/);
  });

  it('edits only an owned draft while preserving its enrolled recipients', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const beforeRecipients = await CampaignRecipient.countDocuments({ campaignId: campaign._id });
    const questions = [...campaign.questionnaire.questions.map((question) => ({ ...question }))];
    questions[0].text = 'Are you still operating?';

    const updated = await service.updateCampaign(campaign._id, {
      name: 'Updated qualification run', questionnaire: { questions },
    }, actor);

    expect(updated.name).toBe('Updated qualification run');
    expect(updated.questionnaireVersion).toBe(campaign.questionnaireVersion + 1);
    expect(updated.questionnaire.questions[0].text).toBe('Are you still operating?');
    expect(await CampaignRecipient.countDocuments({ campaignId: campaign._id })).toBe(beforeRecipients);
    await expect(service.updateCampaign(campaign._id, { name: 'Intruder edit' }, new mongoose.Types.ObjectId())).rejects.toThrow(/not found/i);

    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'paused' } });
    await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: `edit_guard_${campaign._id}`, attemptNumber: 1, state: 'in_progress', createdBy: actor,
    });
    await expect(service.updateCampaign(campaign._id, { name: 'Unsafe mid-call edit' }, actor)).rejects.toThrow(/active calls/i);
  });

  it('requires evidence-backed call consent and rechecks eligibility after a grant', async () => {
    process.env.AI_CALLING_REQUIRE_CONSENT = 'true';
    try {
      const lead = await makeLead();
      const campaign = await service.createCampaign(
        baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
      );
      let recipient = await CampaignRecipient.findOne({ campaignId: campaign._id }).lean();
      expect(recipient).toMatchObject({ state: 'ineligible', eligibility: { eligible: false } });
      expect(recipient.eligibility.reasons).toContain('consent_required');

      await service.updateConsent(lead._id, {
        status: 'granted', evidence: 'Lead opted in on the signed contact form', source: 'crm_test',
      }, actor);
      recipient = await CampaignRecipient.findById(recipient._id).lean();
      expect(recipient).toMatchObject({ state: 'draft', eligibility: { eligible: true, reasons: [] } });

      await service.updateConsent(lead._id, { status: 'revoked', evidence: 'Lead withdrew consent' }, actor);
      recipient = await CampaignRecipient.findById(recipient._id).lean();
      expect(recipient).toMatchObject({ state: 'suppressed', eligibility: { eligible: false } });
    } finally {
      process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
    }
  });

  it('removes selected recipients, keeps mid-call ones, and drops them from the selection', async () => {
    const leads = await Promise.all([makeLead({ mobile: '+41791110011' }), makeLead({ mobile: '+41791110012' }), makeLead({ mobile: '+41791110013' })]);
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: leads.map((l) => String(l._id)) } }), actor,
    );
    const recipients = await CampaignRecipient.find({ campaignId: campaign._id }).sort({ createdAt: 1 }).lean();
    expect(recipients).toHaveLength(3);
    // The third recipient is in a live call: it must be skipped, not deleted.
    await CampaignRecipient.updateOne({ _id: recipients[2]._id }, { $set: { state: 'in_progress' } });

    const result = await service.removeRecipients(campaign._id, actor, { recipientIds: recipients.map((r) => String(r._id)) });
    expect(result.removed).toBe(2);
    expect(result.skipped).toEqual([{ id: String(recipients[2]._id), reason: 'in_call' }]);

    const left = await CampaignRecipient.find({ campaignId: campaign._id }).lean();
    expect(left.map((r) => String(r._id))).toEqual([String(recipients[2]._id)]);
    const saved = await CallCampaign.findById(campaign._id).lean();
    expect(saved.selection.leadIds.map(String)).toEqual([String(recipients[2].leadId)]);
  });

  it('refuses to start with a reason and fix when every lead is held (no consent)', async () => {
    process.env.AI_CALLING_REQUIRE_CONSENT = 'true';
    try {
      const leads = await Promise.all([makeLead({ mobile: '+41791110001' }), makeLead({ mobile: '+41791110002' })]);
      const campaign = await service.createCampaign(
        baseInput({ selection: { mode: 'explicit', leadIds: leads.map((l) => String(l._id)) } }), actor,
      );
      await expect(service.startCampaign(campaign._id, actor, {}))
        .rejects.toThrow(/None of this campaign's 2 leads can be called right now\. 2 leads need recorded call consent — open each lead's AI Calls tab and Record verified consent/);
    } finally {
      process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
    }
  });
});

describe('aiCalling post-call processing', () => {
  async function seedCallWithAnswers(leadOverrides, answers, { isTest = false } = {}) {
    const lead = await makeLead(leadOverrides);
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] }, isTest }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: `call_${recipient._id}_1`, attemptNumber: 1, isTest,
      state: 'in_progress', conversationState: { disclosed: true, endedReason: null, answers },
      createdBy: actor,
    });
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { attemptCount: 1, lastCallId: call._id } });
    return { lead, campaign, recipient, call };
  }

  it('qualifies a lead via a status rule and writes an audit transition', async () => {
    const { lead, call } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true, confirmed: true },
      interest: { validation: 'valid', normalizedValue: 'yes', confirmed: true },
    });
    const res = await service.processCallResults(call._id, { disposition: null, durationSeconds: 60 });
    expect(res.qualification).toBe('qualified');

    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('qualified');
    expect(updatedLead.lastContactChannel).toBe('phone');
    expect(updatedLead.pipelineStage).toBe('FOLLOW_UP');
    expect(updatedLead.latestCall).toMatchObject({ callStatus: 'CALL_COMPLETED', qualificationStatus: 'QUALIFIED', recommendedAction: 'INTRODUCTION_EMAIL' });
    const { default: FollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js');
    const followUp = await FollowUp.findOne({ leadId: lead._id }).lean();
    expect(followUp).toMatchObject({ channel: 'email', status: 'open', source: { type: 'ai_call', qualification: 'qualified' } });
    expect(String(followUp.source.callRecordId)).toBe(String(call._id));

    const transition = await LeadCallTransition.findOne({ leadId: lead._id }).lean();
    expect(transition).toMatchObject({ previousStatus: 'new', newStatus: 'qualified', ruleId: 'q' });
  });

  it('is idempotent — a duplicate processing does not re-apply', async () => {
    const { call } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true },
      interest: { validation: 'valid', normalizedValue: 'yes' },
    });
    await service.processCallResults(call._id, { durationSeconds: 60 });
    const second = await service.processCallResults(call._id, { durationSeconds: 60 });
    expect(second.duplicate).toBe(true);
    expect(await LeadCallTransition.countDocuments({ leadId: call.leadId })).toBe(1);
    const { default: FollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js');
    expect(await FollowUp.countDocuments({ leadId: call.leadId })).toBe(1);
  });

  it.each([null, 'saved@example.com'])('makes a collected email available while preserving an existing address (%s)', async (existingEmail) => {
    const { lead, call, campaign } = await seedCallWithAnswers({ email: existingEmail }, {
      active: { validation: 'valid', normalizedValue: true }, interest: { validation: 'valid', normalizedValue: 'yes' },
      email: { validation: 'valid', normalizedValue: 'New@Example.com', confirmed: true },
    });
    await CallCampaign.updateOne({ _id: campaign._id }, { $push: { 'questionnaire.questions': {
      fieldKey: 'email', type: 'email', label: 'Email', text: 'Where should we send the information?', order: 3, mapTo: 'email', confirmCritical: true,
    } } });
    await service.processCallResults(call._id, {});
    expect((await Lead.findById(lead._id).lean()).email).toBe(existingEmail || 'new@example.com');
    expect((await CallRecord.findById(call._id).lean()).answers.find((answer) => answer.questionFieldKey === 'email').normalizedValue).toBe('New@Example.com');
  });

  it('reconciles a failed follow-up handoff without redialing or losing the saved call', async () => {
    const { lead, call, recipient } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true },
      interest: { validation: 'valid', normalizedValue: 'yes' },
    });
    const { default: followUps } = await import('../../src/modules/crm/leadFollowUp.service.js');
    const failing = jest.spyOn(followUps, 'fromAiCall').mockRejectedValueOnce(new Error('temporary storage failure'));
    try {
      await expect(service.processCallResults(call._id, {})).rejects.toThrow('temporary storage failure');
      const saved = await CallRecord.findById(call._id).lean();
      expect(saved.state).toBe('completed');
      expect(saved.answers).toHaveLength(2);
      expect(saved.resultsProcessedAt).toBeNull();
      expect((await Lead.findById(lead._id).lean()).pipelineStage).toBe('LEAD');
      await CallRecord.updateOne({ _id: call._id }, { $set: { processingLeaseUntil: new Date(0) } });
      await service.processCallResults(call._id, { source: 'reconcile' });
      expect((await Lead.findById(lead._id).lean()).pipelineStage).toBe('FOLLOW_UP');
      expect((await CampaignRecipient.findById(recipient._id).lean()).state).toBe('completed');
      expect(await CallRecord.countDocuments({ leadId: lead._id })).toBe(1);
    } finally { failing.mockRestore(); }
  });

  it('retains validated answers after lost audio but requires review before qualification', async () => {
    const { lead, call, recipient } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true },
      interest: { validation: 'valid', normalizedValue: 'yes' },
    });
    await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.audioLostAt': new Date() } });
    await service.processCallResults(call._id, {});
    const saved = await CallRecord.findById(call._id).lean();
    expect(saved).toMatchObject({ disposition: 'interrupted', qualification: 'review', reviewRequired: true });
    expect(saved.answers).toHaveLength(2);
    const updated = await Lead.findById(lead._id).lean();
    expect(updated.pipelineStage).toBe('LEAD');
    expect(updated.latestCall.callStatus).toBe('CALL_INTERRUPTED');
    expect((await CampaignRecipient.findById(recipient._id).lean()).state).toBe('completed');
  });

  it('handles a cancellation webhook without classifying it as failure or scheduling a retry', async () => {
    const { lead, call, recipient } = await seedCallWithAnswers({}, {});
    await service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'cancelled', providerEventId: 'cancel-event' });
    expect((await CallRecord.findById(call._id).lean()).state).toBe('cancelled');
    expect((await CampaignRecipient.findById(recipient._id).lean()).state).toBe('cancelled');
    expect((await Lead.findById(lead._id).lean()).latestCall.callStatus).toBe('CALL_CANCELLED');
  });

  it('records a completed call separately from a failed qualification result', async () => {
    const { lead, call } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: false },
      interest: { validation: 'valid', normalizedValue: 'yes' },
    });
    await service.processCallResults(call._id, {});
    expect((await CallRecord.findById(call._id).lean()).state).toBe('completed');
    const stored = await Lead.findById(lead._id).lean();
    expect(stored).toMatchObject({ status: 'unqualified', pipelineStage: 'LEAD', latestCall: { callStatus: 'CALL_COMPLETED', qualificationStatus: 'NOT_QUALIFIED' } });
    const { default: FollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js');
    expect(await FollowUp.countDocuments({ leadId: lead._id })).toBe(0);
  });

  it('cancels automatic outreach after refusal while retaining human-created tasks', async () => {
    const { lead, call } = await seedCallWithAnswers({}, {});
    const { default: FollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js');
    const due = new Date();
    const automatic = await FollowUp.create({ leadId: lead._id, ownerId: actor, createdBy: null, dueAt: due, nextDueAt: due, source: { type: 'ai_call' } });
    const manual = await FollowUp.create({ leadId: lead._id, ownerId: actor, createdBy: actor, dueAt: due, nextDueAt: due, source: { type: 'manual' } });
    await Lead.updateOne({ _id: lead._id }, { $set: { pipelineStage: 'FOLLOW_UP' } });
    await CallRecord.updateOne({ _id: call._id }, { $set: { 'conversationState.endedReason': 'declined' } });
    await service.processCallResults(call._id, { disposition: 'failed' });
    expect((await FollowUp.findById(automatic._id).lean()).status).toBe('cancelled');
    expect((await FollowUp.findById(manual._id).lean()).status).toBe('open');
    expect((await CallRecord.findById(call._id).lean()).disposition).toBe('declined');
    expect((await Lead.findById(lead._id).lean()).pipelineStage).toBe('LEAD');
  });

  it('automatically persists a grounded recap when a call ends without agent notes', async () => {
    const { call } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true, rawAnswer: 'Yes, we are operating.' },
    });
    await service.processCallResults(call._id, {});
    const saved = await CallRecord.findById(call._id).lean();
    expect(saved.callNotes).toMatchObject({ source: 'call_results', description: 'Qualification run' });
    expect(saved.callNotes.summary).toContain('Yes, we are operating.');
    expect(saved.callNotes.blockers).toContain('1 required answer(s) unresolved.');
    const second = await service.processCallResults(call._id, { callNotes: { summary: 'Overwrite' } });
    expect(second.duplicate).toBe(true);
    expect((await CallRecord.findById(call._id).lean()).callNotes).toEqual(saved.callNotes);
  });

  it('accepts a late agent recap once after provider completion without reapplying outcomes', async () => {
    const { call } = await seedCallWithAnswers({}, {});
    await service.processCallResults(call._id, {});
    const notes = { description: 'Discussed availability', summary: 'The lead requested time to review.', blockers: ['Needs time to review'] };
    await service.agentEndCall(call.internalCallId, { callNotes: notes });
    const saved = await CallRecord.findById(call._id).lean();
    expect(saved.callNotes).toMatchObject({ ...notes, blockers: expect.arrayContaining(notes.blockers), source: 'ai_agent' });
    await service.agentEndCall(call.internalCallId, { callNotes: { ...notes, summary: 'Replay' } });
    expect((await CallRecord.findById(call._id).lean()).callNotes).toEqual(saved.callNotes);
  });

  it('a do-not-contact request suppresses the number and does not qualify', async () => {
    const { lead, recipient, call } = await seedCallWithAnswers({}, {});
    await CallRecord.updateOne({ _id: call._id }, { $set: { 'conversationState.endedReason': 'do_not_contact' } });
    await service.processCallResults(call._id, {});
    const suppression = await CallSuppression.findOne({ phoneHash: recipient.phoneHash }).lean();
    expect(suppression).toBeTruthy();
    expect(suppression.reason).toBe('do_not_contact');
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).not.toBe('qualified');
  });

  it('incomplete required answers mark the call for review, never qualified', async () => {
    const { lead, call } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true },
      // interest left unanswered → unresolved required
    });
    const res = await service.processCallResults(call._id, {});
    expect(res.qualification).toBe('review');
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('new'); // unchanged
    expect(updatedLead.latestCall.qualificationStatus).toBe('PARTIALLY_QUALIFIED');
    expect(updatedLead.pipelineStage).toBe('LEAD');
    const { default: FollowUp } = await import('../../src/modules/crm/leadFollowUp.model.js');
    expect(await FollowUp.countDocuments({ leadId: lead._id })).toBe(0);
    expect(notify).toHaveBeenCalled();
    const stored = await CallRecord.findById(call._id).lean();
    expect(stored.reviewRequired).toBe(true);
  });

  it('a test campaign never mutates the lead', async () => {
    const { lead, call } = await seedCallWithAnswers({}, {
      active: { validation: 'valid', normalizedValue: true },
      interest: { validation: 'valid', normalizedValue: 'yes' },
    }, { isTest: true });
    await service.processCallResults(call._id, {});
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('new');
    expect(await LeadCallTransition.countDocuments({ leadId: lead._id })).toBe(0);
  });

  it('never moves a converted lead automatically (protected status)', async () => {
    const { lead, call } = await seedCallWithAnswers({ status: 'converted' }, {
      active: { validation: 'valid', normalizedValue: true },
      interest: { validation: 'valid', normalizedValue: 'yes' },
    });
    await service.processCallResults(call._id, {});
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('converted');
    expect(await LeadCallTransition.countDocuments({ leadId: lead._id })).toBe(0);
  });
});

describe('aiCalling CSV export', () => {
  it('exports call attempts as CSV with flattened answers and a UTF-8 BOM', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: `call_${recipient._id}_1`, attemptNumber: 1, state: 'completed',
      disposition: 'answered_completed', qualification: 'qualified', durationSeconds: 72,
      answers: [{ questionFieldKey: 'active', label: 'Active', type: 'boolean', normalizedValue: true, validation: 'valid' }],
      createdBy: actor,
    });
    const csv = await service.exportCampaign(campaign._id, actor);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('callId,leadNumber,leadName');
    expect(csv).toContain('answered_completed');
    expect(csv).toContain('qualified');
    expect(csv).toContain('active=yes(valid)');
  });

  it('refuses to export a campaign owned by another user', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const other = new mongoose.Types.ObjectId();
    await expect(service.exportCampaign(campaign._id, other)).rejects.toThrow();
  });
});

describe('aiCalling browser simulation', () => {
  it('runs the question engine end-to-end and previews the outcome', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    let r = await service.simulate(campaign._id, actor, { disclose: true });
    expect(r.nextAction.type).toBe('ask');
    expect(r.nextAction.question.fieldKey).toBe('active');
    r = await service.simulate(campaign._id, actor, { state: r.state, userText: 'yes we are' });
    expect(r.nextAction.question.fieldKey).toBe('interest');
    r = await service.simulate(campaign._id, actor, { state: r.state, userText: 'yes definitely' });
    expect(r.nextAction.type).toBe('finish');
    expect(r.outcomePreview.qualification).toBe('qualified');
  });
});

describe('aiCalling dispatch / tick', () => {
  it('claims a queued recipient, creates a call attempt, and does not retry a permanent rejection', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    await service.startCampaign(campaign._id, actor, {});
    // Provider mock is offline → createOutboundCall returns a permanent rejection.
    // The worker passes the chain token the start minted (stale tokens exit).
    const { tickToken } = await CallCampaign.findById(campaign._id).lean();
    expect(await service.tickCampaign(campaign._id, 'stale-token')).toEqual({ superseded: true });
    const res = await service.tickCampaign(campaign._id, tickToken);
    expect(res.dispatched).toBe(1);

    const call = await CallRecord.findOne({ campaignId: campaign._id });
    expect(call).toBeTruthy();
    expect(call.attemptNumber).toBe(1);
    expect(call.state).toBe('failed');
    expect(call.dispatchStartedAt).toBeTruthy(); // marked before the provider request

    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    expect(recipient.state).toBe('failed'); // permanent reject → terminal, not retry_scheduled
    expect(recipient.attemptCount).toBe(1);
  });
});

describe('aiCalling reconciliation sweep', () => {
  async function campaignWithRecipient() {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    return { lead, campaign, recipient };
  }

  it('turns a long-ringing call into no_answer once the provider confirms the room is gone', async () => {
    roomStatusMock.mockResolvedValueOnce('gone');
    const { campaign, recipient } = await campaignWithRecipient();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_ring_${recipient._id}`, attemptNumber: 1, state: 'ringing',
      roomName: `crm-call-rc_ring_${recipient._id}`,
      initiatedAt: new Date(Date.now() - 6 * 60_000), createdBy: actor,
    });
    const res = await service.reconcileStuckCalls();
    expect(res.noAnswer).toBeGreaterThanOrEqual(1);
    const updated = await CallRecord.findById(call._id).lean();
    expect(updated.disposition).toBe('no_answer');
    expect(updated.resultsProcessedAt).toBeTruthy();
  });

  it('processes an in_progress call that ran past its max duration', async () => {
    const { campaign, recipient } = await campaignWithRecipient();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_long_${recipient._id}`, attemptNumber: 1, state: 'in_progress',
      answeredAt: new Date(Date.now() - 60 * 60_000), // far beyond default 300s + grace
      conversationState: { disclosed: true, endedReason: null, answers: { active: { validation: 'valid', normalizedValue: true } } },
      createdBy: actor,
    });
    const res = await service.reconcileStuckCalls();
    expect(res.timedOut).toBeGreaterThanOrEqual(1);
    const updated = await CallRecord.findById(call._id).lean();
    expect(['completed', 'no_answer', 'failed']).toContain(updated.state);
    expect(updated.resultsProcessedAt).toBeTruthy();
  });

  it('parks (never redials) a long-ringing call when the provider state is unknown', async () => {
    roomStatusMock.mockResolvedValueOnce('unknown');
    const { campaign, recipient } = await campaignWithRecipient();
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'dialing', attemptCount: 1 } });
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_unknown_${recipient._id}`, attemptNumber: 1, state: 'ringing',
      roomName: `crm-call-rc_unknown_${recipient._id}`,
      initiatedAt: new Date(Date.now() - 6 * 60_000), dispatchStartedAt: new Date(Date.now() - 6 * 60_000), createdBy: actor,
    });
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { lastCallId: call._id } });
    const res = await service.reconcileStuckCalls();
    expect(res.parked).toBe(1);
    const updated = await CallRecord.findById(call._id).lean();
    expect(updated.state).toBe('needs_reconcile');
    const r = await CampaignRecipient.findById(recipient._id).lean();
    expect(r.state).toBe('failed'); // NOT retry_scheduled: a human decides
    expect(r.finalDisposition).toBe('needs_reconcile');
  });

  it('leaves a long-ringing call alone while the provider still reports the SIP leg live', async () => {
    roomStatusMock.mockResolvedValueOnce('live');
    const { campaign, recipient } = await campaignWithRecipient();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_live_${recipient._id}`, attemptNumber: 1, state: 'ringing',
      roomName: `crm-call-rc_live_${recipient._id}`,
      initiatedAt: new Date(Date.now() - 6 * 60_000), createdBy: actor,
    });
    const res = await service.reconcileStuckCalls();
    expect(res.stillLive).toBe(1);
    expect((await CallRecord.findById(call._id).lean()).state).toBe('ringing');
  });

  it('does not auto-retry an ambiguous needs_reconcile attempt', async () => {
    const { campaign, recipient } = await campaignWithRecipient();
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { state: 'failed', finalDisposition: 'needs_reconcile', attemptCount: 1 } });
    await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_amb_${recipient._id}`, attemptNumber: 1, state: 'needs_reconcile',
      reconciliation: { needed: true, note: 'ambiguous' }, createdBy: actor,
    });
    await CallRecord.updateMany({}, { $set: { createdAt: new Date(Date.now() - 60 * 60_000) } });
    await service.reconcileStuckCalls();
    const r = await CampaignRecipient.findById(recipient._id).lean();
    expect(r.state).toBe('failed');
    expect(r.nextAttemptAt == null).toBe(true);
  });
});

describe('aiCalling analytics', () => {
  it('computes rates, a daily time series, and a CSV with a totals row', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    await CallRecord.create([
      { campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id, internalCallId: `an1_${recipient._id}`, attemptNumber: 1, state: 'completed', disposition: 'answered_completed', qualification: 'qualified', durationSeconds: 60, createdBy: actor },
      { campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id, internalCallId: `an2_${recipient._id}`, attemptNumber: 2, state: 'no_answer', disposition: 'no_answer', durationSeconds: 0, createdBy: actor },
    ]);
    const a = await service.analytics(actor, {});
    expect(a.totalCalls).toBe(2);
    expect(a.answered).toBe(1);
    expect(a.answerRate).toBeCloseTo(0.5, 2);
    expect(a.qualified).toBe(1);
    expect(a.byDisposition.map((d) => d._id).sort()).toEqual(['answered_completed', 'no_answer']);
    expect(a.byDay.reduce((s, d) => s + d.calls, 0)).toBe(2);

    const csv = await service.analyticsCsv(actor, {});
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('date,calls,answered,qualified');
    expect(csv).toContain('TOTAL,2,1,1');
  });
});

describe('aiCalling call history', () => {
  it('lists only the owner\'s production calls and supports lead search and review filters', async () => {
    const lead = await makeLead({ name: 'History Search Lead' });
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    const other = new mongoose.Types.ObjectId();
    await CallRecord.create([
      {
        campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
        internalCallId: `history_prod_${recipient._id}`, attemptNumber: 1,
        state: 'completed', disposition: 'answered_partial', reviewRequired: true, createdBy: actor,
      },
      {
        campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
        internalCallId: `history_test_${recipient._id}`, attemptNumber: -1,
        state: 'completed', provider: 'livekit_web', isTest: true, createdBy: actor,
      },
      {
        campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
        internalCallId: `history_other_${recipient._id}`, attemptNumber: 2,
        state: 'failed', createdBy: other,
      },
    ]);

    const result = await service.listCalls(actor, { search: 'History Search', reviewRequired: true });
    expect(result.pagination.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ internalCallId: `history_prod_${recipient._id}`, reviewRequired: true });
    expect(result.data[0].leadId).toMatchObject({ name: 'History Search Lead' });

    const withTests = await service.listCalls(actor, { includeTests: true });
    expect(withTests.pagination.total).toBe(2);
    expect(withTests.data.map((call) => call.internalCallId)).not.toContain(`history_other_${recipient._id}`);
  });
});

describe('aiCalling live monitoring', () => {
  it('reports in-flight calls with current question + progress', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: `live_${recipient._id}`, attemptNumber: 1, state: 'in_progress',
      answeredAt: new Date(Date.now() - 20_000),
      conversationState: { disclosed: true, endedReason: null, answers: { active: { validation: 'valid', normalizedValue: true } } },
      createdBy: actor,
    });
    const active = await service.activeCalls(campaign._id, actor);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ leadName: 'Müller AG', state: 'in_progress', answered: 1, total: 2 });
    expect(active[0].currentQuestion).toBe('Interest'); // next unanswered question label
    expect(active[0].elapsedSeconds).toBeGreaterThanOrEqual(18);
  });
});

describe('aiCalling human review', () => {
  it('applies answer corrections, marks them human-reviewed, and clears the review flag', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: `review_${recipient._id}`, attemptNumber: 1, state: 'completed',
      disposition: 'answered_partial', reviewRequired: true, resultsProcessedAt: new Date(),
      answers: [{ questionFieldKey: 'employees', label: 'Employees', type: 'integer', rawAnswer: 'a lot', normalizedValue: null, validation: 'invalid' }],
      createdBy: actor,
    });
    const updated = await service.reviewAnswers(call._id, actor, {
      answers: [{ questionFieldKey: 'employees', normalizedValue: 25, validation: 'valid' }],
      qualification: 'qualified',
    });
    expect(updated.reviewRequired).toBe(false);
    expect(updated.qualification).toBe('qualified');
    const ans = updated.answers.find((a) => a.questionFieldKey === 'employees');
    expect(ans.normalizedValue).toBe(25);
    expect(ans.validation).toBe('valid');
    expect(ans.reviewStatus).toBe('corrected');
    expect(ans.source).toBe('human_review');
  });

  it('refuses review of a call owned by another user', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: `review_other_${recipient._id}`, attemptNumber: 1, state: 'completed', createdBy: actor,
    });
    await expect(service.reviewAnswers(call._id, new mongoose.Types.ObjectId(), {})).rejects.toThrow();
  });
});

describe('aiCalling browser web test', () => {
  it('fails honestly when LiveKit is not configured (never fakes a call)', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    await expect(service.startWebTest(campaign._id, actor, {})).rejects.toThrow(/LiveKit/i);
  });
});

describe('aiCalling webhook idempotency', () => {
  it('ignores duplicate webhook events', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(
      baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } }), actor,
    );
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
      internalCallId: 'crm-webhook-1', attemptNumber: 1, state: 'ringing', providerCallId: 'pc1',
      createdBy: actor,
    });
    const evt = { provider: 'livekit_sip', providerCallId: 'pc1', internalCallId: 'crm-webhook-1', eventType: 'answered', occurredAt: new Date() };
    const first = await service.applyWebhookEvent(evt);
    const second = await service.applyWebhookEvent(evt);
    expect(first.matched).toBe(true);
    expect(second.duplicate).toBe(true);
    const updated = await CallRecord.findById(call._id).lean();
    expect(updated.state).toBe('in_progress');
  });
});
