import mongoose from 'mongoose';

// --- Enum constants ---
const DOCUMENT_CATEGORIES = ['PLANS', 'CONTRACTS', 'PHOTOS', 'CORRESPONDENCE', 'REPORTS', 'OTHER'];

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
export { DOCUMENT_CATEGORIES };
