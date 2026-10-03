import mongoose from 'mongoose';

/**
 * Lead import job — tracks a bulk "Add to CRM" run (Add All New / Add Selected)
 * with counts, status and a log, mirroring catalog/ighImportJob.model.js
 * (§4.4 of LEAD_GENERATION_DESIGN.md). Single-tenant (createdBy), soft-deletable.
 */

export const LEAD_IMPORT_MODE = Object.freeze({
  NEW: 'new',
  SKIP: 'skip',
  UPDATE: 'update',
});

export const LEAD_IMPORT_SELECTION_KIND = Object.freeze({
  ALL_NEW: 'ALL_NEW',
  SELECTED: 'SELECTED',
});

export const LEAD_IMPORT_JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const leadImportJobSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    discoverySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DiscoverySession',
      default: null,
    },
    mode: {
      type: String,
      enum: Object.values(LEAD_IMPORT_MODE),
      default: LEAD_IMPORT_MODE.NEW,
    },
    selection: {
      kind: {
        type: String,
        enum: Object.values(LEAD_IMPORT_SELECTION_KIND),
        default: LEAD_IMPORT_SELECTION_KIND.ALL_NEW,
      },
      resultIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    },
    status: {
      type: String,
      enum: Object.values(LEAD_IMPORT_JOB_STATUS),
      default: LEAD_IMPORT_JOB_STATUS.QUEUED,
    },
    counts: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      created: { type: Number, default: 0 },
      existing: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
    log: {
      type: String,
      maxlength: 100000,
      default: '',
    },
    error: {
      code: { type: String, default: null },
      message: { type: String, default: null },
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
leadImportJobSchema.index({ createdBy: 1, createdAt: -1 }); // scoped history list
leadImportJobSchema.index({ status: 1 }); // worker / stale scans
leadImportJobSchema.index({ discoverySessionId: 1 }); // jobs for a session

// --- Soft-delete pre-hook ---
leadImportJobSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const LeadImportJob = mongoose.model('LeadImportJob', leadImportJobSchema);
export default LeadImportJob;
