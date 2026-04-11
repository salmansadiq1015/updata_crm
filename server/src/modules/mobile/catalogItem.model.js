import mongoose from 'mongoose';

export const CATALOG_SOURCES = ['IGH', 'INTERNAL'];

const catalogItemSchema = new mongoose.Schema(
  {
    itemNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    catalogSource: {
      type: String,
      enum: CATALOG_SOURCES,
      required: true,
    },
    description: {
      type: String,
      required: true,
      maxlength: 300,
    },
    category: {
      type: String,
      maxlength: 100,
      default: null,
    },
    unit: {
      type: String,
      maxlength: 20,
      required: true,
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
catalogItemSchema.index({ catalogSource: 1, category: 1 });
catalogItemSchema.index(
  { description: 'text', itemNumber: 'text' },
  { weights: { description: 10, itemNumber: 5 } },
);

const CatalogItem = mongoose.model('CatalogItem', catalogItemSchema);
export default CatalogItem;
