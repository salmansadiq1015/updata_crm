import mongoose from 'mongoose';
import { CALL_STATES, DISPOSITIONS, ANSWER_VALIDATION, ANSWER_REVIEW, QUALIFICATION_RESULTS } from './aiCalling.constants.js';

/**
 * CallRecord — the authoritative record of ONE call attempt. Append-semantics:
 * a retry is a new document. Structured answers are kept bounded inside the
 * record (the question set per call is small), each tagged with its validation
 * state, source and whether the person confirmed it.
 */

const answerSchema = new mongoose.Schema({
  questionFieldKey: { type: String, required: true, maxlength: 80 },
  questionnaireVersion: { type: Number, default: 1 },
  label: { type: String, maxlength: 200, default: '' },
  type: { type: String, maxlength: 40, default: 'short_text' },
  rawAnswer: { type: String, maxlength: 4000, default: '' },
  normalizedValue: { type: mongoose.Schema.Types.Mixed, default: null },
  mapTo: { type: String, maxlength: 120, default: null },
  validation: { type: String, enum: ANSWER_VALIDATION, default: 'unknown' },
  confirmed: { type: Boolean, default: false },
  clarifications: { type: Number, default: 0 },
  source: { type: String, maxlength: 40, default: 'agent_tool' },
  confidence: { type: Number, default: null },
  reviewStatus: { type: String, enum: ANSWER_REVIEW, default: 'none' },
  recordedAt: { type: Date, default: Date.now },
}, { _id: false });

const callRecordSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallCampaign', required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignRecipient', required: true, index: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },

  // Stable internal id used as the idempotency anchor for this attempt and as
  // the handle the voice agent worker authenticates against.
  internalCallId: { type: String, required: true, unique: true },
  attemptNumber: { type: Number, required: true },
  isTest: { type: Boolean, default: false },

  // Telephony / LiveKit linkage.
  provider: { type: String, maxlength: 40, default: null },
  providerCallId: { type: String, default: null, index: true },
  fallbackFrom: { type: String, maxlength: 40, default: null },
  fallbackReason: { type: String, maxlength: 500, default: null },
  roomName: { type: String, maxlength: 200, default: null },
  agentSessionId: { type: String, maxlength: 200, default: null },

  state: { type: String, enum: CALL_STATES, default: 'queued', index: true },
  disposition: { type: String, enum: [...DISPOSITIONS, null], default: null },
  qualification: { type: String, enum: [...QUALIFICATION_RESULTS, null], default: null },

  // Live conversation state (the deterministic engine's state for THIS call).
  conversationState: { type: mongoose.Schema.Types.Mixed, default: null },

  queuedAt: { type: Date, default: Date.now },
  initiatedAt: { type: Date, default: null },
  answeredAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: 0 },

  answers: { type: [answerSchema], default: [] },
  transcriptRef: { type: String, maxlength: 500, default: null }, // pointer, not inline
  recordingRef: { type: String, maxlength: 500, default: null },
  cost: {
    amount: { type: Number, default: 0 },
    currency: { type: String, maxlength: 3, default: 'USD' },
    breakdown: { type: mongoose.Schema.Types.Mixed, default: null },
  },

  resultsProcessedAt: { type: Date, default: null }, // idempotency guard for post-call processing
  reviewRequired: { type: Boolean, default: false },
  failureCode: { type: String, maxlength: 100, default: null },
  failureMessage: { type: String, maxlength: 500, default: null },
  reconciliation: {
    needed: { type: Boolean, default: false },
    note: { type: String, maxlength: 500, default: null },
    resolvedAt: { type: Date, default: null },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true });

callRecordSchema.index({ leadId: 1, createdAt: -1 });
callRecordSchema.index({ campaignId: 1, state: 1 });
callRecordSchema.index({ recipientId: 1, attemptNumber: 1 }, { unique: true });

export default mongoose.model('CallRecord', callRecordSchema);
