import mongoose from 'mongoose';

const entityImageSchema = new mongoose.Schema(
  {
    entityType: {
      type: String,
      enum: ['customer', 'site', 'installation'],
      required: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      required: true,
    },
    caption: {
      type: String,
      trim: true,
      maxlength: 255,
      default: null,
    },
    category: {
      type: String,
      enum: ['nameplate', 'damage', 'before_after', 'general'],
      default: 'general',
    },
    sortOrder: { type: Number, default: 0 },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  },
);

// --- Indexes ---
entityImageSchema.index({ entityType: 1, entityId: 1 });

const EntityImage = mongoose.model('EntityImage', entityImageSchema);
export default EntityImage;
