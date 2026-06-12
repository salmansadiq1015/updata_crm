import mongoose from 'mongoose';
import voiceMetadataSchema from '../../shared/schemas/voiceMetadata.schema.js';

export const ORDER_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const lineItemSchema = new mongoose.Schema(
  {
    position: { type: Number, required: true },
    articleNumber: { type: String, trim: true, maxlength: 50, default: '' },
    description: { type: String, required: true, trim: true, maxlength: 1000 },
    unit: { type: String, trim: true, maxlength: 20, default: 'pcs' },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    vatRate: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, default: 0 },
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

const orderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      unique: true,
      required: true,
      trim: true,
    },
    sourceQuotationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Quotation',
      default: null,
    },
    sourceQuotationNumber: {
      type: String,
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
      enum: ['CHF', 'EUR'],
      default: 'CHF',
    },
    globalDiscountPercent: { type: Number, default: 0, min: 0, max: 100 },
    subtotal: { type: Number, default: 0 },
    vatBreakdown: [vatBreakdownSchema],
    grandTotal: { type: Number, default: 0 },
    roundingAmount: { type: Number, default: 0 },
    grandTotalRounded: { type: Number, default: 0 },
    paymentTerms: { type: String, maxlength: 1000, default: null },
    notes: { type: String, maxlength: 5000, default: null },
    voiceAttachments: { type: [voiceMetadataSchema], default: [] },
    termsAndConditions: { type: String, maxlength: 10000, default: null },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'CONFIRMED',
      index: true,
    },
    requestedDate: { type: Date, default: null },
    assignedTeam: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    specialInstructions: { type: String, maxlength: 5000, default: '' },
    orderConfirmationDocId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    invoiceIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Invoice',
      },
    ],
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
orderSchema.index({ customerId: 1, status: 1 });
orderSchema.index({ sourceQuotationId: 1 });
orderSchema.index({ projectId: 1 });
orderSchema.index({ isDeleted: 1, createdAt: -1 });
orderSchema.index(
  { orderNumber: 'text', title: 'text', customerName: 'text' },
  { weights: { orderNumber: 10, title: 5, customerName: 3 } },
);

// --- Soft-delete pre-hook ---
orderSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Order = mongoose.model('Order', orderSchema);
export default Order;
