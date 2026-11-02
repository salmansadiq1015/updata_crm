import mongoose from 'mongoose';
import { INTELLIGENCE_CATEGORIES } from './engine/callIntelligence.js';
import { HANDOFF_STATUSES } from './engine/handoffPolicy.js';

/**
 * CallRecord sub-documents for evidence-linked intelligence, the knowledge version
 * a call ran with, and human transfer. Kept here so callRecord.model.js only gains
 * three field declarations.
 *
 * Contract for other modules: `intelligence.items[]` (one per accepted/reviewable
 * fact, with transcript evidence), `intelligence.rejected[]` (model proposals that
 * failed verbatim/speaker checks = extraction errors), `intelligence.status`.
 */

const { ObjectId, Mixed } = mongoose.Schema.Types;

const reviewSchema = new mongoose.Schema({
  decision: { type: String, enum: ['accept', 'edit', 'reject'], required: true },
  decidedBy: { type: ObjectId, ref: 'User', required: true },
  decidedAt: { type: Date, required: true },
  previousValue: { type: Mixed, default: null },
  note: { type: String, maxlength: 500, default: '' },
}, { _id: false });

const leadWriteSchema = new mongoose.Schema({
  status: { type: String, enum: ['applied', 'skipped', 'failed'], required: true },
  fieldKey: { type: String, maxlength: 80, default: null },
  source: { type: String, maxlength: 40, default: null },
  reason: { type: String, maxlength: 300, default: null },
  at: { type: Date, default: Date.now },
}, { _id: false });

export const intelligenceItemSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 40 },
  category: { type: String, enum: INTELLIGENCE_CATEGORIES, required: true },
  value: { type: String, maxlength: 500, default: '' },
  normalized: { type: Mixed, default: null },
  quote: { type: String, maxlength: 1000, required: true },
  turnIndex: { type: Number, required: true },
  turnItemId: { type: String, maxlength: 160, default: null },
  speaker: { type: String, enum: ['lead', 'agent'], required: true },
  startMs: { type: Number, default: null },
  confidence: { type: Number, default: null },
  status: { type: String, enum: ['accepted', 'needs_review', 'user_accepted', 'user_edited', 'user_rejected'], required: true },
  reviewReasons: { type: [String], default: [] },
  review: { type: reviewSchema, default: undefined },
  leadWrite: { type: leadWriteSchema, default: undefined },
}, { _id: false });

const complianceFlagSchema = new mongoose.Schema({
  kind: { type: String, enum: ['unapproved_price', 'unapproved_promise', 'forbidden_claim'], required: true },
  turnIndex: { type: Number, required: true },
  quote: { type: String, maxlength: 400, default: '' },
  detail: { type: String, maxlength: 400, default: '' },
  severity: { type: String, enum: ['medium', 'high'], default: 'medium' },
}, { _id: false });

export const intelligenceSchema = new mongoose.Schema({
  version: { type: Number, default: 1 },
  status: { type: String, enum: ['pending', 'ok', 'partial', 'failed', 'skipped'], default: 'pending' },
  reason: { type: String, maxlength: 120, default: null },
  error: { type: String, maxlength: 500, default: null },
  model: { type: String, maxlength: 80, default: null },
  usage: { type: Mixed, default: null },
  promptVersion: { type: String, maxlength: 80, default: null },
  transcriptVersion: { type: Number, default: null },
  turnCount: { type: Number, default: 0 },
  items: { type: [intelligenceItemSchema], default: [] },
  rejected: { type: [new mongoose.Schema({
    category: { type: String, maxlength: 20, default: null },
    quote: { type: String, maxlength: 300, default: '' },
    turnIndex: { type: Number, default: null },
    reason: { type: String, maxlength: 40, required: true },
  }, { _id: false })], default: [] },
  pendingReview: { type: Number, default: 0 },
  complianceVersion: { type: Number, default: null },
  complianceFlags: { type: [complianceFlagSchema], default: [] },
  runs: { type: Number, default: 0 },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  leaseUntil: { type: Date, default: null },
}, { _id: false, minimize: false });

export const knowledgeStampSchema = new mongoose.Schema({
  versionId: { type: ObjectId, ref: 'KnowledgeVersion', default: null },
  version: { type: Number, default: null },
  mode: { type: String, enum: ['latest', 'pinned', 'none'], default: 'latest' },
  entryCount: { type: Number, default: 0 },
  resolvedAt: { type: Date, default: null },
}, { _id: false });

const handoffEventSchema = new mongoose.Schema({
  at: { type: Date, required: true },
  type: { type: String, maxlength: 40, required: true },
  userId: { type: ObjectId, ref: 'User', default: null },
  detail: { type: String, maxlength: 500, default: '' },
}, { _id: false });

export const handoffSchema = new mongoose.Schema({
  requestedAt: { type: Date, required: true },
  reason: { type: String, maxlength: 500, default: '' },
  summary: { type: String, maxlength: 2000, default: '' },
  status: { type: String, enum: HANDOFF_STATUSES, required: true },
  offeredTo: { type: [ObjectId], default: [] },
  declinedBy: { type: [ObjectId], default: [] },
  skipped: { type: [new mongoose.Schema({ userId: ObjectId, reason: String }, { _id: false })], default: [] },
  targetUserId: { type: ObjectId, ref: 'User', default: null },
  mode: { type: String, enum: ['web', 'phone', null], default: null },
  expiresAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  joinedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  failure: { code: { type: String, maxlength: 60, default: null }, message: { type: String, maxlength: 500, default: null } },
  fallback: {
    script: { type: String, maxlength: 1000, default: null },
    language: { type: String, maxlength: 10, default: null },
    offeredAt: { type: Date, default: null },
    followUp: {
      state: { type: String, enum: ['creating', 'created', 'skipped', 'failed', null], default: null },
      kind: { type: String, maxlength: 20, default: null },
      id: { type: ObjectId, default: null },
      preferredTime: { type: String, maxlength: 300, default: null },
      reason: { type: String, maxlength: 300, default: null },
      at: { type: Date, default: null },
    },
  },
  events: { type: [handoffEventSchema], default: [] },
}, { _id: false });
