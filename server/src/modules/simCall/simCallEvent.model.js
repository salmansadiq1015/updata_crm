import mongoose from 'mongoose';
import { EVENT_TYPES } from './simCall.constants.js';

/** Campaign activity history (shown in the app and web). No phone numbers or transcripts. */
const eventSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimCallCampaign', required: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimCallTask', default: null },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null },
  type: { type: String, enum: EVENT_TYPES, required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = system
  details: { type: mongoose.Schema.Types.Mixed, default: null },
  at: { type: Date, default: Date.now },
}, { versionKey: false });

eventSchema.index({ campaignId: 1, at: -1 });

export default mongoose.model('SimCallEvent', eventSchema);
