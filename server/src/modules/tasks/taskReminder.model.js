import mongoose from 'mongoose';

export const REMINDER_TYPES = ['RELATIVE', 'ABSOLUTE'];
export const REMINDER_CHANNELS = ['PUSH', 'IN_APP', 'EMAIL'];
export const REMINDER_STATUSES = ['PENDING', 'FIRED', 'SNOOZED', 'CANCELLED'];

const taskReminderSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: REMINDER_TYPES, required: true },
    offsetMinutes: { type: Number, default: null },
    fireAt: { type: Date, required: true },
    channels: [{ type: String, enum: REMINDER_CHANNELS }],
    status: { type: String, enum: REMINDER_STATUSES, default: 'PENDING' },
    snoozedUntil: { type: Date, default: null },
    firedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taskReminderSchema.index({ fireAt: 1, status: 1 });
taskReminderSchema.index({ taskId: 1 });
taskReminderSchema.index({ userId: 1, status: 1 });

const TaskReminder = mongoose.model('TaskReminder', taskReminderSchema);
export default TaskReminder;
