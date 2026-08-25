import mongoose from 'mongoose';

const { Schema } = mongoose;

const StepSchema = new Schema({
  stepIndex: { type: Number, required: true },
  node: { type: String, required: true },
  type: { type: String, enum: ['REASONING', 'TOOL_CALL', 'TRANSITION', 'ERROR'], required: true },
  toolName: String,
  toolInput: Schema.Types.Mixed,
  toolOutput: Schema.Types.Mixed,
  reasoning: String,
  durationMs: Number,
  timestamp: { type: Date, default: Date.now },
}, { _id: false });

const AgentRunSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  workflowType: {
    type: String,
    enum: ['LEAD_CREATION', 'INVOICE_GENERATION', 'TASK_AUTOMATION', 'NOTIFICATION', 'FIELD_SERVICE_AGENT', 'GENERAL'],
    required: true,
  },
  status: {
    type: String,
    enum: ['PENDING', 'RUNNING', 'AWAITING_CONFIRMATION', 'COMPLETED', 'FAILED', 'CANCELLED'],
    default: 'PENDING',
  },
  input: { type: Schema.Types.Mixed },
  steps: [StepSchema],
  output: { type: Schema.Types.Mixed },
  error: {
    message: String,
    code: String,
    node: String,
    retryCount: Number,
  },
  threadId: { type: String, index: true },
  idempotencyKey: { type: String },
  correlationId: String,
  voiceSessionId: { type: Schema.Types.ObjectId, ref: 'VoiceSession' },
  metadata: {
    ipAddress: String,
    userAgent: String,
  },
  /**
   * What produced this answer (C2 "Versioning").
   *
   * The question somebody asks months later is never "which agent ran" but
   * "why did it say that" — and the answer needs the model, the provider, the
   * agent version, and whether the planner or the fallback heuristics decided.
   * Recorded when the run is dispatched, so it survives a later config change.
   */
  provenance: {
    agentVersion: String,
    action: String,
    model: String,
    provider: String,
    plannedBy: { type: String, enum: ['llm', 'heuristic', 'follow-up'] },
  },
  /**
   * A person's correction of what the agent proposed (C2 "Override").
   *
   * The office approves with changes rather than re-dictating the whole
   * request; what they changed is kept beside what the agent had suggested,
   * so a wrong proposal stays visible next to the corrected one.
   */
  override: {
    by: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    at: { type: Date, default: null },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
  },
  archived:    { type: Boolean, default: false },
  completedAt: Date,
  failedAt: Date,
  cancelledAt: Date,
}, { timestamps: true });

AgentRunSchema.index({ userId: 1, createdAt: -1 });
AgentRunSchema.index({ status: 1, createdAt: -1 });
AgentRunSchema.index({ voiceSessionId: 1 }, { sparse: true });
AgentRunSchema.index({ correlationId: 1 }, { sparse: true });
AgentRunSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
AgentRunSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model('AgentRun', AgentRunSchema);
