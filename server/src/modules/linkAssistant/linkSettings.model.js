import mongoose from 'mongoose';

/**
 * Global switches for the link assistant. One document (key 'global').
 * `paused` is the kill switch: no new links, no AI turns, open pages show a polite notice.
 */
const linkSettingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },
  paused: { type: Boolean, default: false },
  pausedReason: { type: String, maxlength: 300, default: '' },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  changedAt: { type: Date, default: null },
}, { timestamps: true });

export const LinkSettings = mongoose.models.LinkSettings || mongoose.model('LinkSettings', linkSettingsSchema);

/** Model spend per campaign per UTC day, for the daily cap. */
const linkSpendSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallCampaign', required: true },
  day: { type: String, required: true }, // YYYY-MM-DD (UTC)
  amount: { type: Number, default: 0 },
  sessions: { type: Number, default: 0 },
  capHitAt: { type: Date, default: null },
}, { timestamps: true });
linkSpendSchema.index({ campaignId: 1, day: 1 }, { unique: true });

export const LinkSpend = mongoose.models.LinkSpend || mongoose.model('LinkSpend', linkSpendSchema);
