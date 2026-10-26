import mongoose from 'mongoose';

/**
 * One-time gateway pairing code. Only its SHA-256 is stored; it expires after 10 minutes
 * (TTL index) and is consumed atomically, so it can be redeemed once.
 */
const pairingCodeSchema = new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  deviceName: { type: String, trim: true, maxlength: 80, required: true },
  phoneLabel: { type: String, trim: true, maxlength: 80, default: '' },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  deviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PairedDevice', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

pairingCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.models.PairedPhonePairingCode || mongoose.model('PairedPhonePairingCode', pairingCodeSchema);
