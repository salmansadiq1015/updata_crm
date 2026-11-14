import mongoose from 'mongoose';
import { RECIPIENT_STATES } from './aiCalling.constants.js';

/**
 * CampaignRecipient — one lead enrolled in one call campaign. It owns the
 * retry/lease bookkeeping and points at the latest CallRecord. Call *attempts*
 * live in their own collection (CallRecord): a retry creates a new record, it
 * never overwrites a previous attempt.
 */
const recipientSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallCampaign', required: true, index: true },
  // Null only for the built-in browser-test contact (`testContact`): an agent can be
  // tested before any lead exists. Real campaign recipients always reference a lead.
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', default: null, required() { return !this.testContact; }, index: true },
  testContact: { type: Boolean, default: false },
  // Phone snapshotted at enrolment (E.164) so later lead edits don't change who we dialled.
  phoneSnapshot: { type: String, maxlength: 32, default: null },
  phoneHash: { type: String, index: true, default: null },
  country: { type: String, uppercase: true, maxlength: 2, default: null },

  state: { type: String, enum: RECIPIENT_STATES, default: 'draft', index: true },
  eligibility: {
    eligible: { type: Boolean, required: true },
    reasons: { type: [String], default: [] },
  },

  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: null, index: true },
  // Cooperative lease so two workers can't dial the same recipient at once.
  leaseUntil: { type: Date, default: null },

  lastCallId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', default: null },
  finalDisposition: { type: String, maxlength: 40, default: null },
  qualification: { type: String, maxlength: 40, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

recipientSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });
recipientSchema.index({ leadId: 1, createdAt: -1 });
recipientSchema.index({ campaignId: 1, state: 1 });
recipientSchema.index({ state: 1, nextAttemptAt: 1 });
recipientSchema.index({ state: 1, leaseUntil: 1 }); // expired dispatch-lease recovery
recipientSchema.index({ phoneHash: 1, state: 1 });  // DNC / consent fan-out

export default mongoose.model('CampaignRecipient', recipientSchema);
