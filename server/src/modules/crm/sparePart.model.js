import mongoose from 'mongoose';

const sparePartSchema = new mongoose.Schema(
  {
    partNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    description: {
      type: String,
      maxlength: 2000,
      default: null,
    },
    manufacturer: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    category: {
      type: String,
      enum: ['filter', 'gasket', 'pump_part', 'valve', 'sensor', 'igniter', 'burner_part', 'control_board', 'other'],
      required: true,
      index: true,
    },
    unitPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    currency: {
      type: String,
      maxlength: 3,
      default: 'CHF',
    },
    unit: {
      type: String,
      maxlength: 20,
      default: 'pcs',
    },
    minStockLevel: {
      type: Number,
      min: 0,
      default: 0,
    },
    currentStock: {
      type: Number,
      min: 0,
      default: 0,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
      default: null,
    },
    supplierPartNumber: {
      type: String,
      maxlength: 100,
      default: null,
    },
    compatibleInstallationTypes: {
      type: [String],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
sparePartSchema.index(
  { partNumber: 'text', name: 'text', manufacturer: 'text' },
);
sparePartSchema.index({ isDeleted: 1, isActive: 1 });

// --- Soft-delete pre-hook ---
sparePartSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const SparePart = mongoose.model('SparePart', sparePartSchema);
export default SparePart;
