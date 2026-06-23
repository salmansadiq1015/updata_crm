import mongoose from 'mongoose';

export const IGH_JOB_TYPES = Object.freeze({
  FULL: 'FULL',
  DELTA: 'DELTA',
});

export const IGH_JOB_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  PREVIEW: 'PREVIEW',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

/**
 * IGH import job — tracks each import run with counts, status, and log.
 */
const ighImportJobSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: Object.values(IGH_JOB_TYPES),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(IGH_JOB_STATUSES),
      default: IGH_JOB_STATUSES.PENDING,
    },
    articlesCreated: {
      type: Number,
      default: 0,
    },
    articlesUpdated: {
      type: Number,
      default: 0,
    },
    articlesSkipped: {
      type: Number,
      default: 0,
    },
    articlesDeactivated: {
      type: Number,
      default: 0,
    },
    errorsCount: {
      type: Number,
      default: 0,
    },
    previewData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    sourceChecksum: {
      type: String,
      maxlength: 128,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    log: {
      type: String,
      maxlength: 100000,
      default: '',
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
ighImportJobSchema.index({ status: 1 });
ighImportJobSchema.index({ createdAt: -1 });

const IghImportJob = mongoose.model('IghImportJob', ighImportJobSchema);
export default IghImportJob;
