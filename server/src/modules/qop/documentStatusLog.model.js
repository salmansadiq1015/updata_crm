import mongoose from 'mongoose';

const documentStatusLogSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: ['quotation', 'order', 'invoice'],
      required: true,
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    fromStatus: {
      type: String,
      required: true,
    },
    toStatus: {
      type: String,
      required: true,
    },
    changedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    changedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      maxlength: 2000,
      default: null,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  },
);

// --- Indexes ---
documentStatusLogSchema.index({ documentType: 1, documentId: 1, changedAt: -1 });

const DocumentStatusLog = mongoose.model('DocumentStatusLog', documentStatusLogSchema);
export default DocumentStatusLog;
