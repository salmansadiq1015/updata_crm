import mongoose from 'mongoose';

/**
 * RecoveryItem — one thing a human must look at because the system will not
 * guess: an SMS whose send result is unknown, a reply from a number with no
 * active conversation, a permanent delivery failure, a phone ↔ CRM sync
 * failure, or a provider messaging failure. `key` makes every collector
 * idempotent. Every action on an item is audit-logged; nothing here re-sends
 * automatically.
 */
export const RECOVERY_TYPES = Object.freeze(['unknown_send', 'unmatched_reply', 'delivery_failure', 'sync_failure', 'provider_failure']);
export const RECOVERY_STATUSES = Object.freeze(['open', 'resolved', 'dismissed']);

const recoverySchema = new mongoose.Schema({
  key: { type: String, required: true, maxlength: 160 },
  type: { type: String, enum: RECOVERY_TYPES, required: true },
  severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  // Numeric severity for the inbox sort (high → medium → low); the string sorts alphabetically.
  severityRank: { type: Number, default: 2 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  source: { type: String, enum: ['sim_sms', 'messaging', 'device'], default: 'sim_sms' },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  campaignId: { type: mongoose.Schema.Types.ObjectId, default: null },
  conversationId: { type: mongoose.Schema.Types.ObjectId, default: null },
  messageId: { type: mongoose.Schema.Types.ObjectId, default: null },
  deviceId: { type: String, maxlength: 80, default: null },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: RECOVERY_STATUSES, default: 'open' },
  occurrences: { type: Number, default: 1 },
  lastSeenAt: { type: Date, default: Date.now },
  resolution: {
    action: { type: String, maxlength: 40, default: null },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: null },
    note: { type: String, maxlength: 500, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  actions: { type: [{ action: String, by: mongoose.Schema.Types.ObjectId, at: Date, note: String, _id: false }], default: [] },
}, { timestamps: true, minimize: false });

recoverySchema.index({ key: 1 }, { unique: true });
recoverySchema.index({ ownerId: 1, status: 1, type: 1, createdAt: -1 });
// Inbox list: most severe first, newest first — with and without a type filter.
recoverySchema.index({ ownerId: 1, status: 1, severityRank: -1, createdAt: -1 }, { name: 'recovery_inbox' });
recoverySchema.index({ ownerId: 1, status: 1, type: 1, severityRank: -1, createdAt: -1 }, { name: 'recovery_inbox_type' });

export const SEVERITY_RANK = Object.freeze({ low: 1, medium: 2, high: 3 });

export default mongoose.models.RecoveryItem || mongoose.model('RecoveryItem', recoverySchema);
