import mongoose from 'mongoose';

const fileFolderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    path: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500,
      index: true,
    },
    parentPath: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    classification: {
      type: String,
      trim: true,
      default: 'general',
      index: true,
      maxlength: 80,
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

fileFolderSchema.index({ path: 1, isDeleted: 1 }, { unique: true });
fileFolderSchema.index({ classification: 1, entityType: 1, entityId: 1 });

fileFolderSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const FileFolder = mongoose.model('FileFolder', fileFolderSchema);
export default FileFolder;
