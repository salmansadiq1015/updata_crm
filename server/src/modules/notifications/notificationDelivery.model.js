import mongoose from 'mongoose';

export const DELIVERY_STATUSES = ['PENDING', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'BOUNCED', 'CANCELLED'];
export const DELIVERY_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];

const notificationDeliverySchema = new mongoose.Schema(
  {
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
    recipientId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recipientEmail: { type: String, default: null },
    recipientPhone: { type: String, default: null },
    channel: { type: String, enum: DELIVERY_CHANNELS, required: true },
    status: { type: String, enum: DELIVERY_STATUSES, default: 'PENDING' },
    providerMessageId: { type: String, default: null },
    templateId: { type: mongoose.Schema.Types.ObjectId, default: null },
    templateVersion: { type: Number, default: null },
    renderedSubject: { type: String, default: null },
    renderedBody: { type: String, default: null },
    errorCode: { type: String, default: null },
    errorMessage: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    nextRetryAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    failedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

notificationDeliverySchema.index({ notificationId: 1 });
notificationDeliverySchema.index({ recipientId: 1, channel: 1, createdAt: -1 });
notificationDeliverySchema.index({ status: 1, nextRetryAt: 1 });
notificationDeliverySchema.index({ channel: 1, status: 1, createdAt: -1 });
notificationDeliverySchema.index({ providerMessageId: 1 }, { sparse: true });
notificationDeliverySchema.index({ recipientId: 1, channel: 1, status: 1, createdAt: 1 });

const NotificationDelivery = mongoose.model('NotificationDelivery', notificationDeliverySchema);
export default NotificationDelivery;
