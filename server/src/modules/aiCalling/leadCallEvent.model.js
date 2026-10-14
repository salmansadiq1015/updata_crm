import mongoose from 'mongoose';

/**
 * Append-only audit of every automatic lead-status change made by the calling
 * module, plus a dedupe anchor for provider webhook events.
 *
 * LeadCallTransition records *why* a lead's status changed: previous → new
 * status, the rule that fired, the source call, and the responsible actor
 * (always the system for automated transitions). It is never updated or deleted.
 */
const transitionSchema = new mongoose.Schema({
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallCampaign', default: null, index: true },
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null, index: true },
  previousStatus: { type: String, maxlength: 40, default: null },
  newStatus: { type: String, maxlength: 40, default: null },
  qualification: { type: String, maxlength: 40, default: null },
  ruleId: { type: String, maxlength: 80, default: null },
  reason: { type: String, maxlength: 300, default: null },
  actorType: { type: String, enum: ['system', 'user', 'provider_webhook'], default: 'system' },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

transitionSchema.index({ leadId: 1, createdAt: -1 });

export const LeadCallTransition = mongoose.model('LeadCallTransition', transitionSchema);

/**
 * Idempotency ledger for provider/telephony webhook events. A unique eventKey
 * makes duplicate or out-of-order deliveries harmless.
 */
const webhookEventSchema = new mongoose.Schema({
  eventKey: { type: String, required: true, unique: true },
  provider: { type: String, maxlength: 40, required: true },
  providerCallId: { type: String, maxlength: 200, default: null, index: true },
  callId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null, index: true },
  eventType: { type: String, maxlength: 100, required: true },
  normalizedState: { type: String, maxlength: 40, default: null },
  occurredAt: { type: Date, required: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } });

export const CallWebhookEvent = mongoose.model('CallWebhookEvent', webhookEventSchema);
