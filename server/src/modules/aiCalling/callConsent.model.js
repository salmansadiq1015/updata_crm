import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  phoneHash: { type: String, required: true, index: true },
  status: { type: String, enum: ['granted', 'denied', 'revoked'], required: true, index: true },
  evidence: { type: String, maxlength: 2000, default: '' },
  source: { type: String, maxlength: 100, default: 'manual' },
  capturedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

schema.index({ createdBy: 1, leadId: 1, phoneHash: 1 }, { unique: true });

export default mongoose.model('CallConsent', schema);
