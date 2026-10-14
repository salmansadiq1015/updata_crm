import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

// Existing workflow fixtures predate the consent ledger; dedicated consent
// tests exercise enforcement, while these retain their original focus.
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

const addJob = jest.fn();
const logEvent = jest.fn();
const notify = jest.fn(async () => ({}));

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
  },
}));

let mongod;
let service;
let CampaignRecipient;
let CallRecord;
let CallSuppression;
let LeadCallTransition;
let Lead;

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
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  addJob.mockClear(); logEvent.mockClear(); notify.mockClear();
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

  it('rejects a questionnaire with duplicate field keys', async () => {
    const lead = await makeLead();
    const input = baseInput({ selection: { mode: 'explicit', leadIds: [String(lead._id)] } });
    input.questionnaire.questions[1].fieldKey = 'active';
    await expect(service.createCampaign(input, actor)).rejects.toThrow(/Duplicate question fieldKey/);
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
    const res = await service.tickCampaign(campaign._id);
    expect(res.dispatched).toBe(1);

    const call = await CallRecord.findOne({ campaignId: campaign._id });
    expect(call).toBeTruthy();
    expect(call.attemptNumber).toBe(1);
    expect(call.state).toBe('failed');

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

  it('turns a long-ringing, never-answered call into no_answer', async () => {
    const { campaign, recipient } = await campaignWithRecipient();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_ring_${recipient._id}`, attemptNumber: 1, state: 'ringing',
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

  it('conservatively fails an ambiguous dispatch left unresolved', async () => {
    const { campaign, recipient } = await campaignWithRecipient();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId,
      internalCallId: `rc_amb_${recipient._id}`, attemptNumber: 1, state: 'needs_reconcile',
      reconciliation: { needed: true, note: 'ambiguous' }, createdBy: actor,
      createdAt: new Date(Date.now() - 11 * 60_000),
    });
    // createdAt is set by timestamps; force it old.
    await CallRecord.updateOne({ _id: call._id }, { $set: { createdAt: new Date(Date.now() - 11 * 60_000) } });
    const res = await service.reconcileStuckCalls();
    expect(res.failed).toBeGreaterThanOrEqual(1);
    const updated = await CallRecord.findById(call._id).lean();
    expect(updated.state).toBe('failed');
    expect(updated.reconciliation.resolvedAt).toBeTruthy();
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
      disposition: 'answered_partial', reviewRequired: true,
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
    const evt = { provider: 'livekit_sip', providerCallId: 'pc1', internalCallId: 'crm-webhook-1', eventType: 'participant_joined', occurredAt: new Date() };
    const first = await service.applyWebhookEvent(evt);
    const second = await service.applyWebhookEvent(evt);
    expect(first.matched).toBe(true);
    expect(second.duplicate).toBe(true);
    const updated = await CallRecord.findById(call._id).lean();
    expect(updated.state).toBe('in_progress');
  });
});
