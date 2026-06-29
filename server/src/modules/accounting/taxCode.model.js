import mongoose from 'mongoose';

export const TAX_TYPES = ['VAT', 'GST', 'WITHHOLDING'];
export const TAX_DIRECTIONS = ['INPUT', 'OUTPUT', 'BOTH', 'WITHHOLDING'];
export const TAX_SCOPES = ['STANDARD', 'REDUCED', 'ZERO', 'EXEMPT', 'REVERSE_CHARGE', 'WITHHOLDING'];

const taxCodeSchema = new mongoose.Schema(
  {
    code: {
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
      maxlength: 160,
    },
    type: {
      type: String,
      enum: TAX_TYPES,
      default: 'VAT',
      required: true,
    },
    direction: {
      type: String,
      enum: TAX_DIRECTIONS,
      default: 'BOTH',
      required: true,
    },
    scope: {
      type: String,
      enum: TAX_SCOPES,
      default: 'STANDARD',
      required: true,
    },
    country: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      default: 'CH',
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    recoverablePercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
    validFrom: {
      type: Date,
      required: true,
    },
    validTo: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
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

taxCodeSchema.index({ country: 1, type: 1, direction: 1, isActive: 1 });
taxCodeSchema.index({ validFrom: 1, validTo: 1 });

taxCodeSchema.pre('validate', function normalizeTaxCode(next) {
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  if (this.type) this.type = String(this.type).trim().toUpperCase();
  if (this.direction) this.direction = String(this.direction).trim().toUpperCase();
  if (this.scope) this.scope = String(this.scope).trim().toUpperCase();
  if (this.country) this.country = String(this.country).trim().toUpperCase();
  if (this.validFrom && this.validTo && this.validTo < this.validFrom) {
    this.invalidate('validTo', 'Tax code validTo must be on or after validFrom');
  }
  next();
});

const TaxCode = mongoose.model('TaxCode', taxCodeSchema);
export default TaxCode;
