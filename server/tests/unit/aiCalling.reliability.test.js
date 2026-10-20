import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

/**
 * Reliability guarantees of the AI calling backend: exactly-once post-call
 * processing, lost-update-free tool calls, single tick chain, pause/cancel per
 * dial, crash recovery that never redials an ambiguous attempt, out-of-order
 * webhooks, company-wide consent, and manual-override protection.
 */
process.env.AI_CALLING_REQUIRE_CONSENT = 'false';

const addJob = jest.fn(async () => ({}));
const logEvent = jest.fn();
const notify = jest.fn(async () => ({}));
const createOutboundCall = jest.fn();
const roomStatus = jest.fn(async () => 'unknown');
const endCall = jest.fn(async () => ({ ended: true }));
const dispatchAgent = jest.fn(async () => ({ outcome: 'accepted', provider: 'livekit_sip', providerCallId: 'disp1' }));

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob, getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: notify } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class MockLiveKitSipProvider {
    constructor() { this.configured = false; this.enabled = false; }
    eligibleFor() { return false; }
    async health() { return { configured: false, eligible: false }; }
  },
  default: {
    configured: true,
    livekitReady: true,
    wsUrl: 'wss://test.livekit.cloud',
    health: async () => ({ configured: true, eligible: true }),
    createOutboundCall: (...a) => createOutboundCall(...a),
    roomStatus: (...a) => roomStatus(...a),
    endCall: (...a) => endCall(...a),
    dispatchAgent: (...a) => dispatchAgent(...a),
    issueJoinToken: () => 'join-token',
  },
}));

let mongod;
let service;
let consentStatus;
let sanitizeReportedDisposition;
let retryDelayMs;
let startOfLocalDay;
let estimateCallCost;
let CallCampaign;
let CampaignRecipient;
let CallRecord;
let CallConsent;
let LeadCallTransition;
let Lead;
let AuditLog;
let phoneHash;

const actor = new mongoose.Types.ObjectId();
const otherUser = new mongoose.Types.ObjectId();

const accepted = (id = 'sip_1') => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: id, safeToRetry: false });

function baseInput(leadIds, overrides = {}) {
  return {
    name: 'Reliability run',
    questionnaire: { questions: [
      { fieldKey: 'active', label: 'Active', text: 'Operating?', type: 'boolean', required: true, order: 1 },
      { fieldKey: 'interest', label: 'Interest', text: 'Interested?', type: 'single_choice', required: true, order: 2, options: ['yes', 'no'] },
    ] },
    statusRules: [
      { id: 'q', when: { all: [{ field: 'active', equals: true }, { field: 'interest', equals: 'yes' }] }, action: 'mark_qualified' },
    ],
    agentConfig: { agentName: 'Tess', organizationName: 'Acme' },
    schedule: {
      timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' },
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 1, maxAttemptsPerLead: 3,
    },
    selection: { mode: 'explicit', leadIds: leadIds.map(String) },
    ...overrides,
  };
}

let seq = 0;
async function makeLead(overrides = {}) {
  seq += 1;
  return Lead.create({
    leadNumber: `L-${100000 + seq}`, name: `Lead ${seq}`, type: 'business', source: 'manual',
    mobile: `+4179${String(1000000 + seq).slice(-7)}`, address: { country: 'CH', city: 'Basel' },
    createdBy: actor, ...overrides,
  });
}

async function runningCampaign(leadCount = 1, overrides = {}) {
  const leads = [];
  for (let i = 0; i < leadCount; i += 1) leads.push(await makeLead());
  const campaign = await service.createCampaign(baseInput(leads.map((l) => l._id), overrides), actor);
  await service.startCampaign(campaign._id, actor, {});
  const { tickToken } = await CallCampaign.findById(campaign._id).lean();
  return { campaign, leads, tickToken };
}

/** Dispatch one accepted call and return its record. */
async function dialOne() {
  createOutboundCall.mockResolvedValueOnce(accepted());
  const ctx = await runningCampaign(1);
  await service.tickCampaign(ctx.campaign._id, ctx.tickToken);
  const call = await CallRecord.findOne({ campaignId: ctx.campaign._id });
  return { ...ctx, call };
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const mod = await import('../../src/modules/aiCalling/aiCalling.service.js');
  service = mod.default;
  ({ consentStatus, sanitizeReportedDisposition, retryDelayMs, startOfLocalDay, estimateCallCost } = mod);
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CallConsent = (await import('../../src/modules/aiCalling/callConsent.model.js')).default;
  LeadCallTransition = (await import('../../src/modules/aiCalling/leadCallEvent.model.js')).LeadCallTransition;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  AuditLog = (await import('../../src/modules/auth/auditLog.model.js')).default;
  ({ phoneHash } = await import('../../src/modules/aiCalling/callAuth.js'));
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  for (const key in mongoose.connection.collections) await mongoose.connection.collections[key].deleteMany({});
  for (const fn of [addJob, logEvent, notify, createOutboundCall, roomStatus, endCall]) fn.mockClear();
  createOutboundCall.mockReset();
  createOutboundCall.mockResolvedValue(accepted());
  roomStatus.mockReset();
  roomStatus.mockResolvedValue('unknown');
  // Pin the recipient's local calling window: without this the tests depend on the wall clock
  // (default 08:00–20:00 in the lead's country) and fail outside Swiss business hours.
  process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
  process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';
  process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
});

describe('post-call processing is exactly-once', () => {
  it('concurrent finishers (agent end + webhook + reconciler) apply the outcome once', async () => {
    const { call, leads } = await dialOne();
    await service.agentAnswered(call.internalCallId);
    await service.agentDisclose(call.internalCallId);
    await service.agentRecordAnswer(call.internalCallId, { fieldKey: 'active', rawAnswer: 'yes' });
    await service.agentRecordAnswer(call.internalCallId, { fieldKey: 'interest', rawAnswer: 'yes' });

    const results = await Promise.all([
      service.agentEndCall(call.internalCallId, {}),
      service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'completed', providerEventId: 'evt-1' }),
      service.processCallResults(call._id, { source: 'reconcile' }),
    ]);
    const processed = [results[0], results[2]].filter((r) => r.processed);
    expect(processed.length).toBeLessThanOrEqual(1);

    const transitions = await LeadCallTransition.find({ callId: call._id }).lean();
    expect(transitions).toHaveLength(1);
    expect(transitions[0].newStatus).toBe('qualified');
    expect((await Lead.findById(leads[0]._id).lean()).status).toBe('qualified');
    const recipient = await CampaignRecipient.findOne({ campaignId: call.campaignId }).lean();
    expect(recipient.state).toBe('completed');
    expect(endCall).toHaveBeenCalledWith({ roomName: call.roomName }); // hangs up the SIP leg
  });

  it('resumes a processing run that crashed after claiming (expired claim)', async () => {
    const { call } = await dialOne();
    await CallRecord.updateOne({ _id: call._id }, { $set: { processingLeaseUntil: new Date(Date.now() - 1000), state: 'in_progress', answeredAt: new Date() } });
    const res = await service.reconcileStuckCalls();
    expect(res.reprocessed).toBe(1);
    expect((await CallRecord.findById(call._id).lean()).resultsProcessedAt).toBeTruthy();
  });

  it('a late result for an OLDER attempt never overwrites the current attempt', async () => {
    const { call, campaign } = await dialOne();
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id });
    // A newer attempt now owns the recipient.
    const newer = new mongoose.Types.ObjectId();
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { lastCallId: newer, state: 'in_progress', attemptCount: 2 } });
    await service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'busy', providerEventId: 'old-busy' });
    const after = await CampaignRecipient.findById(recipient._id).lean();
    expect(after.state).toBe('in_progress');
    expect(String(after.lastCallId)).toBe(String(newer));
  });
});

describe('agent tool calls', () => {
  it('parallel record_answer calls never lose an answer (optimistic concurrency)', async () => {
    const { call } = await dialOne();
    await service.agentDisclose(call.internalCallId);
    await Promise.all([
      service.agentRecordAnswer(call.internalCallId, { fieldKey: 'active', rawAnswer: 'yes' }),
      service.agentRecordAnswer(call.internalCallId, { fieldKey: 'interest', rawAnswer: 'no' }),
    ]);
    const fresh = await CallRecord.findById(call._id).lean();
    expect(fresh.conversationState.answers.active.normalizedValue).toBe(true);
    expect(fresh.conversationState.answers.interest.normalizedValue).toBe('no');
    expect(fresh.stateVersion).toBe(3);
  });

  it('refuses answers before the AI disclosure and after the call has ended', async () => {
    const { call } = await dialOne();
    await expect(service.agentRecordAnswer(call.internalCallId, { fieldKey: 'active', rawAnswer: 'yes' }))
      .rejects.toThrow(/disclosure/i);
    await service.agentEndCall(call.internalCallId, {});
    await expect(service.agentDisclose(call.internalCallId)).rejects.toThrow(/already ended/i);
  });

  it('ignores an impossible worker-reported disposition once the call was answered', () => {
    expect(sanitizeReportedDisposition('answered_completed', {})).toBeNull(); // business outcomes are server-derived
    expect(sanitizeReportedDisposition('no_answer', { answeredAt: new Date() })).toBeNull();
    expect(sanitizeReportedDisposition('voicemail', { answeredAt: new Date() })).toBe('voicemail');
    expect(sanitizeReportedDisposition('busy', {})).toBe('busy');
  });

  it('an answered caller who heard the disclosure then hung up is "reached", not redialled as no-answer', async () => {
    const { call, campaign } = await dialOne();
    await service.agentAnswered(call.internalCallId);
    await service.agentDisclose(call.internalCallId);
    const res = await service.agentEndCall(call.internalCallId, {});
    expect(res.disposition).toBe('answered_partial');
    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id }).lean();
    expect(recipient.state).toBe('completed');
  });
});

describe('tick chain + per-dial gates', () => {
  it('a superseded or overlapping tick does nothing', async () => {
    const { campaign, tickToken } = await runningCampaign(1);
    const newer = await service._scheduleTick(campaign._id, 0);
    expect(newer).not.toBe(tickToken);
    expect(await service.tickCampaign(campaign._id, tickToken)).toEqual({ superseded: true });

    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { tickLeaseUntil: new Date(Date.now() + 60_000) } });
    expect(await service.tickCampaign(campaign._id, newer)).toEqual({ superseded: true }); // another tick holds the lease
    expect(createOutboundCall).not.toHaveBeenCalled();
  });

  it('pausing mid-batch stops the very next dial', async () => {
    const { campaign, tickToken } = await runningCampaign(3, {
      schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 3 },
    });
    createOutboundCall.mockImplementationOnce(async () => {
      await service.pauseCampaign(campaign._id, actor);
      return accepted('first');
    });
    const res = await service.tickCampaign(campaign._id, tickToken);
    expect(res.dispatched).toBe(1);
    expect(createOutboundCall).toHaveBeenCalledTimes(1);
    expect(await CampaignRecipient.countDocuments({ campaignId: campaign._id, state: 'queued' })).toBe(2);
  });

  it('cannot restart a cancelled campaign; double start conflicts', async () => {
    const { campaign } = await runningCampaign(1);
    await expect(service.startCampaign(campaign._id, actor, {})).rejects.toThrow(/Only draft/);
    await service.cancelCampaign(campaign._id, actor);
    await expect(service.startCampaign(campaign._id, actor, {})).rejects.toThrow();
    await expect(service.retryRecipients(campaign._id, actor, {})).rejects.toThrow(/cancelled/);
  });

  it('defers (without consuming an attempt) outside the recipient\'s local quiet hours', async () => {
    process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-00:00'; // never open
    const { campaign, tickToken } = await runningCampaign(1);
    await service.tickCampaign(campaign._id, tickToken);
    expect(createOutboundCall).not.toHaveBeenCalled();
    const r = await CampaignRecipient.findOne({ campaignId: campaign._id }).lean();
    expect(r.state).toBe('queued');
    expect(r.attemptCount).toBe(0);
    expect(r.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('the watchdog revives a lost tick chain with a fresh token', async () => {
    const { campaign, tickToken } = await runningCampaign(1);
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { nextTickAt: new Date(Date.now() - 10 * 60_000) } });
    const res = await service.reconcileStuckCalls();
    expect(res.ticksRevived).toBe(1);
    const { tickToken: revived } = await CallCampaign.findById(campaign._id).lean();
    expect(revived).not.toBe(tickToken);
  });

  it('rejects a filter selection with no filters (would target every lead)', async () => {
    await makeLead();
    await expect(service.createCampaign({ ...baseInput([]), selection: { mode: 'filters', filters: { q: '' } } }, actor))
      .rejects.toThrow(/at least one filter/);
  });
});

describe('crash recovery never redials an ambiguous attempt', () => {
  async function claimed() {
    const { campaign } = await runningCampaign(1);
    const recipient = await CampaignRecipient.findOneAndUpdate(
      { campaignId: campaign._id }, { $set: { state: 'dialing', leaseUntil: new Date(Date.now() - 1000) } }, { returnDocument: 'after' },
    );
    return { campaign, recipient };
  }

  it('pointer to a call that was never created → requeued, attempt refunded', async () => {
    const { recipient } = await claimed();
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { lastCallId: new mongoose.Types.ObjectId(), attemptCount: 1 } });
    await service._recoverExpiredDispatches({});
    const r = await CampaignRecipient.findById(recipient._id).lean();
    expect(r.state).toBe('queued');
    expect(r.attemptCount).toBe(0);
  });

  it('call created but never sent to the provider → requeued, attempt refunded', async () => {
    const { campaign, recipient } = await claimed();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId, internalCallId: 'nd-1',
      attemptNumber: 1, state: 'initiating', createdBy: actor,
    });
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { lastCallId: call._id, attemptCount: 1 } });
    await service._recoverExpiredDispatches({});
    expect((await CampaignRecipient.findById(recipient._id).lean())).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect((await CallRecord.findById(call._id).lean()).state).toBe('cancelled');
  });

  it('call sent to the provider with no recorded outcome → parked as needs_reconcile, never requeued', async () => {
    const { campaign, recipient } = await claimed();
    const call = await CallRecord.create({
      campaignId: campaign._id, recipientId: recipient._id, leadId: recipient.leadId, internalCallId: 'amb-1',
      attemptNumber: 1, state: 'initiating', dispatchStartedAt: new Date(), createdBy: actor,
    });
    await CampaignRecipient.updateOne({ _id: recipient._id }, { $set: { lastCallId: call._id, attemptCount: 1 } });
    await service._recoverExpiredDispatches({});
    expect((await CampaignRecipient.findById(recipient._id).lean())).toMatchObject({ state: 'failed', finalDisposition: 'needs_reconcile' });
    expect((await CallRecord.findById(call._id).lean()).state).toBe('needs_reconcile');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'ai_calling.needs_reconcile' }), actor);
  });

  it('an ambiguous provider response is parked immediately', async () => {
    createOutboundCall.mockResolvedValueOnce({ provider: 'livekit_sip', outcome: 'ambiguous', errorCode: 'TIMEOUT', safeToRetry: false });
    const { campaign, tickToken } = await runningCampaign(1);
    await service.tickCampaign(campaign._id, tickToken);
    const r = await CampaignRecipient.findOne({ campaignId: campaign._id }).lean();
    expect(r).toMatchObject({ state: 'failed', finalDisposition: 'needs_reconcile' });
  });

  it('transient rejections back off exponentially with jitter, bounded by the min gap', () => {
    const s = { retryDelayMinutes: 10, minMinutesBetweenAttempts: 0 };
    expect(retryDelayMs(s, 1, () => 0)).toBe(10 * 60_000);
    expect(retryDelayMs(s, 2, () => 0)).toBe(20 * 60_000);
    expect(retryDelayMs(s, 2, () => 1)).toBe(22 * 60_000);
    expect(retryDelayMs(s, 20, () => 0)).toBe(24 * 60 * 60_000);
    expect(retryDelayMs({ retryDelayMinutes: 1, minMinutesBetweenAttempts: 30 }, 1, () => 0)).toBe(30 * 60_000);
  });

  it('computes the campaign-local day start for the daily cap', () => {
    const now = new Date('2026-10-19T02:30:00Z'); // 04:30 in Zurich (CEST)
    expect(startOfLocalDay('Europe/Zurich', now).toISOString()).toBe('2026-10-18T22:00:00.000Z');
    expect(startOfLocalDay('UTC', now).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });
});

describe('cost + spend cap', () => {
  it('estimates cost only from an operator-configured rate, flagged as an estimate; never invents prices', () => {
    expect(estimateCallCost({ durationSeconds: 61 }, null, 0)).toEqual({ amount: 0, currency: 'USD', breakdown: null });
    expect(estimateCallCost({ durationSeconds: 61 }, null, 0.12)).toMatchObject({ amount: 0.24, breakdown: { estimate: true, billedMinutes: 2 } });
    expect(estimateCallCost({ durationSeconds: 61 }, { amount: 0.5, currency: 'CHF' }, 0.12)).toMatchObject({ amount: 0.5, currency: 'CHF' });
  });

  it('pauses a campaign (and notifies) once the spend cap is reached, before dialling', async () => {
    const { campaign, tickToken } = await runningCampaign(1, {
      schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxCampaignSpend: 5 },
    });
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { 'summary.actualCost': 5.01 } });
    expect(await service.tickCampaign(campaign._id, tickToken)).toMatchObject({ stopped: true, reason: 'spend_cap' });
    expect(createOutboundCall).not.toHaveBeenCalled();
    expect((await CallCampaign.findById(campaign._id).lean()).status).toBe('paused');
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ type: 'ai_calling.spend_cap' }), actor);
  });
});

describe('operations', () => {
  it('reports stuck and parked calls without touching readiness', async () => {
    createOutboundCall.mockResolvedValueOnce({ provider: 'livekit_sip', outcome: 'ambiguous', errorCode: 'TIMEOUT', safeToRetry: false });
    const { campaign, tickToken } = await runningCampaign(1);
    await service.tickCampaign(campaign._id, tickToken);
    const health = await service.operationalHealth();
    expect(health).toMatchObject({ status: 'attention', needsReconcile: 1 });
    expect(health.warnings.join(' ')).toMatch(/manual reconciliation/);
  });

  it('refuses to dial in production without a reachable https PUBLIC_API_BASE_URL (silent-call guard)', async () => {
    const { agentApiMisconfiguration } = await import('../../src/modules/aiCalling/aiCalling.service.js');
    expect(agentApiMisconfiguration({ NODE_ENV: 'development' })).toBeNull();
    expect(agentApiMisconfiguration({ NODE_ENV: 'production' })).toMatch(/not set/);
    expect(agentApiMisconfiguration({ NODE_ENV: 'production', PUBLIC_API_BASE_URL: 'http://x' })).toMatch(/https/);
    expect(agentApiMisconfiguration({ NODE_ENV: 'production', PUBLIC_API_BASE_URL: 'https://crm.example.com' })).toBeNull();
  });
});

describe('webhook ordering', () => {
  it('an answered call cannot later become busy/no_answer; a late "answered" after the end is ignored', async () => {
    const { call } = await dialOne();
    await service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'answered', providerEventId: 'a1' });
    await service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'busy', providerEventId: 'b1' });
    let fresh = await CallRecord.findById(call._id).lean();
    expect(fresh.disposition).not.toBe('busy');
    expect(fresh.resultsProcessedAt).toBeTruthy();
    await service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'answered', providerEventId: 'a2' });
    fresh = await CallRecord.findById(call._id).lean();
    expect(fresh.state).not.toBe('in_progress');
  });

  it('room_finished on a never-answered call → no_answer and a retry is scheduled', async () => {
    const { call, campaign } = await dialOne();
    await service.applyWebhookEvent({ provider: 'livekit_sip', internalCallId: call.internalCallId, eventType: 'completed', providerEventId: 'rf1' });
    expect((await CallRecord.findById(call._id).lean()).disposition).toBe('no_answer');
    expect((await CampaignRecipient.findOne({ campaignId: campaign._id }).lean()).state).toBe('retry_scheduled');
  });
});

describe('consent is company-wide', () => {
  beforeEach(() => { process.env.AI_CALLING_REQUIRE_CONSENT = 'true'; });

  it('a consent grant by a colleague makes the lead callable; a later revocation by anyone blocks it', async () => {
    const lead = await makeLead();
    await service.updateConsent(lead._id, { status: 'granted', evidence: 'Signed web form 2026-10-01', source: 'web_form' }, otherUser);
    let campaign = await service.createCampaign(baseInput([lead._id]), actor);
    expect(campaign.summary.eligible).toBe(1);

    await service.updateConsent(lead._id, { status: 'revoked', evidence: '' }, otherUser);
    expect((await CampaignRecipient.findOne({ campaignId: campaign._id }).lean()).state).toBe('suppressed');
    campaign = await service.createCampaign(baseInput([lead._id]), actor);
    expect(campaign.summary.eligible).toBe(0);
  });

  it('re-granting consent puts the recipient of a running campaign back in the queue', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(baseInput([lead._id]), actor);
    expect(campaign.summary.consentRequired).toBe(1);
    await service.updateConsent(lead._id, { status: 'granted', evidence: 'Verbal consent logged by sales', source: 'phone' }, actor);
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { status: 'running' } });
    await service.updateConsent(lead._id, { status: 'granted', evidence: 'Verbal consent re-confirmed', source: 'phone' }, actor);
    expect((await CampaignRecipient.findOne({ campaignId: campaign._id }).lean()).state).toBe('queued');
  });

  it('consentStatus: latest decision semantics', () => {
    expect(consentStatus(null)).toBe('missing');
    expect(consentStatus({ status: 'revoked' })).toBe('revoked');
    expect(consentStatus({ status: 'granted', expiresAt: new Date(Date.now() - 1) })).toBe('expired');
    expect(consentStatus({ status: 'granted' })).toBe('granted');
  });

  it('consent is re-checked immediately before dialling', async () => {
    const lead = await makeLead();
    await service.updateConsent(lead._id, { status: 'granted', evidence: 'Signed web form 2026-10-01' }, actor);
    const campaign = await service.createCampaign(baseInput([lead._id]), actor);
    await service.startCampaign(campaign._id, actor, {});
    // Revoked directly in the ledger (e.g. by another process) after enrolment.
    await CallConsent.updateMany({ leadId: lead._id }, { $set: { status: 'revoked' } });
    const { tickToken } = await CallCampaign.findById(campaign._id).lean();
    await service.tickCampaign(campaign._id, tickToken);
    expect(createOutboundCall).not.toHaveBeenCalled();
    expect((await CampaignRecipient.findOne({ campaignId: campaign._id }).lean()).eligibility.reasons).toContain('consent_revoked');
    expect(phoneHash('+41790000000')).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('CRM sync preserves human decisions', () => {
  it('does not overwrite a status a human changed after the call was placed', async () => {
    const { call, leads } = await dialOne();
    await Lead.updateOne({ _id: leads[0]._id }, { $set: { status: 'unqualified' } });
    await AuditLog.create({
      eventType: 'lead.updated', ipAddress: '127.0.0.1', result: 'success', module: 'lead', timestamp: new Date(),
      details: { leadId: String(leads[0]._id), changedFields: ['status'] },
    });
    await service.agentAnswered(call.internalCallId);
    await service.agentDisclose(call.internalCallId);
    await service.agentRecordAnswer(call.internalCallId, { fieldKey: 'active', rawAnswer: 'yes' });
    await service.agentRecordAnswer(call.internalCallId, { fieldKey: 'interest', rawAnswer: 'yes' });
    const res = await service.agentEndCall(call.internalCallId, {});
    expect(res.qualification).toBe('qualified');
    const lead = await Lead.findById(leads[0]._id).lean();
    expect(lead.status).toBe('unqualified'); // manual override wins
    expect(lead.lastContactedAt).toBeTruthy(); // contact is still recorded
  });

  it('human review re-validates corrections and applies the verdict to the lead', async () => {
    const { call, leads } = await dialOne();
    await service.agentAnswered(call.internalCallId);
    await service.agentDisclose(call.internalCallId);
    await service.agentRecordAnswer(call.internalCallId, { fieldKey: 'active', rawAnswer: 'maybe-ish' });
    await service.agentEndCall(call.internalCallId, {});
    expect((await CallRecord.findById(call._id).lean()).reviewRequired).toBe(true);
    expect((await Lead.findById(leads[0]._id).lean()).status).not.toBe('qualified');

    await expect(service.reviewAnswers(call._id, actor, { answers: [{ questionFieldKey: 'interest', normalizedValue: 'perhaps' }] }))
      .rejects.toThrow(/Interest/);
    const reviewed = await service.reviewAnswers(call._id, actor, {
      answers: [{ questionFieldKey: 'active', normalizedValue: true }], qualification: 'qualified',
    });
    expect(reviewed.answers.find((a) => a.questionFieldKey === 'active')).toMatchObject({ normalizedValue: true, validation: 'valid', source: 'human_review' });
    expect((await Lead.findById(leads[0]._id).lean()).status).toBe('qualified');
    const t = await LeadCallTransition.findOne({ callId: call._id, actorType: 'user' }).lean();
    expect(String(t.actorId)).toBe(String(actor));
    const audit = await service.leadTransitions(leads[0]._id, actor);
    expect(audit.map((x) => x.actorType)).toContain('user');
  });
});

describe('browser web test isolation', () => {
  it('uses negative attempt numbers and never touches the recipient or the lead', async () => {
    const lead = await makeLead();
    const campaign = await service.createCampaign(baseInput([lead._id]), actor);
    const web = await service.startWebTest(campaign._id, actor, {});
    expect(web.token).toBe('join-token');
    const call = await CallRecord.findOne({ internalCallId: web.callId }).lean();
    expect(call.attemptNumber).toBe(-1);
    expect(dispatchAgent.mock.calls.at(-1)[0].metadata.mode).toBe('web');

    await service.getCallContext(web.callId); // browser user present → answered
    await service.agentDisclose(web.callId);
    await service.agentRecordAnswer(web.callId, { fieldKey: 'active', rawAnswer: 'yes' });
    await service.agentRecordAnswer(web.callId, { fieldKey: 'interest', rawAnswer: 'yes' });
    await service.agentEndCall(web.callId, {});

    const recipient = await CampaignRecipient.findOne({ campaignId: campaign._id }).lean();
    expect(recipient.state).toBe('draft');
    expect(recipient.attemptCount).toBe(0);
    expect((await Lead.findById(lead._id).lean()).status).toBe('new');
    const summary = (await CallCampaign.findById(campaign._id).lean()).summary;
    expect(summary.answered).toBe(0); // web tests are not campaign traffic
  });
});
