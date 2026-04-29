import mongoose from 'mongoose';

const dlqEntrySchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
    },
    envelope: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    error: {
      type: String,
      required: true,
    },
    stack: {
      type: String,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 3,
    },
    status: {
      type: String,
      enum: ['pending', 'retrying', 'resolved', 'failed'],
      default: 'pending',
    },
    resolvedAt: {
      type: Date,
    },
    lastRetryAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
dlqEntrySchema.index({ eventType: 1 });
dlqEntrySchema.index({ status: 1 });
dlqEntrySchema.index({ status: 1, createdAt: 1 });

const DlqEntry = mongoose.model('DlqEntry', dlqEntrySchema);
export default DlqEntry;
