import mongoose from 'mongoose';

const projectStatusHistorySchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    fromStatus: {
      type: String,
      required: true,
    },
    toStatus: {
      type: String,
      required: true,
    },
    comment: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    isOverride: {
      type: Boolean,
      default: false,
    },
    overrideReason: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

// --- Indexes ---
projectStatusHistorySchema.index({ projectId: 1, changedAt: -1 });

const ProjectStatusHistory = mongoose.model('ProjectStatusHistory', projectStatusHistorySchema);
export default ProjectStatusHistory;
