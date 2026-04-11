import mongoose from 'mongoose';

export const SCHEDULE_TYPES = ['ONE_TIME', 'RECURRING'];
export const SCHEDULE_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED'];

const scheduledNotificationSchema = new mongoose.Schema(
  {
    notificationType: { type: String, required: true },
    category: { type: String, default: 'SYSTEM' },
    scheduleType: { type: String, enum: SCHEDULE_TYPES, required: true },
    scheduledAt: { type: Date, default: null },
    cronExpression: { type: String, default: null },
    timezone: { type: String, default: 'Europe/Zurich' },
    endDate: { type: Date, default: null },
    recipientQuery: { type: mongoose.Schema.Types.Mixed, default: null },
    recipientIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    channels: [{ type: String }],
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    priority: { type: String, default: 'NORMAL' },
    status: { type: String, enum: SCHEDULE_STATUSES, default: 'ACTIVE' },
    lastDispatchedAt: { type: Date, default: null },
    nextDispatchAt: { type: Date, default: null },
    sourceModule: { type: String, default: null },
    sourceEntityType: { type: String, default: null },
    sourceEntityId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

scheduledNotificationSchema.index({ status: 1, nextDispatchAt: 1 });
scheduledNotificationSchema.index({ sourceEntityType: 1, sourceEntityId: 1 });
scheduledNotificationSchema.index({ isDeleted: 1 });

scheduledNotificationSchema.pre(/^find/, function () {
  if (this.getOptions().includeDeleted) return;
  this.where({ isDeleted: false });
});

const ScheduledNotification = mongoose.model('ScheduledNotification', scheduledNotificationSchema);
export default ScheduledNotification;
