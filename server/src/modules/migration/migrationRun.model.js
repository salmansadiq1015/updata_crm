import mongoose from 'mongoose';
import {
  DEFAULT_BATCH_SIZE,
  DEFAULT_ERROR_THRESHOLD_PERCENT,
  EXECUTABLE_DOMAINS,
  RUN_ENVIRONMENTS,
  RUN_STATUSES,
  RUN_TYPES,
} from './migration.constants.js';

const migrationRunSchema = new mongoose.Schema(
  {
    runType: { type: String, enum: RUN_TYPES, required: true },
    environment: { type: String, enum: RUN_ENVIRONMENTS, required: true },
    status: { type: String, enum: RUN_STATUSES, default: 'pending', index: true },
    sourceDataDate: { type: Date, required: true },
    domains: {
      type: [String],
      enum: EXECUTABLE_DOMAINS,
      default: EXECUTABLE_DOMAINS,
    },
    config: {
      errorThresholdPercent: { type: Number, min: 0, max: 100, default: DEFAULT_ERROR_THRESHOLD_PERCENT },
      batchSize: { type: Number, min: 1, max: 5000, default: DEFAULT_BATCH_SIZE },
      scopeFilter: { type: mongoose.Schema.Types.Mixed, default: {} },
      sourceDataRef: { type: String, maxlength: 500, default: null },
      rollbackBackupRef: { type: String, maxlength: 500, default: null },
    },
    preBackupRef: { type: String, maxlength: 500, default: null },
    notes: { type: String, maxlength: 5000, default: '' },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    rolledBackAt: { type: Date, default: null },
    failureReason: { type: String, maxlength: 2000, default: null },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

migrationRunSchema.index({ runType: 1, environment: 1, createdAt: -1 });
migrationRunSchema.index({ status: 1, createdAt: -1 });

const MigrationRun = mongoose.model('MigrationRun', migrationRunSchema);
export default MigrationRun;
