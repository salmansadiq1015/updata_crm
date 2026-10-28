/**
 * Paired-phone calling: the CRM side of the ESP32 Bluetooth hands-free gateway.
 *
 *   owner (web/mobile) ── pairing code ──▶ gateway (laptop) ── redeem ──▶ device + bearer token
 *   gateway ── heartbeat (board, phone, call state, audio stats) ──▶ CRM ── commands ──▶ gateway
 *   aiCalling scheduler ── acquire(device) + CallRecord(provider paired_phone, gateway.state queued)
 *   gateway ── claim ──▶ CRM signs the dial with the device key ──▶ gateway dials via the ESP32,
 *                                   joins the LiveKit room as `sip-<callId>`, the agent worker talks
 *   gateway ── events (idempotent) ──▶ applyWebhookEvent / processCallResults (shared with cloud SIP)
 *
 * Safety rules:
 *   - one call per device (atomic lock), cooldown + hourly/daily caps, kill switch, audio verified;
 *   - a call the gateway never claimed was provably never dialed → cancelled, attempt refunded;
 *   - anything else without a clear end is AMBIGUOUS: parked for a human, device held, never redialed.
 */

import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import PairedDevice from './pairedDevice.model.js';
import PairingCode from './pairingCode.model.js';
import CallRecord from '../aiCalling/callRecord.model.js';
import CallCampaign from '../aiCalling/callCampaign.model.js';
import CampaignRecipient from '../aiCalling/campaignRecipient.model.js';
import { CallWebhookEvent } from '../aiCalling/leadCallEvent.model.js';
import livekit from '../aiCalling/providers/livekitSip.provider.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import {
  decryptDialKey, encryptDialKey, hashToken, newDialKey, newPairingCode, newToken, normalizePairingCode, signDial,
} from './deviceCrypto.js';
import { deviceReadiness, HEARTBEAT_STALE_MS } from './readiness.js';
import { publicSetup } from './setupCommand.js';

const PAIRING_TTL_MS = 10 * 60_000;
const MAX_OPEN_PAIRING_CODES = 5;
const CLAIM_TTL_MS = 90_000; // a queued call nobody claimed by then was never dialed
const KEY_REDELIVERY_MS = 15 * 60_000;
const CALL_STATE_EVENTS = new Set(['dialing', 'ringing', 'answered', 'ended', 'failed']);
const aiCalling = () => import('../aiCalling/aiCalling.service.js');

function emitToOwner(userId, event, payload) {
  try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* best-effort */ }
}

const PUBLIC_FIELDS = '-tokenHash -dialKey.enc';

async function usageCounts(deviceId, now = new Date()) {
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const [callsLastHour, callsToday] = await Promise.all([
    CallRecord.countDocuments({ pairedDeviceId: deviceId, initiatedAt: { $gte: new Date(now.getTime() - 3_600_000) } }),
    CallRecord.countDocuments({ pairedDeviceId: deviceId, initiatedAt: { $gte: dayStart } }),
  ]);
  return { callsLastHour, callsToday };
}

/** Owner-facing shape: never includes the token hash or key material. */
export function presentDevice(device, readiness, usage = null) {
  const d = device.toObject ? device.toObject() : device;
  return {
    id: String(d._id),
    name: d.name,
    phoneLabel: d.phoneLabel,
    kind: d.kind,
    revoked: Boolean(d.revokedAt),
    revokedAt: d.revokedAt,
    online: readiness.online,
    lastHeartbeatAt: d.lastHeartbeatAt,
    gateway: d.gateway,
    board: d.board,
    state: d.state,
    stats: d.stats,
    lastError: d.lastError?.code ? d.lastError : null,
    keyState: d.dialKey?.state || 'pending',
    setup: publicSetup(d.setup),
    audioVerified: Boolean(d.audioVerifiedAt),
    audioVerifiedAt: d.audioVerifiedAt,
    audioTest: d.audioTest,
    audioVerification: d.audioVerification,
    limits: d.limits,
    currentCallId: d.currentCallId ? String(d.currentCallId) : null,
    currentCallSince: d.currentCallSince,
    lastCallEndedAt: d.lastCallEndedAt,
    attention: d.attention?.needed ? d.attention : null,
    readiness: { ok: readiness.ok, reasons: readiness.reasons, messages: readiness.messages, blocking: readiness.blocking },
    usage,
    createdAt: d.createdAt,
  };
}

class PairedPhoneService {
  // ------------------------------------------------------------------ owner: pairing & devices

  async createPairingCode(actor, { deviceName, phoneLabel = '' }, meta = {}) {
    const open = await PairingCode.countDocuments({ createdBy: actor, usedAt: null, expiresAt: { $gt: new Date() } });
    if (open >= MAX_OPEN_PAIRING_CODES) throw new ConflictError('Too many unused pairing codes; wait for them to expire');
    const code = newPairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
    await PairingCode.create({ codeHash: hashToken(normalizePairingCode(code)), deviceName, phoneLabel, expiresAt, createdBy: actor });
    auditService.logEvent({
      eventType: 'paired_phone.pairing_code_created', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { deviceName },
    });
    return { code, expiresAt };
  }

  /** Gateway side of pairing. The code is the only credential, so it is consumed atomically. */
  async redeemPairingCode(code, gatewayInfo = {}, meta = {}) {
    const row = await PairingCode.findOneAndUpdate(
      { codeHash: hashToken(normalizePairingCode(code)), usedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!row) throw new AuthenticationError('Pairing code is invalid, used or expired');
    const token = newToken();
    const device = await PairedDevice.create({
      name: row.deviceName,
      phoneLabel: row.phoneLabel,
      tokenHash: hashToken(token),
      tokenIssuedAt: new Date(),
      gateway: { version: gatewayInfo.version || null, platform: gatewayInfo.platform || null, hostname: gatewayInfo.hostname || null },
      dialKey: { enc: encryptDialKey(newDialKey()), state: 'pending', issuedAt: new Date() },
      createdBy: row.createdBy,
    });
    await PairingCode.updateOne({ _id: row._id }, { $set: { deviceId: device._id } });
    auditService.logEvent({
      eventType: 'paired_phone.gateway_paired', userId: row.createdBy, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { deviceId: device._id, platform: gatewayInfo.platform },
    });
    emitToOwner(row.createdBy, 'paired-phone:device', { deviceId: String(device._id), event: 'paired' });
    return { deviceId: String(device._id), deviceName: device.name, token };
  }

  async authenticateGateway(token) {
    if (!token) return null;
    return PairedDevice.findOne({ tokenHash: hashToken(token), revokedAt: null }).lean();
  }

  async listDevices(actor) {
    const devices = await PairedDevice.find({ createdBy: actor }).select(PUBLIC_FIELDS).sort({ revokedAt: 1, createdAt: -1 }).lean();
    const now = new Date();
    return Promise.all(devices.map(async (d) => {
      const usage = await usageCounts(d._id, now);
      return presentDevice(d, deviceReadiness(d, { now, ...usage }), usage);
    }));
  }

  async _owned(actor, id, { includeKey = false } = {}) {
    if (!mongoose.isValidObjectId(id)) throw new NotFoundError('PairedDevice', id);
    const q = PairedDevice.findOne({ _id: id, createdBy: actor });
    if (includeKey) q.select('+dialKey.enc');
    const device = await q;
    if (!device) throw new NotFoundError('PairedDevice', id);
    return device;
  }

  async getDevice(actor, id) {
    const device = await this._owned(actor, id);
    const usage = await usageCounts(device._id);
    return presentDevice(device, deviceReadiness(device.toObject(), usage), usage);
  }

  async updateDevice(actor, id, { name, phoneLabel, limits }) {
    const device = await this._owned(actor, id);
    if (name !== undefined) device.name = name;
    if (phoneLabel !== undefined) device.phoneLabel = phoneLabel;
    if (limits) device.limits = { ...(device.limits?.toObject?.() || device.limits || {}), ...limits };
    await device.save();
    return this.getDevice(actor, id);
  }

  async revokeDevice(actor, id, meta = {}) {
    const device = await this._owned(actor, id);
    if (device.revokedAt) return this.getDevice(actor, id);
    device.revokedAt = new Date();
    device.revokedBy = actor;
    device.tokenHash = null; // the gateway's next request fails immediately
    await device.save();
    // Campaigns bound to the device stop at their next tick (readiness: revoked).
    auditService.logEvent({
      eventType: 'paired_phone.device_revoked', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { deviceId: device._id },
    });
    emitToOwner(actor, 'paired-phone:device', { deviceId: String(device._id), event: 'revoked' });
    return this.getDevice(actor, id);
  }

  /** Gate A for one device: the owner attests that the probe call carried speech both ways. */
  async verifyAudio(actor, id, { inboundPhraseHeard, outboundPhraseHeard, note = '' }, meta = {}) {
    const device = await this._owned(actor, id);
    if (device.revokedAt) throw new ConflictError('Device is revoked');
    if (!inboundPhraseHeard || !outboundPhraseHeard) {
      throw new ValidationError('Both directions must be confirmed: the remote phrase in remote.wav AND the person hearing the AI prompt');
    }
    if (!device.board?.firmware) throw new ConflictError('Connect the ESP32 to the gateway first, so the verified firmware version is recorded');
    device.audioVerifiedAt = new Date();
    device.audioVerifiedBy = actor;
    device.audioVerification = { note, inboundPhraseHeard: true, outboundPhraseHeard: true, firmware: device.board.firmware };
    if (device.lastError?.code === 'FIRMWARE_CHANGED') device.lastError = { code: null, message: null, at: null };
    await device.save();
    auditService.logEvent({
      eventType: 'paired_phone.audio_verified', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { deviceId: device._id, firmware: device.board.firmware },
    });
    return this.getDevice(actor, id);
  }

  async rotateDialKey(actor, id, meta = {}) {
    const device = await this._owned(actor, id, { includeKey: true });
    if (device.currentCallId) throw new ConflictError('Wait until the current call ends');
    if (['pending', 'running'].includes(device.setup?.command?.state) && new Date(device.setup.command.expiresAt) > new Date()) throw new ConflictError('Wait for the setup action to finish before replacing its key');
    if (device.dialKey?.state === 'pending') throw new ConflictError('A new key is already waiting. Choose Finish setup → Save security key while holding BOOT; no reboot or another key is needed.');
    device.dialKey = { enc: encryptDialKey(newDialKey()), state: 'pending', issuedAt: new Date(), deliveredAt: null, provisionedAt: null };
    device.board.keyProvisioned = false;
    await device.save();
    auditService.logEvent({
      eventType: 'paired_phone.key_rotated', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { deviceId: device._id },
    });
    return this.getDevice(actor, id);
  }

  /**
   * After an uncertain outcome the device stays held. The owner looks at the phone, ends any call
   * by hand, then clears it here. Refused while the gateway still reports a live call.
   */
  async clearAttention(actor, id, meta = {}) {
    const device = await this._owned(actor, id);
    const online = device.lastHeartbeatAt && Date.now() - device.lastHeartbeatAt.getTime() <= HEARTBEAT_STALE_MS;
    if (online && (device.state?.call || device.state?.callsetup)) throw new ConflictError('The phone still reports a call; end it first');
    if (device.currentCallId) {
      const call = await CallRecord.findById(device.currentCallId).select('resultsProcessedAt state').lean();
      if (call && !call.resultsProcessedAt && call.state !== 'needs_reconcile') {
        throw new ConflictError('The current call is still being handled; end it from the live monitor first');
      }
    }
    await PairedDevice.updateOne({ _id: device._id }, { $set: {
      attention: { needed: false, reason: null, at: null },
      currentCallId: null, currentRecipientId: null, currentCallSince: null, lastCallEndedAt: new Date(),
    } });
    auditService.logEvent({
      eventType: 'paired_phone.attention_cleared', userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { deviceId: device._id },
    });
    return this.getDevice(actor, id);
  }

  // ------------------------------------------------------------------ scheduler integration

  async readiness(deviceId, now = new Date(), { audioVerificationTest = false } = {}) {
    const device = await PairedDevice.findById(deviceId).lean();
    if (!device) return { ok: false, reasons: ['revoked'], messages: ['Device not found'], blocking: true, retryInMs: null, online: false };
    return deviceReadiness(device, { now, ...(await usageCounts(device._id, now)), audioVerificationTest });
  }

  /** Atomically reserve the device for one call. Returns { ok } or { ok:false, reasons, retryInMs }. */
  async acquire(deviceId, { callId, recipientId, owner, audioVerificationTest = false }) {
    const ready = await this.readiness(deviceId, new Date(), { audioVerificationTest });
    if (!ready.ok) return ready;
    const now = new Date();
    const taken = await PairedDevice.findOneAndUpdate(
      { _id: deviceId, createdBy: owner, currentCallId: null, revokedAt: null, 'attention.needed': { $ne: true },
        $or: [{ 'setup.command.state': { $nin: ['pending', 'running'] } }, { 'setup.command.expiresAt': { $lte: now } }] },
      { $set: { currentCallId: callId, currentRecipientId: recipientId, currentCallSince: now } },
      { returnDocument: 'after' },
    );
    if (!taken) return { ok: false, reasons: ['device_busy'], retryInMs: 15_000, blocking: false };
    return { ok: true };
  }

  async release(deviceId, callId, { endedAt = new Date() } = {}) {
    if (!deviceId) return;
    const res = await PairedDevice.updateOne(
      { _id: deviceId, currentCallId: callId, 'attention.needed': { $ne: true } },
      { $set: { currentCallId: null, currentRecipientId: null, currentCallSince: null, lastCallEndedAt: endedAt } },
    );
    if (res.modifiedCount) {
      const d = await PairedDevice.findById(deviceId).select('createdBy').lean();
      if (d) emitToOwner(d.createdBy, 'paired-phone:device', { deviceId: String(deviceId), event: 'released' });
    }
  }

  /** Does the gateway (heard from recently) still report a phone call for this CRM call? */
  async phoneStillInCall(deviceId, callId, now = new Date()) {
    if (!deviceId) return false;
    const d = await PairedDevice.findById(deviceId).select('lastHeartbeatAt currentCallId state').lean();
    if (!d?.lastHeartbeatAt || now - new Date(d.lastHeartbeatAt) > HEARTBEAT_STALE_MS) return false;
    return String(d.currentCallId) === String(callId) && Boolean(d.state?.call || d.state?.callsetup);
  }

  async markAttention(deviceId, callId, reason) {
    if (!deviceId) return;
    await PairedDevice.updateOne({ _id: deviceId }, { $set: {
      attention: { needed: true, reason: String(reason || 'Unknown call outcome').slice(0, 300), at: new Date() },
      ...(callId ? { currentCallId: callId } : {}),
    } });
    const d = await PairedDevice.findById(deviceId).select('createdBy').lean();
    if (d) emitToOwner(d.createdBy, 'paired-phone:device', { deviceId: String(deviceId), event: 'attention' });
  }

  /**
   * A queued call the gateway never claimed: provably never dialed. Cancel it, refund the attempt,
   * free the device, and close the agent's room.
   */
  async cancelUndialed(call, reason) {
    const now = new Date();
    const res = await CallRecord.updateOne(
      { _id: call._id, resultsProcessedAt: null, 'gateway.state': 'queued' },
      { $set: {
        state: 'cancelled', disposition: 'cancelled', 'gateway.state': 'cancelled',
        failureCode: 'NOT_DIALED', failureMessage: reason, endedAt: now, resultsProcessedAt: now,
      } },
    );
    if (!res.modifiedCount) return false;
    const campaign = await CallCampaign.findById(call.campaignId).select('status createdBy').lean();
    await CampaignRecipient.updateOne(
      { _id: call.recipientId, lastCallId: call._id, attemptCount: { $gt: 0 } },
      { $set: { state: campaign?.status === 'cancelled' ? 'cancelled' : 'queued', leaseUntil: null, nextAttemptAt: null }, $inc: { attemptCount: -1 } },
    );
    await PairedDevice.updateOne(
      { _id: call.pairedDeviceId, currentCallId: call._id },
      { $set: { currentCallId: null, currentRecipientId: null, currentCallSince: null } },
    );
    if (call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
    const { refreshCampaignSummary } = await aiCalling();
    await refreshCampaignSummary(call.campaignId);
    logger.info('Paired-phone call cancelled before dialing', { module: 'paired-phone', callId: call.internalCallId, reason });
    return true;
  }

  // ------------------------------------------------------------------ gateway API

  async heartbeat(device, body = {}) {
    const now = new Date();
    const set = { lastHeartbeatAt: now, 'gateway.monitorSafe': body.gateway?.monitorSafe === true };
    if (body.gateway) {
      set['gateway.version'] = body.gateway.version || null;
      set['gateway.platform'] = body.gateway.platform || null;
      set['gateway.hostname'] = body.gateway.hostname || null;
      set['gateway.playbackGainDb'] = Number.isFinite(body.gateway.playbackGainDb) ? body.gateway.playbackGainDb : null;
      set['gateway.autoConnect'] = typeof body.gateway.autoConnect === 'boolean' ? body.gateway.autoConnect : null;
    }
    const b = body.board || {};
    set['board.connected'] = Boolean(b.connected);
    set['board.port'] = b.port || null;
    if (b.connected) {
      set['board.bdaddr'] = b.bdaddr || null;
      set['board.firmware'] = b.firmware || null;
      set['board.idf'] = b.idf || null;
      set['board.chipRevision'] = Number.isFinite(b.chipRevision) ? b.chipRevision : null;
      set['board.keyProvisioned'] = Boolean(b.keyProvisioned);
      if (b.sessionNonce && b.sessionNonce !== device.dial?.nonce) {
        set['dial.nonce'] = b.sessionNonce;
        set['dial.counter'] = 0; // the firmware reset its counter with the new session
      }
    }
    const s = b.connected ? (body.state || {}) : {};
    set.state = {
      device: b.connected ? String(s.device || 'unknown') : 'offline',
      hfp: String(s.hfp || 'disconnected'),
      call: Number(s.call) || 0,
      callsetup: Number(s.callsetup) || 0,
      audio: String(s.audio || 'off'),
      codec: String(s.codec || 'none'),
      signal: Number.isFinite(s.signal) ? s.signal : null,
      battery: Number.isFinite(s.battery) ? s.battery : null,
      peer: s.peer || null,
    };
    if (body.stats) set.stats = body.stats;
    if (body.error?.code) set.lastError = { code: String(body.error.code).slice(0, 60), message: String(body.error.message || '').slice(0, 300), at: now };
    // A different firmware than the one verified needs a new audio check.
    if (device.audioVerifiedAt && b.connected && b.firmware && device.audioVerification?.firmware && b.firmware !== device.audioVerification.firmware) {
      set.audioVerifiedAt = null;
      set['lastError'] = { code: 'FIRMWARE_CHANGED', message: `Firmware changed from ${device.audioVerification.firmware} to ${b.firmware}; verify call audio again`, at: now };
    }
    await PairedDevice.updateOne({ _id: device._id }, { $set: set });

    const commands = [];
    if (device.currentCallId) {
      const call = await CallRecord.findById(device.currentCallId).select('internalCallId gateway').lean();
      if (call?.gateway?.command?.kind && !call.gateway.command.ackedAt) {
        commands.push({ type: call.gateway.command.kind, callId: call.internalCallId });
      }
    }
    // Holding some key does not prove the newly delivered key was written.
    // Only explicit confirmation after the firmware's provisioning ACK may do that.
    const keyPending = device.dialKey?.state !== 'provisioned';
    emitToOwner(device.createdBy, 'paired-phone:device', { deviceId: String(device._id), event: 'heartbeat' });
    const fresh = await PairedDevice.findById(device._id).lean();
    const ready = deviceReadiness(fresh, { now, ...(await usageCounts(device._id, now)) });
    return {
      serverTime: now.toISOString(),
      deviceName: fresh.name,
      limits: fresh.limits,
      provisionKeyPending: keyPending,
      readiness: { ok: ready.ok, reasons: ready.reasons },
      voicePaused: await (await aiCalling()).default.isVoicePaused(),
      // Keeps the laptop awake while campaigns using this phone are running.
      activeCampaigns: await CallCampaign.countDocuments({ pairedDeviceId: device._id, transport: 'paired_phone', status: { $in: ['running', 'scheduled'] } }),
      commands,
      setup: publicSetup(fresh.setup, now),
    };
  }

  /** One-time hand-over of the dial key to the gateway for writing into the ESP32. */
  async takeDialKey(device) {
    const full = await PairedDevice.findById(device._id).select('+dialKey.enc');
    const k = full.dialKey || {};
    if (k.state === 'provisioned') throw new ConflictError('The dial key is already provisioned; rotate it from the CRM to provision again');
    if (k.state === 'delivered' && k.deliveredAt && Date.now() - k.deliveredAt.getTime() > KEY_REDELIVERY_MS) {
      throw new ConflictError('The dial key hand-over window passed; rotate the key from the CRM');
    }
    full.dialKey.state = 'delivered';
    full.dialKey.deliveredAt = k.deliveredAt || new Date();
    await full.save();
    return { key: decryptDialKey(k.enc).toString('hex') };
  }

  async confirmDialKey(device, { bdaddr }) {
    await PairedDevice.updateOne({ _id: device._id, 'dialKey.state': 'delivered' }, { $set: {
      'dialKey.state': 'provisioned', 'dialKey.provisionedAt': new Date(), 'board.keyProvisioned': true, 'board.bdaddr': bdaddr || null,
    } });
    return { ok: true };
  }

  /**
   * Hand the gateway its next call, signed for the ESP32's current session.
   * Returns null when there is nothing to do.
   */
  async claimCall(device, { sessionNonce }) {
    if (!/^[0-9a-f]{32}$/.test(sessionNonce || '')) throw new ValidationError('sessionNonce must be the 16-byte hex nonce from the ESP32 HELLO_ACK');
    const now = new Date();
    const candidate = await CallRecord.findOne({
      pairedDeviceId: device._id, provider: 'paired_phone', 'gateway.state': 'queued', resultsProcessedAt: null,
    }).sort({ 'gateway.queuedAt': 1 }).lean();
    if (!candidate) return null;

    // Never hand out a call that should no longer happen; each of these provably never dialed.
    const ai = await aiCalling();
    const campaign = await CallCampaign.findById(candidate.campaignId).select('status agentConfig').lean();
    let stop = null;
    if (now - new Date(candidate.gateway.queuedAt) > CLAIM_TTL_MS) stop = 'gateway did not claim the call in time';
    else if (campaign?.status !== 'running') stop = `campaign is ${campaign?.status || 'gone'}`;
    else if (await ai.default.isVoicePaused()) stop = 'voice calling is paused (kill switch)';
    else if (device.revokedAt) stop = 'device revoked';
    if (stop) {
      await this.cancelUndialed(candidate, stop);
      return null;
    }

    const recipient = await CampaignRecipient.findById(candidate.recipientId).select('phoneSnapshot').lean();
    const number = String(recipient?.phoneSnapshot || '').replace(/[^\d+]/g, '');
    const full = await PairedDevice.findById(device._id).select('+dialKey.enc');
    if (!full.dialKey?.enc || full.dialKey.state !== 'provisioned') {
      await this.cancelUndialed(candidate, 'dial key not provisioned');
      return null;
    }
    // Reserve the counter + call reference atomically for this claim.
    const nonceMatches = full.dial?.nonce === sessionNonce;
    const bumped = await PairedDevice.findOneAndUpdate(
      { _id: device._id, 'dial.nonce': full.dial?.nonce ?? null },
      nonceMatches
        ? { $inc: { 'dial.counter': 1, 'dial.callRefSeq': 1 } }
        : { $set: { 'dial.nonce': sessionNonce, 'dial.counter': 1 }, $inc: { 'dial.callRefSeq': 1 } },
      { returnDocument: 'after' },
    );
    if (!bumped) return null; // a concurrent heartbeat changed the session; the gateway claims again
    const claimed = await CallRecord.findOneAndUpdate(
      { _id: candidate._id, 'gateway.state': 'queued', resultsProcessedAt: null },
      { $set: { 'gateway.state': 'claimed', 'gateway.claimedAt': now, 'gateway.callRef': ((bumped.dial.callRefSeq - 1) % 0xfffffffe) + 1 /* u32, never 0 */ } },
      { returnDocument: 'after' },
    );
    if (!claimed) return null;

    const counter = bumped.dial.counter;
    const callRef = claimed.gateway.callRef;
    let mac;
    try {
      mac = signDial(decryptDialKey(full.dialKey.enc), { sessionNonce, counter, callRef, number });
    } catch (error) {
      logger.error('Paired-phone dial signing failed', { module: 'paired-phone', callId: claimed.internalCallId, error: error.message });
      await CallRecord.updateOne({ _id: claimed._id }, { $set: { 'gateway.state': 'queued' } });
      await this.cancelUndialed({ ...claimed.toObject(), gateway: { state: 'queued' } }, `cannot sign dial: ${error.message}`);
      return null;
    }
    const maxCallSeconds = campaign.agentConfig?.maxCallSeconds || 300;
    return {
      callId: claimed.internalCallId,
      callRef,
      counter,
      mac,
      number,
      roomName: claimed.roomName,
      livekit: {
        url: livekit.url,
        identity: `sip-${claimed.internalCallId}`,
        token: this._gatewayRoomToken(claimed.roomName, claimed.internalCallId, maxCallSeconds + 900),
      },
      ringTimeoutSeconds: bumped.limits?.ringTimeoutSeconds || 45,
      maxCallSeconds,
    };
  }

  /** LiveKit grant for the gateway's phone-line participant (it sets its own sip.callStatus). */
  _gatewayRoomToken(roomName, internalCallId, ttlSeconds) {
    if (!livekit.livekitReady) return null;
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({
      iss: livekit.apiKey,
      sub: `sip-${internalCallId}`,
      nbf: now,
      exp: now + ttlSeconds,
      name: 'lead (paired phone)',
      kind: 'sip',
      video: { room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canUpdateOwnMetadata: true },
    }, livekit.apiSecret, { algorithm: 'HS256' });
  }

  async _recordOnce(eventKey, { callId, eventType, occurredAt, payload }) {
    try {
      await CallWebhookEvent.create({ eventKey, provider: 'paired_phone', providerCallId: null, callId, eventType, normalizedState: null, occurredAt, payload });
      return true;
    } catch (error) {
      if (error?.code === 11000) return false;
      throw error;
    }
  }

  /** Gateway → CRM call events. Idempotent per eventId; stale events for finished calls are ignored. */
  async reportEvent(device, internalCallId, { eventId, type, at, data = {} }) {
    const call = await CallRecord.findOne({ internalCallId, pairedDeviceId: device._id });
    if (!call) throw new NotFoundError('CallRecord', internalCallId);
    const occurredAt = at ? new Date(at) : new Date();
    const ai = await aiCalling();
    const owner = call.createdBy;
    const emit = (extra = {}) => emitToOwner(owner, 'ai-calling:call', {
      campaignId: String(call.campaignId), callId: internalCallId, transport: 'paired_phone', event: type, ...extra,
    });

    if (CALL_STATE_EVENTS.has(type)) {
      if (type === 'dialing') await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.state': 'dialing', 'gateway.dialedAt': occurredAt } });
      let eventType = type;
      if (type === 'ended' || type === 'failed') {
        const reason = String(data.reason || '');
        eventType = type === 'failed' ? 'failed'
          : ({ not_answered: 'no-answer', busy: 'busy', rejected: 'busy' })[reason] || 'completed';
        await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.state': 'ended', 'gateway.endReason': reason.slice(0, 60) || type } });
      }
      const result = await ai.default.applyWebhookEvent({
        provider: 'paired_phone', providerCallId: call.providerCallId, internalCallId, eventType, occurredAt,
        providerEventId: eventId, payload: { type, reason: data.reason || null },
      });
      emit({ state: result?.state || null });
      return { ok: true, duplicate: Boolean(result?.duplicate) };
    }

    const first = await this._recordOnce(`paired_phone:event:${eventId}`, { callId: call._id, eventType: type, occurredAt, payload: { type } });
    if (!first) return { ok: true, duplicate: true };
    switch (type) {
      case 'claimed_ack':
        break;
      case 'dial_refused': {
        // The firmware refused the DIAL before anything reached the phone: not dialed.
        await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.state': 'ended', failureCode: `FIRMWARE_${String(data.code || 'REFUSED').toUpperCase()}`.slice(0, 100), failureMessage: 'ESP32 refused the dial' } });
        await PairedDevice.updateOne({ _id: device._id }, { $set: { lastError: { code: `DIAL_${String(data.code || 'REFUSED').toUpperCase()}`.slice(0, 60), message: 'ESP32 refused a dial', at: new Date() } } });
        await ai.default.applyWebhookEvent({ provider: 'paired_phone', providerCallId: call.providerCallId, internalCallId, eventType: 'failed', occurredAt, providerEventId: `${eventId}:failed` });
        break;
      }
      case 'audio_opened':
        await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.audioOpenedAt': occurredAt, 'gateway.codec': data.codec || null } });
        break;
      case 'audio_lost':
        await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.audioLostAt': occurredAt } });
        // Lost or missing call audio is a fault on this phone/board: every next lead would hear
        // silence. Hold the device until the owner has checked it.
        await this.markAttention(device._id, call._id, `Call audio failed (${String(data.detail || 'audio link lost').slice(0, 120)}); check the phone and the board, then clear the device`);
        break;
      case 'stats':
        await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.audio': sanitizeAudioStats(data), 'gateway.audioAt': occurredAt } });
        // Its own socket event: every 2 s during a call, so it must not refresh the whole dashboard.
        emitToOwner(owner, 'paired-phone:call-audio', { campaignId: String(call.campaignId), callId: internalCallId, audio: sanitizeAudioStats(data) });
        return { ok: true };
      case 'command_done':
        await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.command.ackedAt': occurredAt, ...(data.type === 'takeover' ? { 'gateway.takenOverAt': occurredAt } : {}) } });
        break;
      case 'outcome_unknown': {
        const campaign = await CallCampaign.findById(call.campaignId).lean();
        const detail = String(data.detail || 'The gateway could not tell how the call ended').slice(0, 300);
        if (campaign && !call.resultsProcessedAt) {
          await ai.default._markAmbiguous(call._id, call.recipientId, campaign, 'GATEWAY_OUTCOME_UNKNOWN', detail);
        } else if (campaign) {
          // Already processed (an end report won the race): withdraw any retry; never a silent redial.
          await ai.default._parkProcessedCall(call._id, 'GATEWAY_OUTCOME_UNKNOWN', detail);
        }
        await this.markAttention(device._id, call._id, 'The gateway lost track of a call; check the phone, end any call by hand, then clear the device');
        break;
      }
      default:
        throw new ValidationError(`Unknown gateway event type: ${type}`);
    }
    emit();
    return { ok: true };
  }

  // ------------------------------------------------------------------ owner: live call control

  async requestCallControl(actor, callRecordId, type, meta = {}) {
    if (!mongoose.isValidObjectId(callRecordId)) throw new NotFoundError('CallRecord', callRecordId);
    const call = await CallRecord.findOne({ _id: callRecordId, createdBy: actor, provider: 'paired_phone' });
    if (!call) throw new NotFoundError('CallRecord', callRecordId);
    if (call.resultsProcessedAt || ['ended', 'cancelled'].includes(call.gateway?.state)) throw new ConflictError('The call has already ended');
    // Repeating a request (double tap, retry after a timeout) changes nothing.
    if (call.gateway?.command?.kind === type) return { ok: true, duplicate: true };
    if (call.gateway?.state === 'queued') {
      await this.cancelUndialed(call, `cancelled by the owner (${type})`);
      return { ok: true, cancelledBeforeDial: true };
    }
    await CallRecord.updateOne({ _id: call._id }, { $set: { 'gateway.command': { kind: type, requestedAt: new Date(), requestedBy: actor, ackedAt: null }, ...(type === 'takeover' ? { reviewRequired: true } : {}) } });
    // Ending: closing the room makes the agent stop and the gateway hang up.
    if (type === 'hangup' && call.roomName) livekit.endCall({ roomName: call.roomName }).catch(() => {});
    auditService.logEvent({
      eventType: `paired_phone.call_${type}`, userId: actor, ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent, result: 'success', module: 'paired-phone', details: { callId: call.internalCallId },
    });
    return { ok: true };
  }
}

function sanitizeAudioStats(d = {}) {
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    rxLevelDbfs: num(d.rxLevelDbfs),
    txLevelDbfs: num(d.txLevelDbfs),
    upFrames: num(d.upFrames),
    downFrames: num(d.downFrames),
    upSeqGaps: num(d.upSeqGaps),
    downUnderruns: num(d.downUnderruns),
    downOverruns: num(d.downOverruns),
    firstAiAudioMs: num(d.firstAiAudioMs),
    agentConnected: Boolean(d.agentConnected),
  };
}

export default new PairedPhoneService();
