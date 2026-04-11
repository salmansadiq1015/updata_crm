import mongoose from 'mongoose';

export const PHOTO_CATEGORIES = ['BEFORE', 'AFTER', 'DAMAGE', 'INSTALLATION', 'GENERAL', 'NAMEPLATE'];

const mobilePhotoSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    workReportId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      required: true,
    },
    category: {
      type: String,
      enum: PHOTO_CATEGORIES,
      required: true,
    },
    caption: {
      type: String,
      maxlength: 300,
      default: null,
    },
    hasAnnotations: { type: Boolean, default: false },
    annotationData: { type: String, default: null },
    latitude: { type: Number, default: null },
    longitude: { type: Number, default: null },
    capturedAt: { type: Date, required: true },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
mobilePhotoSchema.index({ orderId: 1 });
mobilePhotoSchema.index({ workReportId: 1 });

const MobilePhoto = mongoose.model('MobilePhoto', mobilePhotoSchema);
export default MobilePhoto;
