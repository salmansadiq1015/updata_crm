import mongoose from 'mongoose';

const fixedAssetDepreciationEntrySchema = new mongoose.Schema(
  {
    assetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FixedAsset',
      required: true,
      index: true,
    },
    assetNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    periodDate: {
      type: Date,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    accumulatedDepreciationAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    bookValueAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
      index: true,
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
    },
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

fixedAssetDepreciationEntrySchema.index(
  { assetId: 1, periodDate: 1 },
  { unique: true },
);
fixedAssetDepreciationEntrySchema.index({ periodDate: -1, currency: 1 });

fixedAssetDepreciationEntrySchema.pre('validate', function normalizeDepreciationEntry(next) {
  if (this.assetNumber) this.assetNumber = String(this.assetNumber).trim().toUpperCase();
  if (this.currency) this.currency = String(this.currency).trim().toUpperCase();
  next();
});

const FixedAssetDepreciationEntry = mongoose.model(
  'FixedAssetDepreciationEntry',
  fixedAssetDepreciationEntrySchema,
);
export default FixedAssetDepreciationEntry;
