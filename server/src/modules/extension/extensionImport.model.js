import mongoose from 'mongoose';

/**
 * ExtensionImport — a CRM-side record of one bulk import that originated from
 * the Lead Finder extension (§ "CRM-side import status"). The extension sends
 * leads in batches of 25; every batch carries the same client-generated
 * `importId`, so this one document accumulates the whole run's progress and
 * gives the CRM web page a live + historical view of extension imports.
 *
 * Single-tenant: scoped by `createdBy` (there is no organizationId). It does not
 * duplicate the Lead data — leads live in the `leads` collection — it only
 * tracks the import's counts/status.
 */

export const EXTENSION_IMPORT_STATUS = Object.freeze({
  RUNNING: 'running',
  COMPLETED: 'completed',
  PARTIAL: 'partial', // finished with some failures
  FAILED: 'failed',
});

const extensionImportSchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    // Client-generated correlation id shared by every batch of one import run.
    importId: { type: String, required: true, trim: true, maxlength: 128 },
    source: { type: String, default: 'extension', trim: true, maxlength: 40 },
    total: { type: Number, default: 0, min: 0 },
    processed: { type: Number, default: 0, min: 0 },
    created: { type: Number, default: 0, min: 0 },
    existing: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: Object.values(EXTENSION_IMPORT_STATUS),
      default: EXTENSION_IMPORT_STATUS.RUNNING,
      index: true,
    },
    errorSummary: { type: String, default: null, maxlength: 1000 },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    lastBatchAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// One record per import run, per user.
extensionImportSchema.index({ createdBy: 1, importId: 1 }, { unique: true });
// Recent-imports listing for the CRM web page.
extensionImportSchema.index({ createdBy: 1, startedAt: -1 });

const ExtensionImport = mongoose.model('ExtensionImport', extensionImportSchema);

export default ExtensionImport;
