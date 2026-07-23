import mongoose from 'mongoose';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
export const TASK_PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
export const MAX_SUBTASK_DEPTH = 3;

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 500 },
    description: { type: String, default: null },
    status: { type: String, enum: TASK_STATUSES, default: 'OPEN' },
    priority: { type: String, enum: TASK_PRIORITIES, default: 'NONE' },
    listId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaskList', required: true },
    assigneeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    parentTaskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    meetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null },
    startDate: { type: Date, default: null },
    dueDate: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    depth: { type: Number, default: 0, min: 0, max: MAX_SUBTASK_DEPTH },
    version: { type: Number, default: 0, min: 0 },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
    // Lock (Sperrfunktion): confidential/personal task that stays with its owner.
    // Locked tasks cannot be reassigned/claimed, never enter the overdue pool,
    // and are invisible to everyone except the owner (assignee/creator/lockedBy) and admins.
    locked: { type: Boolean, default: false },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lockedAt: { type: Date, default: null },
    // Overdue pool (Aufgabenpool): a task overdue past the configured working-day
    // threshold is flagged into a shared pool so colleagues can help. The task
    // stays with its assignee; poolHelperId records who stepped in to support.
    inPool: { type: Boolean, default: false },
    pooledAt: { type: Date, default: null },
    poolHelperId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// Indexes
taskSchema.index({ listId: 1, isDeleted: 1 });
taskSchema.index({ assigneeId: 1, isDeleted: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ startDate: 1 });
taskSchema.index({ dueDate: 1 });
taskSchema.index({ projectId: 1 }, { sparse: true });
taskSchema.index({ orderId: 1 }, { sparse: true });
taskSchema.index({ meetingId: 1 }, { sparse: true });
taskSchema.index({ parentTaskId: 1 }, { sparse: true });
taskSchema.index({ updatedAt: 1 }); // For sync queries
taskSchema.index({ listId: 1, status: 1, sortOrder: 1, isDeleted: 1 });
taskSchema.index({ assigneeId: 1, status: 1, dueDate: 1, isDeleted: 1 });
taskSchema.index({ projectId: 1, status: 1, sortOrder: 1 }, { sparse: true });
taskSchema.index({ createdBy: 1, isDeleted: 1 });
taskSchema.index({ inPool: 1, isDeleted: 1 });

// Validation: projectId and orderId are mutually exclusive
taskSchema.pre('validate', function () {
  if (this.projectId && this.orderId) {
    throw new Error('Task cannot be linked to both a project and an order');
  }
});

// Soft delete filter
taskSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Task = mongoose.model('Task', taskSchema);
export default Task;
