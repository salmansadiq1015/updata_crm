import mongoose from 'mongoose';

export const TAX_TRANSACTION_SOURCE_TYPES = ['AP_INVOICE', 'AR_INVOICE', 'JOURNAL', 'MANUAL'];
export const TAX_TRANSACTION_DIRECTIONS = ['INPUT', 'OUTPUT', 'WITHHOLDING'];
export const TAX_TRANSACTION_STATUSES = ['POSTED', 'VOID'];

const taxTransactionSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: TAX_TRANSACTION_SOURCE_TYPES,
      required: true,
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sourceNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    sourceLineKey: {
      type: String,
      trim: true,
      maxlength: 120,
      default: 'summary',
    },
    transactionDate: {
      type: Date,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: TAX_TRANSACTION_DIRECTIONS,
      required: true,
      index: true,
    },
    taxType: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
      default: 'VAT',
    },
    taxCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCode',
      default: null,
    },
    taxCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    taxRate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    taxableAmount: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    recoverableAmount: { type: Number, default: 0 },
    nonRecoverableAmount: { type: Number, default: 0 },
    grossAmount: { type: Number, required: true },
    currency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
      index: true,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    partyName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
    },
    status: {
      type: String,
      enum: TAX_TRANSACTION_STATUSES,
      default: 'POSTED',
      index: true,
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

taxTransactionSchema.index(
  { sourceType: 1, sourceId: 1, sourceLineKey: 1, direction: 1 },
  { unique: true },
);
taxTransactionSchema.index({ transactionDate: 1, currency: 1, direction: 1 });
taxTransactionSchema.index({ taxCode: 1, transactionDate: 1 });

taxTransactionSchema.pre('validate', function normalizeTaxTransaction(next) {
  if (this.sourceType) this.sourceType = String(this.sourceType).trim().toUpperCase();
  if (this.direction) this.direction = String(this.direction).trim().toUpperCase();
  if (this.taxType) this.taxType = String(this.taxType).trim().toUpperCase();
  if (this.taxCode) this.taxCode = String(this.taxCode).trim().toUpperCase();
  if (this.currency) this.currency = String(this.currency).trim().toUpperCase();
  if (this.status) this.status = String(this.status).trim().toUpperCase();
  next();
});

const TaxTransaction = mongoose.model('TaxTransaction', taxTransactionSchema);
export default TaxTransaction;
