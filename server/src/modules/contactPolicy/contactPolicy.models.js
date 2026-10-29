import mongoose from 'mongoose';
import { CONTACT_CHANNELS, CONTACT_SOURCES, TOUCH_STATUSES } from './contactPolicy.constants.js';

/**
 * Contact policy persistence.
 *
 *  ContactPolicySettings  — singleton (key 'global') with the limits.
 *  ContactLedger          — one document per lead holding the recent touch events;
 *                           reservations are a single conditional $push on it, so
 *                           two dispatchers can never both take the last slot.
 *  ContactTouch           — the durable, auditable record of every touch
 *                           (reserved → committed | released), unique per {source, refId}.
 *  ContactPolicyDenial    — per {source, campaignId, leadId} skip counter for the
 *                           "skipped: contact limit" campaign figures.
 */
const channelLimit = new mongoose.Schema({
  perDay: { type: Number, min: 0, max: 100, default: 0 },
  perWeek: { type: Number, min: 0, max: 500, default: 0 },
}, { _id: false });

const settingsSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'global' },
  enabled: { type: Boolean, default: true },
  maxTouchesPerDay: { type: Number, min: 0, max: 100, default: 3 },
  maxTouchesPerWeek: { type: Number, min: 0, max: 500, default: 10 },
  minGapMinutes: { type: Number, min: 0, max: 10_080, default: 60 },
  channels: {
    voice: { type: channelLimit, default: () => ({ perDay: 2, perWeek: 6 }) },
    sms: { type: channelLimit, default: () => ({ perDay: 3, perWeek: 8 }) },
    email: { type: channelLimit, default: () => ({ perDay: 2, perWeek: 7 }) },
    whatsapp: { type: channelLimit, default: () => ({ perDay: 2, perWeek: 7 }) },
  },
  quietHours: {
    enabled: { type: Boolean, default: true },
    start: { type: String, maxlength: 5, default: '20:00' },
    end: { type: String, maxlength: 5, default: '08:00' },
  },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

const ledgerEventSchema = new mongoose.Schema({
  touchId: { type: mongoose.Schema.Types.ObjectId, required: true },
  channel: { type: String, enum: CONTACT_CHANNELS, required: true },
  at: { type: Date, required: true },
}, { _id: false });

const ledgerSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, unique: true },
  events: { type: [ledgerEventSchema], default: [] },
}, { timestamps: true });

const touchSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  channel: { type: String, enum: CONTACT_CHANNELS, required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, default: null },
  source: { type: String, enum: CONTACT_SOURCES, required: true },
  refId: { type: String, required: true, maxlength: 160 },
  at: { type: Date, required: true },
  status: { type: String, enum: TOUCH_STATUSES, default: 'reserved' },
  // A manual contact that broke a frequency/timing rule is recorded, not blocked.
  manual: { type: Boolean, default: false },
  policyWarning: { type: String, maxlength: 60, default: null },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  committedAt: { type: Date, default: null },
  releasedAt: { type: Date, default: null },
}, { timestamps: true });
touchSchema.index({ source: 1, refId: 1 }, { unique: true });
touchSchema.index({ leadId: 1, at: -1 });
touchSchema.index({ campaignId: 1, status: 1 });

const denialSchema = new mongoose.Schema({
  source: { type: String, enum: CONTACT_SOURCES, required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  channel: { type: String, enum: CONTACT_CHANNELS, required: true },
  reason: { type: String, maxlength: 60, required: true },
  count: { type: Number, default: 0 },
  firstAt: { type: Date, default: null },
  lastAt: { type: Date, default: null },
  nextAllowedAt: { type: Date, default: null },
  // Cleared when a later reservation for the same campaign+lead succeeds.
  active: { type: Boolean, default: true },
}, { timestamps: true });
denialSchema.index({ source: 1, campaignId: 1, leadId: 1 }, { unique: true });
denialSchema.index({ source: 1, campaignId: 1, active: 1 });

export const ContactPolicySettings = mongoose.models.ContactPolicySettings || mongoose.model('ContactPolicySettings', settingsSchema);
export const ContactLedger = mongoose.models.ContactLedger || mongoose.model('ContactLedger', ledgerSchema);
export const ContactTouch = mongoose.models.ContactTouch || mongoose.model('ContactTouch', touchSchema);
export const ContactPolicyDenial = mongoose.models.ContactPolicyDenial || mongoose.model('ContactPolicyDenial', denialSchema);
