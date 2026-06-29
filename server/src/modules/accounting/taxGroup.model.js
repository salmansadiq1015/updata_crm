import mongoose from 'mongoose';

const taxGroupLineSchema = new mongoose.Schema(
  {
    taxCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCode',
      required: true,
    },
    allocationPercent: {
      type: Number,
      min: 0,
      max: 100,
      default: 100,
    },
  },
  { _id: false },
);

const taxGroupSchema = new mongoose.Schema(
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
    country: {
      type: String,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 2,
      default: 'CH',
    },
    taxCodes: {
      type: [taxGroupLineSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'Tax group must contain at least one tax code',
      },
    },
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

taxGroupSchema.pre('validate', function normalizeTaxGroup(next) {
  if (this.code) this.code = String(this.code).trim().toUpperCase();
  if (this.country) this.country = String(this.country).trim().toUpperCase();
  next();
});

const TaxGroup = mongoose.model('TaxGroup', taxGroupSchema);
export default TaxGroup;
