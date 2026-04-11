import mongoose from 'mongoose';

export const CATALOG_SOURCES = ['IGH', 'INTERNAL', 'CUSTOM'];

const materialLineItemSchema = new mongoose.Schema(
  {
    workReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkReport',
      required: true,
    },
    catalogSource: {
      type: String,
      enum: CATALOG_SOURCES,
      required: true,
    },
    catalogItemId: { type: String, maxlength: 50, default: null },
    description: {
      type: String,
      required: true,
      maxlength: 300,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      required: true,
      maxlength: 20,
    },
    sortOrder: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
materialLineItemSchema.index({ workReportId: 1 });

const MaterialLineItem = mongoose.model('MaterialLineItem', materialLineItemSchema);
export default MaterialLineItem;
