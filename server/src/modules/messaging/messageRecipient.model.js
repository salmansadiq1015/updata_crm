import mongoose from 'mongoose';
import { CHANNELS, MESSAGE_STATUSES, PROVIDERS } from './messaging.constants.js';

const recipientSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'MessageCampaign', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  channel: { type: String, enum: CHANNELS, required: true },
  destination: { type: String, required: true, maxlength: 320 },
  destinationHash: { type: String, required: true, index: true },
  country: { type: String, uppercase: true, maxlength: 2, default: null },
  status: { type: String, enum: MESSAGE_STATUSES, default: 'draft', index: true },
  eligibility: {
    eligible: { type: Boolean, required: true },
    reasons: { type: [String], default: [] },
  },
  rendered: {
    subject: { type: String, maxlength: 500, default: '' },
    bodyHtml: { type: String, maxlength: 200000, default: '' },
    bodyText: { type: String, maxlength: 10000, default: '' },
    whatsappComponents: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  provider: { type: String, enum: [...PROVIDERS, null], default: null, index: true },
  providerMessageId: { type: String, default: null, index: true },
  // Set when a worker crosses the durable provider-submission boundary. A
  // recovery sweep uses this independently from updatedAt, which may change
  // later for unrelated reasons.
  submissionStartedAt: { type: Date, default: null },
  quotaReservationId: { type: mongoose.Schema.Types.ObjectId, default: null },
  quotaReservationState: { type: String, enum: ['pending', 'reserved', 'consumed', 'released', null], default: null },
  quotaReservedAt: { type: Date, default: null },
  frequencyReservationState: { type: String, enum: ['reserved', 'consumed', 'released', null], default: null },
  frequencyReservedAt: { type: Date, default: null },
  fallbackFrom: { type: String, enum: [...PROVIDERS, null], default: null },
  fallbackReason: { type: String, maxlength: 500, default: null },
  acceptedAt: { type: Date, default: null },
  sentAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  readAt: { type: Date, default: null },
  failedAt: { type: Date, default: null },
  lastEventAt: { type: Date, default: null },
  // Last bounded provider-status lookup. This prevents a recovery sweep from
  // hammering provider APIs while webhooks remain the primary delivery path.
  lastReconciliationAt: { type: Date, default: null },
  // Short-lived compare-and-set marker used while a confirmed bulk retry is
  // being handed to Redis. It makes a concurrent retry reversible without
  // changing a recipient another operation already claimed.
  retryOperationId: { type: String, maxlength: 64, default: null },
  retryPreviousStatus: { type: String, enum: [...MESSAGE_STATUSES, null], default: null },
  error: {
    code: { type: String, maxlength: 100, default: null },
    message: { type: String, maxlength: 500, default: null },
  },
  estimatedCost: { amount: { type: Number, default: null }, currency: { type: String, maxlength: 3, default: null } },
  actualCost: { amount: { type: Number, default: null }, currency: { type: String, maxlength: 3, default: null } },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

recipientSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });
recipientSchema.index({ campaignId: 1, status: 1, createdAt: 1 });
recipientSchema.index({ leadId: 1, createdAt: -1 });
recipientSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
recipientSchema.index({ status: 1, submissionStartedAt: 1 });
recipientSchema.index(
  { provider: 1, status: 1, lastReconciliationAt: 1, createdAt: 1 },
  { name: 'provider_status_reconciliation_due' },
);
recipientSchema.index(
  { quotaReservationId: 1 },
  { unique: true, partialFilterExpression: { quotaReservationId: { $type: 'objectId' } } },
);
recipientSchema.index(
  { provider: 1, providerMessageId: 1 },
  { unique: true, partialFilterExpression: { providerMessageId: { $type: 'string' } } },
);

export default mongoose.model('MessageRecipient', recipientSchema);
