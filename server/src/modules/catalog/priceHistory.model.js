import mongoose from 'mongoose';

/**
 * Price history — append-only ledger of price changes.
 * Every price mutation (single, bulk, rollback) creates a record here.
 */
const priceHistorySchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true,
    },
    batchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PriceUpdateBatch',
      default: null,
    },
    oldPrice: {
      type: Number,
      required: true,
    },
    newPrice: {
      type: Number,
      required: true,
    },
    effectiveDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
priceHistorySchema.index({ articleId: 1, effectiveDate: -1 });
priceHistorySchema.index({ batchId: 1 });

const PriceHistory = mongoose.model('PriceHistory', priceHistorySchema);
export default PriceHistory;
