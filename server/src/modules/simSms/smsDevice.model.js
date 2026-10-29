import mongoose from 'mongoose';

/**
 * SmsDevice — one Android install (stable per-install deviceId) of a user that
 * carries SIM SMS. Upserted by the phone's heartbeat; health is derived at read
 * time (engine/deviceHealth.js). SIM numbers are stored MASKED only.
 */
const simSchema = new mongoose.Schema({
  subscriptionId: { type: Number, default: null },
  slotIndex: { type: Number, default: -1 },
  carrierName: { type: String, maxlength: 80, default: null },
  displayName: { type: String, maxlength: 80, default: null },
  countryIso: { type: String, maxlength: 4, default: null },
  isDefaultSms: { type: Boolean, default: false },
  selected: { type: Boolean, default: false },
  numberMasked: { type: String, maxlength: 20, default: null },
}, { _id: false });

const historySchema = new mongoose.Schema({
  status: { type: String, enum: ['online', 'warning', 'offline'], required: true },
  at: { type: Date, required: true },
  reasons: { type: [String], default: [] },
}, { _id: false });

const deviceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deviceId: { type: String, required: true, maxlength: 80 },
  platform: { type: String, maxlength: 20, default: 'android' },
  manufacturer: { type: String, maxlength: 80, default: null },
  model: { type: String, maxlength: 80, default: null },
  osVersion: { type: String, maxlength: 20, default: null },
  sdkInt: { type: Number, default: null },
  appVersion: { type: String, maxlength: 30, default: null },
  buildNumber: { type: String, maxlength: 30, default: null },
  buildProfile: { type: String, maxlength: 20, default: null }, // play | shared | private | development
  permissions: {
    smsDeclared: { type: Boolean, default: null },
    sendSms: { type: Boolean, default: null },
    receiveSms: { type: Boolean, default: null },
    readPhoneState: { type: Boolean, default: null },
    postNotifications: { type: Boolean, default: null },
    batteryOptimizationIgnored: { type: Boolean, default: null },
  },
  simState: { type: String, maxlength: 20, default: null },
  sims: { type: [simSchema], default: [] },
  selectedSubscriptionId: { type: Number, default: null },
  network: {
    type: { type: String, maxlength: 20, default: null },
    connected: { type: Boolean, default: null },
    internetReachable: { type: Boolean, default: null },
    airplaneMode: { type: Boolean, default: null },
  },
  queue: {
    pending: { type: Number, default: 0 },
    attempting: { type: Number, default: 0 },
    unknown: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    inboundPending: { type: Number, default: 0 },
  },
  last: {
    sendAt: { type: Date, default: null },
    inboundAt: { type: Date, default: null },
    leaseAt: { type: Date, default: null },
    resultPostAt: { type: Date, default: null },
  },
  lastError: {
    code: { type: String, maxlength: 80, default: null },
    message: { type: String, maxlength: 300, default: null },
    at: { type: Date, default: null },
  },
  agent: {
    running: { type: Boolean, default: null },
    lastCycleAt: { type: Date, default: null },
  },
  journalMismatch: {
    count: { type: Number, default: 0 },
    messageIds: { type: [String], default: [] },
    at: { type: Date, default: null },
  },
  firstSeenAt: { type: Date, default: null },
  lastHeartbeatAt: { type: Date, default: null },
  lastStatus: { type: String, enum: ['online', 'warning', 'offline', null], default: null },
  statusHistory: { type: [historySchema], default: [] },
  offlineAlertedAt: { type: Date, default: null },
  resyncRequestedAt: { type: Date, default: null },
  resyncRequestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resyncCompletedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
deviceSchema.index({ lastHeartbeatAt: 1, lastStatus: 1 });

export default mongoose.models.SmsDevice || mongoose.model('SmsDevice', deviceSchema);
