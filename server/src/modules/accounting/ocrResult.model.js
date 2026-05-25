import mongoose from 'mongoose';

export const OCR_RESULT_STATUSES = ['EXTRACTED', 'CONFIRMED', 'REJECTED'];

const ocrResultSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingDocument',
      unique: true,
      required: true,
    },
    extractedSupplierName: { type: String, trim: true, maxlength: 200 },
    extractedSupplierAddress: { type: String, trim: true, maxlength: 500 },
    extractedInvoiceNumber: { type: String, trim: true, maxlength: 50 },
    extractedInvoiceDate: { type: Date },
    extractedDueDate: { type: Date },
    extractedTotal: { type: Number },
    extractedVat: { type: Number },
    extractedLineItems: { type: mongoose.Schema.Types.Mixed },
    matchedSupplierId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    provider: { type: String, trim: true, maxlength: 50, default: 'unknown' },
    rawText: { type: String, maxlength: 20000, default: '' },
    rawPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    confidenceScores: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    lowConfidenceFields: [{ type: String, trim: true, maxlength: 100 }],
    status: {
      type: String,
      enum: OCR_RESULT_STATUSES,
      required: true,
    },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    confirmedAt: { type: Date, default: null },
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    rejectedAt: { type: Date, default: null },
    errorMessage: { type: String, maxlength: 1000, default: '' },
    processingTimeMs: { type: Number },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
ocrResultSchema.index({ status: 1 });

const OcrResult = mongoose.model('OcrResult', ocrResultSchema);
export default OcrResult;
