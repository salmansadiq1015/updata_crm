import mongoose from 'mongoose';

export const DOCUMENT_TYPES = [
  'SUPPLIER_INVOICE',
  'RECEIPT',
  'BANK_STATEMENT',
  'AR_INVOICE_PDF',
  'PAYMENT_CONFIRMATION',
  'OTHER',
];

export const OCR_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NOT_APPLICABLE'];
export const PROCESSING_STATUSES = ['UNPROCESSED', 'IN_REVIEW', 'PROCESSED'];

const accountingDocumentSchema = new mongoose.Schema(
  {
    filePath: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    fileSize: { type: Number },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    fileHash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    ocrStatus: {
      type: String,
      enum: OCR_STATUSES,
      default: 'PENDING',
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAt: { type: Date, default: null },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    processingStatus: {
      type: String,
      enum: PROCESSING_STATUSES,
      default: 'UNPROCESSED',
    },
    notes: { type: String, maxlength: 2000, default: '' },
    projectReference: { type: String, trim: true, maxlength: 100, default: '' },
    retentionUntil: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
accountingDocumentSchema.index({ documentType: 1 });
accountingDocumentSchema.index({ ocrStatus: 1 });
accountingDocumentSchema.index({ assignedTo: 1 });
accountingDocumentSchema.index({ processingStatus: 1 });
accountingDocumentSchema.index({ createdAt: -1 });

const AccountingDocument = mongoose.model('AccountingDocument', accountingDocumentSchema);
export default AccountingDocument;
