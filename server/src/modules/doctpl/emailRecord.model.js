import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    documentId: { type: mongoose.Schema.Types.ObjectId, default: null },
    fileId: { type: mongoose.Schema.Types.ObjectId, ref: 'FileMetadata', default: null },
    fileName: { type: String },
    fileUrl: { type: String },
  },
  { _id: false },
);

const emailRecordSchema = new mongoose.Schema(
  {
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GeneratedDocument',
      default: null,
    },
    sourceModule: {
      type: String,
      required: true,
    },
    sourceRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    to: {
      type: [String],
      required: true,
    },
    cc: {
      type: [String],
      default: [],
    },
    bcc: {
      type: [String],
      default: [],
    },
    subject: {
      type: String,
      required: true,
      maxlength: 500,
    },
    bodyHtml: {
      type: String,
      required: true,
    },
    bodyText: {
      type: String,
      default: '',
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    senderAddress: {
      type: String,
    },
    senderName: {
      type: String,
      default: 'Updata',
    },
    status: {
      type: String,
      enum: ['QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED'],
      default: 'QUEUED',
      index: true,
    },
    sentAt: { type: Date },
    deliveredAt: { type: Date },
    bouncedAt: { type: Date },
    errorMessage: {
      type: String,
      default: '',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    externalId: {
      type: String,
      default: '',
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
emailRecordSchema.index({ sourceModule: 1, sourceRecordId: 1 });
emailRecordSchema.index({ sentAt: -1 });

const EmailRecord = mongoose.model('EmailRecord', emailRecordSchema);
export default EmailRecord;
