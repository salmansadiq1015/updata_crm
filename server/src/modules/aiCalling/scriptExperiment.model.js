import mongoose from 'mongoose';
import { agentConfigSchema, questionSchema, statusRuleSchema } from './callCampaign.model.js';

// Snapshots may hold draft questions (label/text not yet filled), like CallingAgent.
const snapshotQuestionSchema = questionSchema.clone();
snapshotQuestionSchema.path('label').required(false);
snapshotQuestionSchema.path('text').required(false);

/**
 * Agent script versioning and experiments.
 *
 * AgentScriptVersion — an immutable snapshot of a calling agent's script (agentConfig:
 *   prompt/objective/style/disclosure/voice/language, questionnaire, status rules).
 * ScriptActivation — append-only log of which version is live on an agent; the latest
 *   entry is the active version, the one before it is what a rollback restores.
 * ScriptExperiment — control vs variant arms with a traffic split, campaign eligibility,
 *   guardrails and lifecycle (draft → running ⇄ paused → completed).
 */

const versionSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallingAgent', required: true },
  number: { type: Number, required: true },
  label: { type: String, trim: true, maxlength: 160, default: '' },
  note: { type: String, trim: true, maxlength: 2000, default: '' },
  source: { type: String, enum: ['agent', 'variant'], default: 'agent' },
  basedOnVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentScriptVersion', default: null },
  snapshot: {
    agentConfig: { type: agentConfigSchema, default: () => ({}) },
    questionnaire: { questions: { type: [snapshotQuestionSchema], default: [] } },
    statusRules: { type: [statusRuleSchema], default: [] },
  },
  contentHash: { type: String, required: true, maxlength: 64 },
  agentConfigHash: { type: String, required: true, maxlength: 64 },
  questionnaireHash: { type: String, required: true, maxlength: 64 },
  sourceAgentVersion: { type: Number, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true, minimize: false });
versionSchema.index({ agentId: 1, number: 1 }, { unique: true });
versionSchema.index({ agentId: 1, contentHash: 1 });
// Immutable: a version is evidence of what ran. Corrections are new versions.
versionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function immutable() {
  throw new Error('Agent script versions are immutable');
});

const activationSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallingAgent', required: true },
  versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentScriptVersion', required: true },
  previousVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentScriptVersion', default: null },
  action: { type: String, enum: ['snapshot', 'promote', 'rollback'], required: true },
  experimentId: { type: mongoose.Schema.Types.ObjectId, ref: 'ScriptExperiment', default: null },
  campaignsUpdated: { type: Number, default: 0 },
  reason: { type: String, trim: true, maxlength: 500, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });
activationSchema.index({ agentId: 1, createdAt: -1 });

export const EXPERIMENT_STATUSES = ['draft', 'running', 'paused', 'completed'];

const armSchema = new mongoose.Schema({
  key: { type: String, required: true, maxlength: 40 }, // 'control' | 'variant_1' …
  versionId: { type: mongoose.Schema.Types.ObjectId, ref: 'AgentScriptVersion', required: true },
  weight: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

const guardrailSchema = new mongoose.Schema({
  minCallsPerArm: { type: Number, default: 30, min: 5, max: 10000 },
  maxFailureRateIncrease: { type: Number, default: 0.1, min: 0, max: 1 },
  maxOptOutRateIncrease: { type: Number, default: 0.05, min: 0, max: 1 },
  maxMissingTranscriptRateIncrease: { type: Number, default: 0.1, min: 0, max: 1 },
  maxAudioFailureRateIncrease: { type: Number, default: 0.1, min: 0, max: 1 },
  maxP95LatencyIncreaseMs: { type: Number, default: 750, min: 0, max: 60000 },
}, { _id: false });

const experimentSchema = new mongoose.Schema({
  agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CallingAgent', required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  hypothesis: { type: String, trim: true, maxlength: 2000, default: '' },
  status: { type: String, enum: EXPERIMENT_STATUSES, default: 'draft' },
  arms: { type: [armSchema], default: [] },
  // Empty → every campaign of the agent is eligible.
  campaignIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  guardrails: { type: guardrailSchema, default: () => ({}) },
  guardrailStatus: {
    checkedAt: { type: Date, default: null },
    state: { type: String, enum: ['not_checked', 'ok', 'insufficient_data', 'breached'], default: 'not_checked' },
  },
  guardrailEvents: {
    type: [new mongoose.Schema({
      at: { type: Date, default: Date.now },
      arm: { type: String, maxlength: 40 },
      metric: { type: String, maxlength: 60 },
      controlValue: { type: Number, default: null },
      variantValue: { type: Number, default: null },
      threshold: { type: Number, default: null },
      controlCalls: { type: Number, default: null },
      variantCalls: { type: Number, default: null },
    }, { _id: false })],
    default: [],
  },
  startedAt: { type: Date, default: null },
  pausedAt: { type: Date, default: null },
  pausedReason: { type: String, enum: ['manual', 'guardrail', 'rollback', null], default: null },
  completedAt: { type: Date, default: null },
  promotedArm: { type: String, maxlength: 40, default: null },
  version: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, minimize: false });
experimentSchema.index({ createdBy: 1, agentId: 1, createdAt: -1 });
// At most one running experiment per agent: two would fight over the same leads.
experimentSchema.index({ agentId: 1 }, { unique: true, partialFilterExpression: { status: 'running' }, name: 'one_running_experiment_per_agent' });

export const AgentScriptVersion = mongoose.model('AgentScriptVersion', versionSchema);
export const ScriptActivation = mongoose.model('ScriptActivation', activationSchema);
export const ScriptExperiment = mongoose.model('ScriptExperiment', experimentSchema);
export default { AgentScriptVersion, ScriptActivation, ScriptExperiment };
