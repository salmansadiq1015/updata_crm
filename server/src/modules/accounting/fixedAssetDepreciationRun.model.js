import mongoose from 'mongoose';

export const FIXED_ASSET_DEPRECIATION_RUN_STATUSES = ['POSTED', 'FAILED'];

const fixedAssetDepreciationRunSchema = new mongoose.Schema(
  {
    periodDate: {
      type: Date,
      required: true,
      index: true,
    },
    assetCount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
      index: true,
    },
    status: {
      type: String,
      enum: FIXED_ASSET_DEPRECIATION_RUN_STATUSES,
      default: 'POSTED',
      required: true,
      index: true,
    },
    assetIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FixedAsset',
    }],
    entryIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FixedAssetDepreciationEntry',
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

fixedAssetDepreciationRunSchema.index({ periodDate: -1, currency: 1, status: 1 });

fixedAssetDepreciationRunSchema.pre('validate', function normalizeDepreciationRun(next) {
  if (this.currency) this.currency = String(this.currency).trim().toUpperCase();
  if (this.status) this.status = String(this.status).trim().toUpperCase();
  next();
});

const FixedAssetDepreciationRun = mongoose.model(
  'FixedAssetDepreciationRun',
  fixedAssetDepreciationRunSchema,
);
export default FixedAssetDepreciationRun;
