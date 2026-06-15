import mongoose from 'mongoose';

const catalogBarcodeReferenceSchema = new mongoose.Schema(
  {
    articleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', required: true, index: true },
    code: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ['EAN', 'QR', 'SUPPLIER', 'INTERNAL'], default: 'EAN' },
    isActive: { type: Boolean, default: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

catalogBarcodeReferenceSchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { isActive: true } },
);

const CatalogBarcodeReference = mongoose.model('CatalogBarcodeReference', catalogBarcodeReferenceSchema);
export default CatalogBarcodeReference;
