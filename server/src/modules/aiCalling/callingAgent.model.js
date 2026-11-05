import mongoose from 'mongoose';
import { agentAvatarPresetIds } from './agentAvatarPresets.js';
import { agentConfigSchema, questionSchema, scheduleSchema, statusRuleSchema } from './callCampaign.model.js';
import { AGENT_TYPES, FOLLOW_UP_TRIGGERS } from './engine/agentTypes.js';

const draftQuestionSchema = questionSchema.clone();
draftQuestionSchema.path('label').required(false);
draftQuestionSchema.path('text').required(false);

// Follow-up calling automation for this agent (followUpCalling.service.js). Off by default;
// automatic calls additionally need the organisation switch (AiCallingSettings.followUpAutomation).
const followUpSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: false },
  autoCall: { type: Boolean, default: false },   // place follow-up calls automatically when due
  manualCall: { type: Boolean, default: true },  // allow "Call now" from a follow-up
  triggers: { type: [{ type: String, enum: FOLLOW_UP_TRIGGERS }], default: () => ['CALLBACK_REQUESTED'] },
  objective: { type: String, trim: true, maxlength: 1000, default: '' },
  instructions: { type: String, trim: true, maxlength: 4000, default: '' },
  // Extra questions asked only on follow-up calls (appended to the agent questionnaire).
  questions: { type: [draftQuestionSchema], default: [] },
  // Calling window, attempts per follow-up, retry delay and concurrency for follow-up calls.
  schedule: { type: scheduleSchema, default: () => ({ maxAttemptsPerLead: 2, retryDelayMinutes: 30, minMinutesBetweenAttempts: 15 }) },
  maxRounds: { type: Number, min: 1, max: 10, default: 3 },
  minHoursBetweenRounds: { type: Number, min: 0, max: 720, default: 0 },
  defaultCallbackDelayMinutes: { type: Number, min: 5, max: 10080, default: 120 },
  unavailableRetryHours: { type: Number, min: 1, max: 720, default: 24 },
  incompleteRetryHours: { type: Number, min: 1, max: 720, default: 24 },
  informationRetryHours: { type: Number, min: 1, max: 720, default: 48 },
  needsTimeRetryDays: { type: Number, min: 1, max: 60, default: 3 },
  eligibleLeadStatuses: { type: [String], default: [] }, // empty = any status
  stopLeadStatuses: { type: [String], default: () => ['converted', 'unqualified'] },
  // Sequential workflow: outcome → agent that takes the next conversation (QUALIFIED = hand-off on success).
  routes: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
  // Ordered routing rules on lead/call facts (engine/followUpRouting.js); first match wins over routes.
  routingRules: { type: [mongoose.Schema.Types.Mixed], default: [] },
  // Who is told (and who takes over) when a follow-up needs a person. Empty userIds → the
  // organisation default (AiCallingSettings.followUpAutomation.escalationUserIds) → the owner.
  escalation: {
    userIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    assignTo: { type: String, enum: ['owner', 'first_recipient'], default: 'owner' },
    email: { type: Boolean, default: false },
  },
  escalateToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // legacy single recipient
}, { _id: false, minimize: false });

// Reusable configuration only. Each execution still belongs to CallCampaign.
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  title: { type: String, trim: true, maxlength: 160, default: '' },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  availability: { type: String, enum: ['draft', 'active', 'paused', 'archived'], default: 'draft' },
  // What the agent is for: outbound campaigns, answering incoming calls, or both.
  usage: { type: String, enum: ['outbound', 'inbound', 'both'], default: 'outbound' },
  // Business role template (engine/agentTypes.js). Several agents may share a type.
  agentType: { type: String, enum: AGENT_TYPES, default: 'custom' },
  followUp: { type: followUpSchema, default: () => ({}) },
  avatarPresetId: { type: String, enum: [...agentAvatarPresetIds, null], default: null },
  avatarFileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
  agentConfig: { type: agentConfigSchema, default: () => ({}) },
  questionnaire: { questions: { type: [draftQuestionSchema], default: [] } },
  statusRules: { type: [statusRuleSchema], default: [] },
  schedule: { type: scheduleSchema, default: () => ({}) },
  transport: { type: String, enum: ['cloud_sip', 'paired_phone'], default: 'cloud_sip' },
  pairedDeviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'PairedDevice', default: null },
  assignedLeadIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  // Approved knowledge the agent speaks from (knowledge.service.js) and its human transfer setup (humanTransfer.service.js).
  knowledge: {
    mode: { type: String, enum: ['latest', 'pinned', 'none'], default: 'latest' },
    versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'KnowledgeVersion', default: null },
  },
  transfer: {
    enabled: { type: Boolean, default: false },
    targetUserIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    timeoutSeconds: { type: Number, default: 30 },
    allowPhoneTransfer: { type: Boolean, default: true },
  },
  // Incoming calls (inboundCalling module): how this agent behaves as the receptionist.
  inbound: {
    greeting: { type: String, trim: true, maxlength: 500, default: '' },
    instructions: { type: String, trim: true, maxlength: 4000, default: '' },
    escalationInstructions: { type: String, trim: true, maxlength: 1000, default: '' },
    // Routing after an incoming call: who works it, and which work status each result gets.
    assignToUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignOverridesLeadOwner: { type: Boolean, default: false },
    statusByResult: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
    // Asked before goodbye (inboundCalling/engine/closingQuestions.js): contact details + custom questions.
    closingQuestions: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  version: { type: Number, default: 1 },
  launchLeaseUntil: { type: Date, default: null },
  launchLeaseToken: { type: String, default: null, select: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });
schema.index({ createdBy: 1, availability: 1, updatedAt: -1 });
export default mongoose.model('CallingAgent', schema);
