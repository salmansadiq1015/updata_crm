import mongoose from 'mongoose';
import SmsDevice from './smsDevice.model.js';
import SimSmsCampaign from './simSmsCampaign.model.js';
import SimSmsMessage from './simSmsMessage.model.js';
import auditService from '../auth/audit.service.js';
import notificationService from '../notifications/notification.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import {
  deriveHealth, HISTORY_LIMIT, maskNumber, ONLINE_WINDOW_MS, queueLoad,
} from './engine/deviceHealth.js';

/**
 * Android SMS device dashboard: heartbeat upsert, derived health, status
 * history, offline alerts for phones carrying a running campaign, resync
 * requests, and journal-vs-CRM mismatch detection (→ recovery inbox).
 */
export const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
// A journal entry finished on the phone this long ago but not reflected in the CRM = sync failure.
const JOURNAL_MISMATCH_GRACE_MS = 15 * 60_000;
export const OFFLINE_ALERT_MS = 20 * 60_000;
const minAppVersion = () => process.env.SIM_SMS_MIN_APP_VERSION || null;
const SERVER_FINAL = { sent: ['sent'], failed: ['failed', 'cancelled'], unknown: ['unknown', 'sent', 'failed'] };

function emit(userId, event, payload) {
  try { global.io?.to(`user:${userId}`).emit(event, payload); } catch { /* best effort */ }
}

const clean = (v) => (v === '' ? null : v);

class SmsDeviceService {
  _health(device, now = new Date()) {
    return deriveHealth(device, { now, minAppVersion: minAppVersion() });
  }

  async heartbeat(actor, input, now = new Date()) {
    const sims = (input.sims || []).map((s) => ({
      subscriptionId: s.subscriptionId ?? null, slotIndex: s.slotIndex ?? -1,
      carrierName: clean(s.carrierName) ?? null, displayName: clean(s.displayName) ?? null, countryIso: clean(s.countryIso) ?? null,
      isDefaultSms: Boolean(s.isDefaultSms), selected: Boolean(s.selected),
      numberMasked: s.numberMasked ? maskNumber(s.numberMasked) : null,
    }));
    const set = {
      platform: input.platform || 'android', manufacturer: clean(input.manufacturer) ?? null, model: clean(input.model) ?? null,
      osVersion: clean(input.osVersion) ?? null, sdkInt: input.sdkInt ?? null, appVersion: clean(input.appVersion) ?? null,
      buildNumber: clean(input.buildNumber) ?? null, buildProfile: input.buildProfile ?? null,
      permissions: { smsDeclared: null, sendSms: null, receiveSms: null, readPhoneState: null, postNotifications: null, batteryOptimizationIgnored: null, ...(input.permissions || {}) },
      simState: input.simState ?? null, sims, selectedSubscriptionId: input.selectedSubscriptionId ?? null,
      network: { type: clean(input.network?.type) ?? null, connected: input.network?.connected ?? null, internetReachable: input.network?.internetReachable ?? null, airplaneMode: input.network?.airplaneMode ?? null },
      queue: { pending: 0, attempting: 0, unknown: 0, failed: 0, inboundPending: 0, ...(input.queue || {}) },
      last: { sendAt: input.last?.sendAt ?? null, inboundAt: input.last?.inboundAt ?? null, leaseAt: input.last?.leaseAt ?? null, resultPostAt: input.last?.resultPostAt ?? null },
      lastError: input.lastError?.code ? { code: input.lastError.code, message: clean(input.lastError.message) ?? null, at: input.lastError.at ?? now } : { code: null, message: null, at: null },
      agent: { running: input.agent?.running ?? null, lastCycleAt: input.agent?.lastCycleAt ?? null },
      lastHeartbeatAt: now,
      ...(input.resyncCompleted ? { resyncCompletedAt: now } : {}),
    };
    const mismatch = await this._journalMismatch(actor, input.deviceId, input.journal || [], now);
    set.journalMismatch = { count: mismatch.length, messageIds: mismatch.slice(0, 20).map((m) => m.messageId), at: mismatch.length ? now : null };

    const device = await SmsDevice.findOneAndUpdate(
      { userId: actor, deviceId: input.deviceId },
      { $set: set, $setOnInsert: { userId: actor, deviceId: input.deviceId, firstSeenAt: now } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
    ).lean();
    const health = this._health(device, now);
    await this._recordTransition(device, health, now);
    if (mismatch.length) {
      const { default: recovery } = await import('./recovery.service.js');
      for (const m of mismatch) await recovery.syncFailure({ ownerId: actor, deviceId: input.deviceId, messageId: m.messageId, cause: 'journal_mismatch', details: { deviceStatus: m.status, serverStatus: m.serverStatus } });
    }
    if (input.resyncCompleted) {
      const { default: recovery } = await import('./recovery.service.js');
      await recovery.autoResolveResync(actor, input.deviceId);
    }
    const resyncRequested = Boolean(device.resyncRequestedAt && (!device.resyncCompletedAt || device.resyncCompletedAt < device.resyncRequestedAt));
    return {
      deviceId: device.deviceId, health: { status: health.status, reasons: health.reasons }, resyncRequested,
      minAppVersion: minAppVersion(), serverTime: now.toISOString(), nextHeartbeatMs: HEARTBEAT_INTERVAL_MS,
    };
  }

  /** Phone-final journal entries the CRM still sees as in flight (result post lost). */
  async _journalMismatch(actor, deviceId, journal, now) {
    const finished = journal.filter((j) => j.status !== 'attempting' && j.finishedAt && now - new Date(j.finishedAt) > JOURNAL_MISMATCH_GRACE_MS && mongoose.isValidObjectId(j.messageId));
    if (!finished.length) return [];
    const server = await SimSmsMessage.find({ _id: { $in: finished.map((j) => j.messageId) }, createdBy: actor }).select('status deviceId').lean();
    const byId = new Map(server.map((m) => [String(m._id), m]));
    return finished.filter((j) => {
      const s = byId.get(j.messageId);
      return s && (!s.deviceId || s.deviceId === deviceId) && !(SERVER_FINAL[j.status] || []).includes(s.status);
    }).map((j) => ({ messageId: j.messageId, status: j.status, serverStatus: byId.get(j.messageId).status }));
  }

  async _recordTransition(device, health, now) {
    if (device.lastStatus === health.status) return false;
    const res = await SmsDevice.updateOne(
      { _id: device._id, lastStatus: device.lastStatus ?? null },
      {
        $set: { lastStatus: health.status, ...(health.status !== 'offline' ? { offlineAlertedAt: null } : {}) },
        $push: { statusHistory: { $each: [{ status: health.status, at: now, reasons: health.reasons.map((r) => r.code) }], $slice: -HISTORY_LIMIT } },
      },
    );
    if (res.modifiedCount) emit(device.userId, 'sim-sms:device', { deviceId: device.deviceId, status: health.status });
    return res.modifiedCount === 1;
  }

  async _campaignsByDevice(actor, deviceIds) {
    const since = new Date(Date.now() - 7 * 24 * 3_600_000);
    const [running, used] = await Promise.all([
      SimSmsCampaign.find({ createdBy: actor, status: 'running' }).select('_id name status').lean(),
      SimSmsMessage.aggregate([
        { $match: { createdBy: new mongoose.Types.ObjectId(String(actor)), direction: 'outbound', deviceId: { $in: deviceIds }, updatedAt: { $gte: since } } },
        { $group: { _id: { d: '$deviceId', c: '$campaignId' } } },
      ]),
    ]);
    const usedIds = [...new Set(used.map((u) => String(u._id.c)))];
    const usedCampaigns = usedIds.length ? await SimSmsCampaign.find({ _id: { $in: usedIds } }).select('_id name status').lean() : [];
    const byId = new Map([...running, ...usedCampaigns].map((c) => [String(c._id), c]));
    const out = new Map(deviceIds.map((d) => [d, new Map()]));
    for (const u of used) { const c = byId.get(String(u._id.c)); if (c) out.get(u._id.d)?.set(String(c._id), c); }
    // A single phone carries all of the owner's running campaigns.
    if (deviceIds.length === 1) for (const c of running) out.get(deviceIds[0]).set(String(c._id), c);
    return new Map([...out].map(([d, m]) => [d, [...m.values()].map((c) => ({ id: String(c._id), name: c.name, status: c.status }))]));
  }

  _serialize(device, campaigns, now, { withHistory = false } = {}) {
    const health = this._health(device, now);
    const { statusHistory, __v, ...rest } = device;
    return { ...rest, health, queueLoad: queueLoad(device.queue), campaigns: campaigns || [], ...(withHistory ? { statusHistory: [...(statusHistory || [])].reverse() } : {}) };
  }

  async list(actor, now = new Date()) {
    const devices = await SmsDevice.find({ userId: actor }).sort({ lastHeartbeatAt: -1 }).limit(50).lean();
    const campaigns = devices.length ? await this._campaignsByDevice(actor, devices.map((d) => d.deviceId)) : new Map();
    return devices.map((d) => this._serialize(d, campaigns.get(d.deviceId), now));
  }

  async get(actor, deviceId, now = new Date()) {
    const device = await SmsDevice.findOne({ userId: actor, deviceId }).lean();
    if (!device) throw new NotFoundError('SmsDevice', deviceId);
    const campaigns = await this._campaignsByDevice(actor, [deviceId]);
    return this._serialize(device, campaigns.get(deviceId), now, { withHistory: true });
  }

  async requestResync(actor, deviceId, meta = {}, now = new Date()) {
    const device = await SmsDevice.findOneAndUpdate(
      { userId: actor, deviceId }, { $set: { resyncRequestedAt: now, resyncRequestedBy: actor } }, { returnDocument: 'after' },
    ).lean();
    if (!device) throw new NotFoundError('SmsDevice', deviceId);
    auditService.logEvent({ eventType: 'sim_sms.device.resync_requested', userId: actor, ipAddress: meta.ipAddress || 'internal', userAgent: meta.userAgent, result: 'success', module: 'sim-sms', details: { deviceId } });
    emit(actor, 'sim-sms:outbox', { resync: true, deviceId });
    return { deviceId, resyncRequestedAt: now };
  }

  /**
   * Sweep: devices that stopped sending heartbeats become offline (history) and,
   * when their owner has a running SIM SMS campaign, the owner is alerted once.
   */
  async sweep(now = new Date()) {
    const cutoff = new Date(now.getTime() - ONLINE_WINDOW_MS);
    const stale = await SmsDevice.find({ lastHeartbeatAt: { $lt: cutoff }, lastStatus: { $ne: 'offline' } }).limit(500).lean();
    for (const device of stale) await this._recordTransition(device, this._health(device, now), now);
    // The phone's agent loop may sleep up to ~15 min between cycles, so the alert
    // waits for OFFLINE_ALERT_MS of silence (status still flips at 10 min).
    const silent = await SmsDevice.find({ lastHeartbeatAt: { $lt: new Date(now.getTime() - OFFLINE_ALERT_MS) }, lastStatus: 'offline', offlineAlertedAt: null }).limit(500).lean();
    let alerts = 0;
    for (const device of silent) {
      const running = await SimSmsCampaign.find({ createdBy: device.userId, status: 'running' }).select('_id name').limit(5).lean();
      if (!running.length) continue;
      const claimed = await SmsDevice.updateOne({ _id: device._id, offlineAlertedAt: null }, { $set: { offlineAlertedAt: now } });
      if (!claimed.modifiedCount) continue;
      alerts += 1;
      notificationService.create({
        channels: ['IN_APP', 'PUSH'], recipientIds: [device.userId], type: 'sim_sms.device_offline', category: 'CRM', priority: 'HIGH',
        payload: {
          title: 'SMS phone offline',
          message: `${device.model || 'Your phone'} has not reported for ${Math.round((now - new Date(device.lastHeartbeatAt)) / 60_000)} min while "${running[0].name}" is running. Messages wait until it is back online.`,
          deviceId: device.deviceId, campaignIds: running.map((c) => String(c._id)),
        },
        sourceModule: 'sim-sms', sourceEvent: 'DEVICE_OFFLINE', sourceEntityType: 'SmsDevice', sourceEntityId: device._id,
        idempotencyKey: `sim-sms-device-offline-${device._id}-${new Date(device.lastHeartbeatAt).getTime()}`,
      }, device.userId).catch(() => {});
    }
    return { offline: stale.length, alerts };
  }
}

export default new SmsDeviceService();
