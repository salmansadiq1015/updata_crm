import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';
import migrationTraceSchema from '../../shared/schemas/migrationTrace.schema.js';
import catalogSnapshotSchema from '../../shared/schemas/catalogSnapshot.schema.js';
import lineItemImageSchema from '../../shared/schemas/lineItemImage.schema.js';

export const INVOICE_STATUSES = ['DRAFT', 'FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'WRITTEN_OFF'];
export const INVOICE_TYPES = ['STANDARD', 'ADVANCE', 'FINAL', 'CREDIT_NOTE'];
export const PAYMENT_METHODS = ['bank_transfer', 'cash', 'card', 'other'];

const lineItemSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    articleNumber: { type: String, trim: true, maxlength: 50, default: '' },
    catalogItemId: { type: mongoose.Schema.Types.ObjectId, default: null },
    catalogSnapshot: { type: catalogSnapshotSchema, default: null },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    unit: { type: String, trim: true, maxlength: 20, default: 'pcs' },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    vatRate: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, default: 0 },
    sourceOrderLinePosition: { type: Number, min: 1, default: null },
    sourceOrderLineQuantity: { type: Number, min: 0, default: null },
    image: { type: lineItemImageSchema, default: null },
  },
  { _id: false },
);

const vatBreakdownSchema = new mongoose.Schema(
  {
    rate: { type: Number, required: true },
    base: { type: Number, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0.01 },
    reference: { type: String, maxlength: 100, default: '' },
    method: {
      type: String,
      enum: PAYMENT_METHODS,
      default: 'bank_transfer',
    },
    note: { type: String, maxlength: 500, default: '' },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const advanceDeductionSchema = new mongoose.Schema(
  {
    advanceInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
    },
    advanceInvoiceNumber: { type: String, required: true },
    advanceInvoiceDate: { type: Date, required: true },
    netAmount: { type: Number, required: true },
    vatAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    invoiceType: {
      type: String,
      enum: INVOICE_TYPES,
      required: true,
    },
    sourceOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
    sourceQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Set when the invoice was billed from an Arbeitsrapport (Rapport →
    // Rechnung): its lines are the report's hours and material, not the
    // order's remaining quantities.
    sourceWorkReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkReport',
      default: null,
    },
    creditNoteForInvoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact',
      default: null,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Carried over from the source quotation/order (Objekt-first flow); decides
    // which party is printed as the invoice recipient (QR debtor included).
    siteId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Site',
      default: null,
    },
    billingAddressSource: {
      type: String,
      enum: ['customer', 'site_billing', 'site_ownership', 'site_management'],
      default: 'customer',
    },
    language: {
      type: String,
      enum: ['de', 'fr', 'it', 'en'],
      default: 'de',
    },
    title: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
    lineItems: [lineItemSchema],
    currency: {
      type: String,
      enum: CURRENCY_CODES,
      default: 'CHF',
    },
    globalDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    subtotal: { type: Number, default: 0 },
    vatBreakdown: [vatBreakdownSchema],
    grandTotal: { type: Number, default: 0 },
    roundingAmount: { type: Number, default: 0 },
    grandTotalRounded: { type: Number, default: 0 },
    invoiceDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    advanceDeductions: [advanceDeductionSchema],
    advanceDeductionTotal: { type: Number, default: 0 },
    netSubtotal: { type: Number, default: 0 },
    amountPaid: { type: Number, default: 0 },
    amountDue: { type: Number, default: 0 },
    paymentTermsDays: { type: Number, default: 30 },
    paymentTermsText: { type: String, maxlength: 1000, default: '' },
    payments: [paymentSchema],
    milestoneDescription: { type: String, maxlength: 500, default: null },
    milestonePercent: { type: Number, default: null, min: 0, max: 100 },
    isDeducted: { type: Boolean, default: false, index: true },
    sentAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancellationReason: { type: String, maxlength: 2000, default: null },
    writtenOffAt: { type: Date, default: null },
    writeOffReason: { type: String, maxlength: 2000, default: null },
    pdfDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingDocument',
      default: null,
    },
    pdfGeneratedAt: { type: Date, default: null },
    qrBillReference: { type: String, trim: true, maxlength: 27, default: null },
    status: {
      type: String,
      enum: INVOICE_STATUSES,
      default: 'DRAFT',
      index: true,
    },
    version: { type: Number, default: 1 },
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
    migration: { type: migrationTraceSchema, default: () => ({}) },
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
invoiceSchema.index({ customerId: 1, status: 1 });
invoiceSchema.index({ sourceOrderId: 1 });
invoiceSchema.index({ creditNoteForInvoiceId: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ isDeleted: 1, status: 1, dueDate: 1, _id: 1 });
invoiceSchema.index({ isDeleted: 1, status: 1, amountDue: 1 });
invoiceSchema.index({ customerId: 1, status: 1, dueDate: 1 });
invoiceSchema.index({ invoiceType: 1 });
invoiceSchema.index({ projectId: 1 });
invoiceSchema.index({ isDeleted: 1, createdAt: -1 });
// Dashboard revenue window (current + previous period by invoiceDate) — migration 057.
invoiceSchema.index({ isDeleted: 1, invoiceDate: 1 }, { name: 'dashboard_invoice_date' });
invoiceSchema.index({ 'migration.sourceSystem': 1, 'migration.sourceId': 1 });
invoiceSchema.index(
  { invoiceNumber: 'text', title: 'text', customerName: 'text' },
  { weights: { invoiceNumber: 10, title: 5, customerName: 3 } },
);

// --- Soft-delete pre-hook ---
invoiceSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Invoice = mongoose.model('Invoice', invoiceSchema);
export default Invoice;
