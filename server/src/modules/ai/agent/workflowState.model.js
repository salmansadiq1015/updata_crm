import mongoose from 'mongoose';

const { Schema } = mongoose;

const WorkflowStateSchema = new Schema({
  agentRunId: { type: Schema.Types.ObjectId, ref: 'AgentRun', required: true, unique: true },
  workflowType: { type: String, required: true },
  currentNode: { type: String, required: true },
  state: { type: Schema.Types.Mixed, required: true },
  stepCount: { type: Number, default: 0 },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 10 * 60 * 1000) },
}, { timestamps: true });

WorkflowStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('WorkflowState', WorkflowStateSchema);
