import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallCampaign', required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignRecipient', required: true, index: true },
  attemptIndex: { type: Number, required: true },
  provider: { type: String, required: true, maxlength: 40 },
  outcome: { type: String, enum: ['accepted', 'rejected', 'ambiguous'], required: true },
  providerCallId: { type: String, default: null, index: true },
  errorCode: { type: String, maxlength: 100, default: null },
  errorMessage: { type: String, maxlength: 500, default: null },
  responseStatus: { type: Number, default: null },
  fallbackReason: { type: String, maxlength: 500, default: null },
  submittedAt: { type: Date, default: Date.now, immutable: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

schema.index({ callId: 1, attemptIndex: 1 }, { unique: true });

// Provider attempts are evidence. Reject updates/deletes outside migrations.
for (const hook of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete']) {
  schema.pre(hook, function preventMutation() { throw new Error('CallProviderAttempt is append-only'); });
}

export default mongoose.model('CallProviderAttempt', schema);
