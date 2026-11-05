import mongoose from 'mongoose';
import { CALL_STATUSES, AI_STATUSES, AUDIO_STATUSES, HANDLING_MODES, OUTCOMES } from './engine/stateMachine.js';
import { INQUIRY_CATEGORIES } from './engine/intents.js';
import { QUALIFICATION_RESULTS } from './engine/qualification.js';
import { RECOMMENDATION_ACTIONS } from './engine/recommendations.js';
import { WORK_STATUSES } from './engine/workStatus.js';

/**
 * InboundCall — ONE incoming phone call on a connected phone, from the first ring to its
 * post-call processing. The single source of truth for the Incoming Calls workspace (web +
 * mobile) and the lead timeline.
 *
 * Idempotency: `dedupeKey` (device + the gateway's ring session id) is unique, so a retried or
 * duplicated ring report can never create a second session; `internalCallId` is unique and is
 * the only handle the voice agent worker's token is bound to.
 *
 * Caller data is persisted AS IT ARRIVES (fields, questions, transcript), so an interrupted
 * call keeps everything collected up to that point.
 */

const { ObjectId, Mixed } = mongoose.Schema.Types;

const transitionSchema = new mongoose.Schema({
  from: { type: String, maxlength: 30 }, to: { type: String, maxlength: 30 },
  at: { type: Date, required: true }, reason: { type: String, maxlength: 200, default: null }, source: { type: String, maxlength: 30, default: 'system' },
}, { _id: false });

const turnSchema = new mongoose.Schema({
  itemId: { type: String, required: true, maxlength: 120 },
  role: { type: String, enum: ['assistant', 'caller', 'system'], required: true },
  text: { type: String, maxlength: 4000, required: true },
  interrupted: { type: Boolean, default: false },
  language: { type: String, maxlength: 12, default: null },
  at: { type: Date, default: Date.now },
}, { _id: false });

const fieldSchema = new mongoose.Schema({
  key: { type: String, required: true, maxlength: 60 },
  label: { type: String, maxlength: 80, default: null },
  value: { type: String, maxlength: 1000, required: true },
  explicit: { type: Boolean, default: true },
  confidence: { type: Number, min: 0, max: 1, default: null },
  verification: { type: String, enum: ['unverified', 'confirmed', 'corrected', 'rejected'], default: 'unverified' },
  evidence: { type: String, maxlength: 1000, default: null },
  transcriptItemId: { type: String, maxlength: 120, default: null },
  askedQuestion: { type: String, maxlength: 500, default: null },
  appliedToLead: { type: Boolean, default: false },
  supersededAt: { type: Date, default: null },
  source: { type: String, enum: ['ai_agent', 'user_correction'], default: 'ai_agent' },
  at: { type: Date, default: Date.now },
}, { _id: true });

const questionSchema = new mongoose.Schema({
  requestId: { type: String, maxlength: 80, default: null },
  text: { type: String, maxlength: 1000, required: true },
  category: { type: String, enum: INQUIRY_CATEGORIES, default: 'OTHER' },
  categorySource: { type: String, enum: ['ai', 'rules'], default: 'ai' },
  answerStatus: { type: String, enum: ['answered', 'partially_answered', 'unanswered', 'deferred'], default: 'unanswered' },
  answerSummary: { type: String, maxlength: 1000, default: null },
  transcriptItemId: { type: String, maxlength: 120, default: null },
  at: { type: Date, default: Date.now },
}, { _id: true });

const recommendationSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 60 },
  action: { type: String, enum: RECOMMENDATION_ACTIONS, required: true },
  reason: { type: String, maxlength: 500, default: '' },
  status: { type: String, enum: ['pending', 'executed', 'dismissed'], default: 'pending' },
  followUpId: { type: ObjectId, ref: 'LeadFollowUp', default: null },
  decidedBy: { type: ObjectId, ref: 'User', default: null },
  decidedAt: { type: Date, default: null },
  automatic: { type: Boolean, default: false },
}, { _id: false });

const inboundCallSchema = new mongoose.Schema({
  createdBy: { type: ObjectId, ref: 'User', required: true },
  internalCallId: { type: String, required: true, unique: true, maxlength: 80 },
  dedupeKey: { type: String, required: true, unique: true, maxlength: 200 },
  source: { type: String, enum: ['paired_gateway', 'simulation'], default: 'paired_gateway' },
  isTest: { type: Boolean, default: false },

  deviceId: { type: ObjectId, ref: 'PairedDevice', default: null },
  deviceName: { type: String, maxlength: 80, default: null },
  simSlot: { type: Number, min: 0, max: 4, default: null },
  simLabel: { type: String, maxlength: 80, default: null },

  caller: {
    raw: { type: String, maxlength: 40, default: null },
    e164: { type: String, maxlength: 20, default: null },
    presentation: { type: String, enum: ['available', 'private', 'unavailable'], default: 'available' },
    name: { type: String, maxlength: 200, default: null },
  },
  match: {
    status: { type: String, enum: ['new', 'existing', 'ambiguous', 'unknown'], default: 'unknown' },
    leadIds: { type: [ObjectId], default: [] },
    resolvedBy: { type: ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  leadId: { type: ObjectId, ref: 'Lead', default: null },
  leadCreated: { type: Boolean, default: false },
  assignedTo: { type: ObjectId, ref: 'User', default: null },

  status: { type: String, enum: CALL_STATUSES, default: 'DETECTED' },
  statusChangedAt: { type: Date, default: Date.now },
  aiStatus: { type: String, enum: AI_STATUSES, default: 'not_applicable' },
  audioStatus: { type: String, enum: AUDIO_STATUSES, default: 'none' },
  transitions: { type: [transitionSchema], default: [] },

  handling: {
    mode: { type: String, enum: [...HANDLING_MODES, null], default: null },
    agentId: { type: ObjectId, ref: 'CallingAgent', default: null },
    agentName: { type: String, maxlength: 120, default: null },
    ruleId: { type: String, maxlength: 60, default: null },
    ruleName: { type: String, maxlength: 120, default: null },
    reason: { type: String, maxlength: 60, default: null },
    aiBlockedBy: { type: String, maxlength: 60, default: null },
    callerType: { type: String, maxlength: 30, default: null },
    inBusinessHours: { type: Boolean, default: null },
    answerAfterMs: { type: Number, default: null },
    decidedAt: { type: Date, default: null },
  },
  answeredBy: { type: String, enum: ['ai', 'human', null], default: null },
  outcome: { type: String, enum: [...OUTCOMES, null], default: null },
  endReason: { type: String, maxlength: 60, default: null },

  detectedAt: { type: Date, default: Date.now },
  answeredAt: { type: Date, default: null },
  aiConnectedAt: { type: Date, default: null },
  // The voice agent saw the phone line active and started its session (worker /answered).
  // "AI connected" needs BOTH this and an open audio link — never one alone.
  agentJoinedAt: { type: Date, default: null },
  agentContextAt: { type: Date, default: null },
  leadClaimAt: { type: Date, default: null },
  humanAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  ringSeconds: { type: Number, default: null },
  durationSeconds: { type: Number, default: 0 },
  lastEventAt: { type: Date, default: Date.now },

  roomName: { type: String, maxlength: 200, default: null },
  // Rang while the phone was already in a call (HFP call waiting): the AI cannot take it.
  callWaiting: { type: Boolean, default: false },
  gateway: {
    sessionId: { type: String, maxlength: 80, default: null },
    callRef: { type: Number, default: null },
    codec: { type: String, maxlength: 10, default: null },
    audio: { type: Mixed, default: null },
    command: {
      kind: { type: String, enum: ['hangup', 'takeover', 'reject', 'answer', null], default: null },
      requestedAt: { type: Date, default: null },
      requestedBy: { type: ObjectId, default: null },
      ackedAt: { type: Date, default: null },
    },
  },
  agentActivity: {
    state: { type: String, maxlength: 20, default: null },
    speaker: { type: String, enum: ['assistant', 'caller', null], default: null },
    at: { type: Date, default: null },
  },

  language: {
    initial: { type: String, maxlength: 12, default: null },
    current: { type: String, maxlength: 12, default: null },
    // Automatic detection needs the same language on two caller turns in a row (or high confidence).
    candidate: { type: String, maxlength: 12, default: null },
    candidateCount: { type: Number, default: 0 },
    switches: { type: [new mongoose.Schema({ from: String, to: String, at: Date, explicit: Boolean, evidence: { type: String, maxlength: 300 } }, { _id: false })], default: [] },
  },
  transcript: { type: [turnSchema], default: [] },
  events: { type: [new mongoose.Schema({ type: { type: String, maxlength: 40 }, at: Date, detail: { type: String, maxlength: 300, default: null } }, { _id: false })], default: [] },
  fields: { type: [fieldSchema], default: [] },
  // Closing questions the caller chose not to answer (never asked again in this call).
  declinedFields: { type: [new mongoose.Schema({ key: { type: String, maxlength: 60 }, at: Date, evidence: { type: String, maxlength: 1000, default: null } }, { _id: false })], default: [] },
  questions: { type: [questionSchema], default: [] },
  intents: {
    primary: { type: String, enum: [...INQUIRY_CATEGORIES, null], default: null },
    secondary: { type: [String], default: [] },
    source: { type: String, enum: ['ai', 'rules', null], default: null },
    agentPrimary: { type: String, maxlength: 40, default: null },
    agentSecondary: { type: [String], default: [] },
  },
  summary: {
    reason: { type: String, maxlength: 1000, default: null },
    text: { type: String, maxlength: 4000, default: null },
    requirements: { type: [String], default: [] },
    concerns: { type: [String], default: [] },
    objections: { type: [String], default: [] },
    unresolvedQuestions: { type: [String], default: [] },
    tone: { type: String, enum: ['positive', 'neutral', 'hesitant', 'negative', null], default: null },
    toneEvidence: { type: String, maxlength: 300, default: null },
    notInterested: { type: Boolean, default: false },
    generatedBy: { type: String, enum: ['ai_agent', 'system', null], default: null },
    at: { type: Date, default: null },
  },
  qualification: {
    result: { type: String, enum: [...QUALIFICATION_RESULTS, null], default: null },
    reasons: { type: [String], default: [] },
    met: { type: [String], default: [] },
    missing: { type: [String], default: [] },
    score: { type: Number, default: null },
    evaluatedAt: { type: Date, default: null },
  },
  recommendations: { type: [recommendationSchema], default: [] },
  followUpIds: { type: [ObjectId], default: [] },
  callback: {
    requested: { type: Boolean, default: false },
    whenText: { type: String, maxlength: 300, default: null },
    note: { type: String, maxlength: 1000, default: null },
    at: { type: Date, default: null },
  },
  handoff: {
    requested: { type: Boolean, default: false },
    reason: { type: String, maxlength: 500, default: null },
    summary: { type: String, maxlength: 2000, default: null },
    requestedAt: { type: Date, default: null },
    status: { type: String, enum: ['none', 'waiting', 'taken_over', 'callback_offered', 'expired'], default: 'none' },
    takenOverAt: { type: Date, default: null },
    takenOverBy: { type: ObjectId, ref: 'User', default: null },
  },
  doNotContact: { type: Boolean, default: false },
  // Where the follow-up WORK stands (separate from the call status). Set by the agent's routing
  // after the call, then by people; every change is kept with who made it.
  work: {
    status: { type: String, enum: [...WORK_STATUSES, null], default: null },
    reason: { type: String, maxlength: 80, default: null },
    updatedAt: { type: Date, default: null },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
    source: { type: String, enum: ['user', 'agent', 'system', null], default: null },
    history: { type: [new mongoose.Schema({
      from: { type: String, maxlength: 30, default: null }, to: { type: String, maxlength: 30, default: null },
      assignedFrom: { type: ObjectId, ref: 'User', default: null }, assignedTo: { type: ObjectId, ref: 'User', default: null },
      by: { type: ObjectId, ref: 'User', default: null }, source: { type: String, enum: ['user', 'agent', 'system'], default: 'user' },
      note: { type: String, maxlength: 1000, default: null }, reason: { type: String, maxlength: 80, default: null }, at: { type: Date, default: Date.now },
    }, { _id: false })], default: [] },
  },
  notes: { type: [new mongoose.Schema({ text: { type: String, maxlength: 2000 }, by: { type: ObjectId, ref: 'User' }, at: Date }, { _id: true })], default: [] },
  aiVoice: { type: Mixed, default: null },
  cost: { amount: { type: Number, default: 0 }, currency: { type: String, default: 'USD' }, breakdown: { type: Mixed, default: null } },
  quality: { type: Mixed, default: null },
  agentEnd: {
    at: { type: Date, default: null },
    disposition: { type: String, maxlength: 40, default: null },
    failureCode: { type: String, maxlength: 100, default: null },
  },
  error: { code: { type: String, maxlength: 100, default: null }, message: { type: String, maxlength: 500, default: null }, at: { type: Date, default: null } },

  // Post-call processing: claimed atomically, done once.
  processingLeaseUntil: { type: Date, default: null },
  processedAt: { type: Date, default: null },
  processingErrors: { type: Number, default: 0 },
}, { timestamps: true, minimize: false });

inboundCallSchema.index({ createdBy: 1, createdAt: -1 });
inboundCallSchema.index({ createdBy: 1, 'caller.e164': 1, createdAt: -1 });
inboundCallSchema.index({ leadId: 1, createdAt: -1 });
inboundCallSchema.index({ deviceId: 1, createdAt: -1 });
inboundCallSchema.index({ createdBy: 1, simSlot: 1, createdAt: -1 });
inboundCallSchema.index({ createdBy: 1, status: 1, createdAt: -1 });
inboundCallSchema.index({ createdBy: 1, 'qualification.result': 1, createdAt: -1 });
inboundCallSchema.index({ 'handling.agentId': 1, createdAt: -1 });
inboundCallSchema.index({ createdBy: 1, 'work.status': 1, createdAt: -1 });
inboundCallSchema.index({ assignedTo: 1, 'work.status': 1, createdAt: -1 });
// Sweep: unprocessed sessions by status + age.
inboundCallSchema.index({ status: 1, lastEventAt: 1 }, { partialFilterExpression: { processedAt: null }, name: 'inbound_sweep' });

export default mongoose.models.InboundCall || mongoose.model('InboundCall', inboundCallSchema);
