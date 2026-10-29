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
  const { default: ownerRoutes } = await import('../../src/modules/pairedPhone/pairedPhone.routes.js');
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
  app.use('/owner', ownerRoutes);
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

describe('phone creation, recovery and deletion', () => {
  it('archives and restores an idle phone without losing credentials, setup or campaign history', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    const before = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    await expect(pp.archiveDevice(stranger, d.deviceId)).rejects.toThrow(/not found/i);
    const archived = await pp.archiveDevice(owner, d.deviceId);
    expect(archived).toMatchObject({ archived: true, readiness: { ok: false, blocking: true } });
    expect(archived.readiness.reasons).toContain('archived');
    expect((await pp.listDevices(owner))[0].archived).toBe(true);
    expect(await pp.authenticateGateway(d.token)).toBeTruthy();
    await d.gw('/heartbeat').send(hb()).expect(200).expect(res => expect(res.body.data.voicePaused).toBe(true));
    await expect(ai.startCampaign(campaign._id, owner)).rejects.toThrow(/archived/);
    expect(await pp.acquire(d.deviceId, { owner, callId: new mongoose.Types.ObjectId() })).toMatchObject({ ok: false, reasons: expect.arrayContaining(['archived']) });
    await expect(pairedCampaign(d.deviceId)).rejects.toThrow(/archived/);
    await expect(pp.createPairingCode(owner, { deviceId: d.deviceId, deviceName: 'Sales' })).rejects.toThrow(/Restore/);
    await expect(pp.restoreDevice(stranger, d.deviceId)).rejects.toThrow(/not found/i);
    expect(await pp.restoreDevice(owner, d.deviceId)).toMatchObject({ archived: false, audioVerified: true, readiness: { ok: true } });
    const restored = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    expect(restored.dialKey.enc).toBe(before.dialKey.enc);
    expect(restored.tokenHash).toBe(before.tokenHash);
    expect(restored.audioVerifiedAt).toEqual(before.audioVerifiedAt);
    expect(await CallCampaign.findById(campaign._id)).toBeTruthy();
    await pp.archiveDevice(owner, d.deviceId);
    await pp.deleteDevice(owner, d.deviceId);
    await expect(pp.restoreDevice(owner, d.deviceId)).rejects.toThrow(/not found/i);
  });

  it('blocks archiving during calls, setup and unresolved alerts', async () => {
    const d = await readyDevice();
    for (const fields of [
      { currentCallId: new mongoose.Types.ObjectId() }, { 'state.call': 1 }, { 'attention.needed': true },
      { 'setup.command': { id: crypto.randomUUID(), action: 'connect_phone', state: 'pending', requestedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } },
    ]) {
      await PairedDevice.updateOne({ _id: d.deviceId }, { $set: fields });
      await expect(pp.archiveDevice(owner, d.deviceId)).rejects.toThrow(/Finish the current call/);
      await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { currentCallId: null, 'state.call': 0, 'attention.needed': false, 'setup.command': null } });
    }
    expect((await pp.getDevice(owner, d.deviceId)).archived).toBe(false);
  });

  it('invalidates unused pairing codes when archiving and can issue a fresh one after restoring', async () => {
    const pending = await pp.createPairingCode(owner, { deviceName: 'Sales' });
    await pp.archiveDevice(owner, pending.deviceId);
    await expect(pp.redeemPairingCode(pending.code)).rejects.toThrow(/invalid/);
    await pp.restoreDevice(owner, pending.deviceId);
    const fresh = await pp.createPairingCode(owner, { deviceId: pending.deviceId, deviceName: 'Sales' });
    expect((await pp.redeemPairingCode(fresh.code)).deviceId).toBe(pending.deviceId);
  });

  it('saves multiple distinct phones before their gateways pair, then redeems into those same records', async () => {
    const codes = await Promise.all(['Sales', 'Support'].map(deviceName => pp.createPairingCode(owner, { deviceName })));
    expect(codes[0].deviceId).not.toBe(codes[1].deviceId);
    const saved = await pp.listDevices(owner);
    expect(saved).toHaveLength(2);
    expect(saved.every(d => !d.online && !d.readiness.ok)).toBe(true);
    const paired = await Promise.all(codes.map(c => pp.redeemPairingCode(c.code)));
    expect(paired.map(d => d.deviceId)).toEqual(codes.map(c => c.deviceId));
    expect(await PairedDevice.countDocuments({ createdBy: owner })).toBe(2);
    expect(await pp.authenticateGateway(paired[0].token)).toMatchObject({ name: 'Sales' });
    expect(await pp.authenticateGateway(paired[1].token)).toMatchObject({ name: 'Support' });
  });

  it('edits a phone without changing its security key, verification or call history', async () => {
    const d = await readyDevice();
    const before = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    const edited = await pp.updateDevice(owner, d.deviceId, { name: 'Sales phone', phoneLabel: 'SIM 2' });
    expect(edited).toMatchObject({ name: 'Sales phone', phoneLabel: 'SIM 2', audioVerified: true });
    const after = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    expect(after.dialKey.enc).toBe(before.dialKey.enc);
    expect(after.tokenHash).toBe(before.tokenHash);
    await expect(pp.updateDevice(stranger, d.deviceId, { name: 'Taken' })).rejects.toThrow(/not found/i);
  });

  it('replaces unused codes on the same phone without duplicates or exhausting the open-code limit', async () => {
    let code = await pp.createPairingCode(owner, { deviceName: 'Sales' });
    const original = code;
    for (let i = 0; i < 6; i++) code = await pp.createPairingCode(owner, { deviceId: original.deviceId, deviceName: 'Sales' });
    expect(code.deviceId).toBe(original.deviceId);
    expect(await pp.listDevices(owner)).toHaveLength(1);
    await expect(pp.redeemPairingCode(original.code)).rejects.toThrow(/invalid, used or expired/);
    expect((await pp.redeemPairingCode(code.code)).deviceId).toBe(original.deviceId);
    await expect(pp.createPairingCode(stranger, { deviceId: original.deviceId, deviceName: 'Sales' })).rejects.toThrow(/not found/i);
  });

  it('relinks an offline phone, invalidates its old token, and preserves the board key and audio verification', async () => {
    const d = await readyDevice();
    await expect(pp.createPairingCode(owner, { deviceId: d.deviceId, deviceName: 'Sales' })).rejects.toThrow(/Stop the gateway/);
    const before = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { lastHeartbeatAt: new Date(Date.now() - 30_000) } });
    const code = await pp.createPairingCode(owner, { deviceId: d.deviceId, deviceName: 'Sales' });
    const paired = await pp.redeemPairingCode(code.code, { version: '0.4.0' });
    expect(paired.deviceId).toBe(d.deviceId);
    expect(await pp.authenticateGateway(d.token)).toBeNull();
    expect(await pp.authenticateGateway(paired.token)).toBeTruthy();
    const after = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    expect(after.dialKey.enc).toBe(before.dialKey.enc);
    expect(after.audioVerifiedAt).toEqual(before.audioVerifiedAt);
    expect(await pp.listDevices(owner)).toHaveLength(1);
  });

  it('does not consume a code if the saved phone becomes busy before redemption', async () => {
    const code = await pp.createPairingCode(owner, { deviceName: 'Sales' });
    await PairedDevice.updateOne({ _id: code.deviceId }, { $set: { currentCallId: new mongoose.Types.ObjectId() } });
    await expect(pp.redeemPairingCode(code.code)).rejects.toThrow(/in a call/);
    await PairedDevice.updateOne({ _id: code.deviceId }, { $set: { currentCallId: null } });
    expect((await pp.redeemPairingCode(code.code)).deviceId).toBe(code.deviceId);
  });

  it('deletes an unused phone, invalidates its code and frees an open-code slot', async () => {
    const codes = [];
    for (let i = 0; i < 5; i++) codes.push(await pp.createPairingCode(owner, { deviceName: `Phone ${i}` }));
    await expect(pp.createPairingCode(owner, { deviceName: 'Extra' })).rejects.toThrow(/Five phones/);
    await pp.deleteDevice(owner, codes[0].deviceId);
    await expect(pp.redeemPairingCode(codes[0].code)).rejects.toThrow(/invalid/);
    await pp.createPairingCode(owner, { deviceName: 'Extra' });
    expect(await pp.listDevices(owner)).toHaveLength(5);
  });

  it('deletes only the owner’s idle phone and keeps historical references while revoking credentials', async () => {
    const d = await readyDevice();
    await expect(pp.deleteDevice(stranger, d.deviceId)).rejects.toThrow(/not found/i);
    const campaign = await pairedCampaign(d.deviceId);
    await pp.deleteDevice(owner, d.deviceId);
    expect(await pp.listDevices(owner)).toEqual([]);
    expect(await pp.authenticateGateway(d.token)).toBeNull();
    await expect(pp.getDevice(owner, d.deviceId)).rejects.toThrow(/not found/i);
    const deleted = await PairedDevice.findById(d.deviceId).select('+dialKey.enc').lean();
    expect(deleted.deletedAt).toBeTruthy();
    expect(deleted.revokedAt).toBeTruthy();
    expect(deleted.dialKey.enc).toBeNull();
    expect(await CallCampaign.findById(campaign._id)).toBeTruthy();
    await expect(ai.startCampaign(campaign._id, owner)).rejects.toThrow(/revoked/);
    await d.gw('/heartbeat').send(hb()).expect(401);
  });

  it('blocks deletion while a call or setup action is active or a call needs attention', async () => {
    const d = await readyDevice();
    for (const fields of [
      { currentCallId: new mongoose.Types.ObjectId() },
      { 'state.call': 1 },
      { 'attention.needed': true },
      { 'setup.command': { id: crypto.randomUUID(), action: 'connect_phone', state: 'pending', requestedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) } },
    ]) {
      await PairedDevice.updateOne({ _id: d.deviceId }, { $set: fields });
      await expect(pp.deleteDevice(owner, d.deviceId)).rejects.toThrow(/Finish the current call/);
      await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { currentCallId: null, 'state.call': 0, 'attention.needed': false, 'setup.command': null } });
    }
    expect(await pp.authenticateGateway(d.token)).toBeTruthy();
  });
});

describe('supervised audio verification call', () => {
  it('runs one bounded test before audio attestation, without marking audio verified', async () => {
    const { AUDIO_VERIFICATION_TEST } = await import('../../src/modules/aiCalling/aiCalling.service.js');
    const d = await readyDevice();
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { audioVerifiedAt: null } });
    const c = await pairedCampaign(d.deviceId);
    await CallCampaign.updateOne({ _id: c._id }, { $set: { isTest: true, 'schedule.maxConcurrency': 1, 'schedule.maxAttemptsPerLead': 1, 'schedule.maxCallsPerDay': 1 } });
    await expect(ai.startCampaign(c._id, owner)).rejects.toThrow(/audio has not been verified/);
    // A JSON field is not the trusted diagnostic capability.
    await expect(ai.startCampaign(c._id, owner, { audioVerificationTest: true })).rejects.toThrow(/audio has not been verified/);
    const opts = { [AUDIO_VERIFICATION_TEST]: true };
    await expect(ai.startCampaign(c._id, stranger, opts)).rejects.toThrow();
    await ai.startCampaign(c._id, owner, opts);
    const started = await CallCampaign.findById(c._id).lean();
    expect(await ai.tickCampaign(c._id, started.tickToken, opts)).toMatchObject({ dispatched: 1 });
    expect(await CallRecord.countDocuments({ campaignId: c._id })).toBe(1);
    expect((await PairedDevice.findById(d.deviceId).lean()).audioVerifiedAt).toBeNull();
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    expect(job.callId).toBeTruthy();
    expect((await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data).toBeNull();
  });

  it('rejects normal campaigns and multi-recipient campaigns even with the trusted capability', async () => {
    const { AUDIO_VERIFICATION_TEST } = await import('../../src/modules/aiCalling/aiCalling.service.js');
    const d = await readyDevice();
    const c = await pairedCampaign(d.deviceId, 2);
    const opts = { [AUDIO_VERIFICATION_TEST]: true };
    await expect(ai.startCampaign(c._id, owner, opts)).rejects.toThrow(/fresh, single-recipient/);
    await CallCampaign.updateOne({ _id: c._id }, { $set: { isTest: true, 'schedule.maxConcurrency': 1, 'schedule.maxAttemptsPerLead': 1, 'schedule.maxCallsPerDay': 1 } });
    await expect(ai.startCampaign(c._id, owner, opts)).rejects.toThrow(/fresh, single-recipient/);
    expect(dispatchAgent).not.toHaveBeenCalled();
  });
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

describe('CRM manual setup', () => {
  async function currentGateway() {
    const d = await readyDevice();
    await d.gw('/heartbeat').send(hb({ gateway: { version: '0.3.0', platform: 'darwin' } })).expect(200);
    return d;
  }

  it('delivers a command only to its device, claims once, reports completion and rejects in-call changes', async () => {
    const { default: setup } = await import('../../src/modules/pairedPhone/pairedSetup.service.js');
    const d = await currentGateway();
    await expect(setup.request(stranger, d.deviceId, 'status')).rejects.toThrow();
    const s = await setup.request(owner, d.deviceId, 'pair_phone');
    await expect(setup.request(owner, d.deviceId, 'status')).rejects.toThrow(/progress/);
    const other = await pairDevice('Other device');
    await request(serve(app)).post(`/gw/setup/${s.command.id}/claim`).set('Authorization', `Bearer ${other.token}`).send({}).expect(409);
    await d.gw(`/setup/${s.command.id}/claim`).send({}).expect(200);
    await d.gw(`/setup/${s.command.id}/claim`).send({}).expect(409);
    await d.gw(`/setup/${s.command.id}/result`).send({ succeeded: true }).expect(200);
    expect((await pp.getDevice(owner, d.deviceId)).setup.command.state).toBe('succeeded');
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { 'state.call': 1 } });
    await expect(setup.request(owner, d.deviceId, 'reconnect_usb')).rejects.toThrow(/End the phone call/);
  });

  it('expires abandoned commands and does not confirm a newly delivered key from an old board flag', async () => {
    const { default: setup } = await import('../../src/modules/pairedPhone/pairedSetup.service.js');
    const d = await currentGateway();
    const s = await setup.request(owner, d.deviceId, 'status');
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { 'setup.command.expiresAt': new Date(Date.now() - 1) } });
    await d.gw(`/setup/${s.command.id}/claim`).send({}).expect(409);
    expect((await pp.getDevice(owner, d.deviceId)).setup.command.state).toBe('expired');
    await pp.rotateDialKey(owner, d.deviceId);
    await d.gw('/dial-key').send({}).expect(200);
    await d.gw('/heartbeat').send(hb()).expect(200);
    expect((await pp.getDevice(owner, d.deviceId)).keyState).toBe('delivered');
    expect((await pp.readiness(d.deviceId)).reasons).toContain('key_not_provisioned');
  });

  it('does not replace a pending key again during routine setup', async () => {
    const d = await currentGateway();
    await pp.rotateDialKey(owner, d.deviceId);
    const first = await PairedDevice.findById(d.deviceId).select('dialKey.issuedAt').lean();
    await expect(pp.rotateDialKey(owner, d.deviceId)).rejects.toThrow(/already waiting/);
    const after = await PairedDevice.findById(d.deviceId).select('dialKey.issuedAt').lean();
    expect(after.dialKey.issuedAt).toEqual(first.dialKey.issuedAt);
  });

  it('allows an ordinary writer to set up their device while readers, anonymous users and other owners cannot', async () => {
    const { createRole, createUser } = await import('../helpers/factory.js');
    await import('../../src/modules/auth/role.model.js');
    const { default: Permission } = await import('../../src/modules/auth/permission.model.js');
    const { generateAccessToken } = await import('../../src/shared/utils/crypto.js');
    const write = await Permission.create({ module: 'ai-calling', action: 'write' });
    const read = await Permission.create({ module: 'ai-calling', action: 'read' });
    const role = await createRole({ name: 'Bridge operator', permissions: [write._id, read._id] });
    await createUser({ _id: owner, role: role._id });
    const reader = await createUser({ role: (await createRole({ permissions: [read._id] }))._id });
    const other = await createUser({ role: role._id });
    const auth = user => `Bearer ${generateAccessToken({ sub: String(user) })}`;
    const codePath = '/owner/devices/pairing-code';
    await request(serve(app)).post(codePath).send({ deviceName: 'Sales' }).expect(401);
    await request(serve(app)).post(codePath).set('Authorization', auth(reader._id)).send({ deviceName: 'Sales' }).expect(403);
    const created = await request(serve(app)).post(codePath).set('Authorization', auth(owner)).send({ deviceName: 'Sales' }).expect(201);
    const devicePath = `/owner/devices/${created.body.data.deviceId}`;
    await request(serve(app)).patch(devicePath).set('Authorization', auth(reader._id)).send({ name: 'New name' }).expect(403);
    await request(serve(app)).patch(devicePath).set('Authorization', auth(other._id)).send({ name: 'New name' }).expect(404);
    await request(serve(app)).patch(devicePath).set('Authorization', auth(owner)).send({ name: ' ' }).expect(400);
    await request(serve(app)).patch(devicePath).set('Authorization', auth(owner)).send({ name: 'New name', phoneLabel: 'SIM 2' }).expect(200);
    for (const action of ['archive', 'restore']) {
      await request(serve(app)).post(`${devicePath}/${action}`).expect(401);
      await request(serve(app)).post(`${devicePath}/${action}`).set('Authorization', auth(reader._id)).expect(403);
      await request(serve(app)).post(`${devicePath}/${action}`).set('Authorization', auth(other._id)).expect(404);
      await request(serve(app)).post(`${devicePath}/${action}`).set('Authorization', auth(owner)).expect(200);
    }
    await request(serve(app)).delete(devicePath).expect(401);
    await request(serve(app)).delete(devicePath).set('Authorization', auth(reader._id)).expect(403);
    await request(serve(app)).delete(devicePath).set('Authorization', auth(other._id)).expect(404);
    await request(serve(app)).delete(devicePath).set('Authorization', auth(owner)).expect(200);
    const d = await currentGateway();
    const path = `/owner/devices/${d.deviceId}/setup`;
    const call = user => request(serve(app)).post(path).set('Authorization', `Bearer ${generateAccessToken({ sub: String(user) })}`).send({ action: 'status' });
    await request(serve(app)).post(path).send({ action: 'status' }).expect(401);
    await call(reader._id).expect(403);
    await call(other._id).expect(404);
    await call(owner).expect(202);
    await request(serve(app)).patch(path).set('Authorization', `Bearer ${generateAccessToken({ sub: String(owner) })}`).send({ playbackGainDb: 99 }).expect(400);
  });

  it('starts a single owned audio test before verification, and keeps its results private', async () => {
    const { default: audio } = await import('../../src/modules/pairedPhone/audioTest.service.js');
    const d = await currentGateway();
    await PairedDevice.updateOne({ _id: d.deviceId }, { $set: { audioVerifiedAt: null } });
    await expect(audio.start(owner, d.deviceId, { destination: '+923001234567', ownsDestination: false })).rejects.toThrow();
    const r = await audio.start(owner, d.deviceId, { destination: '+923001234567', ownsDestination: true });
    expect(await CallRecord.countDocuments({ pairedDeviceId: d.deviceId })).toBe(1);
    const call = await CallRecord.findById(r.id).lean();
    expect(call.isTest).toBe(true);
    expect((await pp.getDevice(owner, d.deviceId)).audioVerified).toBe(false);
    await expect(audio.result(stranger, d.deviceId, r.id)).rejects.toThrow();
    const campaign = await CallCampaign.findById(call.campaignId).lean();
    expect(campaign.schedule.maxAttemptsPerLead).toBe(1);
    expect(campaign.schedule.maxCallsPerDay).toBe(1);
  });

  it('never bypasses suppression for a test destination or leaves an eligible orphan campaign', async () => {
    const { default: audio } = await import('../../src/modules/pairedPhone/audioTest.service.js');
    const { default: Suppression } = await import('../../src/modules/aiCalling/callSuppression.model.js');
    const { phoneHash } = await import('../../src/modules/aiCalling/callAuth.js');
    const d = await currentGateway();
    await Suppression.create({ phoneHash: phoneHash('+923001234567'), reason: 'do_not_contact', createdBy: owner });
    await expect(audio.start(owner, d.deviceId, { destination: '+923001234567', ownsDestination: true })).rejects.toThrow(/eligible|can be called/);
    expect(await CallRecord.countDocuments({ pairedDeviceId: d.deviceId })).toBe(0);
    expect(await CallCampaign.countDocuments({ pairedDeviceId: d.deviceId, status: 'running' })).toBe(0);
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

  it.each(['unauthorized', 'no_session', 'session_changed', 'agent_not_ready', 'agent_failed', 'room_closed_before_dial', 'livekit_unavailable'])('dial refusal %s fails the call without holding the device', async code => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'dial_refused', data: { code } }).expect(200);
    const call = await CallRecord.findOne().lean();
    expect(call.resultsProcessedAt).toBeTruthy();
    expect(call.failureCode).toBe(`FIRMWARE_${code.toUpperCase()}`);
    if (code !== 'unauthorized') expect(call.failureMessage).toMatch(/no phone call was placed/i);
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

  it('keeps the agent recap while waiting for the paired phone to report completion', async () => {
    const d = await readyDevice();
    const campaign = await pairedCampaign(d.deviceId);
    await startAndTick(campaign);
    const job = (await d.gw('/calls/claim').send({ sessionNonce: NONCE }).expect(200)).body.data;
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'answered' }).expect(200);
    const callNotes = { description: 'Availability discussion', summary: 'The lead asked for a quote.', blockers: ['Awaiting quote'] };
    expect(await ai.agentEndCall(job.callId, { durationSeconds: 30, callNotes })).toMatchObject({ deferred: true });
    const pending = await CallRecord.findOne().lean();
    expect(pending.resultsProcessedAt).toBeNull();
    expect(pending.agentEnd.callNotes).toMatchObject(callNotes);
    await d.gw(`/calls/${job.callId}/events`).send({ eventId: crypto.randomUUID(), type: 'ended', data: { reason: 'remote_hangup' } }).expect(200);
    const finished = await CallRecord.findOne().lean();
    expect(finished.resultsProcessedAt).toBeTruthy();
    expect(finished.callNotes).toMatchObject({ ...callNotes, blockers: expect.arrayContaining(callNotes.blockers), source: 'ai_agent' });
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
