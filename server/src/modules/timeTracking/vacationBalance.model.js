import mongoose from 'mongoose';

const vacationBalanceSchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
      max: 2100,
    },
    annualEntitlementDays: {
      type: Number,
      min: 0,
      default: 25,
    },
    carryoverDays: {
      type: Number,
      default: 0,
    },
    manualAdjustmentDays: {
      type: Number,
      default: 0,
    },
    notes: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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

vacationBalanceSchema.index({ employeeId: 1, year: 1 }, { unique: true });
vacationBalanceSchema.index({ year: 1 });

const VacationBalance = mongoose.model('VacationBalance', vacationBalanceSchema);
export default VacationBalance;
