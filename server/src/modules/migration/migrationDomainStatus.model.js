import mongoose from 'mongoose';
import { DOMAIN_STATUSES, MIGRATION_DOMAINS } from './migration.constants.js';

const migrationDomainStatusSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', required: true, index: true },
    domain: { type: String, enum: MIGRATION_DOMAINS, required: true },
    status: { type: String, enum: DOMAIN_STATUSES, default: 'pending', index: true },
    totalSource: { type: Number, min: 0, default: 0 },
    processed: { type: Number, min: 0, default: 0 },
    migratedOk: { type: Number, min: 0, default: 0 },
    migratedWarning: { type: Number, min: 0, default: 0 },
    skipped: { type: Number, min: 0, default: 0 },
    failed: { type: Number, min: 0, default: 0 },
    deduplicationMerged: { type: Number, min: 0, default: 0 },
    errorRate: { type: Number, min: 0, default: 0 },
    processingRate: { type: Number, min: 0, default: 0 },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    failureReason: { type: String, maxlength: 2000, default: null },
  },
  { timestamps: true },
);

migrationDomainStatusSchema.index({ runId: 1, domain: 1 }, { unique: true });

const MigrationDomainStatus = mongoose.model('MigrationDomainStatus', migrationDomainStatusSchema);
export default MigrationDomainStatus;
