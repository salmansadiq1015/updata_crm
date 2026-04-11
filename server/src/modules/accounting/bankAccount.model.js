import mongoose from 'mongoose';

export const CONNECTION_TYPES = ['MANUAL', 'EBICS', 'SFTP'];
export const BANK_ACCOUNT_STATUSES = ['ACTIVE', 'INACTIVE'];

const bankAccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    iban: {
      type: String,
      required: true,
      trim: true,
      maxlength: 34,
    },
    bic: { type: String, trim: true, maxlength: 11 },
    bankName: { type: String, trim: true, maxlength: 200 },
    currency: {
      type: String,
      enum: ['CHF', 'EUR'],
      default: 'CHF',
    },
    currentBalance: { type: Number, default: 0 },
    balanceDate: { type: Date },
    connectionType: {
      type: String,
      enum: CONNECTION_TYPES,
      default: 'MANUAL',
    },
    connectionConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    autoRetrieveEnabled: { type: Boolean, default: false },
    autoRetrieveSchedule: { type: String, trim: true, maxlength: 50 },
    status: {
      type: String,
      enum: BANK_ACCOUNT_STATUSES,
      default: 'ACTIVE',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
bankAccountSchema.index({ iban: 1 });
bankAccountSchema.index({ status: 1 });

const BankAccount = mongoose.model('BankAccount', bankAccountSchema);
export default BankAccount;
