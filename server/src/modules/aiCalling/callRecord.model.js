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
  // Paired-phone calls: the device and the gateway's progress (see pairedPhone.service.js).
  pairedDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PairedDevice', default: null },
  gateway: {
    type: new mongoose.Schema({
      state: { type: String, enum: ['queued', 'claimed', 'dialing', 'ended', 'cancelled'], default: 'queued' },
      queuedAt: { type: Date, default: null },
      claimedAt: { type: Date, default: null },
      dialedAt: { type: Date, default: null },
      callRef: { type: Number, default: null },
      audioOpenedAt: { type: Date, default: null },
      audioLostAt: { type: Date, default: null },
      takenOverAt: { type: Date, default: null },
      codec: { type: String, maxlength: 10, default: null },
      endReason: { type: String, maxlength: 60, default: null },
      audio: { type: mongoose.Schema.Types.Mixed, default: null },
      audioAt: { type: Date, default: null },
      command: {
        kind: { type: String, enum: ['takeover', 'hangup', null], default: null },
        requestedAt: { type: Date, default: null },
        requestedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        ackedAt: { type: Date, default: null },
      },
    }, { _id: false }),
    default: undefined,
  },
  agentSessionId: { type: String, maxlength: 200, default: null },
  // Paired phone: the agent's /end, held until the gateway reports how the phone call ended
  // (the agent leaving is no evidence that the line is down). Merged by processCallResults.
  agentEnd: {
    type: new mongoose.Schema({
      at: { type: Date, required: true },
      disposition: { type: String, maxlength: 40, default: null },
      durationSeconds: { type: Number, default: null },
      transcriptRef: { type: String, maxlength: 500, default: null },
      cost: { type: mongoose.Schema.Types.Mixed, default: null },
    }, { _id: false }),
    default: undefined,
  },

  state: { type: String, enum: CALL_STATES, default: 'queued', index: true },
  disposition: { type: String, enum: [...DISPOSITIONS, null], default: null },
  qualification: { type: String, enum: [...QUALIFICATION_RESULTS, null], default: null },

  // Live conversation state (the deterministic engine's state for THIS call).
  conversationState: { type: mongoose.Schema.Types.Mixed, default: null },
  // Optimistic-concurrency counter for conversationState: the realtime model can
  // issue parallel tool calls, and a read-modify-write without it loses answers.
  stateVersion: { type: Number, default: 0 },

  queuedAt: { type: Date, default: Date.now },
  initiatedAt: { type: Date, default: null },
  // Set immediately BEFORE the provider request leaves the process. A crashed
  // dispatch with this unset provably never dialled (safe to requeue); with it
  // set the outcome is ambiguous and must be reconciled, never blindly redialled.
  dispatchStartedAt: { type: Date, default: null },
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
  // Atomic claim so concurrent finishers (agent end, webhook, reconciler) can't
  // both apply outcomes; an expired claim (crashed processor) may be re-taken.
  processingLeaseUntil: { type: Date, default: null },
  reviewRequired: { type: Boolean, default: false },
  failureCode: { type: String, maxlength: 100, default: null },
  failureMessage: { type: String, maxlength: 500, default: null },
  reconciliation: {
    needed: { type: Boolean, default: false },
    note: { type: String, maxlength: 500, default: null },
    resolvedAt: { type: Date, default: null },
    // Set only by the owner's explicit reconcile action (aiCalling.service reconcileCall).
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolution: { type: String, enum: ['reached', 'not_reached', 'retry', null], default: null },
  },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, minimize: false });

callRecordSchema.index({ leadId: 1, createdAt: -1 });
callRecordSchema.index({ campaignId: 1, state: 1 });
callRecordSchema.index({ recipientId: 1, attemptNumber: 1 }, { unique: true });
// Reconciliation sweep (every 2 min): unprocessed calls by state/age, and
// crashed processing claims. Partial so processed history doesn't bloat them.
callRecordSchema.index({ state: 1, initiatedAt: 1 }, { partialFilterExpression: { resultsProcessedAt: null }, name: 'reconcile_state_initiatedAt' });
callRecordSchema.index({ processingLeaseUntil: 1 }, { partialFilterExpression: { resultsProcessedAt: null }, name: 'reconcile_processing_lease' });
// Daily-cap count per campaign.
callRecordSchema.index({ campaignId: 1, initiatedAt: 1 });
callRecordSchema.index({ pairedDeviceId: 1, initiatedAt: 1 }, { partialFilterExpression: { pairedDeviceId: { $type: 'objectId' } }, name: 'paired_device_usage' });
callRecordSchema.index({ pairedDeviceId: 1, 'gateway.state': 1 }, { partialFilterExpression: { pairedDeviceId: { $type: 'objectId' } }, name: 'paired_device_queue' });

export default mongoose.model('CallRecord', callRecordSchema);
