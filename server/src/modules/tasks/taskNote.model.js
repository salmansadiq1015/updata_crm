import mongoose from 'mongoose';
import taskCache from './taskCache.js';

const taskNoteSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    bodyHtml: { type: String, required: true },
    isEdited: { type: Boolean, default: false },
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taskNoteSchema.index({ taskId: 1, isDeleted: 1 });
taskNoteSchema.index({ authorId: 1 });

taskNoteSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

// Note/attachment counts are part of the cached task detail.
taskCache.registerInvalidation(taskNoteSchema);

const TaskNote = mongoose.model('TaskNote', taskNoteSchema);
export default TaskNote;
