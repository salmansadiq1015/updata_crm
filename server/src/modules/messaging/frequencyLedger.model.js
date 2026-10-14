import mongoose from 'mongoose';
import { CHANNELS } from './messaging.constants.js';

const eventSchema = new mongoose.Schema({
  token: { type: mongoose.Schema.Types.ObjectId, required: true },
  at: { type: Date, required: true },
}, { _id: false });

const frequencyLedgerSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  channel: { type: String, enum: CHANNELS, required: true, index: true },
  destinationHash: { type: String, required: true, index: true },
  initializedAt: { type: Date, default: null },
  horizonHours: { type: Number, min: 0, max: 720, default: 0 },
  events: { type: [eventSchema], default: [] },
}, { timestamps: true });

frequencyLedgerSchema.index({ channel: 1, destinationHash: 1 }, { unique: true });

export default mongoose.model('MessagingFrequencyLedger', frequencyLedgerSchema);
