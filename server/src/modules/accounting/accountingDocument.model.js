import mongoose from 'mongoose';

export const DOCUMENT_TYPES = [
  'SUPPLIER_INVOICE',
  'RECEIPT',
  'BANK_STATEMENT',
  'AR_INVOICE_PDF',
  'OPEN_ITEM_STATEMENT',
  'DUNNING_LETTER',
  'PAYMENT_CONFIRMATION',
  'OTHER',
];

export const OCR_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'NOT_APPLICABLE'];
export const PROCESSING_STATUSES = ['UNPROCESSED', 'IN_REVIEW', 'PROCESSED'];
export const LINKED_RECORD_TYPES = [
  'AR_INVOICE',
  'AP_INVOICE',
  'AR_PAYMENT',
  'PAYMENT_BATCH',
  'BANK_STATEMENT',
  'BANK_TRANSACTION',
  'JOURNAL_ENTRY',
  'OTHER',
];

const linkedRecordSchema = new mongoose.Schema(
  {
    recordType: {
      type: String,
      enum: LINKED_RECORD_TYPES,
      required: true,
    },
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
  },
  { _id: false },
);

const assignmentHistorySchema = new mongoose.Schema(
  {
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    assignedAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    reason: {
      type: String,
      enum: ['MANUAL', 'BULK', 'AUTO_RULE'],
      default: 'MANUAL',
    },
  },
  { _id: false },
);

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
    supplierName: { type: String, trim: true, maxlength: 200, default: '' },
    receiptDate: { type: Date, default: null },
    amount: { type: Number, default: null },
    vat: { type: Number, default: null },
    receiptType: {
      type: String,
      enum: ['MATERIAL', 'TRAVEL', 'MEAL', 'SERVICE', 'TOOLS', 'OTHER', null],
      default: null,
    },
    accountingCategory: { type: String, trim: true, maxlength: 120, default: '' },
    projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    autoAssignmentStatus: {
      type: String,
      enum: ['PENDING_REVIEW', 'CONFIRMED', 'AUTO_ASSIGNED'],
      default: 'PENDING_REVIEW',
    },
    fullText: { type: String, maxlength: 200000, default: '' },
    linkedRecords: [linkedRecordSchema],
    assignmentHistory: [assignmentHistorySchema],
    retentionUntil: {
      type: Date,
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
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
accountingDocumentSchema.index({ projectId: 1 });
accountingDocumentSchema.index({ customerId: 1 });
accountingDocumentSchema.index({ employeeId: 1 });
accountingDocumentSchema.index({ accountingCategory: 1 });
accountingDocumentSchema.index({ processingStatus: 1 });
accountingDocumentSchema.index({ createdAt: -1 });
accountingDocumentSchema.index({ isDeleted: 1, createdAt: -1 });
accountingDocumentSchema.index({ 'linkedRecords.recordType': 1, 'linkedRecords.recordId': 1 });
accountingDocumentSchema.index(
  { fileName: 'text', notes: 'text', projectReference: 'text', fullText: 'text' },
  { weights: { fileName: 10, supplierName: 8, projectReference: 5, accountingCategory: 4, notes: 3, fullText: 1 } },
);

accountingDocumentSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const AccountingDocument = mongoose.model('AccountingDocument', accountingDocumentSchema);
export default AccountingDocument;
