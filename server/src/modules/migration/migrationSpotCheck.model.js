import mongoose from 'mongoose';
import { MIGRATION_DOMAINS } from './migration.constants.js';

const spotCheckSampleSchema = new mongoose.Schema(
  {
    domain: { type: String, enum: MIGRATION_DOMAINS, required: true },
    sourceSystem: { type: String, required: true },
    sourceId: { type: String, required: true },
    targetTable: { type: String, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetUrl: { type: String, required: true },
    result: {
      type: String,
      enum: ['pending', 'ok', 'minor_discrepancy', 'critical_discrepancy'],
      default: 'pending',
    },
    notes: { type: String, maxlength: 2000, default: '' },
  },
  { _id: true },
);

const migrationSpotCheckSchema = new mongoose.Schema(
  {
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', required: true, index: true },
    sampleSizePerDomain: { type: Number, min: 1, max: 500, required: true },
    domains: { type: [String], enum: MIGRATION_DOMAINS, required: true },
    samples: { type: [spotCheckSampleSchema], default: [] },
    generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

migrationSpotCheckSchema.index({ runId: 1, createdAt: -1 });

const MigrationSpotCheck = mongoose.model('MigrationSpotCheck', migrationSpotCheckSchema);
export default MigrationSpotCheck;
