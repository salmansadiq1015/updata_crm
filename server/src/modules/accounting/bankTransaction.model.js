import mongoose from 'mongoose';

export const RECONCILIATION_STATUSES = ['UNMATCHED', 'AUTO_MATCHED', 'MANUALLY_MATCHED', 'CATEGORIZED'];

const bankTransactionSchema = new mongoose.Schema(
  {
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      required: true,
    },
    transactionDate: { type: Date, required: true },
    valueDate: { type: Date, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, required: true, trim: true },
    reference: { type: String, trim: true, maxlength: 100 },
    payerPayeeName: { type: String, trim: true, maxlength: 200 },
    payerPayeeIban: { type: String, trim: true, maxlength: 34 },
    bookingText: { type: String, trim: true, maxlength: 1000 },
    statementId: { type: String, trim: true, maxlength: 50 },
    reconciliationStatus: {
      type: String,
      enum: RECONCILIATION_STATUSES,
      default: 'UNMATCHED',
      index: true,
    },
    matchedInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    matchedAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    importedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
bankTransactionSchema.index({ bankAccountId: 1 });
bankTransactionSchema.index({ transactionDate: 1 });
bankTransactionSchema.index({ reference: 1 });

const BankTransaction = mongoose.model('BankTransaction', bankTransactionSchema);
export default BankTransaction;
