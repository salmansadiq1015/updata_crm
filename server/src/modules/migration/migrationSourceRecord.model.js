import mongoose from 'mongoose';
import {
  MIGRATION_DOMAINS,
  SOURCE_SYSTEMS,
} from './migration.constants.js';

const migrationSourceRecordSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', required: true, index: true },
    domain: { type: String, enum: MIGRATION_DOMAINS, required: true, index: true },
    sourceSystem: { type: String, enum: SOURCE_SYSTEMS, required: true },
    sourceTable: { type: String, required: true, maxlength: 150 },
    sourceId: { type: String, required: true, maxlength: 150 },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    payloadHash: { type: String, required: true, maxlength: 64 },
  },
  { timestamps: true },
);

migrationSourceRecordSchema.index(
  { runId: 1, domain: 1, sourceSystem: 1, sourceTable: 1, sourceId: 1 },
  { unique: true },
);

const MigrationSourceRecord = mongoose.model('MigrationSourceRecord', migrationSourceRecordSchema);
export default MigrationSourceRecord;
