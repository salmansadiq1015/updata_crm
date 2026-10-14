import mongoose from 'mongoose';
import { PROVIDERS } from './messaging.constants.js';

const providerAttemptSchema = new mongoose.Schema({
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageRecipient', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageCampaign', required: true, index: true },
  internalMessageId: { type: String, required: true, index: true },
  attemptNumber: { type: Number, required: true },
  provider: { type: String, enum: PROVIDERS, required: true, index: true },
  idempotencyKey: { type: String, required: true, unique: true },
  outcome: { type: String, enum: ['accepted', 'rejected', 'ambiguous', 'skipped'], required: true },
  safeToFallback: { type: Boolean, required: true, default: false },
  providerMessageId: { type: String, default: null, index: true },
  providerStatus: { type: String, maxlength: 100, default: null },
  failureClass: { type: String, enum: ['permanent', 'transient', 'ambiguous', 'configuration', 'policy', null], default: null },
  errorCode: { type: String, maxlength: 100, default: null },
  errorMessage: { type: String, maxlength: 500, default: null },
  responseStatus: { type: Number, default: null },
  cost: { amount: { type: Number, default: null }, currency: { type: String, maxlength: 3, default: null } },
  estimatedCost: { amount: { type: Number, default: null }, currency: { type: String, maxlength: 3, default: null } },
  submittedAt: { type: Date, required: true },
  resolvedAt: { type: Date, default: null },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Attempts are append-only by design; application code never updates or deletes them.
providerAttemptSchema.index({ recipientId: 1, attemptNumber: 1 }, { unique: true });

export default mongoose.model('ProviderSubmissionAttempt', providerAttemptSchema);
