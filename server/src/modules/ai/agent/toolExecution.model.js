import mongoose from 'mongoose';

const { Schema } = mongoose;

const ToolExecutionSchema = new Schema({
  agentRunId: { type: Schema.Types.ObjectId, ref: 'AgentRun', required: true },
  toolName: { type: String, required: true },
  input: { type: Schema.Types.Mixed },
  output: { type: Schema.Types.Mixed },
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED', 'COMPENSATED'], default: 'PENDING' },
  errorMessage: String,
  retryCount: { type: Number, default: 0 },
  durationMs: Number,
  compensationAction: String,
  compensatedAt: Date,
}, { timestamps: true });

ToolExecutionSchema.index({ agentRunId: 1 });

export default mongoose.model('ToolExecution', ToolExecutionSchema);
