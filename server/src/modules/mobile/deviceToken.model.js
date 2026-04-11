import mongoose from 'mongoose';

export const PLATFORMS = ['IOS', 'ANDROID'];

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    deviceToken: {
      type: String,
      required: true,
      unique: true,
    },
    platform: {
      type: String,
      enum: PLATFORMS,
      required: true,
    },
    deviceId: { type: String, default: null },
    appVersion: { type: String, default: null },
    isActive: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
deviceTokenSchema.index({ userId: 1 });

const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
export default DeviceToken;
