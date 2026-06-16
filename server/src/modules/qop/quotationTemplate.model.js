import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';

const templateLineItemSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    type: {
      type: String,
      enum: ['service', 'material', 'text', 'subtotal', 'optional'],
      required: true,
    },
    description: { type: String, required: true, maxlength: 2000 },
    unit: { type: String, maxlength: 20, default: null },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    vatRate: { type: Number, default: 8.1 },
  },
  { _id: true },
);

const quotationTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, maxlength: 1000, default: '' },
    category: { type: String, maxlength: 100, default: '' },
    language: { type: String, enum: ['de', 'fr', 'it', 'en'], default: 'de' },
    currency: { type: String, enum: ['CHF', 'EUR'], default: 'CHF' },
    introduction: { type: String, maxlength: 5000, default: '' },
    notes: { type: String, maxlength: 5000, default: '' },
    paymentTerms: { type: String, maxlength: 1000, default: '' },
    termsAndConditions: { type: String, maxlength: 10000, default: '' },
    globalDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    lineItems: [templateLineItemSchema],
    isActive: { type: Boolean, default: true, index: true },
    usageCount: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    migration: { type: migrationTraceSchema, default: () => ({}) },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

quotationTemplateSchema.index({ isDeleted: 1, isActive: 1, usageCount: -1 });
quotationTemplateSchema.index(
  { name: 'text', description: 'text', category: 'text' },
  { weights: { name: 10, category: 5, description: 3 } },
);

quotationTemplateSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const QuotationTemplate = mongoose.model('QuotationTemplate', quotationTemplateSchema);
export default QuotationTemplate;
