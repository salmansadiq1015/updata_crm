import mongoose from 'mongoose';

export const FIXED_ASSET_STATUSES = ['DRAFT', 'ACTIVE', 'FULLY_DEPRECIATED', 'DISPOSED'];
export const FIXED_ASSET_METHODS = ['STRAIGHT_LINE'];

const fixedAssetSchema = new mongoose.Schema(
  {
    assetNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 120,
      default: 'Equipment',
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    acquisitionDate: {
      type: Date,
      required: true,
      index: true,
    },
    placedInServiceDate: {
      type: Date,
      default: null,
      index: true,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
      required: true,
      index: true,
    },
    acquisitionCost: {
      type: Number,
      required: true,
      min: 0.01,
    },
    salvageValue: {
      type: Number,
      min: 0,
      default: 0,
    },
    usefulLifeMonths: {
      type: Number,
      required: true,
      min: 1,
    },
    depreciationMethod: {
      type: String,
      enum: FIXED_ASSET_METHODS,
      default: 'STRAIGHT_LINE',
      required: true,
    },
    accumulatedDepreciation: {
      type: Number,
      min: 0,
      default: 0,
    },
    bookValue: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastDepreciationDate: {
      type: Date,
      default: null,
    },
    assetAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    accumulatedDepreciationAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    depreciationExpenseAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    disposalGainAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    disposalLossAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    status: {
      type: String,
      enum: FIXED_ASSET_STATUSES,
      default: 'DRAFT',
      required: true,
      index: true,
    },
    acquisitionJournalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
    },
    disposalDate: {
      type: Date,
      default: null,
    },
    disposalProceeds: {
      type: Number,
      min: 0,
      default: 0,
    },
    disposalGainLoss: {
      type: Number,
      default: 0,
    },
    disposalJournalEntryIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
    }],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

fixedAssetSchema.index({ status: 1, category: 1 });
fixedAssetSchema.index({ acquisitionDate: -1, assetNumber: 1 });

fixedAssetSchema.pre('validate', function normalizeFixedAsset(next) {
  if (this.assetNumber) this.assetNumber = String(this.assetNumber).trim().toUpperCase();
  if (this.currency) this.currency = String(this.currency).trim().toUpperCase();
  if (this.salvageValue > this.acquisitionCost) {
    this.invalidate('salvageValue', 'Salvage value cannot exceed acquisition cost');
  }
  if (this.bookValue === undefined || this.bookValue === null || this.isNew) {
    this.bookValue = Math.max(0, Number(this.acquisitionCost || 0) - Number(this.accumulatedDepreciation || 0));
  }
  next();
});

const FixedAsset = mongoose.model('FixedAsset', fixedAssetSchema);
export default FixedAsset;
