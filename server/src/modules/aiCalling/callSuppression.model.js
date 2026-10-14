import mongoose from 'mongoose';

/**
 * Do-not-call / suppression ledger for voice calls. A hashed phone number (never
 * the raw number as the unique key) that must not be dialled, plus the reason.
 * Independent of the messaging module's suppression list by design.
 */
const callSuppressionSchema = new mongoose.Schema({
  phoneHash: { type: String, required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
  reason: { type: String, enum: ['do_not_contact', 'invalid', 'complaint', 'admin'], required: true },
  source: { type: String, maxlength: 100, default: 'manual' },
  note: { type: String, maxlength: 500, default: null },
  suppressedAt: { type: Date, required: true, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

callSuppressionSchema.index({ phoneHash: 1 }, { unique: true });

export default mongoose.model('CallSuppression', callSuppressionSchema);
