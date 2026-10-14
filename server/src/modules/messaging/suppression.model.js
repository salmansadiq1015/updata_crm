import mongoose from 'mongoose';
import { CHANNELS } from './messaging.constants.js';

const suppressionSchema = new mongoose.Schema({
  channel: { type: String, enum: CHANNELS, required: true },
  destinationHash: { type: String, required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, index: true },
  reason: { type: String, enum: ['opt_out', 'bounce', 'complaint', 'admin', 'invalid'], required: true },
  source: { type: String, maxlength: 100, default: 'manual' },
  suppressedAt: { type: Date, required: true, default: Date.now },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

suppressionSchema.index({ channel: 1, destinationHash: 1 }, { unique: true });

export default mongoose.model('MessageSuppression', suppressionSchema);
