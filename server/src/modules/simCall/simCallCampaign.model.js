import mongoose from 'mongoose';
import { CAMPAIGN_STATUSES, DEFAULT_SETTINGS } from './simCall.constants.js';
import { QUESTION_TYPES } from '../aiCalling/aiCalling.constants.js';

/**
 * SimCallCampaign — a list of CRM leads the OWNER calls from their own phone/SIM,
 * with the campaign's own ordered questions. Same question shape as AI calling and
 * SIM SMS so the same engines (questionEngine.conditionMet, answerValidation) apply.
 */
const questionSchema = new mongoose.Schema({
  fieldKey: { type: String, required: true, trim: true, maxlength: 80 },
  label: { type: String, required: true, trim: true, maxlength: 200 },
  text: { type: String, required: true, trim: true, maxlength: 1000 },
  description: { type: String, trim: true, maxlength: 1000, default: '' }, // hint / follow-up prompt
  type: { type: String, enum: QUESTION_TYPES, required: true },
  required: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
  options: { type: [mongoose.Schema.Types.Mixed], default: [] },
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  condition: { type: mongoose.Schema.Types.Mixed, default: null }, // skip rule
}, { _id: false });

const campaignSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  creationKey: { type: String, default: null },
  creationHash: { type: String, default: null },
  creationInitializedAt: { type: Date, default: null },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft', index: true },

  questionsVersion: { type: Number, default: 1 },
  questionnaire: { questions: { type: [questionSchema], default: [] } },
  instructions: { type: String, trim: true, maxlength: 2000, default: '' }, // script / opening shown to the caller

  settings: {
    timezone: { type: String, maxlength: 80, default: DEFAULT_SETTINGS.timezone },
    callWindow: {
      start: { type: String, maxlength: 5, default: DEFAULT_SETTINGS.callWindow.start },
      end: { type: String, maxlength: 5, default: DEFAULT_SETTINGS.callWindow.end },
    },
    daysOfWeek: { type: [Number], default: () => [...DEFAULT_SETTINGS.daysOfWeek] },
    countdownSeconds: { type: Number, min: 3, max: 120, default: DEFAULT_SETTINGS.countdownSeconds },
    autoDial: { type: Boolean, default: DEFAULT_SETTINGS.autoDial },
    maxAttempts: { type: Number, min: 1, max: 5, default: DEFAULT_SETTINGS.maxAttempts },
    retryDelayMinutes: { type: Number, min: 5, max: 10_080, default: DEFAULT_SETTINGS.retryDelayMinutes },
    readAloud: { type: Boolean, default: DEFAULT_SETTINGS.readAloud },
  },
  subscriptionId: { type: Number, default: null }, // preferred SIM; null = ask / system default
  startsAt: { type: Date, default: null },         // scheduled execution: nothing is handed out before

  summary: {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    inProgress: { type: Number, default: 0 },
    scheduled: { type: Number, default: 0 },
    needsReview: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    ineligible: { type: Number, default: 0 },
    cancelled: { type: Number, default: 0 },
    answered: { type: Number, default: 0 },
    noAnswer: { type: Number, default: 0 },
    busy: { type: Number, default: 0 },
    rejected: { type: Number, default: 0 },
    callbacks: { type: Number, default: 0 },
    callbacksDue: { type: Number, default: 0 },
    wrongNumber: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    syncFailed: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
  },
  lastActivityAt: { type: Date, default: null },

  startedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
}, { timestamps: true, minimize: false });

campaignSchema.index({ createdBy: 1, createdAt: -1 });
campaignSchema.index({ createdBy: 1, status: 1, lastActivityAt: -1 });

campaignSchema.index({ createdBy: 1, creationKey: 1 }, {
  unique: true, partialFilterExpression: { creationKey: { $type: 'string' } }, name: 'sim_call_creation_key',
});
export default mongoose.model('SimCallCampaign', campaignSchema);
