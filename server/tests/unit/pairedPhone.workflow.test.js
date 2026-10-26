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

describe('pairing and gateway authentication', () => {
  it('a pairing code works once; the token authenticates; revocation is immediate', async () => {
    const d = await pairDevice();
    const again = await request(serve(app)).post('/gw/pair').send({ code: d.code });
    expect(again.status).toBe(401);
    await request(serve(app)).post('/gw/heartbeat').set('Authorization', `Bearer ${d.token}`).send(hb()).expect(200);
    await request(serve(app)).post('/gw/heartbeat').set('Authorization', 'Bearer nope').send(hb()).expect(401);
    const stored = await PairedDevice.findById(d.deviceId).lean();
    expect(stored.tokenHash).not.toBe(d.token);
    await pp.revokeDevice(owner, d.deviceId);
    await request(serve(app)).post('/gw/heartbeat').set('Authorization', `Bearer ${d.token}`).send(hb()).expect(401);
  });

  it('heartbeat validation rejects junk; another owner cannot see the device', async () => {
    const d = await pairDevice();
    await request(serve(app)).post('/gw/heartbeat').set('Authorization', `Bearer ${d.token}`).send({ board: { connected: true, sessionNonce: 'xyz' } }).expect(400);
    await expect(pp.getDevice(stranger, d.deviceId)).rejects.toThrow();
    expect(await pp.listDevices(stranger)).toEqual([]);
  });

  it('the dial key is handed over once, then only the CRM holds it', async () => {
    const d = await pairDevice();
    const gw = (p) => request(serve(app)).post(`/gw${p}`).set('Authorization', `Bearer ${d.token}`);
    const first = await gw('/dial-key').send({}).expect(200);
    expect(first.body.data.key).toMatch(/^[0-9a-f]{64}$/);
    await gw('/dial-key/confirm').send({ bdaddr: '24:0A:C4:00:11:22' }).expect(200);
    await gw('/dial-key').send({}).expect(409);
    const listed = await pp.getDevice(owner, d.deviceId);
    expect(JSON.stringify(listed)).not.toContain(first.body.data.key);
    expect(listed.keyState).toBe('provisioned');
  });
});

describe('campaign gating', () => {
  it('cannot start on an unverified device, a revoked one, or one owned by someone else', async () => {
    const d = await pairDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await expect(ai.startCampaign(campaign._id, owner)).rejects.toThrow(/not been verified/);
    await expect(ai.createCampaign({
      name: 'x', questionnaire: { questions: [{ fieldKey: 'a', label: 'A', text: 'A?', type: 'boolean', order: 1 }] },
      selection: { mode: 'explicit', leadIds: campaign.selection.leadIds.map(String) }, transport: 'paired_phone', pairedDeviceId: d.deviceId,
    }, stranger)).rejects.toThrow(/not found/);
    await pp.revokeDevice(owner, d.deviceId);
    await expect(ai.startCampaign(campaign._id, owner)).rejects.toThrow(/revoked/);
  });

  it('kill switch blocks starting and dialing', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await ai.setVoicePaused(owner, { voicePaused: true, reason: 'test' });
    await expect(ai.startCampaign(campaign._id, owner)).rejects.toThrow(/kill switch/);
    await ai.setVoicePaused(owner, { voicePaused: false });
    await ai.startCampaign(campaign._id, owner);
    await ai.setVoicePaused(owner, { voicePaused: true });
    ai._voicePausedCache = null;
    expect(await tick(campaign._id)).toMatchObject({ voicePaused: true });
    expect(await CallRecord.countDocuments()).toBe(0);
  });

  it('waits (without claiming a lead) while the phone is not connected', async () => {
    const d = await readyDevice();
    await d.gw('/heartbeat').send(hb({ state: { ...hb().state, hfp: 'disconnected' } })).expect(200);
    const campaign = await pairedCampaign(d.deviceId);
    const res = await startAndTick(campaign);
    expect(res).toMatchObject({ deviceNotReady: true, reasons: ['phone_not_connected'] });
    expect(await CallRecord.countDocuments()).toBe(0);
    expect((await CampaignRecipient.findOne()).attemptCount).toBe(0);
    expect((await CallCampaign.findById(campaign._id).lean()).deviceWait.reasons).toEqual(['phone_not_connected']);
  });
});

describe('a full paired-phone call', () => {
  it('queues one call, signs the dial for the ESP32 session, and finishes through gateway events', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId, 2);
    const tick = await startAndTick(campaign);
    expect(tick.dispatched).toBe(1); // one phone, one call, even with maxConcurrency 5
    const call = await CallRecord.findOne().lean();
    expect(call).toMatchObject({ provider: 'paired_phone', state: 'ringing', gateway: { state: 'queued' } });
    expect(dispatchAgent).toHaveBeenCalledTimes(1);
    expect(String((await PairedDevice.findById(d.deviceId).lean()).currentCallId)).toBe(String(call._id));

    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    expect(job).toMatchObject({ callId: call.internalCallId, counter: 1, callRef: 1, number: '+923001234560', roomName: call.roomName });
    const want = crypto.createHmac('sha256', d.key).update(`updata-dial-v1|${NONCE}|1|1|+923001234560`).digest('hex');
    expect(job.mac).toBe(want);
    const grant = jwt.verify(job.livekit.token, 'secret-secret-secret-secret');
    expect(grant).toMatchObject({ sub: `sip-${call.internalCallId}`, video: { room: call.roomName, canUpdateOwnMetadata: true } });
    expect((await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data).toBeNull(); // not twice

    const ev = (type, data = {}, eventId = crypto.randomUUID()) => d.gw(`/calls/${call.internalCallId}/events`).send({ eventId, type, data });
    await ev('dialing').expect(200);
    await ev('ringing').expect(200);
    await ev('answered').expect(200);
    expect((await CallRecord.findById(call._id).lean()).state).toBe('in_progress');
    await ev('audio_opened', { codec: 'cvsd' }).expect(200);
    await ev('stats', { rxLevelDbfs: -30, txLevelDbfs: -24, upFrames: 500, downUnderruns: 0, firstAiAudioMs: 900, agentConnected: true }).expect(200);
    const live = await ai.activeCalls(campaign._id, owner);
    expect(live[0]).toMatchObject({ transport: 'paired_phone', gateway: { audioOpen: true, audio: { firstAiAudioMs: 900 } } });

    const endId = crypto.randomUUID();
    await ev('ended', { reason: 'remote_hangup' }, endId).expect(200);
    const dup = await ev('ended', { reason: 'remote_hangup' }, endId).expect(200);
    expect(dup.body.data.duplicate).toBe(true);
    const done = await CallRecord.findById(call._id).lean();
    expect(done.resultsProcessedAt).toBeTruthy();
    const dev = await PairedDevice.findById(d.deviceId).lean();
    expect(dev.currentCallId).toBeNull();
    expect(dev.lastCallEndedAt).toBeTruthy();
    expect((await pp.readiness(d.deviceId)).reasons).toContain('cooldown');
  });

  it('a new ESP32 session restarts the counter; the counter rises within a session', async () => {
    const d = await readyDevice();
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { 'limits.cooldownSeconds': 20 } });
    const campaign = await pairedCampaign(d.deviceId, 2);
    await startAndTick(campaign);
    const a = (await d.gw('/calls/claim').send({ sessionNonce: NONCE2 }).expect(200)).body.data;
    expect(a.counter).toBe(1);
    await d.gw(`/calls/${a.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'ended', data: { reason: 'not_answered' } }).expect(200);
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { lastCallEndedAt: new Date(Date.now() - 60_000) } });
    await tick(campaign._id);
    const b = (await d.gw('/calls/claim').send({ sessionNonce: NONCE2 }).expect(200)).body.data;
    expect(b).toMatchObject({ counter: 2, callRef: 2 });
  });

  it('firmware refusal fails the call without holding the device', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'dial_refused', data: { code: 'unauthorized' } }).expect(200);
    const call = await CallRecord.findOne().lean();
    expect(call.resultsProcessedAt).toBeTruthy();
    expect(call.failureCode).toBe('FIRMWARE_UNAUTHORIZED');
    expect((await PairedDevice.findById(d.deviceId).lean()).currentCallId).toBeNull();
  });
});

describe('safety', () => {
  it('a call the gateway never claims is cancelled, the attempt refunded, the device freed', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    await CallRecord.updateOne({}, { $set: { 'gateway.queuedAt': new Date(Date.now() - 120_000), initiatedAt: new Date(Date.now() - 10 * 60_000) } });
    await ai.reconcileStuckCalls();
    const call = await CallRecord.findOne().lean();
    expect(call).toMatchObject({ state: 'cancelled', failureCode: 'NOT_DIALED' });
    const r = await CampaignRecipient.findOne().lean();
    expect(r).toMatchObject({ state: 'queued', attemptCount: 0 });
    expect((await PairedDevice.findById(d.deviceId).lean()).currentCallId).toBeNull();
    expect(endCall).toHaveBeenCalledWith({ roomName: call.roomName });
  });

  it('a paused campaign never hands a queued call to the gateway', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    await ai.pauseCampaign(campaign._id, owner);
    expect((await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data).toBeNull();
    expect((await CallRecord.findOne().lean()).state).toBe('cancelled');
    expect((await CampaignRecipient.findOne().lean())).toMatchObject({ state: 'queued', attemptCount: 0 });
  });

  it('a gateway that vanishes after claiming makes the call ambiguous and holds the device', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200);
    await CallRecord.updateOne({}, { $set: { initiatedAt: new Date(Date.now() - 10 * 60_000) } });
    roomStatusMock.mockResolvedValue('gone');
    await ai.reconcileStuckCalls();
    const call = await CallRecord.findOne().lean();
    expect(call.state).toBe('needs_reconcile');
    expect((await CampaignRecipient.findOne().lean()).state).toBe('failed'); // never redialed automatically
    const dev = await pp.getDevice(owner, d.deviceId);
    expect(dev.readiness.reasons).toContain('needs_attention');
    await d.gw('/heartbeat').send(hb()).expect(200);
    await pp.clearAttention(owner, d.deviceId);
    expect((await pp.getDevice(owner, d.deviceId)).readiness.reasons).not.toContain('needs_attention');
  });

  it('outcome_unknown from the gateway parks the call and the device', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'outcome_unknown', data: { detail: 'USB unplugged mid-call' } }).expect(200);
    expect((await CallRecord.findOne().lean()).state).toBe('needs_reconcile');
    expect((await pp.readiness(d.deviceId)).reasons).toContain('needs_attention');
    await tick(campaign._id);
    expect(await CallRecord.countDocuments()).toBe(1);
  });

  it('a later end report never turns an ambiguous call into a redial (found by the full-stack E2E)', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await CallCampaign.updateOne({ _id: campaign._id }, { $set: { 'schedule.maxAttemptsPerLead': 3 } });
    await startAndTick(campaign);
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'answered' }).expect(200);
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'outcome_unknown', data: { detail: 'USB unplugged' } }).expect(200);
    // The agent notices the line left and reports the end of the call afterwards.
    await ai.agentEndCall(job.callId, { durationSeconds: 7 });
    const call = await CallRecord.findOne().lean();
    expect(call).toMatchObject({ state: 'needs_reconcile', reviewRequired: true, disposition: 'needs_review' });
    const summary = (await CallCampaign.findById(campaign._id).lean()).summary;
    expect(summary).toMatchObject({ needsReconcile: 1, noAnswer: 0 });
    expect(summary.needsReview).toBeGreaterThanOrEqual(1);
    expect(call.resultsProcessedAt).toBeTruthy();
    const r = await CampaignRecipient.findOne().lean();
    expect(r.state).toBe('failed');
    expect(r.nextAttemptAt == null || r.state !== 'retry_scheduled').toBe(true);
    await tick(campaign._id);
    expect(await CallRecord.countDocuments()).toBe(1); // never redialed
  });

  it('owner hang-up and takeover reach the gateway as commands; takeover flags review', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    const call = await CallRecord.findOne().lean();
    await expect(pp.requestCallControl(stranger, call._id, 'takeover')).rejects.toThrow();
    await pp.requestCallControl(owner, call._id, 'takeover');
    const beat = (await d.gw('/heartbeat').send(hb({ state: { ...hb().state, call: 1 } })).expect(200)).body.data;
    expect(beat.commands).toEqual([{ type: 'takeover', callId: job.callId }]);
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'command_done', data: { type: 'takeover' } }).expect(200);
    expect((await d.gw('/heartbeat').send(hb()).expect(200)).body.data.commands).toEqual([]);
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'answered' }).expect(200);
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'ended', data: { reason: 'remote_hangup' } }).expect(200);
    const done = await CallRecord.findOne().lean();
    expect(done.reviewRequired).toBe(true);
    // Found by the Android E2E: a taken-over call was saved as no_answer (which can redial).
    expect(done.disposition).toBe('answered_partial');
    expect(done.state).toBe('completed');
    expect((await CampaignRecipient.findOne().lean()).state).not.toBe('retry_scheduled');
  });

  it('events for another device’s call are refused', async () => {
    const a = await readyDevice();
    const campaign = await pairedCampaign(a.deviceId);
    await startAndTick(campaign);
    const job = (await a.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    const b = await pairDevice('other');
    await request(serve(app)).post(`/gw/calls/${job.callId}/events`).set('Authorization', `Bearer ${b.token}`)
      .send({ eventId: crypto.randomUUID(), type: 'ended', data: { reason: 'remote_hangup' } }).expect(404);
  });

  it('a firmware change after verification requires verifying audio again', async () => {
    const d = await readyDevice();
    await d.gw('/heartbeat').send(hb({ board: { ...hb().board, firmware: '0.2.0' } })).expect(200);
    const dev = await pp.getDevice(owner, d.deviceId);
    expect(dev.audioVerified).toBe(false);
    expect(dev.lastError.code).toBe('FIRMWARE_CHANGED');
  });
});
