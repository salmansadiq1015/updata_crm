import mongoose from 'mongoose';
import { buildArticleSearchTokens } from './catalogNormalization.js';

export const ARTICLE_TYPES = ['MATERIAL', 'SERVICE'];
export const ARTICLE_SOURCES = ['INTERNAL', 'IGH', 'SUPPLIER', 'MANUFACTURER'];
export const ARTICLE_AVAILABILITY_STATUSES = [
  'UNKNOWN',
  'IN_STOCK',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'DISCONTINUED',
];

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
    purchasePrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    salesPrice: {
      type: Number,
      min: 0,
      default: 0,
    },
    currency: {
      type: String,
      trim: true,
      maxlength: 3,
      default: 'CHF',
    },
    catalogConnectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogConnection',
      default: null,
    },
    externalCatalogItemId: {
      type: String,
      maxlength: 100,
      default: null,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    supplierName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
    },
    supplierReference: {
      type: String,
      maxlength: 100,
      default: null,
    },
    manufacturerName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
    },
    manufacturerPartNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    productGroup: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
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
    availabilityStatus: {
      type: String,
      enum: ARTICLE_AVAILABILITY_STATUSES,
      default: 'UNKNOWN',
      index: true,
    },
    availableQuantity: {
      type: Number,
      min: 0,
      default: null,
    },
    lastSyncedAt: {
      type: Date,
      default: null,
    },
    markupPercent: {
      type: Number,
      min: -100,
      max: 1000,
      default: null,
    },
    marginPercent: {
      type: Number,
      min: -100,
      max: 100,
      default: null,
    },
    searchTokens: {
      type: [String],
      default: [],
      index: true,
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
articleSchema.index({ catalogConnectionId: 1, externalCatalogItemId: 1 });
articleSchema.index({ supplierId: 1 });
articleSchema.index({ manufacturerName: 1 });
articleSchema.index({ productGroup: 1 });
articleSchema.index({ availabilityStatus: 1 });
articleSchema.index(
  { ighArticleNumber: 1 },
  { partialFilterExpression: { ighArticleNumber: { $ne: null } } },
);
articleSchema.index({ isDeleted: 1, status: 1 });
articleSchema.index({ createdAt: -1 });
articleSchema.index({ searchTokens: 1 });
articleSchema.index(
  {
    name: 'text',
    description: 'text',
    articleNumber: 'text',
    supplierReference: 'text',
    supplierName: 'text',
    manufacturerName: 'text',
    manufacturerPartNumber: 'text',
    productGroup: 'text',
  },
  {
    weights: {
      articleNumber: 10,
      name: 8,
      manufacturerPartNumber: 6,
      supplierReference: 4,
      supplierName: 3,
      manufacturerName: 3,
      productGroup: 2,
      description: 2,
    },
  },
);

articleSchema.pre('validate', function () {
  if (this.salesPrice === undefined || this.salesPrice === null || this.salesPrice === 0) {
    this.salesPrice = this.basePrice ?? 0;
  }
  if (this.basePrice === undefined || this.basePrice === null) {
    this.basePrice = this.salesPrice ?? 0;
  }
  this.searchTokens = buildArticleSearchTokens(this);
});

// --- Soft-delete pre-hook ---
articleSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Article = mongoose.model('Article', articleSchema);
export default Article;
