import mongoose from 'mongoose';

export const ACCOUNTING_ENTITY_TYPES = ['COMPANY', 'BRANCH'];
export const ACCOUNTING_ENTITY_STATUSES = ['ACTIVE', 'INACTIVE'];

const accountingEntitySchema = new mongoose.Schema(
  {
    entityCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 30,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    legalName: {
      type: String,
      trim: true,
      maxlength: 220,
      default: '',
    },
    type: {
      type: String,
      enum: ACCOUNTING_ENTITY_TYPES,
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingEntity',
      default: null,
    },
    baseCurrency: {
      type: String,
      enum: ['CHF', 'EUR'],
      default: 'CHF',
    },
    taxIdentifier: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
    },
    fiscalYearStartMonth: {
      type: Number,
      min: 1,
      max: 12,
      default: 1,
    },
    status: {
      type: String,
      enum: ACCOUNTING_ENTITY_STATUSES,
      default: 'ACTIVE',
      index: true,
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
  { timestamps: true },
);

accountingEntitySchema.index({ type: 1, status: 1 });
accountingEntitySchema.index({ parentId: 1, status: 1 });

const AccountingEntity = mongoose.model('AccountingEntity', accountingEntitySchema);
export default AccountingEntity;
