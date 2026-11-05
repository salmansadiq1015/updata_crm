import mongoose from 'mongoose';
import { RULE_ACTIONS, CALLER_TYPES } from './engine/ruleEngine.js';
import { QUALIFICATION_RESULTS } from './engine/qualification.js';

/**
 * Incoming-call configuration, one document per owner (single-tenant CRM: ownership =
 * createdBy). AI answering is OFF until the owner turns it on. Automatic outbound messages
 * (SMS / e-mail) are off unless explicitly enabled — follow-up TASKS are not messages.
 */

const { ObjectId } = mongoose.Schema.Types;

const ruleSchema = new mongoose.Schema({
  id: { type: String, required: true, maxlength: 60 },
  name: { type: String, trim: true, maxlength: 120, required: true },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, min: 0, max: 1000, default: 100 },
  conditions: {
    callerType: { type: String, enum: CALLER_TYPES, default: 'any' },
    numbers: { type: [String], default: [] },
    numberPrefixes: { type: [String], default: [] },
    deviceIds: { type: [ObjectId], default: [] },
    simSlots: { type: [Number], default: [] },
    withinBusinessHours: { type: Boolean, default: null },
    leadStatuses: { type: [String], default: [] },
  },
  action: { type: String, enum: RULE_ACTIONS, required: true },
  agentId: { type: ObjectId, ref: 'CallingAgent', default: null },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const deviceAgentSchema = new mongoose.Schema({
  deviceId: { type: ObjectId, ref: 'PairedDevice', required: true },
  simSlot: { type: Number, min: 0, max: 4, default: null }, // null = every SIM on this phone
  agentId: { type: ObjectId, ref: 'CallingAgent', default: null },
  aiEnabled: { type: Boolean, default: true },
}, { _id: false });

const inboundSettingsSchema = new mongoose.Schema({
  createdBy: { type: ObjectId, ref: 'User', required: true, unique: true },
  enabled: { type: Boolean, default: false },
  organizationName: { type: String, trim: true, maxlength: 200, default: '' },
  defaultRegion: { type: String, trim: true, uppercase: true, maxlength: 2, default: 'CH' },
  defaultAgentId: { type: ObjectId, ref: 'CallingAgent', default: null },
  deviceAgents: { type: [deviceAgentSchema], default: [] },
  answerDelaySeconds: { type: Number, min: 0, max: 30, default: 4 },
  ringTimeoutSeconds: { type: Number, min: 15, max: 120, default: 45 },
  maxConcurrentAiSessions: { type: Number, min: 1, max: 10, default: 1 },
  fallbackAction: { type: String, enum: ['human', 'ignore'], default: 'human' },
  businessHours: {
    enabled: { type: Boolean, default: false },
    timezone: { type: String, maxlength: 80, default: 'UTC' },
    days: { type: [Number], default: [1, 2, 3, 4, 5] },
    start: { type: String, maxlength: 5, default: '09:00' },
    end: { type: String, maxlength: 5, default: '18:00' },
  },
  outsideHoursAction: { type: String, enum: RULE_ACTIONS, default: 'ai_answer' },
  blockedNumbers: { type: [String], default: [] },
  blockedAction: { type: String, enum: ['human', 'ignore'], default: 'human' },
  rules: { type: [ruleSchema], default: [] },
  leadCreation: { type: String, enum: ['ai_answered', 'all_identified', 'never'], default: 'ai_answered' },
  qualification: {
    required: { type: [String], default: ['full_name', 'service_interest', 'requirements'] },
    anyOf: { type: [String], default: ['timeline', 'budget', 'decision_role'] },
    promoteLeadStatus: { type: Boolean, default: true },
  },
  automation: {
    createFollowUps: { type: Boolean, default: true },
    followUpFor: { type: [String], enum: QUALIFICATION_RESULTS, default: ['QUALIFIED', 'PARTIALLY_QUALIFIED', 'CALLBACK_REQUIRED', 'SUPPORT_REQUIRED'] },
    returnMissedCalls: { type: Boolean, default: true },
    notifyMissed: { type: Boolean, default: true },
    notifyHandoff: { type: Boolean, default: true },
    notifyQualified: { type: Boolean, default: true },
    // Outbound messages need explicit opt-in; tasks above are internal.
    autoSendSms: { type: Boolean, default: false },
    autoSendEmail: { type: Boolean, default: false },
  },
  handoffWaitSeconds: { type: Number, min: 10, max: 120, default: 30 },
  aiDisclosure: { type: Boolean, default: true },
  transcriptRetentionDays: { type: Number, min: 1, max: 3650, default: 365 },
  version: { type: Number, default: 1 },
  updatedBy: { type: ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });

export default mongoose.models.InboundSettings || mongoose.model('InboundSettings', inboundSettingsSchema);
