import mongoose from 'mongoose';

export const PROCESSING_STATUSES = ['pending', 'processed', 'duplicate', 'spam'];
export const REQUEST_TYPES = ['heizungsstoerung', 'wartung', 'neuinstallation', 'beratung', 'other'];

const widgetSubmissionSchema = new mongoose.Schema(
  {
    widgetId: { type: String, required: true, default: 'mb-boiler-main-site' },
    referenceNumber: { type: String, unique: true },
    contactName: { type: String, required: true, trim: true, maxlength: 200 },
    contactEmail: { type: String, required: true, trim: true, maxlength: 200 },
    contactPhone: { type: String, trim: true, maxlength: 30, default: null },
    contactAddress: {
      street: { type: String, maxlength: 200, default: null },
      zip: { type: String, maxlength: 10, default: null },
      city: { type: String, maxlength: 100, default: null },
    },
    requestType: { type: String, enum: REQUEST_TYPES, required: true },
    description: { type: String, required: true, maxlength: 5000 },
    preferredWindow: { type: String, maxlength: 100, default: null },
    attachments: [
      {
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'File', default: null },
        key: { type: String, default: null },
        originalName: { type: String, default: null },
        mimeType: { type: String, default: null },
        sizeBytes: { type: Number, default: null },
        _id: false,
      },
    ],
    captchaScore: { type: Number, min: 0, max: 1, default: null },
    ipAddress: { type: String, default: null },
    userAgent: { type: String, default: null },
    language: { type: String, default: 'de', maxlength: 5 },
    processingStatus: { type: String, enum: PROCESSING_STATUSES, default: 'pending' },
    crmContactId: { type: mongoose.Schema.Types.ObjectId, default: null },
    orderId: { type: mongoose.Schema.Types.ObjectId, default: null },
    processedAt: { type: Date, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

widgetSubmissionSchema.index({ processingStatus: 1, createdAt: -1 });
widgetSubmissionSchema.index({ contactEmail: 1, requestType: 1, createdAt: -1 });
widgetSubmissionSchema.index({ createdAt: -1 });

widgetSubmissionSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const WidgetSubmission = mongoose.model('WidgetSubmission', widgetSubmissionSchema);
export default WidgetSubmission;
