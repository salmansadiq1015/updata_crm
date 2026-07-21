import mongoose from 'mongoose';

export const NOTIFICATION_CATEGORIES = ['TASK', 'ORDER', 'CHAT', 'SYSTEM', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'CRM', 'PROJECT', 'SCHEDULING'];
export const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];
export const NOTIFICATION_CHANNELS = ['PUSH', 'EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
export const NOTIFICATION_STATUSES = ['QUEUED', 'PROCESSING', 'COMPLETED', 'PARTIAL', 'FAILED'];

const notificationSchema = new mongoose.Schema(
  {
    type: { type: String, required: true, trim: true, maxlength: 100 },
    category: { type: String, enum: NOTIFICATION_CATEGORIES, required: true },
    priority: { type: String, enum: NOTIFICATION_PRIORITIES, default: 'NORMAL' },
    sourceModule: { type: String, default: null },
    sourceEvent: { type: String, default: null },
    sourceEntityType: { type: String, default: null },
    sourceEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    channels: [{ type: String, enum: NOTIFICATION_CHANNELS }],
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // No `default: null`: keyless notifications must leave this field ABSENT so
    // the unique+sparse index skips them. A stored null still counts as present
    // and would collide across all keyless notifications.
    idempotencyKey: { type: String },
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'QUEUED' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    processedAt: { type: Date, default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ category: 1, createdAt: -1 });
notificationSchema.index({ sourceEntityType: 1, sourceEntityId: 1 });
notificationSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
notificationSchema.index({ status: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ 'recipientIds': 1 });

notificationSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
