import mongoose from 'mongoose';
import {
  MIGRATION_DOMAINS,
  RECORD_ACTIONS,
  SOURCE_SYSTEMS,
} from './migration.constants.js';

const migrationRecordMapSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', required: true, index: true },
    domain: { type: String, enum: MIGRATION_DOMAINS, required: true, index: true },
    sourceSystem: { type: String, enum: SOURCE_SYSTEMS, required: true },
    sourceTable: { type: String, required: true, maxlength: 150 },
    sourceId: { type: String, required: true, maxlength: 150 },
    targetTable: { type: String, required: true, maxlength: 150, index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    action: { type: String, enum: RECORD_ACTIONS, required: true },
    previousRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', default: null },
    rolledBackAt: { type: Date, default: null },
  },
  { timestamps: true },
);

migrationRecordMapSchema.index(
  { sourceSystem: 1, sourceTable: 1, sourceId: 1, targetTable: 1 },
  { unique: true },
);
migrationRecordMapSchema.index({ runId: 1, domain: 1, targetTable: 1 });

const MigrationRecordMap = mongoose.model('MigrationRecordMap', migrationRecordMapSchema);
export default MigrationRecordMap;
