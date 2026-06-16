import mongoose from 'mongoose';

export const PURCHASE_ORDER_STATUSES = ['draft', 'sent', 'partial', 'received', 'cancelled'];

const supplierSnapshotSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 255, default: '' },
    email: { type: String, trim: true, maxlength: 255, default: '' },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    street: { type: String, trim: true, maxlength: 255, default: '' },
    postalCode: { type: String, trim: true, maxlength: 10, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
  },
  { _id: false },
);

const purchaseOrderItemSchema = new mongoose.Schema(
  {
    sparePartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SparePart',
      default: null,
      index: true,
    },
    partNumber: { type: String, trim: true, maxlength: 100, default: '' },
    name: { type: String, trim: true, maxlength: 255, required: true },
    quantity: { type: Number, min: 0.001, required: true },
    receivedQuantity: { type: Number, min: 0, default: 0 },
    unitPrice: { type: Number, min: 0, default: 0 },
    unit: { type: String, trim: true, maxlength: 20, default: 'pcs' },
    supplierPartNumber: { type: String, trim: true, maxlength: 100, default: '' },
  },
  { _id: true },
);

const receiptSchema = new mongoose.Schema(
  {
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    deliveryNoteNumber: { type: String, trim: true, maxlength: 100, default: '' },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    items: [{
      itemId: { type: mongoose.Schema.Types.ObjectId, default: null },
      sparePartId: { type: mongoose.Schema.Types.ObjectId, ref: 'SparePart', default: null },
      name: { type: String, trim: true, maxlength: 255, default: '' },
      receivedQuantity: { type: Number, min: 0, default: 0 },
      movementId: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryMovement', default: null },
    }],
  },
  { _id: true },
);

const purchaseOrderSchema = new mongoose.Schema(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    supplierName: {
      type: String,
      trim: true,
      maxlength: 255,
      default: '',
      index: true,
    },
    supplierSnapshot: {
      type: supplierSnapshotSchema,
      default: () => ({}),
    },
    status: {
      type: String,
      enum: PURCHASE_ORDER_STATUSES,
      default: 'sent',
      index: true,
    },
    expectedDelivery: {
      type: Date,
      default: null,
      index: true,
    },
    currency: {
      type: String,
      trim: true,
      maxlength: 3,
      default: 'CHF',
    },
    items: {
      type: [purchaseOrderItemSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      min: 0,
      default: 0,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    receipts: {
      type: [receiptSchema],
      default: [],
    },
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
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

purchaseOrderSchema.index({ status: 1, createdAt: -1 });
purchaseOrderSchema.index({ supplierId: 1, createdAt: -1 });
purchaseOrderSchema.index({ 'items.sparePartId': 1, createdAt: -1 });
purchaseOrderSchema.index({ orderNumber: 'text', supplierName: 'text', notes: 'text', 'items.name': 'text', 'items.partNumber': 'text' });

const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
export default PurchaseOrder;
