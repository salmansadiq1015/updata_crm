import mongoose from 'mongoose';

export const RECURRING_TRANSACTION_TYPES = ['JOURNAL', 'AP_BILL', 'AR_INVOICE'];
export const RECURRING_STATUSES = ['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'ARCHIVED'];
export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'];

const recurringTransactionSchema = new mongoose.Schema(
  {
    recurringNumber: {
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
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    transactionType: {
      type: String,
      enum: RECURRING_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RECURRING_STATUSES,
      default: 'DRAFT',
      required: true,
      index: true,
    },
    frequency: {
      type: String,
      enum: RECURRENCE_FREQUENCIES,
      required: true,
    },
    interval: {
      type: Number,
      min: 1,
      default: 1,
    },
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    nextRunDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      default: null,
      index: true,
    },
    maxRuns: {
      type: Number,
      min: 1,
      default: null,
    },
    runCount: {
      type: Number,
      min: 0,
      default: 0,
    },
    lastRunDate: {
      type: Date,
      default: null,
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 64,
      default: 'UTC',
    },
    templatePayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
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
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    activatedAt: {
      type: Date,
      default: null,
    },
    pausedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    archivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    archivedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

recurringTransactionSchema.index({ status: 1, nextRunDate: 1 });
recurringTransactionSchema.index({ transactionType: 1, status: 1 });
recurringTransactionSchema.index({ name: 1 });

recurringTransactionSchema.pre('validate', function normalizeRecurringTransaction(next) {
  if (this.recurringNumber) this.recurringNumber = String(this.recurringNumber).trim().toUpperCase();
  if (this.transactionType) this.transactionType = String(this.transactionType).trim().toUpperCase();
  if (this.status) this.status = String(this.status).trim().toUpperCase();
  if (this.frequency) this.frequency = String(this.frequency).trim().toUpperCase();
  if (!this.nextRunDate && this.startDate) this.nextRunDate = this.startDate;
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'Recurring endDate must be on or after startDate');
  }
  next();
});

const RecurringTransaction = mongoose.model('RecurringTransaction', recurringTransactionSchema);
export default RecurringTransaction;
