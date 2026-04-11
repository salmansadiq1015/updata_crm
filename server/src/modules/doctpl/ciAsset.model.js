import mongoose from 'mongoose';

export const ASSET_TYPES = [
  'logo_cmyk',
  'logo_rgb',
  'logo_png',
  'font_300',
  'font_500',
  'font_700',
];

const ciAssetSchema = new mongoose.Schema(
  {
    assetType: {
      type: String,
      enum: ASSET_TYPES,
      required: true,
      index: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'uploadedAt', updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

const CIAsset = mongoose.model('CIAsset', ciAssetSchema);
export default CIAsset;
