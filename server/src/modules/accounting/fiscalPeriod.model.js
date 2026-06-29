import mongoose from 'mongoose';

export const FISCAL_PERIOD_STATUSES = ['OPEN', 'CLOSED', 'ARCHIVED'];

const fiscalPeriodSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: FISCAL_PERIOD_STATUSES,
      default: 'OPEN',
      index: true,
    },
    closeReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    reopenReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedAt: { type: Date, default: null },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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

fiscalPeriodSchema.index({ startDate: 1, endDate: 1 });
fiscalPeriodSchema.index({ status: 1, startDate: 1 });

fiscalPeriodSchema.pre('validate', function validateDateRange(next) {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'Fiscal period end date must be on or after start date');
  }
  next();
});

const FiscalPeriod = mongoose.model('FiscalPeriod', fiscalPeriodSchema);
export default FiscalPeriod;
