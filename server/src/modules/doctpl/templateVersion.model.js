import mongoose from 'mongoose';

const templateVersionSchema = new mongoose.Schema(
  {
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentTemplate',
      required: true,
      index: true,
    },
    version: {
      type: Number,
      required: true,
    },
    changeDescription: {
      type: String,
      maxlength: 1000,
      default: '',
    },
    templateSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
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
templateVersionSchema.index({ templateId: 1, version: 1 }, { unique: true });

const TemplateVersion = mongoose.model('TemplateVersion', templateVersionSchema);
export default TemplateVersion;
