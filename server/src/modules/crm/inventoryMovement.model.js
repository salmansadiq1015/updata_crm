import mongoose from 'mongoose';

export const INVENTORY_MOVEMENT_TYPES = ['in', 'out', 'correction', 'receipt', 'issue', 'adjustment'];
export const INVENTORY_REFERENCE_TYPES = [
  'manual',
  'purchase_order',
  'delivery_note',
  'installation_order_request',
  'stock_adjustment',
];

const inventoryMovementSchema = new mongoose.Schema(
  {
    sparePartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SparePart',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: INVENTORY_MOVEMENT_TYPES,
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    stockBefore: {
      type: Number,
      required: true,
      min: 0,
    },
    stockAfter: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      trim: true,
      maxlength: 20,
      default: 'pcs',
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null,
      index: true,
    },
    deliveryNoteJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryNoteOcrJob',
      default: null,
      index: true,
    },
    referenceType: {
      type: String,
      enum: INVENTORY_REFERENCE_TYPES,
      default: 'manual',
      index: true,
    },
    referenceNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    deliveryNoteNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

inventoryMovementSchema.index({ createdAt: -1, _id: -1 });
inventoryMovementSchema.index({ sparePartId: 1, createdAt: -1 });
inventoryMovementSchema.index({ supplierId: 1, createdAt: -1 });
inventoryMovementSchema.index({ type: 1, createdAt: -1 });
inventoryMovementSchema.index(
  { referenceNumber: 'text', reason: 'text', deliveryNoteNumber: 'text' },
);

const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);
export default InventoryMovement;
