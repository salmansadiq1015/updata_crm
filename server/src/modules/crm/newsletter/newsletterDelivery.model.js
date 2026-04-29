import mongoose from 'mongoose';

const newsletterDeliverySchema = new mongoose.Schema(
  {
    newsletterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Newsletter',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    channel: {
      type: String,
      default: 'email',
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'delivered', 'failed', 'opened'],
      default: 'pending',
      index: true,
    },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    openedAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
    errorMessage: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

// Compound unique index — one delivery per customer per newsletter
newsletterDeliverySchema.index(
  { newsletterId: 1, customerId: 1 },
  { unique: true },
);

const NewsletterDelivery = mongoose.model('NewsletterDelivery', newsletterDeliverySchema);
export default NewsletterDelivery;
