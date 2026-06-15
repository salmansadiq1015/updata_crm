import mongoose from 'mongoose';

export const BATCH_TYPES = Object.freeze({
  MANUAL: 'MANUAL',
  PERCENTAGE: 'PERCENTAGE',
  IMPORT: 'IMPORT',
  SCHEDULED: 'SCHEDULED',
});

export const BATCH_STATUSES = Object.freeze({
  PENDING: 'PENDING',
  APPLIED: 'APPLIED',
  ROLLED_BACK: 'ROLLED_BACK',
});

/**
 * Price update batch — groups bulk/percentage/scheduled price changes.
 * Tracks lifecycle from PENDING through APPLIED and optionally ROLLED_BACK.
 */
const priceUpdateBatchSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      maxlength: 500,
    },
    type: {
      type: String,
      enum: Object.values(BATCH_TYPES),
      required: true,
    },
    percentage: {
      type: Number,
      default: null,
    },
    updates: {
      type: [
        {
          articleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Article',
            required: true,
          },
          newPrice: {
            type: Number,
            required: true,
            min: 0,
          },
        },
      ],
      default: [],
    },
    filter: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    previewRows: {
      type: [
        {
          articleId: mongoose.Schema.Types.ObjectId,
          articleNumber: String,
          name: String,
          oldPrice: Number,
          newPrice: Number,
          delta: Number,
          deltaPercent: Number,
        },
      ],
      default: [],
    },
    effectiveDate: {
      type: Date,
      default: null,
    },
    rollbackUntil: {
      type: Date,
      default: null,
    },
    articleCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(BATCH_STATUSES),
      default: BATCH_STATUSES.PENDING,
    },
    scheduledDate: {
      type: Date,
      default: null,
    },
    appliedAt: {
      type: Date,
      default: null,
    },
    rolledBackAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
priceUpdateBatchSchema.index({ status: 1 });
priceUpdateBatchSchema.index({ scheduledDate: 1 });

const PriceUpdateBatch = mongoose.model('PriceUpdateBatch', priceUpdateBatchSchema);
export default PriceUpdateBatch;
