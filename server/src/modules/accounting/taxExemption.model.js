import mongoose from 'mongoose';

const taxExemptionSchema = new mongoose.Schema(
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
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    partyId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    certificateNumber: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, default: null },
    isActive: { type: Boolean, default: true, index: true },
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

taxExemptionSchema.index({ partyId: 1, isActive: 1 });
taxExemptionSchema.index({ validFrom: 1, validTo: 1 });

taxExemptionSchema.pre('validate', function normalizeTaxExemption(next) {
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  if (this.validFrom && this.validTo && this.validTo < this.validFrom) {
    this.invalidate('validTo', 'Tax exemption validTo must be on or after validFrom');
  }
  next();
});

const TaxExemption = mongoose.model('TaxExemption', taxExemptionSchema);
export default TaxExemption;
