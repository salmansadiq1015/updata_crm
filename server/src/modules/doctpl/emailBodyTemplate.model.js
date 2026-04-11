import mongoose from 'mongoose';

const emailBodyTemplateSchema = new mongoose.Schema(
  {
    templateType: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      enum: ['de', 'fr', 'it', 'en'],
      required: true,
    },
    subjectTemplate: {
      type: String,
      required: true,
      maxlength: 500,
    },
    bodyHtml: {
      type: String,
      required: true,
      maxlength: 50000,
    },
    bodyText: {
      type: String,
      maxlength: 20000,
      default: '',
    },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
emailBodyTemplateSchema.index({ templateType: 1, language: 1 }, { unique: true });

const EmailBodyTemplate = mongoose.model('EmailBodyTemplate', emailBodyTemplateSchema);
export default EmailBodyTemplate;
