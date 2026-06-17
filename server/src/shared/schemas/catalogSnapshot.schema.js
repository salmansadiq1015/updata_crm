import mongoose from 'mongoose';

const catalogSnapshotSchema = new mongoose.Schema(
  {
    catalogArticleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
    articleNumber: { type: String, trim: true, maxlength: 50, default: '' },
    articleName: { type: String, trim: true, maxlength: 300, default: '' },
    articleDescription: { type: String, maxlength: 5000, default: '' },
    unitOfMeasure: { type: String, trim: true, maxlength: 20, default: '' },
    snapshotBasePrice: { type: Number, min: 0, default: 0 },
    snapshotPurchasePrice: { type: Number, min: 0, default: 0 },
    snapshotSalesPrice: { type: Number, min: 0, default: 0 },
    snapshotCurrency: { type: String, trim: true, maxlength: 3, default: 'CHF' },
    catalogSource: { type: String, enum: ['INTERNAL', 'IGH', 'SUPPLIER', 'MANUFACTURER', 'CUSTOM'], default: 'INTERNAL' },
    catalogConnectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'CatalogConnection', default: null },
    externalCatalogItemId: { type: String, trim: true, maxlength: 100, default: '' },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    supplierName: { type: String, trim: true, maxlength: 255, default: '' },
    manufacturerName: { type: String, trim: true, maxlength: 255, default: '' },
    manufacturerPartNumber: { type: String, trim: true, maxlength: 100, default: '' },
    productGroup: { type: String, trim: true, maxlength: 100, default: '' },
    availabilityStatus: {
      type: String,
      enum: ['UNKNOWN', 'IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'],
      default: 'UNKNOWN',
    },
    availableQuantity: { type: Number, min: 0, default: null },
    appliedMarkupPercent: { type: Number, min: -100, max: 1000, default: null },
    marginPercent: { type: Number, min: -100, max: 100, default: null },
    manualPriceOverride: { type: Boolean, default: false },
    snapshotTakenAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

export default catalogSnapshotSchema;
