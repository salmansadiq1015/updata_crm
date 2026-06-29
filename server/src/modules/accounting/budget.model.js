import mongoose from 'mongoose';
import { ACCOUNT_TYPES } from './account.model.js';

export const BUDGET_STATUSES = ['DRAFT', 'APPROVED', 'LOCKED', 'ARCHIVED'];

const budgetLineSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    accountType: {
      type: String,
      enum: ACCOUNT_TYPES,
      required: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
  },
  { _id: true },
);

const budgetSchema = new mongoose.Schema(
  {
    budgetNumber: {
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
    startDate: {
      type: Date,
      required: true,
      index: true,
    },
    endDate: {
      type: Date,
      required: true,
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
    status: {
      type: String,
      enum: BUDGET_STATUSES,
      default: 'DRAFT',
      required: true,
      index: true,
    },
    lines: {
      type: [budgetLineSchema],
      default: [],
    },
    totalBudget: {
      type: Number,
      min: 0,
      default: 0,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lockedAt: {
      type: Date,
      default: null,
    },
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

budgetSchema.index({ status: 1, startDate: -1 });
budgetSchema.index({ currency: 1, startDate: 1, endDate: 1 });
budgetSchema.index({ 'lines.accountId': 1, startDate: 1, endDate: 1 });

budgetSchema.pre('validate', function normalizeBudget(next) {
  if (this.budgetNumber) this.budgetNumber = String(this.budgetNumber).trim().toUpperCase();
  if (this.currency) this.currency = String(this.currency).trim().toUpperCase();
  if (this.status) this.status = String(this.status).trim().toUpperCase();
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'Budget endDate must be on or after startDate');
  }
  this.totalBudget = (this.lines || []).reduce((sum, line) => sum + Number(line.amount || 0), 0);
  next();
});

const Budget = mongoose.model('Budget', budgetSchema);
export default Budget;
