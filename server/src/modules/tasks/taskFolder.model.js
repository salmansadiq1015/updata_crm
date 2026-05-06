import mongoose from 'mongoose';

const taskFolderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    color: { type: String, trim: true, maxlength: 7, default: null },
    icon: { type: String, trim: true, maxlength: 50, default: null },
    sortOrder: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

taskFolderSchema.index({ ownerId: 1, isDeleted: 1 });
taskFolderSchema.index({ ownerId: 1, sortOrder: 1 });

taskFolderSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const TaskFolder = mongoose.model('TaskFolder', taskFolderSchema);
export default TaskFolder;
