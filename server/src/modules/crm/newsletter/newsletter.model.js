import mongoose from 'mongoose';

const newsletterSchema = new mongoose.Schema(
  {
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    bodyHtml: {
      type: String,
      required: true,
    },
    bodyText: {
      type: String,
      default: null,
    },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'sending', 'sent', 'cancelled'],
      default: 'draft',
      index: true,
    },
    channels: [
      {
        type: String,
        enum: ['email'],
      },
    ],
    recipientFilter: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    recipientCount: {
      type: Number,
      default: 0,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },
    stats: {
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
newsletterSchema.index({ createdAt: -1 });
newsletterSchema.index({ scheduledAt: 1 }, { sparse: true });
newsletterSchema.index({ isDeleted: 1, status: 1 });

// --- Soft-delete pre-hook ---
newsletterSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Newsletter = mongoose.model('Newsletter', newsletterSchema);
export default Newsletter;
