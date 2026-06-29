import mongoose from 'mongoose';

export const FX_REVALUATION_STATUSES = ['POSTING', 'POSTED', 'FAILED'];
export const FX_REVALUATION_SOURCE_TYPES = ['AR_INVOICE', 'AP_BILL'];

const fxRevaluationLineSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: FX_REVALUATION_SOURCE_TYPES,
      required: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    sourceNumber: {
      type: String,
      trim: true,
      maxlength: 80,
      required: true,
    },
    partyName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
    },
    sourceCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      required: true,
    },
    sourceAmount: {
      type: Number,
      required: true,
    },
    originalRate: {
      type: Number,
      required: true,
    },
    currentRate: {
      type: Number,
      required: true,
    },
    bookedBaseAmount: {
      type: Number,
      required: true,
    },
    currentBaseAmount: {
      type: Number,
      required: true,
    },
    gainLoss: {
      type: Number,
      required: true,
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
    },
  },
  { _id: true },
);

const fxRevaluationRunSchema = new mongoose.Schema(
  {
    runNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    revaluationDate: {
      type: Date,
      required: true,
      index: true,
    },
    baseCurrency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
      required: true,
    },
    status: {
      type: String,
      enum: FX_REVALUATION_STATUSES,
      default: 'POSTING',
      required: true,
      index: true,
    },
    sourceTypes: {
      type: [String],
      enum: FX_REVALUATION_SOURCE_TYPES,
      default: FX_REVALUATION_SOURCE_TYPES,
    },
    lines: {
      type: [fxRevaluationLineSchema],
      default: [],
    },
    totalGain: {
      type: Number,
      default: 0,
    },
    totalLoss: {
      type: Number,
      default: 0,
    },
    netGainLoss: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
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

fxRevaluationRunSchema.index({ baseCurrency: 1, revaluationDate: -1 });
fxRevaluationRunSchema.index({ status: 1, revaluationDate: -1 });

const FxRevaluationRun = mongoose.model('FxRevaluationRun', fxRevaluationRunSchema);
export default FxRevaluationRun;
