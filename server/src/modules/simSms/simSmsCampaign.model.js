import mongoose from 'mongoose';
import { CAMPAIGN_STATUSES, DEFAULT_SETTINGS } from './simSms.constants.js';
import { QUESTION_TYPES, RULE_ACTIONS } from '../aiCalling/aiCalling.constants.js';

/**
 * SimSmsCampaign — an AI SMS qualification run sent from the OWNER's phone SIM.
 * The questionnaire / status rules use the exact shapes of AI calling so the
 * same engines (questionEngine, answerValidation, statusRuleEngine) drive both.
 */
const questionSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, trim: true, maxlength: 80 },
  label: { type: String, required: true, trim: true, maxlength: 200 },
  text: { type: String, required: true, trim: true, maxlength: 600 },
  type: { type: String, enum: QUESTION_TYPES, required: true },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  options: { type: [mongoose.Schema.Types.Mixed], default: [] },
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  maxClarifications: { type: Number, default: 1, min: 0, max: 3 },
  confirmCritical: { type: Boolean, default: false },
  condition: { type: mongoose.Schema.Types.Mixed, default: null },
}, { _id: false });

const ruleSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true, maxlength: 80 },
  when: { type: mongoose.Schema.Types.Mixed, required: true },
  action: { type: String, enum: RULE_ACTIONS, required: true },
  requiresReview: { type: Boolean, default: false },
}, { _id: false });

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },
  isTest: { type: Boolean, default: false },

  questionnaireVersion: { type: Number, default: 1 },
  questionnaire: { questions: { type: [questionSchema], default: [] } },
  statusRules: { type: [ruleSchema], default: [] },
  agent: {
    agentName: { type: String, trim: true, maxlength: 80, default: 'Assistant' },
    organizationName: { type: String, trim: true, maxlength: 120, default: '' },
    // {name} {agent} {company} placeholders. Must identify the sender and offer STOP.
    intro: { type: String, trim: true, maxlength: 300, default: '' },
    closing: { type: String, trim: true, maxlength: 300, default: '' },
    language: { type: String, trim: true, maxlength: 10, default: 'en' },
  },
  settings: {
    timezone: { type: String, maxlength: 80, default: DEFAULT_SETTINGS.timezone },
    sendWindow: {
      start: { type: String, maxlength: 5, default: DEFAULT_SETTINGS.sendWindow.start },
      end: { type: String, maxlength: 5, default: DEFAULT_SETTINGS.sendWindow.end },
    },
    daysOfWeek: { type: [Number], default: () => [...DEFAULT_SETTINGS.daysOfWeek] },
    maxMessagesPerDay: { type: Number, min: 1, max: 1000, default: DEFAULT_SETTINGS.maxMessagesPerDay },
    minSecondsBetweenSends: { type: Number, min: 5, max: 3600, default: DEFAULT_SETTINGS.minSecondsBetweenSends },
    replyTimeoutHours: { type: Number, min: 1, max: 720, default: DEFAULT_SETTINGS.replyTimeoutHours },
    maxReminders: { type: Number, min: 0, max: 2, default: DEFAULT_SETTINGS.maxReminders },
  },
  // Preferred SIM on the owner's phone (Android subscription id); null = system default.
  subscriptionId: { type: Number, default: null },

  summary: {
    total: { type: Number, default: 0 },
    eligible: { type: Number, default: 0 },
    ineligible: { type: Number, default: 0 },
    active: { type: Number, default: 0 },
    awaitingReply: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    stopped: { type: Number, default: 0 },
    expired: { type: Number, default: 0 },
    needsAttention: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    qualified: { type: Number, default: 0 },
    review: { type: Number, default: 0 },
    messagesSent: { type: Number, default: 0 },
    repliesReceived: { type: Number, default: 0 },
    // Send problems the user must see (carrier rejections, no signal…).
    sendFailures: { type: Number, default: 0 },
    lastSendError: {
      code: { type: String, default: null },
      at: { type: Date, default: null },
      nextRetryAt: { type: Date, default: null },
    },
  },

  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, minimize: false });

campaignSchema.index({ createdBy: 1, createdAt: -1 });

export default mongoose.model('SimSmsCampaign', campaignSchema);
