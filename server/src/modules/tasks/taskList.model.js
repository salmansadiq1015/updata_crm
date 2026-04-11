import mongoose from 'mongoose';

export const TASK_LIST_TYPES = ['PERSONAL', 'GROUP'];

const taskListSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: TASK_LIST_TYPES, required: true, default: 'PERSONAL' },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    color: { type: String, trim: true, maxlength: 7, default: null },
    icon: { type: String, trim: true, maxlength: 50, default: null },
    sortOrder: { type: Number, default: 0 },
    isDefault: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

taskListSchema.index({ ownerId: 1, isDeleted: 1 });
taskListSchema.index({ type: 1 });
taskListSchema.index({ isArchived: 1 });
taskListSchema.index({ ownerId: 1, isDefault: 1 }, { unique: true, partialFilterExpression: { isDefault: true, isDeleted: false } });

taskListSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const TaskList = mongoose.model('TaskList', taskListSchema);
export default TaskList;
