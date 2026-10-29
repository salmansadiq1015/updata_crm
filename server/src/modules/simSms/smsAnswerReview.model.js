import mongoose from 'mongoose';

/**
 * SmsAnswerReview — answers found in one SMS reply that the agent did NOT
 * assume (low confidence, model proposal, ambiguous across questions). A human
 * accepts / edits / rejects each proposal; accepted values are written through
 * leadQualificationService.mergeAnswers and, while the conversation runs, into
 * its engine state.
 */
const proposalSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, maxlength: 80 },
  label: { type: String, maxlength: 200, default: null },
  type: { type: String, maxlength: 30, default: null },
  proposedValue: { type: mongoose.Schema.Types.Mixed, default: null },
  confidence: { type: Number, min: 0, max: 1, default: null },
  evidence: { type: String, maxlength: 1600, default: null },
  source: { type: String, maxlength: 30, default: 'deterministic' },
  reason: { type: String, maxlength: 60, default: null },
  alternatives: { type: [mongoose.Schema.Types.Mixed], default: [] },
  decision: { type: String, enum: ['accept', 'edit', 'reject', null], default: null },
  finalValue: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const reviewSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsConversation', required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsCampaign', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true },
  messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimSmsMessage', required: true },
  reply: { type: String, maxlength: 1600, required: true },
  language: { type: String, maxlength: 12, default: null },
  proposals: { type: [proposalSchema], default: [] },
  status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending' },
  resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt: { type: Date, default: null },
  note: { type: String, maxlength: 500, default: null },
  writtenFields: { type: [String], default: [] },
}, { timestamps: true, minimize: false });

reviewSchema.index({ messageId: 1 }, { unique: true });
reviewSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
reviewSchema.index({ conversationId: 1 });

export default mongoose.models.SmsAnswerReview || mongoose.model('SmsAnswerReview', reviewSchema);
