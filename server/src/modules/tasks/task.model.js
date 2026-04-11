import mongoose from 'mongoose';

export const TASK_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
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
    dueDate: { type: Date, default: null },
    sortOrder: { type: Number, default: 0 },
    depth: { type: Number, default: 0, min: 0, max: MAX_SUBTASK_DEPTH },
    completedAt: { type: Date, default: null },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledAt: { type: Date, default: null },
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
taskSchema.index({ dueDate: 1 });
taskSchema.index({ projectId: 1 }, { sparse: true });
taskSchema.index({ orderId: 1 }, { sparse: true });
taskSchema.index({ parentTaskId: 1 }, { sparse: true });
taskSchema.index({ updatedAt: 1 }); // For sync queries
taskSchema.index({ title: 'text' }); // Full-text search
taskSchema.index({ createdBy: 1, isDeleted: 1 });

// Validation: projectId and orderId are mutually exclusive
taskSchema.pre('validate', function (next) {
  if (this.projectId && this.orderId) {
    return next(new Error('Task cannot be linked to both a project and an order'));
  }
  next();
});

// Soft delete filter
taskSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Task = mongoose.model('Task', taskSchema);
export default Task;
