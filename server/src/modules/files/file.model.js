import mongoose from 'mongoose';

/**
 * File metadata schema.
 *
 * Stores metadata about uploaded files. Actual file content lives in S3.
 * Uses polymorphic reference (entityType + entityId) so any module
 * can associate files without schema changes here.
 *
 * Soft delete: isDeleted flag + deletedAt timestamp.
 * Cleanup job processes soft-deleted files after retention period.
 */
const fileMetadataSchema = new mongoose.Schema(
  {
    bucket: {
      type: String,
      required: true,
      index: true,
      enum: ['images', 'documents', 'photos', 'general', 'ci-assets'],
      default: 'general',
    },
    key: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },
    sizeBytes: {
      type: Number,
      required: true,
      min: 0,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    module: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    entityType: {
      type: String,
      trim: true,
      default: null,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    folderPath: {
      type: String,
      trim: true,
      default: '',
      index: true,
      maxlength: 500,
    },
    category: {
      type: String,
      trim: true,
      default: 'general',
      index: true,
      maxlength: 80,
    },
    storageBackend: {
      type: String,
      enum: ['local', 'minio', 's3'],
      default: 's3',
    },
    checksumSha256: {
      type: String,
      trim: true,
      default: '',
    },
    // Digitales Dossier / Visum — same two flags on every backing model, so the
    // federated document list can offer one set of actions everywhere.
    visumBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    visumAt: { type: Date, default: null },
    releasedToField: { type: Boolean, default: false, index: true },
    releasedAt: { type: Date, default: null },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
  },
  {
    timestamps: true, // createdAt, updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
// Unique S3 key per bucket
fileMetadataSchema.index({ bucket: 1, key: 1 }, { unique: true });

// Primary lookup: "all files for entity X"
fileMetadataSchema.index({ module: 1, entityType: 1, entityId: 1 });
fileMetadataSchema.index({ folderPath: 1, createdAt: -1 });
fileMetadataSchema.index({ category: 1, createdAt: -1 });

// User's upload history
fileMetadataSchema.index({ uploadedBy: 1, createdAt: -1 });

// Cleanup job: find soft-deleted files past retention
fileMetadataSchema.index({ isDeleted: 1, deletedAt: 1 });

// Recent files listing
fileMetadataSchema.index({ createdAt: -1 });

// Default query scope: exclude soft-deleted files
fileMetadataSchema.pre(/^find/, function () {
  // Allow explicit queries for deleted files (e.g., cleanup job)
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const FileMetadata = mongoose.model('FileMetadata', fileMetadataSchema);
export default FileMetadata;
