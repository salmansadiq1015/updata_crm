import mongoose from 'mongoose';
import {
  ERROR_TYPES,
  ISSUE_SEVERITIES,
  MIGRATION_DOMAINS,
  SOURCE_SYSTEMS,
} from './migration.constants.js';

const migrationErrorSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', required: true, index: true },
    domain: { type: String, enum: MIGRATION_DOMAINS, required: true },
    severity: { type: String, enum: ISSUE_SEVERITIES, required: true, index: true },
    sourceSystem: { type: String, enum: SOURCE_SYSTEMS, required: true },
    sourceId: { type: String, required: true, maxlength: 150 },
    sourceTable: { type: String, maxlength: 150, default: null },
    errorType: { type: String, enum: ERROR_TYPES, default: 'unknown', index: true },
    errorField: { type: String, maxlength: 150, default: null },
    errorMessage: { type: String, required: true, maxlength: 2000 },
    sourceValue: { type: String, maxlength: 2000, default: null },
    suggestedFix: { type: String, maxlength: 2000, default: null },
    resolutionStatus: {
      type: String,
      enum: ['open', 'fixed', 'accepted', 'skipped'],
      default: 'open',
      index: true,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

migrationErrorSchema.index({ runId: 1, domain: 1, severity: 1 });
migrationErrorSchema.index({ runId: 1, errorType: 1 });
migrationErrorSchema.index({ sourceSystem: 1, sourceId: 1 });

const MigrationError = mongoose.model('MigrationError', migrationErrorSchema);
export default MigrationError;
