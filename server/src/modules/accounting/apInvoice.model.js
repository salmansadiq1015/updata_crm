import { CURRENCY_CODES } from '../../shared/data/currencies.js';
import mongoose from 'mongoose';

export const AP_STATUSES = ['RECORDED', 'APPROVED', 'PAID', 'PARTIALLY_PAID', 'DISPUTED', 'CANCELLED'];

const allocationSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    costCenter: { type: String, trim: true, maxlength: 50 },
    projectReference: { type: String, trim: true, maxlength: 100 },
    orderReference: { type: String, trim: true, maxlength: 100 },
  },
  { _id: false },
);

const lineItemSchema = new mongoose.Schema(
  {
    position: { type: Number },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    quantity: { type: Number, min: 0 },
    unit: { type: String, trim: true, maxlength: 20, default: 'pcs' },
    unitPrice: { type: Number, min: 0 },
    lineTotal: { type: Number },
    vatRate: { type: Number, min: 0 },
    taxCodeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TaxCode',
      default: null,
    },
    taxCode: { type: String, trim: true, uppercase: true, maxlength: 40 },
    taxAmount: { type: Number, default: 0 },
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Account',
      default: null,
    },
    costCenter: { type: String, trim: true, maxlength: 50 },
    allocations: {
      type: [allocationSchema],
      validate: {
        validator: (allocations) => !allocations || allocations.length <= 10,
        message: 'A line item can be split across at most 10 allocations',
      },
      default: undefined,
    },
  },
  { _id: false },
);

const apInvoiceSchema = new mongoose.Schema(
  {
    apInvoiceNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    supplierName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    supplierIban: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 34,
      default: null,
    },
    supplierBic: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 11,
      default: null,
    },
    supplierInvoiceNumber: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    invoiceDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    paymentTermsDays: { type: Number, default: 30 },
    lineItems: [lineItemSchema],
    taxExemptionCode: { type: String, trim: true, uppercase: true, maxlength: 40, default: '' },
    subtotal: { type: Number, default: 0 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    outstandingAmount: { type: Number, default: 0 },
    currency: {
      type: String,
      enum: CURRENCY_CODES,
      default: 'CHF',
    },
    status: {
      type: String,
      enum: AP_STATUSES,
      default: 'RECORDED',
      index: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AccountingDocument',
      default: null,
    },
    paymentBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentBatch',
      default: null,
      index: true,
    },
    projectReference: { type: String, trim: true, maxlength: 100 },
    orderReference: { type: String, trim: true, maxlength: 100 },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: { type: Date, default: null },
    secondApproverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    secondApprovedAt: { type: Date, default: null },
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
apInvoiceSchema.index({ supplierId: 1, supplierInvoiceNumber: 1 }, { unique: true });
apInvoiceSchema.index({ dueDate: 1 });
apInvoiceSchema.index({ supplierId: 1 });
apInvoiceSchema.index({ isDeleted: 1, status: 1, dueDate: 1, _id: 1 });
apInvoiceSchema.index({ isDeleted: 1, status: 1, paymentBatchId: 1 });
apInvoiceSchema.index({ supplierId: 1, status: 1, dueDate: 1 });
apInvoiceSchema.index({ isDeleted: 1, status: 1, outstandingAmount: 1, dueDate: 1 });
apInvoiceSchema.index({ isDeleted: 1, createdAt: -1 });

// --- Soft-delete pre-hook ---
apInvoiceSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ApInvoice = mongoose.model('ApInvoice', apInvoiceSchema);
export default ApInvoice;
