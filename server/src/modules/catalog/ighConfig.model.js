import mongoose from 'mongoose';

/**
 * IGH integration configuration — singleton document.
 * Stores endpoint, credentials, sync schedule, and enable state.
 */
const ighConfigSchema = new mongoose.Schema(
  {
    endpointUrl: {
      type: String,
      maxlength: 500,
    },
    credentials: {
      username: { type: String },
      apiKey: { type: String },
    },
    syncSchedule: {
      type: String,
      maxlength: 50,
    },
    lastSyncAt: {
      type: Date,
      default: null,
    },
    isEnabled: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 1,
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
ighConfigSchema.index({ isEnabled: 1 });

const IghConfig = mongoose.model('IghConfig', ighConfigSchema);
export default IghConfig;
