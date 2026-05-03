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
    enum: ['LEAD_CREATION', 'INVOICE_GENERATION', 'TASK_AUTOMATION', 'NOTIFICATION', 'GENERAL'],
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
  idempotencyKey: { type: String, unique: true, sparse: true },
  correlationId: String,
  voiceSessionId: { type: Schema.Types.ObjectId, ref: 'VoiceSession' },
  metadata: {
    ipAddress: String,
    userAgent: String,
  },
  completedAt: Date,
  failedAt: Date,
  cancelledAt: Date,
}, { timestamps: true });

AgentRunSchema.index({ userId: 1, createdAt: -1 });
AgentRunSchema.index({ status: 1, createdAt: -1 });
AgentRunSchema.index({ voiceSessionId: 1 }, { sparse: true });
AgentRunSchema.index({ correlationId: 1 }, { sparse: true });

export default mongoose.model('AgentRun', AgentRunSchema);
