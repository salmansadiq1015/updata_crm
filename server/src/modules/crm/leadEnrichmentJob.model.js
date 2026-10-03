import mongoose from 'mongoose';

/**
 * Lead enrichment job — tracks a bulk website-enrichment run (enrich selected
 * leads) with status, counts and a log. Mirrors
 * businessDiscovery/leadImportJob.model.js. Single-tenant (createdBy),
 * soft-deletable. The per-lead fan-out (bounded concurrency) happens inside the
 * lead-enrichment worker; this document is the observable progress record.
 */

export const LEAD_ENRICHMENT_JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
});

const leadEnrichmentJobSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    leadIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'Lead',
      default: [],
    },
    status: {
      type: String,
      enum: Object.values(LEAD_ENRICHMENT_JOB_STATUS),
      default: LEAD_ENRICHMENT_JOB_STATUS.QUEUED,
    },
    counts: {
      total: { type: Number, default: 0 },
      processed: { type: Number, default: 0 },
      enriched: { type: Number, default: 0 }, // at least one missing field filled
      skipped: { type: Number, default: 0 }, // robots disallow / nothing to apply
      failed: { type: Number, default: 0 }, // dead site / fetch failure
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
leadEnrichmentJobSchema.index({ createdBy: 1, createdAt: -1 }); // scoped history list
leadEnrichmentJobSchema.index({ status: 1 }); // worker / stale scans

// --- Soft-delete pre-hook ---
leadEnrichmentJobSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const LeadEnrichmentJob = mongoose.model('LeadEnrichmentJob', leadEnrichmentJobSchema);
export default LeadEnrichmentJob;
