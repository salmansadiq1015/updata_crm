import mongoose from 'mongoose';

export const REFERENCE_TYPES = [
  'AR_INVOICE', 'AR_PAYMENT', 'AP_INVOICE', 'AP_PAYMENT',
  'BANK_FEE', 'MANUAL', 'REVERSAL', 'WRITE_OFF',
  'INVOICE_FINALIZED', 'INVOICE_PAYMENT',
  'AUTO_RECONCILIATION', 'MANUAL_RECONCILIATION', 'CATEGORIZATION',
  'NETTING',
  'FIXED_ASSET_ACQUISITION', 'FIXED_ASSET_DEPRECIATION', 'FIXED_ASSET_DISPOSAL',
  'RECURRING_TRANSACTION',
  'FX_REVALUATION',
];

const journalEntrySchema = new mongoose.Schema(
  {
    entryNumber: {
      type: Number,
      unique: true,
      required: true,
    },
    entryDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    debitAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    creditAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      enum: ['CHF', 'EUR'],
      default: 'CHF',
    },
    referenceType: {
      type: String,
      enum: REFERENCE_TYPES,
      required: true,
    },
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    reversalOf: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
    },
    reversedBy: {
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

// --- Indexes ---
journalEntrySchema.index({ entryDate: -1 });
journalEntrySchema.index({ debitAccountId: 1 });
journalEntrySchema.index({ creditAccountId: 1 });
journalEntrySchema.index({ referenceType: 1, referenceId: 1 });

// --- Immutability pre-hooks ---
journalEntrySchema.pre('findOneAndUpdate', function () {
  throw new Error('JournalEntry is immutable');
});

journalEntrySchema.pre('updateOne', function () {
  throw new Error('JournalEntry is immutable');
});

journalEntrySchema.pre('updateMany', function () {
  throw new Error('JournalEntry is immutable');
});

const JournalEntry = mongoose.model('JournalEntry', journalEntrySchema);
export default JournalEntry;
export { REFERENCE_TYPES as JOURNAL_REFERENCE_TYPES };
