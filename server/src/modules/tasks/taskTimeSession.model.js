import mongoose from 'mongoose';

const schema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  taskTitle: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['RUNNING', 'PAUSED', 'STOPPED'], default: 'RUNNING', required: true },
  isActive: { type: Boolean, default: true, required: true },
  mode: { type: String, enum: ['TIMER', 'FOCUS'], default: 'TIMER' },
  targetMinutes: { type: Number, min: 5, max: 240, default: 25 },
  startedAt: { type: Date, required: true },
  segmentStartedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
  elapsedMs: { type: Number, default: 0, min: 0 },
  pauseCount: { type: Number, default: 0 },
  note: { type: String, maxlength: 1000, default: '' },
  stopReason: { type: String, enum: ['USER', 'TASK_CLOSED', 'TASK_DELETED'], default: null },
}, { timestamps: true });

// Paused sessions also reserve the slot. Enforced across tabs, devices and API workers.
schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { isActive: true }, name: 'one_active_task_timer_per_user' });
schema.index({ taskId: 1, startedAt: -1 });
schema.index({ userId: 1, startedAt: -1 });
export default mongoose.model('TaskTimeSession', schema);
