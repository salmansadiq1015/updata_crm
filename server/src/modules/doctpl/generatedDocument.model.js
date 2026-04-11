import mongoose from 'mongoose';

const generatedDocumentSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentTemplate',
      required: true,
    },
    templateVersion: {
      type: Number,
      required: true,
    },
    documentType: {
      type: String,
      required: true,
      index: true,
    },
    sourceModule: {
      type: String,
      required: true,
    },
    sourceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    language: {
      type: String,
      enum: ['de', 'fr', 'it', 'en'],
      required: true,
      default: 'de',
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      maxlength: 500,
    },
    fileSizeBytes: {
      type: Number,
    },
    pageCount: {
      type: Number,
      default: 1,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: 'generatedAt', updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
generatedDocumentSchema.index({ sourceModule: 1, sourceRecordId: 1 });
generatedDocumentSchema.index({ generatedAt: -1 });

const GeneratedDocument = mongoose.model('GeneratedDocument', generatedDocumentSchema);
export default GeneratedDocument;
