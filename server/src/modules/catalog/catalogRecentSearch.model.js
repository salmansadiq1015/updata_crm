import mongoose from 'mongoose';

const catalogRecentSearchSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    query: { type: String, required: true, trim: true, maxlength: 200 },
    queryNormalized: { type: String, required: true, trim: true, maxlength: 200 },
    filters: { type: mongoose.Schema.Types.Mixed, default: {} },
    filtersHash: { type: String, default: null },
    surface: { type: String, default: 'articles', maxlength: 50 },
    useCount: { type: Number, default: 0, min: 0 },
    lastUsedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

catalogRecentSearchSchema.index({ userId: 1, queryNormalized: 1, filtersHash: 1 }, { unique: true });
catalogRecentSearchSchema.index({ userId: 1, lastUsedAt: -1 });

const CatalogRecentSearch = mongoose.model('CatalogRecentSearch', catalogRecentSearchSchema);
export default CatalogRecentSearch;
