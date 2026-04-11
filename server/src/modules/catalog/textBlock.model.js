import mongoose from 'mongoose';

const textBlockSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 300,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CatalogCategory',
      default: null,
    },
    bodyHtml: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    price: {
      type: Number,
      default: null,
      min: 0,
    },
    unit: {
      type: String,
      maxlength: 10,
      default: null,
    },
    status: {
      type: String,
      enum: ['ACTIVE', 'INACTIVE'],
      default: 'ACTIVE',
      index: true,
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
textBlockSchema.index({ categoryId: 1 });
textBlockSchema.index({ isDeleted: 1, status: 1 });
textBlockSchema.index(
  { title: 'text', bodyHtml: 'text' },
  { weights: { title: 10, bodyHtml: 2 } },
);

// --- Soft-delete pre-hook ---
textBlockSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const TextBlock = mongoose.model('TextBlock', textBlockSchema);
export default TextBlock;
