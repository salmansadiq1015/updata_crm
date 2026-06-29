import mongoose from 'mongoose';

export const RECURRING_RUN_STATUSES = ['STARTED', 'COMPLETED', 'FAILED', 'SKIPPED'];

const recurringRunSchema = new mongoose.Schema(
  {
    recurringTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RecurringTransaction',
      required: true,
      index: true,
    },
    recurringNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    periodKey: {
      type: String,
      required: true,
      trim: true,
      maxlength: 32,
    },
    runDate: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: RECURRING_RUN_STATUSES,
      default: 'STARTED',
      required: true,
      index: true,
    },
    generatedEntityType: {
      type: String,
      trim: true,
      maxlength: 40,
      default: null,
    },
    generatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    errorMessage: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    completedAt: {
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
    timestamps: { createdAt: true, updatedAt: true },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

recurringRunSchema.index(
  { recurringTransactionId: 1, periodKey: 1 },
  { unique: true },
);
recurringRunSchema.index({ status: 1, runDate: -1 });

const RecurringRun = mongoose.model('RecurringRun', recurringRunSchema);
export default RecurringRun;
