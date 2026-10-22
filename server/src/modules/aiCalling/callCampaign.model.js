import mongoose from 'mongoose';
import {
  CAMPAIGN_STATUSES, QUESTION_TYPES, RULE_ACTIONS, SPEAKING_STYLES, DEFAULT_SCHEDULE,
} from './aiCalling.constants.js';

/**
 * CallCampaign — configuration + aggregate progress for an AI voice calling run.
 *
 * The `questionnaire` is snapshotted with a `version`: once a campaign starts,
 * later edits cannot change how an in-flight call is interpreted. Single-tenant,
 * scoped by `createdBy`.
 */

const questionSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, trim: true, maxlength: 80 },
  label: { type: String, required: true, trim: true, maxlength: 200 },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  type: { type: String, enum: QUESTION_TYPES, required: true },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  options: { type: [mongoose.Schema.Types.Mixed], default: [] }, // [{value,label}] or [string]
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  maxLength: { type: Number, default: null },
  maxClarifications: { type: Number, default: 2, min: 0, max: 5 },
  confirmCritical: { type: Boolean, default: false },
  condition: { type: mongoose.Schema.Types.Mixed, default: null }, // { all:[], any:[] }
  mapTo: { type: String, trim: true, maxlength: 120, default: null }, // CRM destination path
  sensitive: { type: Boolean, default: false },
}, { _id: false });

const statusRuleSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 300, default: '' },
  when: { type: mongoose.Schema.Types.Mixed, required: true }, // { all:[], any:[] }
  action: { type: String, enum: RULE_ACTIONS, required: true },
  requiresReview: { type: Boolean, default: false },
}, { _id: false });

const agentConfigSchema = new mongoose.Schema({
  agentName: { type: String, trim: true, maxlength: 120, default: 'Assistant' },
  organizationName: { type: String, trim: true, maxlength: 200, default: '' },
  disclosure: { type: String, trim: true, maxlength: 2000, default: '' },
  language: { type: String, trim: true, maxlength: 10, default: 'en' },
  voice: { type: String, trim: true, maxlength: 40, default: 'alloy' },
  speakingStyle: { type: String, enum: SPEAKING_STYLES, default: 'professional' },
  customStyle: { type: String, trim: true, maxlength: 500, default: '' },
  objective: { type: String, trim: true, maxlength: 1000, default: '' },
  maxCallSeconds: { type: Number, default: 300, min: 30, max: 1800 },
  silenceTimeoutSeconds: { type: Number, default: 8, min: 2, max: 60 },
  maxClarificationsPerQuestion: { type: Number, default: 2, min: 0, max: 5 },
  allowBargeIn: { type: Boolean, default: true },
  recordCall: { type: Boolean, default: false },
  shareLeadNotes: { type: Boolean, default: false },
}, { _id: false });

const scheduleSchema = new mongoose.Schema({
  timezone: { type: String, default: 'UTC', maxlength: 80 },
  callWindow: {
    start: { type: String, default: '09:00', maxlength: 5 },
    end: { type: String, default: '18:00', maxlength: 5 },
  },
  daysOfWeek: { type: [Number], default: [1, 2, 3, 4, 5] },
  maxAttemptsPerLead: { type: Number, default: 2, min: 1, max: 10 },
  minMinutesBetweenAttempts: { type: Number, default: 60, min: 0 },
  retryDelayMinutes: { type: Number, default: 120, min: 1 },
  maxConcurrency: { type: Number, default: 1, min: 1, max: 25 },
  maxCallsPerDay: { type: Number, default: 200, min: 1 },
  maxCampaignSpend: { type: Number, default: 0, min: 0 },
}, { _id: false });

// SMS link assistant (channel 'web_link'): persona, FAQ, link lifetime, reminders, limits.
const faqSchema = new mongoose.Schema({
  question: { type: String, trim: true, maxlength: 300, required: true },
  answer: { type: String, trim: true, maxlength: 1000, required: true },
}, { _id: false });

const linkConfigSchema = new mongoose.Schema({
  expiryDays: { type: Number, default: 7, min: 1, max: 60 },
  languages: { type: [String], default: ['en', 'ur', 'roman_ur'] },
  defaultLanguage: { type: String, maxlength: 10, default: 'en' },
  personaName: { type: String, trim: true, maxlength: 60, default: 'Ayesha' },
  personaTone: { type: String, enum: ['warm', 'professional', 'concise'], default: 'warm' },
  reason: { type: String, trim: true, maxlength: 300, default: '' },
  estimatedMinutes: { type: Number, default: 3, min: 1, max: 30 },
  faq: { type: [faqSchema], default: [] },
  smsTemplates: { type: mongoose.Schema.Types.Mixed, default: null }, // { en, ur, roman_ur, … } overrides
  voiceTier: { type: String, enum: ['off', 'browser', 'premium'], default: 'off' },
  reminders: {
    enabled: { type: Boolean, default: false },
    afterHours: { type: Number, default: 24, min: 1, max: 336 },
    max: { type: Number, default: 1, min: 0, max: 3 },
  },
  fallbackToCall: {
    enabled: { type: Boolean, default: false },
    simCallCampaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'SimCallCampaign', default: null },
    afterHours: { type: Number, default: 24, min: 1, max: 336 },
  },
  limits: {
    maxTurns: { type: Number, default: 40, min: 5, max: 200 },
    maxTokensPerTurn: { type: Number, default: 220, min: 60, max: 800 },
    maxSessionMinutes: { type: Number, default: 30, min: 5, max: 240 },
    dailySpendCap: { type: Number, default: 2, min: 0 },
  },
  transcriptRetentionDays: { type: Number, default: 90, min: 1, max: 730 },
  whatsappShare: { type: Boolean, default: false },
}, { _id: false });

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },

  questionnaireVersion: { type: Number, default: 1 },
  questionnaire: { questions: { type: [questionSchema], default: [] } },
  statusRules: { type: [statusRuleSchema], default: [] },
  agentConfig: { type: agentConfigSchema, default: () => ({}) },
  // 'voice' = AI phone calls (cloud); 'web_link' = SMS link → AI chat page.
  channel: { type: String, enum: ['voice', 'web_link'], default: 'voice', index: true },
  linkConfig: { type: linkConfigSchema, default: undefined },
  schedule: { type: scheduleSchema, default: () => ({ ...DEFAULT_SCHEDULE }) },

  selection: {
    mode: { type: String, enum: ['explicit', 'filters'], required: true },
    filters: { type: mongoose.Schema.Types.Mixed, default: null },
    leadIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    selectedAt: { type: Date, required: true },
  },

  summary: {
    total: { type: Number, default: 0 },
    eligible: { type: Number, default: 0 },
    ineligible: { type: Number, default: 0 },
    queued: { type: Number, default: 0 },
    inProgress: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    answered: { type: Number, default: 0 },
    noAnswer: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    retryScheduled: { type: Number, default: 0 },
    qualified: { type: Number, default: 0 },
    unqualified: { type: Number, default: 0 },
    callbacks: { type: Number, default: 0 },
    needsReview: { type: Number, default: 0 },
    doNotContact: { type: Number, default: 0 },
    suppressed: { type: Number, default: 0 },
    missingPhone: { type: Number, default: 0 },
    consentRequired: { type: Number, default: 0 },
    totalCallSeconds: { type: Number, default: 0 },
    actualCost: { type: Number, default: 0 },
  },

  timezone: { type: String, default: 'UTC', maxlength: 80 },
  scheduledAt: { type: Date, default: null, index: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  isTest: { type: Boolean, default: false, index: true },

  // Tick-chain control. Every enqueue mints a new tickToken; a tick whose token
  // is stale exits, so at most one chain drives a campaign. tickLeaseUntil stops
  // two ticks running at once; nextTickAt lets the watchdog revive a lost chain.
  tickToken: { type: String, default: null },
  tickLeaseUntil: { type: Date, default: null },
  nextTickAt: { type: Date, default: null },
  lastTickAt: { type: Date, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });

campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ status: 1, scheduledAt: 1 });
campaignSchema.index({ status: 1, nextTickAt: 1 }); // tick-chain watchdog

export default mongoose.model('CallCampaign', campaignSchema);
