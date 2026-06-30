import mongoose from 'mongoose';

export const INVENTORY_COSTING_METHODS = ['FIFO', 'LIFO', 'WEIGHTED_AVERAGE'];

const inventoryAccountingEntrySchema = new mongoose.Schema(
  {
    movementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InventoryMovement',
      required: true,
      unique: true,
      index: true,
    },
    sparePartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SparePart',
      required: true,
      index: true,
    },
    partNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    partName: {
      type: String,
      trim: true,
      maxlength: 255,
      required: true,
    },
    movementType: {
      type: String,
      trim: true,
      required: true,
    },
    costingMethod: {
      type: String,
      enum: INVENTORY_COSTING_METHODS,
      default: 'WEIGHTED_AVERAGE',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    valuationAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3,
      default: 'CHF',
      required: true,
    },
    journalEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JournalEntry',
      default: null,
      index: true,
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

inventoryAccountingEntrySchema.index({ currency: 1, createdAt: -1 });
inventoryAccountingEntrySchema.index({ costingMethod: 1, createdAt: -1 });

const InventoryAccountingEntry = mongoose.model('InventoryAccountingEntry', inventoryAccountingEntrySchema);
export default InventoryAccountingEntry;
