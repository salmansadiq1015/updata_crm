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
    sourceCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    sourceProjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    sourceDepartmentId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    archived: {
      type: Boolean,
      default: false,
      index: true,
    },
    archivedAt: {
      type: Date,
      default: null,
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
generatedDocumentSchema.index({ sourceModule: 1, sourceProjectId: 1, generatedAt: -1 });
generatedDocumentSchema.index({ sourceModule: 1, sourceCustomerId: 1, generatedAt: -1 });
generatedDocumentSchema.index({ generatedAt: -1 });

const GeneratedDocument = mongoose.model('GeneratedDocument', generatedDocumentSchema);
export default GeneratedDocument;
