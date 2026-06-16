import mongoose from 'mongoose';

export const DELIVERY_NOTE_OCR_STATUSES = ['extracted', 'confirmed', 'failed', 'rejected'];

const deliveryNoteOcrItemSchema = new mongoose.Schema(
  {
    sparePartId: { type: mongoose.Schema.Types.ObjectId, ref: 'SparePart', default: null },
    partNumber: { type: String, trim: true, maxlength: 100, default: '' },
    name: { type: String, trim: true, maxlength: 255, default: '' },
    quantity: { type: Number, min: 0, default: 0 },
    unit: { type: String, trim: true, maxlength: 20, default: 'pcs' },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    matchedBy: { type: String, enum: ['partNumber', 'name', 'none'], default: 'none' },
  },
  { _id: true },
);

const deliveryNoteOcrJobSchema = new mongoose.Schema(
  {
    fileName: { type: String, trim: true, maxlength: 255, required: true },
    mimeType: { type: String, trim: true, maxlength: 100, required: true },
    fileSize: { type: Number, min: 0, default: 0 },
    fileHash: { type: String, trim: true, maxlength: 64, required: true, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    supplierName: { type: String, trim: true, maxlength: 255, default: '' },
    deliveryNoteNumber: { type: String, trim: true, maxlength: 100, default: '' },
    status: {
      type: String,
      enum: DELIVERY_NOTE_OCR_STATUSES,
      default: 'extracted',
      index: true,
    },
    provider: { type: String, trim: true, maxlength: 50, default: 'text' },
    confidence: { type: Number, min: 0, max: 1, default: 0 },
    rawText: { type: String, maxlength: 200000, default: '' },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    items: { type: [deliveryNoteOcrItemSchema], default: [] },
    confirmedItems: { type: [deliveryNoteOcrItemSchema], default: [] },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    confirmedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    errorMessage: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

deliveryNoteOcrJobSchema.index({ createdAt: -1 });
deliveryNoteOcrJobSchema.index({ deliveryNoteNumber: 1, supplierId: 1 });
deliveryNoteOcrJobSchema.index({ fileName: 'text', rawText: 'text', supplierName: 'text', deliveryNoteNumber: 'text' });

const DeliveryNoteOcrJob = mongoose.model('DeliveryNoteOcrJob', deliveryNoteOcrJobSchema);
export default DeliveryNoteOcrJob;
