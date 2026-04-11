import mongoose from 'mongoose';

const articleVersionSchema = new mongoose.Schema(
  {
    articleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Article',
      required: true,
    },
    version: {
      type: Number,
      required: true,
    },
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    changedFields: {
      type: [String],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
articleVersionSchema.index({ articleId: 1, version: 1 }, { unique: true });
articleVersionSchema.index({ articleId: 1 });

const ArticleVersion = mongoose.model('ArticleVersion', articleVersionSchema);
export default ArticleVersion;
