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

const InstallationSparePart = mongoose.model('InstallationSparePart', installationSparePartSchema);
export default InstallationSparePart;
