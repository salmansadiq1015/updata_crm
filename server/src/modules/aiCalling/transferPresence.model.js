import mongoose from 'mongoose';

/**
 * A person's own "available for AI call transfers" switch, how they take a
 * transfer (CRM web audio, or a phone number for SIP transfer) and when they work.
 * One document per user; only that user edits it.
 */
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  available: { type: Boolean, default: false },
  phone: { type: String, trim: true, maxlength: 20, default: null }, // E.164, for SIP transfer
  workingHours: {
    timezone: { type: String, trim: true, maxlength: 80, default: 'UTC' },
    days: { type: [String], default: undefined }, // ['mon', …]; empty = every day
    start: { type: String, maxlength: 5, default: null }, // 'HH:MM'
    end: { type: String, maxlength: 5, default: null },
  },
  changedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('TransferPresence', schema);
