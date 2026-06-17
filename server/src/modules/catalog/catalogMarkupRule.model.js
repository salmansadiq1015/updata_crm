import mongoose from 'mongoose';

export const MARKUP_RULE_SCOPES = [
  'GLOBAL',
  'MANUFACTURER',
  'SUPPLIER',
  'CATEGORY',
  'PRODUCT_GROUP',
  'ARTICLE',
];

const catalogMarkupRuleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    scope: { type: String, enum: MARKUP_RULE_SCOPES, required: true, index: true },
    priority: { type: Number, min: 0, default: 100, index: true },
    manufacturerName: { type: String, trim: true, maxlength: 255, default: '' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogCategory', default: null },
    productGroup: { type: String, trim: true, maxlength: 100, default: '' },
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
    markupPercent: { type: Number, min: -100, max: 1000, default: null },
    marginPercent: { type: Number, min: -100, max: 99.99, default: null },
    isActive: { type: Boolean, default: true, index: true },
    validFrom: { type: Date, default: null },
    validUntil: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

catalogMarkupRuleSchema.index({ isDeleted: 1, isActive: 1, scope: 1 });
catalogMarkupRuleSchema.index({ manufacturerName: 1 });
catalogMarkupRuleSchema.index({ supplierId: 1 });
catalogMarkupRuleSchema.index({ categoryId: 1 });
catalogMarkupRuleSchema.index({ productGroup: 1 });
catalogMarkupRuleSchema.index({ articleId: 1 });

catalogMarkupRuleSchema.pre('validate', function () {
  this.scope = String(this.scope || 'GLOBAL').trim().toUpperCase();
  this.manufacturerName = String(this.manufacturerName || '').trim();
  this.productGroup = String(this.productGroup || '').trim();
});

catalogMarkupRuleSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const CatalogMarkupRule = mongoose.model('CatalogMarkupRule', catalogMarkupRuleSchema);
export default CatalogMarkupRule;
