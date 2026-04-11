import mongoose from 'mongoose';

const inAppNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
    category: { type: String, default: 'SYSTEM' },
    icon: { type: String, default: null },
    title: { type: String, required: true, maxlength: 255 },
    body: { type: String, required: true, maxlength: 1000 },
    deepLink: { type: String, maxlength: 500, default: null },
    isRead: { type: Boolean, default: false },
    isDismissed: { type: Boolean, default: false },
    relatedEntityType: { type: String, default: null },
    relatedEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

inAppNotificationSchema.index({ userId: 1, isDismissed: 1, sentAt: -1 });
inAppNotificationSchema.index({ userId: 1, isRead: 1 });
inAppNotificationSchema.index({ notificationId: 1 }, { sparse: true });

const InAppNotification = mongoose.model('InAppNotification', inAppNotificationSchema);
export default InAppNotification;
