import mongoose from 'mongoose';
import { CONVERSATION_STATES } from './simSms.constants.js';

/**
 * One lead in one SIM SMS campaign. Holds the deterministic conversation state
 * (same shape as AI calling's conversationState) and the reply clock. The lead's
 * number is never stored here — only an HMAC (messaging destinationHash) + mask.
 */
const conversationSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsCampaign', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  destinationField: { type: String, enum: ['mobile', 'phone'], default: 'mobile' },
  destinationHash: { type: String, default: null }, // destinationHash('sms', e164)
  destinationMasked: { type: String, maxlength: 40, default: null },
  country: { type: String, maxlength: 2, default: null },

  state: { type: String, enum: CONVERSATION_STATES, default: 'queued' },
  eligibility: { eligible: { type: Boolean, default: true }, reasons: { type: [String], default: [] } },

  conversationState: { type: mongoose.Schema.Types.Mixed, default: null },
  stateVersion: { type: Number, default: 0 },

  lastOutboundAt: { type: Date, default: null },
  lastInboundAt: { type: Date, default: null },
  replyDeadlineAt: { type: Date, default: null },
  remindersSent: { type: Number, default: 0 },
  // Next time this conversation may be handed a new outbound (quiet hours deferral).
  notBefore: { type: Date, default: null },

  disposition: { type: String, maxlength: 40, default: null },
  qualification: { type: String, maxlength: 40, default: null },
  reviewRequired: { type: Boolean, default: false },
  communicationOperationId: { type: String, maxlength: 64, default: null },
  resultsProcessedAt: { type: Date, default: null },
  processingLeaseUntil: { type: Date, default: null },
}, { timestamps: true, minimize: false });

conversationSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });
conversationSchema.index({ campaignId: 1, state: 1 });
// Inbound matching: an owner's active conversations by destination.
conversationSchema.index({ createdBy: 1, destinationHash: 1, state: 1 });
conversationSchema.index({ state: 1, replyDeadlineAt: 1 });

export default mongoose.model('SimSmsConversation', conversationSchema);
