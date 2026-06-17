import mongoose from 'mongoose';

export const CATALOG_SYNC_MODES = ['MANUAL', 'SCHEDULED', 'FULL', 'DELTA'];
export const CATALOG_SYNC_LOG_STATUSES = ['RUNNING', 'COMPLETED', 'FAILED'];

const catalogSyncLogSchema = new mongoose.Schema(
  {
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogConnection', required: true, index: true },
    mode: { type: String, enum: CATALOG_SYNC_MODES, default: 'MANUAL' },
    status: { type: String, enum: CATALOG_SYNC_LOG_STATUSES, default: 'RUNNING', index: true },
    parsed: { type: Number, default: 0 },
    created: { type: Number, default: 0 },
    updated: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 },
    discontinued: { type: Number, default: 0 },
    errors: { type: Number, default: 0 },
    rowErrors: [{
      row: { type: Number, default: null },
      articleNumber: { type: String, default: '' },
      message: { type: String, maxlength: 1000, default: '' },
    }],
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

catalogSyncLogSchema.index({ connectionId: 1, createdAt: -1 });

const CatalogSyncLog = mongoose.model('CatalogSyncLog', catalogSyncLogSchema);
export default CatalogSyncLog;
