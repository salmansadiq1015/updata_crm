import mongoose from 'mongoose';
import { SETUP_ACTIONS } from './setupCommand.js';

/**
 * A paired phone: the user's own Android phone + SIM, reached through an ESP32 Bluetooth
 * hands-free bridge plugged into a laptop that runs the Updata gateway.
 *
 * Owned by one user (single-tenant CRM: ownership = createdBy). The gateway authenticates with a
 * random bearer token of which only the SHA-256 is stored. The ESP32's dial key is stored
 * encrypted; the CRM signs every dial with it, so neither the laptop nor a stolen gateway token
 * alone can make the phone call an arbitrary number.
 */
export const DEVICE_KINDS = ['esp32_hfp'];
export const KEY_STATES = ['pending', 'delivered', 'provisioned'];

const limitsSchema = new mongoose.Schema({
  cooldownSeconds: { type: Number, default: 60, min: 20, max: 3600 },
  maxCallsPerHour: { type: Number, default: 20, min: 1, max: 30 },
  maxCallsPerDay: { type: Number, default: 100, min: 1, max: 500 },
  ringTimeoutSeconds: { type: Number, default: 45, min: 15, max: 90 },
}, { _id: false });

const pairedDeviceSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 80, required: true },
  phoneLabel: { type: String, trim: true, maxlength: 80, default: '' },
  kind: { type: String, enum: DEVICE_KINDS, default: 'esp32_hfp' },

  tokenHash: { type: String, default: null },
  tokenIssuedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  gateway: {
    monitorSafe: { type: Boolean, default: false },
    version: { type: String, maxlength: 40, default: null },
    platform: { type: String, maxlength: 40, default: null },
    hostname: { type: String, maxlength: 120, default: null },
    playbackGainDb: { type: Number, min: 0, max: 12, default: null },
    autoConnect: { type: Boolean, default: null },
  },
  board: {
    connected: { type: Boolean, default: false },
    port: { type: String, maxlength: 120, default: null },
    bdaddr: { type: String, maxlength: 17, default: null },
    firmware: { type: String, maxlength: 40, default: null },
    idf: { type: String, maxlength: 40, default: null },
    chipRevision: { type: Number, default: null },
    keyProvisioned: { type: Boolean, default: false },
  },
  // Last device STATE as reported by the gateway (see USB-AUDIO-PROTOCOL.md).
  state: {
    device: { type: String, maxlength: 30, default: 'offline' },
    hfp: { type: String, maxlength: 20, default: 'disconnected' },
    call: { type: Number, default: 0 },
    callsetup: { type: Number, default: 0 },
    audio: { type: String, maxlength: 20, default: 'off' },
    codec: { type: String, maxlength: 10, default: 'none' },
    signal: { type: Number, default: null },
    battery: { type: Number, default: null },
    peer: { type: String, maxlength: 17, default: null },
  },
  stats: { type: mongoose.Schema.Types.Mixed, default: null },
  lastHeartbeatAt: { type: Date, default: null, index: true },
  lastError: {
    code: { type: String, maxlength: 60, default: null },
    message: { type: String, maxlength: 300, default: null },
    at: { type: Date, default: null },
  },

  // ESP32 dial key: AES-256-GCM ciphertext. Handed to the gateway once for provisioning
  // (BOOT button held on the board); afterwards only the CRM uses it, to sign dials.
  dialKey: {
    enc: { type: String, default: null, select: false },
    state: { type: String, enum: KEY_STATES, default: 'pending' },
    issuedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    provisionedAt: { type: Date, default: null },
  },
  // Per firmware session: the counter must rise within one session nonce.
  dial: {
    nonce: { type: String, maxlength: 32, default: null },
    counter: { type: Number, default: 0 },
    callRefSeq: { type: Number, default: 0 },
  },

  // Gate A for THIS device: an admin attests that a real call carried audio both ways
  // (probe evidence). Campaigns cannot use the device until then.
  audioVerifiedAt: { type: Date, default: null },
  audioTest: {
    callId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null },
    firmware: { type: String, default: null },
    playbackGainDb: { type: Number, default: null },
    createdAt: { type: Date, default: null },
  },
  audioVerifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  audioVerification: {
    note: { type: String, maxlength: 1000, default: '' },
    inboundPhraseHeard: { type: Boolean, default: false },
    outboundPhraseHeard: { type: Boolean, default: false },
    firmware: { type: String, maxlength: 40, default: null },
  },

  limits: { type: limitsSchema, default: () => ({}) },
  setup: {
    autoConnect: { type: Boolean, default: true },
    playbackGainDb: { type: Number, default: 0, min: 0, max: 12 },
    command: {
      id: { type: String, default: null },
      action: { type: String, enum: [...SETUP_ACTIONS, null], default: null },
      state: { type: String, enum: ['pending', 'running', 'succeeded', 'failed', 'expired', null], default: null },
      requestedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      startedAt: { type: Date, default: null },
      completedAt: { type: Date, default: null },
      message: { type: String, maxlength: 300, default: '' },
    },
  },
  // One call per phone: set atomically before a dial, cleared when the call is processed.
  currentCallId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null },
  currentRecipientId: { type: mongoose.Schema.Types.ObjectId, default: null },
  currentCallSince: { type: Date, default: null },
  lastCallEndedAt: { type: Date, default: null },
  // An uncertain call outcome holds the device until a human looks at the phone.
  attention: {
    needed: { type: Boolean, default: false },
    reason: { type: String, maxlength: 300, default: null },
    at: { type: Date, default: null },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, minimize: false });

pairedDeviceSchema.index({ tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } });
pairedDeviceSchema.index({ createdBy: 1, revokedAt: 1 });

export default mongoose.models.PairedDevice || mongoose.model('PairedDevice', pairedDeviceSchema);
