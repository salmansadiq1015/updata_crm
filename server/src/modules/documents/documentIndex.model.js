import mongoose from 'mongoose';

export const DOCUMENT_SOURCES = ['repository', 'generated', 'project', 'customer', 'accounting', 'mobile'];
export const DOCUMENT_ORIGINS = ['uploaded', 'generated', 'received', 'draft'];

const documentIndexSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: DOCUMENT_SOURCES,
      default: 'repository',
      index: true,
    },
    origin: {
      type: String,
      enum: DOCUMENT_ORIGINS,
      default: 'uploaded',
      index: true,
    },
    sourceDocumentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      default: null,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      maxlength: 300,
      default: '',
    },
    fileName: {
      type: String,
      trim: true,
      maxlength: 500,
      required: true,
    },
    mimeType: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
    },
    fileSizeBytes: {
      type: Number,
      default: 0,
      min: 0,
    },
    documentType: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'OTHER',
      index: true,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 100,
      default: 'OTHER',
      index: true,
    },
    status: {
      type: String,
      trim: true,
      maxlength: 80,
      default: 'FINAL',
      index: true,
    },
    folderPath: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
      index: true,
    },
    description: {
      type: String,
      maxlength: 2000,
      default: '',
    },
    sourceRecordType: {
      type: String,
      trim: true,
      maxlength: 80,
      default: '',
      index: true,
    },
    sourceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
      index: true,
    },
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    installationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Installation',
      default: null,
      index: true,
    },
    ownerUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
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
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

documentIndexSchema.index({ source: 1, sourceDocumentId: 1 }, { unique: true });
documentIndexSchema.index({ createdAt: -1, _id: -1 });
documentIndexSchema.index({ projectId: 1, createdAt: -1 });
documentIndexSchema.index({ customerId: 1, createdAt: -1 });
documentIndexSchema.index({ jobId: 1, createdAt: -1 });
documentIndexSchema.index({ employeeId: 1, createdAt: -1 });
documentIndexSchema.index({ installationId: 1, createdAt: -1 });
documentIndexSchema.index(
  {
    title: 'text',
    fileName: 'text',
    description: 'text',
    documentType: 'text',
    category: 'text',
    folderPath: 'text',
  },
  {
    weights: {
      title: 10,
      fileName: 10,
      documentType: 5,
      category: 4,
      folderPath: 3,
      description: 1,
    },
  },
);

documentIndexSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const DocumentIndex = mongoose.model('DocumentIndex', documentIndexSchema);
export default DocumentIndex;
