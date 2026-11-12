import mongoose from 'mongoose';
import { bumpNotificationGeneration } from './notificationFeedCache.js';

export const IN_APP_NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'];

const inAppNotificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', default: null },
    category: { type: String, default: 'SYSTEM' },
    priority: { type: String, enum: IN_APP_NOTIFICATION_PRIORITIES, default: 'NORMAL' },
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

inAppNotificationSchema.index({ userId: 1, isRead: 1 });
inAppNotificationSchema.index({ userId: 1, isDismissed: 1, isRead: 1, priority: 1, sentAt: -1 });
inAppNotificationSchema.index({ notificationId: 1 }, { sparse: true });
// feed_cursor / feed_category_cursor supersede { userId, isDismissed, sentAt } and
// { userId, isDismissed, category, sentAt } (strict prefixes; retired by migration 058).
// Keyset feed paging (sort { sentAt: -1, _id: -1 }) without an in-memory sort, per filter shape.
inAppNotificationSchema.index({ userId: 1, isDismissed: 1, sentAt: -1, _id: -1 }, { name: 'feed_cursor' });
inAppNotificationSchema.index({ userId: 1, isDismissed: 1, isRead: 1, sentAt: -1, _id: -1 }, { name: 'feed_read_cursor' });
inAppNotificationSchema.index({ userId: 1, isDismissed: 1, category: 1, sentAt: -1, _id: -1 }, { name: 'feed_category_cursor' });
// Covers the summary aggregation (no document fetch) and serves the pending-actions top-5 per priority.
inAppNotificationSchema.index({ userId: 1, isDismissed: 1, isRead: 1, priority: 1, category: 1, sentAt: -1, _id: -1 }, { name: 'feed_summary_pending' });

// Cache invalidation: any write bumps the owning user's feed/unread cache generation.
// Writes whose user is not a single id in the filter bump the global generation.
function filterUserId(query) {
  const userId = query.getFilter?.()?.userId;
  if (userId instanceof mongoose.Types.ObjectId || typeof userId === 'string') return userId;
  return null;
}
inAppNotificationSchema.post('save', (doc) => { bumpNotificationGeneration(doc?.userId ?? null); });
inAppNotificationSchema.post('insertMany', (docs) => {
  const ids = new Set((Array.isArray(docs) ? docs : [docs]).map((doc) => (doc?.userId ? String(doc.userId) : null)));
  if (ids.has(null) || ids.size === 0) bumpNotificationGeneration(null);
  ids.forEach((id) => id && bumpNotificationGeneration(id));
});
const QUERY_WRITES = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'];
inAppNotificationSchema.post(QUERY_WRITES, { document: false, query: true }, function bumpOnQueryWrite(result) {
  const userId = filterUserId(this) ?? result?.userId ?? null;
  bumpNotificationGeneration(userId);
});
inAppNotificationSchema.post('bulkWrite', () => { bumpNotificationGeneration(null); });

const InAppNotification = mongoose.model('InAppNotification', inAppNotificationSchema);
export default InAppNotification;
