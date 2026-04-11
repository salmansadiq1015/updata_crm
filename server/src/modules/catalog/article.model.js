import mongoose from 'mongoose';

export const ARTICLE_TYPES = ['MATERIAL', 'SERVICE'];
export const ARTICLE_SOURCES = ['INTERNAL', 'IGH'];

const articleSchema = new mongoose.Schema(
  {
    articleNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
      maxlength: 20,
      immutable: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    description: {
      type: String,
      maxlength: 5000,
      default: '',
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogCategory',
      required: true,
    },
    type: {
      type: String,
      enum: ARTICLE_TYPES,
      required: true,
    },
    unitOfMeasure: {
      type: String,
      required: true,
      trim: true,
      maxlength: 10,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
      maxlength: 3,
      default: 'CHF',
    },
    supplierReference: {
      type: String,
      maxlength: 100,
      default: null,
    },
    ighArticleNumber: {
      type: String,
      maxlength: 50,
      default: null,
    },
    source: {
      type: String,
      enum: ARTICLE_SOURCES,
      default: 'INTERNAL',
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
    lastUsedAt: {
      type: Date,
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
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
articleSchema.index({ categoryId: 1 });
articleSchema.index({ type: 1 });
articleSchema.index({ source: 1 });
articleSchema.index(
  { ighArticleNumber: 1 },
  { partialFilterExpression: { ighArticleNumber: { $ne: null } } },
);
articleSchema.index({ isDeleted: 1, status: 1 });
articleSchema.index({ createdAt: -1 });
articleSchema.index(
  { name: 'text', description: 'text', articleNumber: 'text', supplierReference: 'text' },
  { weights: { articleNumber: 10, name: 8, description: 3, supplierReference: 3 } },
);

// --- Soft-delete pre-hook ---
articleSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Article = mongoose.model('Article', articleSchema);
export default Article;
