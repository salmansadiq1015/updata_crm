import mongoose from 'mongoose';
import { CHANNELS, CONSENT_STATUSES } from './messaging.constants.js';

const consentSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  channel: { type: String, enum: CHANNELS, required: true },
  status: { type: String, enum: CONSENT_STATUSES, required: true, default: 'unknown' },
  evidence: { type: String, trim: true, maxlength: 2000, default: '' },
  source: { type: String, trim: true, maxlength: 100, default: 'manual' },
  capturedAt: { type: Date, default: null },
  expiresAt: { type: Date, default: null },
  // null denotes a verified provider webhook (for example an inbound STOP).
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

consentSchema.index({ leadId: 1, channel: 1 }, { unique: true });

export default mongoose.model('LeadChannelConsent', consentSchema);
