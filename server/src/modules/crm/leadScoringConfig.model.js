import mongoose from 'mongoose';

/**
 * LeadScoringConfig — one immutable document per scoring-config version.
 * The highest version is the active one; older versions stay so every stored
 * lead.score.version can be traced back to the exact weights and rules that
 * produced it. Content is validated by leadScoring.validation.js and merged onto
 * the engine defaults (leadScoring.engine.normalizeScoringConfig) when read.
 */
const leadScoringConfigSchema = new mongoose.Schema(
  {
    version: { type: Number, required: true, min: 2 },
    bands: { type: mongoose.Schema.Types.Mixed, required: true },
    minEvidence: { type: Number, min: 0, max: 20, required: true },
    targetBusinessTypes: { type: [String], default: [] },
    targetCities: { type: [String], default: [] },
    factors: { type: mongoose.Schema.Types.Mixed, required: true },
    rules: { type: mongoose.Schema.Types.Mixed, required: true },
    note: { type: String, trim: true, maxlength: 500, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Bulk recompute triggered by this version (lead-scoring queue).
    recompute: {
      status: { type: String, enum: ['idle', 'queued', 'running', 'done', 'failed'], default: 'idle' },
      processed: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      startedAt: { type: Date, default: null },
      finishedAt: { type: Date, default: null },
      error: { type: String, maxlength: 500, default: null },
    },
  },
  { timestamps: true, minimize: false },
);

leadScoringConfigSchema.index({ version: -1 }, { unique: true });

const LeadScoringConfig = mongoose.models.LeadScoringConfig
  || mongoose.model('LeadScoringConfig', leadScoringConfigSchema);
export default LeadScoringConfig;
