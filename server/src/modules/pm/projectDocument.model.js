import mongoose from 'mongoose';

// --- Enum constants ---
const DOCUMENT_CATEGORIES = ['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER'];
const DOCUMENT_STATUSES = ['FINAL', 'DRAFT'];

const projectDocumentSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    fileId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FileMetadata',
      default: null,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
    },
    category: {
      type: String,
      enum: DOCUMENT_CATEGORIES,
      default: 'OTHER',
    },
    description: { type: String, maxlength: 2000, default: null },
    version: { type: Number, default: 1, min: 1 },
    previousVersionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ProjectDocument',
      default: null,
    },
    isGenerated: { type: Boolean, default: false },
    // PROJ-005: document-generation workflow.
    // status FINAL = a generated/uploaded document with a real file;
    // status DRAFT = an in-progress generated document (templateType + overrides
    // captured) that has NOT yet been finalised into a PDF (fileId may be null).
    status: {
      type: String,
      enum: DOCUMENT_STATUSES,
      default: 'FINAL',
    },
    templateType: { type: String, default: null, trim: true, maxlength: 100 },
    overrides: { type: mongoose.Schema.Types.Mixed, default: null },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  },
);

// --- Indexes ---
projectDocumentSchema.index({ projectId: 1, category: 1 });
projectDocumentSchema.index({ isDeleted: 1 });
projectDocumentSchema.index({ fileId: 1 });

// --- Soft-delete pre-hook ---
projectDocumentSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ProjectDocument = mongoose.model('ProjectDocument', projectDocumentSchema);
export default ProjectDocument;
export { DOCUMENT_CATEGORIES, DOCUMENT_STATUSES };
