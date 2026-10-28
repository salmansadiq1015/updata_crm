import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

/**
 * End-to-end test of the AI calling AGENT — the exact constrained tool-API
 * contract that the LiveKit voice-agent worker drives during a live call. It
 * exercises the full brain of a call (context → disclose → ask → clarify →
 * conditional branch → confirm → finish → post-call processing → validated lead
 * status transition) without any telephony or OpenAI, which proves the agent
 * orchestration is correct independently of the audio transport.
 */

const addJob = jest.fn();
const logEvent = jest.fn();
const notify = jest.fn(async () => ({}));

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob, getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class MockLiveKitSipProvider {
    constructor() { this.configured = false; this.enabled = false; }
    eligibleFor() { return false; }
    async health() { return { configured: false, eligible: false, reason: 'not_configured' }; }
  },
  default: {
    configured: false,
    health: async () => ({ configured: false }),
    createOutboundCall: async () => ({ provider: 'livekit_sip', outcome: 'rejected', errorCode: 'NOT_CONFIGURED', safeToRetry: false }),
    dispatchAgent: async () => ({ provider: 'livekit_sip', outcome: 'rejected', errorCode: 'NOT_CONFIGURED' }),
    issueJoinToken: () => null,
    endCall: async () => ({ ended: false }),
  },
}));

let mongod;
let service;
let CallCampaign;
let CampaignRecipient;
let CallRecord;
let CallSuppression;
let LeadCallTransition;
let Lead;
let callAuth;

const actor = new mongoose.Types.ObjectId();

// A branching questionnaire: employees is only asked of decision-makers.
function campaignInput(overrides = {}) {
  return {
    name: 'Decision-maker qualification',
    questionnaire: { questions: [
      { fieldKey: 'dm', label: 'Decision maker', text: 'Are you the decision maker?', type: 'boolean', required: true, order: 1 },
      {
        fieldKey: 'employees', label: 'Employees', text: 'How many employees?', type: 'integer', required: true, order: 2,
        min: 1, condition: { all: [{ field: 'dm', equals: true }] },
      },
      { fieldKey: 'interest', label: 'Interest', text: 'Interested in a follow-up?', type: 'single_choice', required: true, order: 3, options: ['yes', 'no', 'later'], confirmCritical: true },
    ] },
    statusRules: [
      { id: 'qualified', when: { all: [{ field: 'dm', equals: true }, { field: 'interest', equals: 'yes' }] }, action: 'mark_qualified' },
      { id: 'callback', when: { any: [{ field: 'interest', equals: 'later' }] }, action: 'schedule_callback' },
    ],
    agentConfig: { agentName: 'Tess', organizationName: 'Acme', disclosure: 'Hi, AI from {company}.', maxCallSeconds: 300 },
    schedule: { maxConcurrency: 1, maxAttemptsPerLead: 2 },
    selection: { mode: 'explicit', leadIds: [] },
    ...overrides,
  };
}

async function makeLead(overrides = {}) {
  return Lead.create({
    leadNumber: `L-${Math.floor(Math.random() * 1e6)}`,
    name: 'Müller AG', type: 'business', source: 'manual',
    mobile: '+41791234567', website: 'https://muller.ch',
    address: { country: 'CH', city: 'Basel' }, sourceMetadata: { businessType: 'Heating' },
    createdBy: actor, ...overrides,
  });
}

/** Create a campaign + a dispatched call in 'ringing' (as _dispatchCall would leave it). */
async function dispatchCall(input = campaignInput(), leadOverrides = {}) {
  const lead = await makeLead(leadOverrides);
  input.selection = { mode: 'explicit', leadIds: [String(lead._id)] };
  const campaign = await service.createCampaign(input, actor);
  const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
  const internalCallId = `call_${recipient._id}_1`;
  const call = await CallRecord.create({
    campaignId: campaign._id, recipientId: recipient._id, leadId: lead._id,
    internalCallId, attemptNumber: 1, provider: 'livekit_sip', roomName: `crm-call-${internalCallId}`,
    state: 'ringing', initiatedAt: new Date(), conversationState: null, createdBy: actor,
  });
  // Mirrors _dispatchCall: the recipient points at its current attempt.
  await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { attemptCount: 1, state: 'dialing', lastCallId: call._id } });
  return { lead, campaign, recipient, internalCallId };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  service = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallSuppression = (await import('../../src/modules/aiCalling/callSuppression.model.js')).default;
  LeadCallTransition = (await import('../../src/modules/aiCalling/leadCallEvent.model.js')).LeadCallTransition;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  callAuth = await import('../../src/modules/aiCalling/callAuth.js');
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  addJob.mockClear(); logEvent.mockClear(); notify.mockClear();
});

describe('agent call context', () => {
  it('connects the call, discloses AI, and provides minimal lead context + first question', async () => {
    const { internalCallId, campaign } = await dispatchCall();
    const ctx = await service.getCallContext(internalCallId);

    expect(ctx.disclosure).toContain('Acme'); // {company} interpolated
    expect(ctx.systemPrompt).toMatch(/AI voice agent/i);
    expect(ctx.systemPrompt).toMatch(/disclose/i);
    expect(ctx.leadContext).toMatchObject({ businessName: 'Müller AG', city: 'Basel', category: 'Heating' });
    expect(ctx.leadContext).not.toHaveProperty('mobile'); // no phone leaked to the model
    expect(ctx.nextAction).toEqual({ type: 'disclose', reason: null });

    // Fetching context is NOT an answer for a phone call: the agent joins the
    // room while the SIP leg is still ringing.
    let call = await CallRecord.findOne({ internalCallId }).lean();
    expect(call.state).toBe('ringing');
    expect(call.answeredAt).toBeNull();

    // The worker reports the answer once SIP callStatus becomes "active".
    expect(await service.agentAnswered(internalCallId)).toMatchObject({ changed: true });
    expect(await service.agentAnswered(internalCallId)).toMatchObject({ changed: false }); // idempotent
    call = await CallRecord.findOne({ internalCallId }).lean();
    expect(call.state).toBe('in_progress');
    expect(call.answeredAt).toBeTruthy();
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id }).lean();
    expect(recipient.state).toBe('in_progress');
  });
});

describe('agent full happy path → qualified', () => {
  it('discloses, asks the branched questions, clarifies an invalid answer, confirms, and qualifies the lead', async () => {
    const { internalCallId, lead } = await dispatchCall();
    await service.getCallContext(internalCallId);

    // Disclose → first question is the decision-maker boolean.
    let res = await service.agentDisclose(internalCallId);
    expect(res.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'dm' } });

    // Answer dm=yes → the conditional employees question becomes eligible.
    res = await service.agentRecordAnswer(internalCallId, { fieldKey: 'dm', rawAnswer: 'yes, I am the owner' });
    expect(res).toMatchObject({ accepted: true, validation: 'valid' });
    expect(res.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'employees' } });

    // An unparseable number triggers a clarification (not an invented value).
    res = await service.agentRecordAnswer(internalCallId, { fieldKey: 'employees', rawAnswer: 'quite a lot honestly' });
    expect(res.validation).toBe('invalid');
    expect(res.nextAction).toMatchObject({ type: 'clarify', question: { fieldKey: 'employees' } });

    // A valid clarification is accepted and we advance.
    res = await service.agentRecordAnswer(internalCallId, { fieldKey: 'employees', rawAnswer: 'about 12 people' });
    expect(res.validation).toBe('valid');
    expect(res.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'interest' } });

    // interest=yes → critical question needs a read-back confirmation.
    res = await service.agentRecordAnswer(internalCallId, { fieldKey: 'interest', rawAnswer: 'yes definitely' });
    expect(res.nextAction).toMatchObject({ type: 'confirm', question: { fieldKey: 'interest' } });

    res = await service.agentConfirm(internalCallId, { fieldKey: 'interest', reply: 'yes' });
    expect(res.nextAction).toEqual({ type: 'finish', reason: null });

    // The worker ends the call → post-call processing runs.
    const out = await service.agentEndCall(internalCallId, { durationSeconds: 95 });
    expect(out).toMatchObject({ processed: true, disposition: 'answered_completed', qualification: 'qualified' });

    // Lead moved to qualified with an audit transition, and answers persisted + normalized.
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('qualified');
    const transition = await LeadCallTransition.findOne({ leadId: lead._id }).lean();
    expect(transition).toMatchObject({ previousStatus: 'new', newStatus: 'qualified', ruleId: 'qualified' });

    const call = await CallRecord.findOne({ internalCallId }).lean();
    const answers = Object.fromEntries(call.answers.map((a) => [a.questionFieldKey, a.normalizedValue]));
    expect(answers).toEqual({ dm: true, employees: 12, interest: 'yes' });
    expect(call.durationSeconds).toBe(95);
  });
});

describe('agent conditional branching', () => {
  it('skips the employees question when the person is not the decision maker, and schedules a callback', async () => {
    const { internalCallId, lead } = await dispatchCall();
    await service.getCallContext(internalCallId);
    await service.agentDisclose(internalCallId);

    // dm=no → employees (conditioned on dm=true) is skipped entirely.
    let res = await service.agentRecordAnswer(internalCallId, { fieldKey: 'dm', rawAnswer: 'no, I just work here' });
    expect(res.nextAction).toMatchObject({ type: 'ask', question: { fieldKey: 'interest' } });

    res = await service.agentRecordAnswer(internalCallId, { fieldKey: 'interest', rawAnswer: 'maybe later this year' });
    expect(res.nextAction).toMatchObject({ type: 'confirm', question: { fieldKey: 'interest' } });
    await service.agentConfirm(internalCallId, { fieldKey: 'interest', reply: 'yes' });

    const out = await service.agentEndCall(internalCallId, { durationSeconds: 40 });
    expect(out).toMatchObject({ disposition: 'answered_completed', qualification: 'callback' });

    // Callback → owner notification + lead not qualified; employees never recorded.
    expect(notify).toHaveBeenCalled();
    const call = await CallRecord.findOne({ internalCallId }).lean();
    expect(call.answers.find((a) => a.questionFieldKey === 'employees')).toBeUndefined();
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).not.toBe('qualified');
  });

  it('marks an unknown answer without inventing a value', async () => {
    const { internalCallId } = await dispatchCall();
    await service.getCallContext(internalCallId);
    await service.agentDisclose(internalCallId);
    await service.agentRecordAnswer(internalCallId, { fieldKey: 'dm', rawAnswer: 'yes' });
    const res = await service.agentMarkUnknown(internalCallId, { fieldKey: 'employees' });
    expect(res.validation).toBe('unknown');
    const call = await CallRecord.findOne({ internalCallId }).lean();
    const emp = call.answers?.length ? null : null; // answers saved at end; check conversationState
    const state = call.conversationState;
    expect(state.answers.employees.validation).toBe('unknown');
    expect(state.answers.employees.normalizedValue).toBeNull();
  });
});

describe('agent stop / do-not-contact during a call', () => {
  it('stops the questionnaire, suppresses the number, and does not qualify', async () => {
    const { internalCallId, recipient, lead } = await dispatchCall();
    await service.getCallContext(internalCallId);
    await service.agentDisclose(internalCallId);

    const res = await service.agentDoNotContact(internalCallId);
    expect(res.nextAction).toEqual({ type: 'end', reason: 'do_not_contact' });

    const out = await service.agentEndCall(internalCallId, { durationSeconds: 15 });
    expect(out.disposition).toBe('do_not_contact');

    const suppression = await CallSuppression.findOne({ phoneHash: recipient.phoneHash }).lean();
    expect(suppression?.reason).toBe('do_not_contact');
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).not.toBe('qualified');
  });
});

describe('agent incomplete call → review, never false-qualify', () => {
  it('routes a partial call with an unresolved required answer to human review', async () => {
    const { internalCallId, lead } = await dispatchCall();
    await service.getCallContext(internalCallId);
    await service.agentDisclose(internalCallId);
    await service.agentRecordAnswer(internalCallId, { fieldKey: 'dm', rawAnswer: 'yes' });
    // employees + interest never answered → unresolved required.
    const out = await service.agentEndCall(internalCallId, { durationSeconds: 20 });
    expect(['answered_partial', 'no_answer']).toContain(out.disposition);
    expect(out.qualification).toBe('review');
    const call = await CallRecord.findOne({ internalCallId }).lean();
    expect(call.reviewRequired).toBe(true);
    const updatedLead = await Lead.findById(lead._id).lean();
    expect(updatedLead.status).toBe('new'); // unchanged — never false-qualified
  });
});

describe('agent constrained-tool security', () => {
  it('rejects an unknown question fieldKey (the model cannot invent fields)', async () => {
    const { internalCallId } = await dispatchCall();
    await service.getCallContext(internalCallId);
    await service.agentDisclose(internalCallId);
    await expect(service.agentRecordAnswer(internalCallId, { fieldKey: 'salary', rawAnswer: '100k' }))
      .rejects.toThrow(/Unknown question/);
  });

  it('issues and verifies a per-call agent token scoped to one call', () => {
    const token = callAuth.issueAgentToken('call_abc');
    expect(callAuth.verifyAgentToken(token)).toMatchObject({ scope: 'ai-call-agent', callId: 'call_abc' });
    expect(callAuth.verifyAgentToken('garbage')).toBeNull();
    expect(callAuth.verifyAgentToken(callAuth.issueAgentToken('call_abc', -1))).toBeNull(); // expired
  });
});
