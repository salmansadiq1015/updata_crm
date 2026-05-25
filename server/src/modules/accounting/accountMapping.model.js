import mongoose from 'mongoose';

export const ACCOUNT_MAPPING_TYPES = [
  'AR_RECEIVABLE',
  'SALES_REVENUE',
  'BANK_CLEARING',
  'WRITE_OFF_EXPENSE',
  'AP_PAYABLE',
  'BANK_FEE_EXPENSE',
];

export const ACCOUNT_MAPPING_SCOPE_TYPES = [
  'GLOBAL',
  'CUSTOMER',
  'SUPPLIER',
  'ARTICLE_CATEGORY',
  'BANK_ACCOUNT',
  'DOCUMENT_TYPE',
];

const accountMappingSchema = new mongoose.Schema(
  {
    mappingType: {
      type: String,
      enum: ACCOUNT_MAPPING_TYPES,
      required: true,
      trim: true,
    },
    scopeType: {
      type: String,
      enum: ACCOUNT_MAPPING_SCOPE_TYPES,
      default: 'GLOBAL',
      required: true,
    },
    scopeValue: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    isActive: { type: Boolean, default: true },
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

accountMappingSchema.pre('validate', function normalizeScope() {
  if (this.scopeType === 'GLOBAL') {
    this.scopeValue = '';
  }
});

accountMappingSchema.index(
  { mappingType: 1, scopeType: 1, scopeValue: 1 },
  { unique: true },
);
accountMappingSchema.index({ mappingType: 1, isActive: 1 });
accountMappingSchema.index({ accountId: 1 });

const AccountMapping = mongoose.model('AccountMapping', accountMappingSchema);
export default AccountMapping;
