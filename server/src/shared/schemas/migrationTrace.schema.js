import mongoose from 'mongoose';

export const migrationTraceSchema = new mongoose.Schema(
  {
    sourceSystem: { type: String, enum: ['of', 'messerli', 'other'], default: null, index: true },
    sourceId: { type: String, maxlength: 150, default: null, index: true },
    runId: { type: mongoose.Schema.Types.ObjectId, ref: 'MigrationRun', default: null, index: true },
    migratedAt: { type: Date, default: null },
    isMigrated: { type: Boolean, default: false, index: true },
    isReadOnly: { type: Boolean, default: false },
    rolledBackAt: { type: Date, default: null },
    rolledBackBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

export default migrationTraceSchema;
