import mongoose from 'mongoose';

const ALLOWED_MIME_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
];
const MAX_FILE_SIZE = 26214400; // 25 MB

const taskAttachmentSchema = new mongoose.Schema(
  {
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
    fileName: { type: String, required: true, trim: true },
    fileSize: { type: Number, required: true, max: MAX_FILE_SIZE },
    mimeType: { type: String, required: true },
    storagePath: { type: String, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

taskAttachmentSchema.index({ taskId: 1, isDeleted: 1 });

taskAttachmentSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

export { ALLOWED_MIME_TYPES, MAX_FILE_SIZE };
const TaskAttachment = mongoose.model('TaskAttachment', taskAttachmentSchema);
export default TaskAttachment;
