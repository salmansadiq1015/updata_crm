import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = [
  'NEW_ASSIGNMENT',
  'ORDER_CHANGED',
  'ORDER_CANCELLED',
  'CHAT_MESSAGE',
  'DAILY_REMINDER',
  'ESCALATION',
];

const notificationLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    notificationType: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 255,
    },
    body: {
      type: String,
      required: true,
      maxlength: 500,
    },
    deepLink: {
      type: String,
      maxlength: 300,
      default: null,
    },
    isRead: { type: Boolean, default: false },
    relatedEntityType: { type: String, default: null },
    relatedEntityId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sentAt: { type: Date, required: true, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// --- Indexes ---
notificationLogSchema.index({ userId: 1, sentAt: -1 });
notificationLogSchema.index({ userId: 1, isRead: 1 });

const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);
export default NotificationLog;
