import mongoose from 'mongoose';

export const METRIC_FEATURES = ['STT', 'INTENT', 'ENTITY_EXTRACTION', 'ADDRESS_PARSING'];

const topCorrectionSchema = new mongoose.Schema({
  original: { type: String, required: true },
  correctedTo: { type: String, required: true },
  count: { type: Number, default: 1 },
}, { _id: false });

const accuracyMetricSchema = new mongoose.Schema(
  {
    period: { type: String, required: true, maxlength: 7 },
    feature: { type: String, enum: METRIC_FEATURES, required: true },
    language: { type: String, required: true, maxlength: 10 },
    totalInteractions: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    correctedCount: { type: Number, default: 0 },
    accuracyRate: { type: Number, min: 0, max: 1, default: 0 },
    topCorrections: [topCorrectionSchema],
  },
  { timestamps: true },
);

accuracyMetricSchema.index({ period: 1, feature: 1, language: 1 }, { unique: true });

const AccuracyMetric = mongoose.model('AccuracyMetric', accuracyMetricSchema);
export default AccuracyMetric;
