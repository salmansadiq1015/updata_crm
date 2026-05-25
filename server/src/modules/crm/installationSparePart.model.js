import mongoose from 'mongoose';

const installationSparePartSchema = new mongoose.Schema(
  {
    installationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Installation',
      required: true,
      index: true,
    },
    sparePartId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SparePart',
      required: true,
      index: true,
    },
    quantity: {
      type: Number,
      min: 1,
      default: 1,
    },
    lastReplacedDate: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    needsOrdering: {
      type: Boolean,
      default: false,
      index: true,
    },
    orderQuantity: {
      type: Number,
      min: 1,
      default: null,
    },
    orderUrgency: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: null,
      index: true,
    },
    orderNotes: {
      type: String,
      maxlength: 1000,
      default: null,
    },
    orderFlaggedAt: {
      type: Date,
      default: null,
    },
    orderFlaggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    orderFulfilledAt: {
      type: Date,
      default: null,
    },
    orderFulfilledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    orderStatus: {
      type: String,
      enum: ['requested', 'ordered', 'received', 'cancelled'],
      default: null,
      index: true,
    },
    createdBy: {
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

// --- Compound unique index ---
installationSparePartSchema.index(
  { installationId: 1, sparePartId: 1 },
  { unique: true },
);
installationSparePartSchema.index({ orderStatus: 1, orderUrgency: 1, orderFlaggedAt: -1 });

const InstallationSparePart = mongoose.model('InstallationSparePart', installationSparePartSchema);
export default InstallationSparePart;
