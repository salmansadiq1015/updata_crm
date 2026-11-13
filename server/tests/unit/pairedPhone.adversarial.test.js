/**
 * Paired-phone adversarial tests (production-hardening audit, 2026-10-24): reordered, late,
 * duplicated and concurrent events must never redial an uncertain call, lose a takeover, report a
 * startup failure as an unknown outcome, or skew the campaign figures. Same harness as
 * pairedPhone.workflow.test.js.
 */
import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';
import { serve } from '../helpers/serve.js';

process.env.AI_CALLING_REQUIRE_CONSENT = 'false';
process.env.AI_CALLING_RECIPIENT_HOURS = '00:00-23:59';
process.env.AI_CALLING_RECIPIENT_DAYS = '0,1,2,3,4,5,6';

const addJob = jest.fn();
const endCall = jest.fn(async () => ({ ended: true }));
const dispatchAgent = jest.fn(async ({ roomName }) => ({ provider: 'livekit_sip', outcome: 'accepted', providerCallId: roomName }));
const roomStatusMock = jest.fn(async () => 'unknown');

jest.unstable_mockModule('../../src/shared/queue/QueueManager.js', () => ({
  default: { addJob, getQueueStats: jest.fn(async () => ({})) },
}));
jest.unstable_mockModule('../../src/modules/auth/audit.service.js', () => ({ default: { logEvent: jest.fn() } }));
jest.unstable_mockModule('../../src/modules/notifications/notification.service.js', () => ({ default: { create: jest.fn(async () => ({})) } }));
jest.unstable_mockModule('../../src/modules/aiCalling/providers/livekitSip.provider.js', () => ({
  LiveKitSipProvider: class {},
  default: {
    configured: false,
    livekitReady: true,
    url: 'wss://test.livekit.cloud',
    apiKey: 'APIkey',
    apiSecret: 'secret-secret-secret-secret',
    eligibleFor: () => false,
    health: async () => ({ configured: false }),
    createOutboundCall: async () => ({ provider: 'livekit_sip', outcome: 'rejected', errorCode: 'NOT_CONFIGURED', safeToRetry: false }),
    dispatchAgent: (...a) => dispatchAgent(...a),
    endCall: (...a) => endCall(...a),
    roomStatus: (...a) => roomStatusMock(...a),
  },
}));

let mongod;
let app;
let ai;
let pp;
let Lead;
let CallRecord;
let CampaignRecipient;
let PairedDevice;
let CallCampaign;

const owner = new mongoose.Types.ObjectId();
const stranger = new mongoose.Types.ObjectId();
const NONCE = '00112233445566778899aabbccddeeff';
const NONCE2 = 'ffeeddccbbaa99887766554433221100';

const hb = (over = {}) => ({
  gateway: { version: '0.2.0', platform: 'darwin', hostname: 'mac' },
  board: { connected: true, port: '/dev/cu.usbserial-1', bdaddr: '24:0A:C4:00:11:22', firmware: '0.1.0', idf: 'v5.5.6', chipRevision: 3, keyProvisioned: true, sessionNonce: NONCE },
  state: { device: 'hfp_ready', hfp: 'slc', call: 0, callsetup: 0, audio: 'off', codec: 'none', signal: 4, battery: 5, peer: '04:01:BB:51:10:48' },
  stats: { uptimeMs: 1000, heapFree: 100000 },
  ...over,
});

async function pairDevice(name = 'TECNO bridge') {
  const { code } = await pp.createPairingCode(owner, { deviceName: name, phoneLabel: 'Jazz SIM' });
  const res = await request(serve(app)).post('/gw/pair').send({ code, gateway: { version: '0.2.0', platform: 'darwin' } });
  expect(res.status).toBe(201);
  return { code, token: res.body.data.token, deviceId: res.body.data.deviceId };
}

/** Pair, provision the key, heartbeat, verify audio: a device ready to dial. Returns the dial key. */
async function readyDevice() {
  const d = await pairDevice();
  const gw = (path) => request(serve(app)).post(`/gw${path}`).set('Authorization', `Bearer ${d.token}`);
  await gw('/heartbeat').send(hb({ board: { ...hb().board, keyProvisioned: false } })).expect(200);
  const key = (await gw('/dial-key').send({}).expect(200)).body.data.key;
  await gw('/dial-key/confirm').send({ bdaddr: '24:0A:C4:00:11:22' }).expect(200);
  await gw('/heartbeat').send(hb()).expect(200);
  await pp.verifyAudio(owner, d.deviceId, { inboundPhraseHeard: true, outboundPhraseHeard: true, note: 'probe call 1' });
  return { ...d, key: Buffer.from(key, 'hex'), gw };
}

async function pairedCampaign(deviceId, leads = 1) {
  const leadIds = [];
  for (let i = 0; i < leads; i += 1) {
    const lead = await Lead.create({
      leadNumber: `L-${crypto.randomInt(1e6)}`, name: `Lead ${i}`, source: 'manual',
      mobile: `+92300123456${i}`, address: { country: 'PK', city: 'Lahore' }, createdBy: owner,
    });
    leadIds.push(String(lead._id));
  }
  const campaign = await ai.createCampaign({
    name: 'Paired run',
    questionnaire: { questions: [{ fieldKey: 'active', label: 'Active', text: 'Operating?', type: 'boolean', required: true, order: 1 }] },
    statusRules: [{ id: 'q', when: { all: [{ field: 'active', equals: true }] }, action: 'mark_qualified' }],
    agentConfig: { agentName: 'Tess', organizationName: 'Acme' },
    schedule: { timezone: 'UTC', callWindow: { start: '00:00', end: '23:59' }, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], maxConcurrency: 5, maxAttemptsPerLead: 2 },
    selection: { mode: 'explicit', leadIds },
    transport: 'paired_phone',
    pairedDeviceId: deviceId,
  }, owner);
  return campaign;
}

async function tick(campaignId) {
  const { tickToken } = await CallCampaign.findById(campaignId).select('tickToken').lean();
  return ai.tickCampaign(campaignId, tickToken);
}

async function startAndTick(campaign) {
  await ai.startCampaign(campaign._id, owner);
  return tick(campaign._id);
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  const responseEnvelope = (await import('../../src/shared/middleware/responseEnvelope.js')).default;
  const errorHandler = (await import('../../src/shared/middleware/errorHandler.js')).default;
  const { gatewayRoutes } = await import('../../src/modules/pairedPhone/pairedPhone.routes.js');
  ai = (await import('../../src/modules/aiCalling/aiCalling.service.js')).default;
  pp = (await import('../../src/modules/pairedPhone/pairedPhone.service.js')).default;
  Lead = (await import('../../src/modules/crm/lead.model.js')).default;
  CallRecord = (await import('../../src/modules/aiCalling/callRecord.model.js')).default;
  CampaignRecipient = (await import('../../src/modules/aiCalling/campaignRecipient.model.js')).default;
  CallCampaign = (await import('../../src/modules/aiCalling/callCampaign.model.js')).default;
  PairedDevice = (await import('../../src/modules/pairedPhone/pairedDevice.model.js')).default;
  app = express();
  app.use((req, _res, next) => { req.requestId = 'test'; next(); });
  app.use(express.json());
  app.use(responseEnvelope);
  app.use('/gw', gatewayRoutes);
  app.use(errorHandler);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  jest.clearAllMocks();
  ai._voicePausedCache = null;
  roomStatusMock.mockResolvedValue('unknown');
});

const ev = (d, callId, type, data = {}, eventId = crypto.randomUUID()) => d.gw(`/calls/${callId}/events`).send({ eventId, type, data });

/** Ready device + running campaign + the gateway's claimed job (optionally driven to an answer). */
async function liveCall({ leads = 1, answered = false } = {}) {
  const d = await readyDevice();
  const campaign = await pairedCampaign(d.deviceId, leads);
  await CallCampaign.updateOne({ _id: campaign._id }, { $set: { 'schedule.maxAttemptsPerLead': 3 } });
  await startAndTick(campaign);
  const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
  await ev(d, job.callId, 'dialing').expect(200);
  await ev(d, job.callId, 'ringing').expect(200);
  if (answered) {
    await ev(d, job.callId, 'answered').expect(200);
    await ev(d, job.callId, 'audio_opened', { codec: 'cvsd' }).expect(200);
  }
  const call = await CallRecord.findOne({ internalCallId: job.callId }).lean();
  return { d, campaign, job, call };
}

const recipientOf = (call) => CampaignRecipient.findById(call.recipientId).lean();
const callOf = (call) => CallRecord.findById(call._id).lean();
const summaryOf = async (campaign) => (await CallCampaign.findById(campaign._id).lean()).summary;

/** Make every scheduled retry due now and tick: anything dialable would be dialed. */
async function forceDueAndTick(campaign) {
  await CampaignRecipient.updateMany({ campaignId: campaign._id, state: { $in: ['retry_scheduled', 'queued'] } }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
  await CallCampaign.updateOne({ _id: campaign._id }, { $set: { tickLeaseUntil: null } });
  return tick(campaign._id);
}

function expectParked(call, recipient) {
  expect(call).toMatchObject({ state: 'needs_reconcile', reviewRequired: true });
  expect(recipient).toMatchObject({ state: 'failed', finalDisposition: 'needs_reconcile' });
  expect(recipient.nextAttemptAt == null).toBe(true);
}

describe('A. an interrupted call is never redialed automatically', () => {
  it('agent /end BEFORE the gateway’s outcome_unknown (the reverse race) is held, then parked', async () => {
    const { d, campaign, job, call } = await liveCall({ answered: true });
    // USB unplugged: the phone leg leaves the room, the agent ends first (nothing disclosed yet).
    const res = await ai.agentEndCall(job.callId, { durationSeconds: 3 });
    expect(res).toMatchObject({ deferred: true });
    expect((await callOf(call)).resultsProcessedAt).toBeNull();
    expect((await recipientOf(call)).state).not.toBe('retry_scheduled');
    expect(String((await PairedDevice.findById(d.deviceId).lean()).currentCallId)).toBe(String(call._id)); // device still held
    await ev(d, job.callId, 'outcome_unknown', { detail: 'ESP32 link lost: unplugged' }).expect(200);
    expectParked(await callOf(call), await recipientOf(call));
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('the agent reporting no_answer while the phone still rings cannot schedule a redial', async () => {
    const { d, campaign, job, call } = await liveCall();
    expect(await ai.agentEndCall(job.callId, { disposition: 'no_answer' })).toMatchObject({ deferred: true });
    expect((await recipientOf(call)).state).toBe('dialing');
    await ev(d, job.callId, 'outcome_unknown', { detail: 'Bluetooth hands-free link dropped' }).expect(200);
    expectParked(await callOf(call), await recipientOf(call));
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('duplicated, replayed and contradictory end reports after parking change nothing', async () => {
    const { d, campaign, job, call } = await liveCall({ answered: true });
    const unknownId = crypto.randomUUID();
    await ev(d, job.callId, 'outcome_unknown', { detail: 'unplugged' }, unknownId).expect(200);
    await Promise.all([
      ai.agentEndCall(job.callId, {}), ai.agentEndCall(job.callId, { disposition: 'no_answer' }), ai.agentEndCall(job.callId, { disposition: 'failed' }),
    ]);
    await ev(d, job.callId, 'ended', { reason: 'not_answered' }).expect(200);
    await ev(d, job.callId, 'failed', { reason: 'board_lost' }).expect(200);
    await ai.applyWebhookEvent({ provider: 'paired_phone', internalCallId: job.callId, eventType: 'completed', providerEventId: 'late-completed' });
    expect((await ev(d, job.callId, 'outcome_unknown', { detail: 'unplugged' }, unknownId).expect(200)).body.data.duplicate).toBe(true);
    await ai.reconcileStuckCalls();
    expectParked(await callOf(call), await recipientOf(call));
    expect((await callOf(call)).disposition).toBe('needs_review');
    expect(await ai.retryRecipients(campaign._id, owner)).toEqual({ retried: 0 }); // bulk "Retry failed" skips it
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('outcome_unknown arriving after the call was processed withdraws the scheduled retry', async () => {
    const { d, campaign, job, call } = await liveCall();
    await ev(d, job.callId, 'ended', { reason: 'not_answered' }).expect(200);
    expect((await recipientOf(call)).state).toBe('retry_scheduled');
    await ev(d, job.callId, 'outcome_unknown', { detail: 'the phone did not confirm the hang-up' }).expect(200);
    expectParked(await callOf(call), await recipientOf(call));
    expect((await summaryOf(campaign))).toMatchObject({ needsReconcile: 1, retryScheduled: 0 });
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('a park that lands while another finisher holds the processing claim wins', async () => {
    const { campaign, call } = await liveCall({ answered: true });
    const original = ai._finalizeRecipient.bind(ai);
    const spy = jest.spyOn(ai, '_finalizeRecipient').mockImplementation(async (...args) => {
      // The reconciler parks the call between the call write and the recipient write.
      await ai._markAmbiguous(call._id, call.recipientId, campaign, 'GATEWAY_SILENT', 'test interleaving');
      return original(...args);
    });
    try {
      await ai.processCallResults(call._id, { disposition: 'no_answer', source: 'webhook' });
    } finally {
      spy.mockRestore();
    }
    expectParked(await callOf(call), await recipientOf(call));
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('a gateway that never reports after the agent left: parked after the grace period, device held', async () => {
    const { d, campaign, job, call } = await liveCall({ answered: true });
    await ai.agentEndCall(job.callId, {});
    await ai.reconcileStuckCalls();
    expect((await callOf(call)).state).toBe('in_progress'); // inside the grace period: wait for the gateway
    await CallRecord.updateOne({ _id: call._id }, { $set: { 'agentEnd.at': new Date(Date.now() - 3 * 60_000) } });
    await ai.reconcileStuckCalls();
    expectParked(await callOf(call), await recipientOf(call));
    expect((await callOf(call)).failureCode).toBe('GATEWAY_NO_END_REPORT');
    expect((await pp.readiness(d.deviceId)).reasons).toContain('needs_attention');
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('a silent gateway past the call’s maximum length parks it instead of guessing an outcome', async () => {
    const { campaign, call } = await liveCall({ answered: true });
    await CallRecord.updateOne({ _id: call._id }, { $set: { answeredAt: new Date(Date.now() - 60 * 60_000) } });
    await ai.reconcileStuckCalls();
    expectParked(await callOf(call), await recipientOf(call));
    await forceDueAndTick(campaign);
    expect(await CallRecord.countDocuments()).toBe(1);
  });
});

describe('B. human takeover', () => {
  it('takeover while the call is still queued cancels it before dialing; the attempt is refunded', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const call = await CallRecord.findOne().lean();
    expect(await pp.requestCallControl(owner, call._id, 'takeover')).toMatchObject({ cancelledBeforeDial: true });
    expect((await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data).toBeNull();
    expect(await recipientOf(call)).toMatchObject({ state: 'queued', attemptCount: 0 });
  });

  it('takeover requested while ringing waits for an answer; an unanswered call stays a plain no-answer', async () => {
    const { d, job, call } = await liveCall();
    await pp.requestCallControl(owner, call._id, 'takeover');
    const beat = (await d.gw('/heartbeat').send(hb({ state: { ...hb().state, callsetup: 3 } })).expect(200)).body.data;
    expect(beat.commands).toEqual([{ type: 'takeover', callId: job.callId }]); // re-sent until the call is active
    await ev(d, job.callId, 'ended', { reason: 'not_answered' }).expect(200);
    const done = await callOf(call);
    expect(done).toMatchObject({ disposition: 'no_answer', state: 'no_answer' });
    expect(done.gateway.takenOverAt).toBeNull();
    expect((await recipientOf(call)).state).toBe('retry_scheduled');
  });

  it('takeover mid-conversation: the agent’s /end beats command_done, the call is still reached and the phone stays held', async () => {
    const { d, campaign, job, call } = await liveCall({ answered: true });
    await pp.requestCallControl(owner, call._id, 'takeover');
    // The gateway releases the audio and leaves the room: the agent ends first.
    expect(await ai.agentEndCall(job.callId, { durationSeconds: 12 })).toMatchObject({ deferred: true });
    expect(String((await PairedDevice.findById(d.deviceId).lean()).currentCallId)).toBe(String(call._id));
    await ev(d, job.callId, 'command_done', { type: 'takeover' }).expect(200);
    // The owner talks for a long time: the reconciler leaves the call alone while the phone reports it.
    await d.gw('/heartbeat').send(hb({ state: { ...hb().state, call: 1, audio: 'off' } })).expect(200);
    await CallRecord.updateOne({ _id: call._id }, { $set: { 'agentEnd.at': new Date(Date.now() - 10 * 60_000), answeredAt: new Date(Date.now() - 60 * 60_000) } });
    const swept = await ai.reconcileStuckCalls();
    expect(swept.stillLive).toBeGreaterThanOrEqual(1);
    expect((await callOf(call)).state).toBe('in_progress');
    await ev(d, job.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    const done = await callOf(call);
    expect(done).toMatchObject({ state: 'completed', disposition: 'answered_partial', reviewRequired: true, durationSeconds: 12 });
    expect((await recipientOf(call)).state).toBe('completed');
    expect((await summaryOf(campaign))).toMatchObject({ completed: 1, noAnswer: 0, failed: 0 });
    expect((await PairedDevice.findById(d.deviceId).lean()).currentCallId).toBeNull();
  });

  it('takeover before the AI finalizes the call requires review even when questionnaire answers are complete', async () => {
    const { d, job, call } = await liveCall({ answered: true });
    await ai.agentDisclose(job.callId);
    await ai.agentRecordAnswer(job.callId, { fieldKey: 'active', rawAnswer: 'yes' });
    await pp.requestCallControl(owner, call._id, 'takeover');
    await ev(d, job.callId, 'command_done', { type: 'takeover' }).expect(200);
    await ev(d, job.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    // Recording answers does not finalize the AI conversation. A takeover interrupts it.
    expect(await callOf(call)).toMatchObject({ disposition: 'interrupted', qualification: 'review', reviewRequired: true });
  });

  it('repeated takeover requests and a duplicated command_done are idempotent', async () => {
    const { d, job, call } = await liveCall({ answered: true });
    await pp.requestCallControl(owner, call._id, 'takeover');
    const first = (await callOf(call)).gateway.command;
    expect(await pp.requestCallControl(owner, call._id, 'takeover')).toMatchObject({ duplicate: true });
    expect((await callOf(call)).gateway.command.requestedAt).toEqual(first.requestedAt);
    const doneId = crypto.randomUUID();
    await ev(d, job.callId, 'command_done', { type: 'takeover' }, doneId).expect(200);
    const takenOverAt = (await callOf(call)).gateway.takenOverAt;
    expect((await ev(d, job.callId, 'command_done', { type: 'takeover' }, doneId).expect(200)).body.data.duplicate).toBe(true);
    expect((await callOf(call)).gateway.takenOverAt).toEqual(takenOverAt);
  });

  it('takeover or hang-up of a finished call is refused; a stranger cannot control the call', async () => {
    const { d, job, call } = await liveCall({ answered: true });
    await expect(pp.requestCallControl(stranger, call._id, 'takeover')).rejects.toThrow();
    await ev(d, job.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    await expect(pp.requestCallControl(owner, call._id, 'takeover')).rejects.toThrow(/already ended/);
    await expect(pp.requestCallControl(owner, call._id, 'hangup')).rejects.toThrow(/already ended/);
  });
});

describe('E. agent start-up and agent failures', () => {
  it('an unconfirmed agent dispatch: nothing reaches the gateway, the call is failed (not an unknown outcome)', async () => {
    dispatchAgent.mockResolvedValueOnce({ provider: 'livekit_sip', outcome: 'ambiguous', errorMessage: 'dispatch timed out' });
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const call = await CallRecord.findOne().lean();
    expect(call).toMatchObject({ state: 'failed', disposition: 'failed', failureCode: 'AGENT_DISPATCH_UNCONFIRMED' });
    expect(call.gateway).toBeUndefined();
    expect((await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data).toBeNull();
    expect((await PairedDevice.findById(d.deviceId).lean()).currentCallId).toBeNull();
    expect(await recipientOf(call)).toMatchObject({ state: 'retry_scheduled', finalDisposition: 'failed' });
    expect((await summaryOf(campaign))).toMatchObject({ needsReconcile: 0, needsReview: 0 });
  });

  it('a definite, permanent agent dispatch refusal fails the lead without retries', async () => {
    dispatchAgent.mockResolvedValueOnce({ provider: 'livekit_sip', outcome: 'rejected', safeToRetry: false, errorCode: 'AGENT_NOT_FOUND', errorMessage: 'no such agent' });
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const call = await CallRecord.findOne().lean();
    expect(call).toMatchObject({ state: 'failed', failureCode: 'AGENT_NOT_FOUND' });
    expect(await recipientOf(call)).toMatchObject({ state: 'failed', finalDisposition: 'failed' });
  });

  it('the agent ending before the gateway claims the call withdraws it: never dialed, a failed attempt', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const call = await CallRecord.findOne().lean();
    await ai.agentEndCall(call.internalCallId, { disposition: 'no_answer' }); // its ring timer expired
    expect((await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data).toBeNull();
    expect(await callOf(call)).toMatchObject({ state: 'failed', disposition: 'failed', failureCode: 'AGENT_ENDED_BEFORE_DIAL', gateway: { state: 'cancelled' } });
    expect((await recipientOf(call)).state).toBe('retry_scheduled');
    expect((await PairedDevice.findById(d.deviceId).lean()).currentCallId).toBeNull();
    expect((await summaryOf(campaign)).noAnswer).toBe(0);
  });

  it('the agent dying after the lead answered is a failed call, not “no answer”', async () => {
    const { d, campaign, job, call } = await liveCall({ answered: true });
    await ev(d, job.callId, 'ended', { reason: 'agent_left' }).expect(200);
    expect(await callOf(call)).toMatchObject({ state: 'failed', disposition: 'failed', failureCode: 'PAIRED_AGENT_LEFT' });
    expect((await summaryOf(campaign))).toMatchObject({ noAnswer: 0 });
    expect((await recipientOf(call)).state).toBe('retry_scheduled'); // a known outcome: normal retry policy
  });

  it('call audio failing holds the phone for a check and flags the call', async () => {
    const { d, job, call } = await liveCall({ answered: true });
    await ev(d, job.callId, 'audio_lost', { detail: 'no audio link after answer' }).expect(200);
    await ev(d, job.callId, 'ended', { reason: 'audio_failed' }).expect(200);
    expect(await callOf(call)).toMatchObject({ reviewRequired: true, failureCode: 'PAIRED_AUDIO_FAILED' });
    expect((await pp.readiness(d.deviceId)).reasons).toContain('needs_attention');
  });
});

describe('C. campaign figures and the reconcile workflow', () => {
  it('figures stay consistent from queued → in progress → parked → reconciled as reached', async () => {
    const { d, campaign, job, call } = await liveCall({ leads: 2 });
    expect(await summaryOf(campaign)).toMatchObject({ total: 2, inProgress: 1, queued: 1, completed: 0 });
    await ev(d, job.callId, 'answered').expect(200);
    expect(await summaryOf(campaign)).toMatchObject({ inProgress: 1 });
    await ev(d, job.callId, 'outcome_unknown', { detail: 'unplugged' }).expect(200);
    expect(await summaryOf(campaign)).toMatchObject({ inProgress: 0, needsReconcile: 1, needsReview: 1, failed: 0, noAnswer: 0, completed: 0 });
    await d.gw('/heartbeat').send(hb()).expect(200); // the phone is idle again
    await ai.reconcileCall(call._id, owner, { resolution: 'reached', qualification: 'qualified', note: 'Lead confirmed on a call back' });
    expect(await callOf(call)).toMatchObject({
      state: 'completed', disposition: 'answered_partial', qualification: 'qualified', reviewRequired: false,
      reconciliation: { resolution: 'reached', resolvedBy: owner },
    });
    expect(await summaryOf(campaign)).toMatchObject({ needsReconcile: 0, needsReview: 0, completed: 1, qualified: 1, failed: 0 });
    expect((await Lead.findById(call.leadId).lean()).status).toBe('qualified');
  });

  it('reconcile is owner-only, once, refused while the phone is in the call, and “retry” requeues only that lead', async () => {
    const { d, campaign, job, call } = await liveCall({ answered: true });
    await ev(d, job.callId, 'outcome_unknown', { detail: 'unplugged' }).expect(200);
    await expect(ai.reconcileCall(call._id, stranger, { resolution: 'retry' })).rejects.toThrow(/not found/i);
    await d.gw('/heartbeat').send(hb({ state: { ...hb().state, call: 1 } })).expect(200);
    await expect(ai.reconcileCall(call._id, owner, { resolution: 'retry' })).rejects.toThrow(/still reports a call/);
    await d.gw('/heartbeat').send(hb()).expect(200);
    const [a, b] = await Promise.allSettled([
      ai.reconcileCall(call._id, owner, { resolution: 'retry' }), ai.reconcileCall(call._id, owner, { resolution: 'not_reached' }),
    ]);
    expect([a.status, b.status].sort()).toEqual(['fulfilled', 'rejected']); // exactly one resolution
    const resolved = await callOf(call);
    const r = await recipientOf(call);
    if (resolved.reconciliation.resolution === 'retry') expect(r).toMatchObject({ state: 'queued', finalDisposition: null });
    else expect(r).toMatchObject({ state: 'failed', finalDisposition: 'no_answer' });
    expect(resolved).toMatchObject({ state: 'failed', disposition: 'no_answer' });
    expect(await summaryOf(campaign)).toMatchObject({ needsReconcile: 0 });
    await expect(ai.reconcileCall(call._id, owner, { resolution: 'reached' })).rejects.toThrow(/only once/);
  });

  it('a call that is not parked cannot be “reconciled” into another outcome', async () => {
    const { d, job, call } = await liveCall({ answered: true });
    await ev(d, job.callId, 'ended', { reason: 'remote_hangup' }).expect(200);
    await expect(ai.reconcileCall(call._id, owner, { resolution: 'retry' })).rejects.toThrow(/unknown outcome/);
  });

  it('the reconcile request is validated: a qualification only with “reached”', async () => {
    const { reconcileCall } = await import('../../src/modules/aiCalling/aiCalling.validation.js');
    expect(reconcileCall.body.validate({ resolution: 'retry', qualification: 'qualified' }).error).toBeTruthy();
    expect(reconcileCall.body.validate({ resolution: 'maybe' }).error).toBeTruthy();
    expect(reconcileCall.body.validate({ resolution: 'reached', qualification: 'qualified' }).error).toBeUndefined();
  });
});

describe('concurrency, pause/resume, isolation', () => {
  it('two gateways claiming at the same moment get the call once', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const [a, b] = await Promise.all([
      d.gw('/calls/claim').send({ sessionNonce: NONCE }), d.gw('/calls/claim').send({ sessionNonce: NONCE }),
    ]);
    expect([a.body.data, b.body.data].filter(Boolean)).toHaveLength(1);
  });

  it('concurrent scheduler ticks never put two calls on one phone', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId, 3);
    await ai.startCampaign(campaign._id, owner);
    await Promise.all([tick(campaign._id), tick(campaign._id), tick(campaign._id)]);
    expect(await CallRecord.countDocuments()).toBe(1);
    expect(await CampaignRecipient.countDocuments({ state: 'dialing' })).toBe(1);
  });

  it('pause and resume with a parked call: the other lead is called, the parked one never again', async () => {
    const { d, campaign, job, call } = await liveCall({ leads: 2, answered: true });
    await ev(d, job.callId, 'outcome_unknown', { detail: 'unplugged' }).expect(200);
    await ai.pauseCampaign(campaign._id, owner);
    await ai.startCampaign(campaign._id, owner); // resume
    await d.gw('/heartbeat').send(hb()).expect(200);
    await pp.clearAttention(owner, d.deviceId);
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { lastCallEndedAt: new Date(Date.now() - 60 * 60_000) } }); // past the cooldown
    await forceDueAndTick(campaign);
    const calls = await CallRecord.find().sort({ createdAt: 1 }).lean();
    expect(calls).toHaveLength(2);
    expect(String(calls[1].recipientId)).not.toBe(String(call.recipientId));
    expectParked(await callOf(call), await recipientOf(call));
  });

  it('a revoked gateway cannot report events or claim calls', async () => {
    const { d, job } = await liveCall({ answered: true });
    await pp.revokeDevice(owner, d.deviceId);
    await ev(d, job.callId, 'ended', { reason: 'remote_hangup' }).expect(401);
    await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(401);
  });

  it('a gateway cannot report on another owner’s device call, and junk events are rejected', async () => {
    const { d, job } = await liveCall({ answered: true });
    const other = await pairDevice('someone else’s laptop');
    await request(serve(app)).post(`/gw/calls/${job.callId}/events`).set('Authorization', `Bearer ${other.token}`)
      .send({ eventId: crypto.randomUUID(), type: 'outcome_unknown', data: {} }).expect(404);
    await ev(d, job.callId, 'teleport').expect(400);
    await d.gw(`/calls/${job.callId}/events`).send({ type: 'ended' }).expect(400); // no event id
  });
});
