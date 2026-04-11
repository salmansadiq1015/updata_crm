import mongoose from 'mongoose';

export const SYNC_TYPES = ['full', 'delta', 'manual', 'scheduled', 'webhook'];
export const SYNC_STATUSES = ['running', 'completed', 'failed', 'cancelled'];

const integrationSyncLogSchema = new mongoose.Schema(
  {
    integrationKey: { type: String, required: true },
    syncType: { type: String, enum: SYNC_TYPES, required: true },
    status: { type: String, enum: SYNC_STATUSES, default: 'running' },
    recordsProcessed: { type: Number, default: 0 },
    recordsCreated: { type: Number, default: 0 },
    recordsUpdated: { type: Number, default: 0 },
    recordsSkipped: { type: Number, default: 0 },
    recordsDeleted: { type: Number, default: 0 },
    errorCount: { type: Number, default: 0 },
    errorDetails: { type: mongoose.Schema.Types.Mixed, default: [] },
    summary: { type: String, default: null },
    triggeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
    durationMs: { type: Number, default: null },
  },
  { timestamps: true },
);

integrationSyncLogSchema.index({ integrationKey: 1, createdAt: -1 });
integrationSyncLogSchema.index({ status: 1 });
integrationSyncLogSchema.index({ createdAt: -1 });

const IntegrationSyncLog = mongoose.model('IntegrationSyncLog', integrationSyncLogSchema);
export default IntegrationSyncLog;
