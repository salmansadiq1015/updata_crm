import mongoose from 'mongoose';
import {
  TASK_STATES, CALL_OUTCOMES, OUTCOME_EVIDENCE, ANSWER_STATUSES, CALLBACK_STATUSES, INTEREST_VALUES,
} from './simCall.constants.js';

/** One answer to a campaign question (validated with aiCalling answerValidation). */
const answerSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, maxlength: 80 },
  status: { type: String, enum: ANSWER_STATUSES, required: true },
  value: { type: mongoose.Schema.Types.Mixed, default: null },           // as entered
  normalizedValue: { type: mongoose.Schema.Types.Mixed, default: null }, // validated form
  attemptId: { type: String, default: null },
  questionsVersion: { type: Number, default: 1 },
  updatedAt: { type: Date, default: Date.now },
}, { _id: false });

/** One call attempt — the outcome is what the USER confirmed, plus device evidence. */
const attemptSchema = new mongoose.Schema({
  attemptId: { type: String, required: true, maxlength: 80 }, // client UUID = idempotency key
  deviceId: { type: String, maxlength: 80, default: null },
  claimedAt: { type: Date, default: Date.now },
  dialedAt: { type: Date, default: null },
  subscriptionId: { type: Number, default: null },
  outcome: { type: String, enum: [...CALL_OUTCOMES, null], default: null },
  interest: { type: String, enum: [...INTEREST_VALUES, null], default: null },
  evidence: { type: String, enum: [...OUTCOME_EVIDENCE, null], default: null },
  offhookAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  durationSec: { type: Number, min: 0, default: null },     // from the call log, when available
  offhookDurationSec: { type: Number, min: 0, default: null }, // dial → hang-up (NOT talk time)
  notes: { type: String, maxlength: 5000, default: '' },
  transcript: { type: String, maxlength: 10_000, default: '' }, // voice note, as reviewed by the user
  completedAt: { type: Date, default: null },
  // CRM sync through leadCommunication (contact log, lead stamp, follow-up, status).
  sync: {
    status: { type: String, enum: ['pending', 'ok', 'failed', 'skipped'], default: 'pending' },
    operationId: { type: String, default: null },
    error: { type: String, maxlength: 500, default: null },
    attempts: { type: Number, default: 0 },
    at: { type: Date, default: null },
  },
}, { _id: false });

const taskSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimCallCampaign', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  order: { type: Number, default: 0 },

  state: { type: String, enum: TASK_STATES, default: 'pending', index: true },
  outcome: { type: String, enum: [...CALL_OUTCOMES, null], default: null }, // latest confirmed outcome
  notBefore: { type: Date, default: null },      // retry delay or callback time
  destinationField: { type: String, enum: ['mobile', 'phone'], default: 'mobile' },
  destinationMasked: { type: String, default: null },
  eligibility: { eligible: { type: Boolean, default: true }, reasons: { type: [String], default: [] } },

  lock: {
    deviceId: { type: String, default: null },
    attemptId: { type: String, default: null },
    until: { type: Date, default: null },
  },
  attemptCount: { type: Number, default: 0 }, // attempts that reached the network (excludes failed/cancelled dials)
  attempts: { type: [attemptSchema], default: [] },

  answers: { type: [answerSchema], default: [] },
  questionsVersion: { type: Number, default: 1 },

  callback: {
    at: { type: Date, default: null },
    timezone: { type: String, default: null },
    reason: { type: String, maxlength: 500, default: '' },
    status: { type: String, enum: [...CALLBACK_STATUSES, null], default: null },
    attemptId: { type: String, default: null },
    notifiedAt: { type: Date, default: null },
  },
  lastActivityAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
}, { timestamps: true, minimize: false });

taskSchema.index({ campaignId: 1, leadId: 1 }, { unique: true });
taskSchema.index({ campaignId: 1, state: 1, notBefore: 1, order: 1 });
taskSchema.index({ createdBy: 1, 'callback.status': 1, 'callback.at': 1 });
taskSchema.index({ state: 1, 'lock.until': 1 });
taskSchema.index({ 'attempts.attemptId': 1 });

export default mongoose.model('SimCallTask', taskSchema);
