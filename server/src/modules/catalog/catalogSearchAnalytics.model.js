import mongoose from 'mongoose';

const catalogSearchAnalyticsSchema = new mongoose.Schema(
  {
    query: { type: String, required: true, trim: true, maxlength: 200 },
    queryNormalized: { type: String, required: true, trim: true, maxlength: 200 },
    filtersHash: { type: String, default: null, index: true },
    resultCount: { type: Number, default: 0, min: 0 },
    surface: { type: String, default: 'articles', maxlength: 50 },
    userHash: { type: String, default: null, index: true },
    ipHash: { type: String, default: null },
    userAgentHash: { type: String, default: null },
  },
  { timestamps: true },
);

catalogSearchAnalyticsSchema.index({ queryNormalized: 1, createdAt: -1 });
catalogSearchAnalyticsSchema.index({ surface: 1, createdAt: -1 });

const CatalogSearchAnalytics = mongoose.model('CatalogSearchAnalytics', catalogSearchAnalyticsSchema);
export default CatalogSearchAnalytics;
