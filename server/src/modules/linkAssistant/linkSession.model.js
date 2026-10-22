import mongoose from 'mongoose';

import { FUNNEL_STEPS, SESSION_STATUSES } from './linkAssistant.constants.js';

/** One hashed personal link. A session can have several (first SMS + reminders). */
const tokenSchema = new mongoose.Schema({
  hash: { type: String, required: true },
  // The mobile SMS operation that delivered this link (idempotency anchor).
  operationId: { type: String, maxlength: 64, default: null },
  purpose: { type: String, enum: ['initial', 'reminder', 'preview'], default: 'initial' },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null },
}, { _id: false });

const turnSchema = new mongoose.Schema({
  role: { type: String, enum: ['assistant', 'customer', 'system'], required: true },
  text: { type: String, maxlength: 2000, default: '' },
  at: { type: Date, default: Date.now },
  kind: { type: String, maxlength: 40, default: null },
  // Client idempotency key for customer messages (reconnect / retry).
  clientMessageId: { type: String, maxlength: 64, default: null },
  source: { type: String, enum: ['model', 'template', 'customer', null], default: null },
}, { _id: false });

const linkSessionSchema = new mongoose.Schema({
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallCampaign', required: true, index: true },
  recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'CampaignRecipient', required: true },
  leadId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
  callRecordId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallRecord', required: true },
  internalCallId: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  isTest: { type: Boolean, default: false },

  tokens: { type: [tokenSchema], default: [] },
  status: { type: String, enum: SESSION_STATUSES, default: 'issued', index: true },
  outcome: {
    type: String,
    enum: ['completed', 'partial', 'opted_out', 'callback_requested', 'human_requested', 'expired', null],
    default: null,
  },
  funnel: {
    type: Object,
    default: () => Object.fromEntries(FUNNEL_STEPS.map((k) => [k, null])),
  },

  // Minimum lead data for the page: first name only, plus the reason for contact.
  displayName: { type: String, maxlength: 60, default: '' },
  language: { type: String, maxlength: 10, default: 'en' },
  languageLocked: { type: Boolean, default: false }, // chosen by the customer
  awaiting: { type: String, maxlength: 40, default: 'start' },
  greeting: { type: String, maxlength: 1000, default: '' },

  transcript: { type: [turnSchema], default: [] },
  turns: { type: Number, default: 0 },
  deviceHashes: { type: [String], default: [] },
  verifyFailures: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },

  usage: {
    promptTokens: { type: Number, default: 0 },
    completionTokens: { type: Number, default: 0 },
    modelCalls: { type: Number, default: 0 },
    modelFailures: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
  },

  reminders: {
    sent: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: null },
  },
  fallbackCallQueuedAt: { type: Date, default: null },
  // One customer turn at a time per session (double taps, two tabs).
  turnLockUntil: { type: Date, default: null },
  // FAQ questions the assistant could not answer, passed to the team (bounded).
  openQuestions: { type: [{ text: String, at: Date, _id: false }], default: [] },
  lastActivityAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true, index: true },
  closedAt: { type: Date, default: null },
  transcriptPurgeAt: { type: Date, default: null, index: true },
}, { timestamps: true, minimize: false });

linkSessionSchema.index({ 'tokens.hash': 1 }, { unique: true, sparse: true });
linkSessionSchema.index({ 'tokens.operationId': 1 }, { sparse: true });
linkSessionSchema.index({ campaignId: 1, leadId: 1, status: 1 });

export default mongoose.models.LinkSession || mongoose.model('LinkSession', linkSessionSchema);
