import InAppNotification from '../modules/notifications/inAppNotification.model.js';
import logger from '../shared/logger/index.js';

/**
 * Notification feed / unread badge / summary read paths (Notifications page + top-bar badge).
 * - feed_*_cursor: keyset paging on (sentAt desc, _id desc) per filter shape, no in-memory sort.
 * - feed_summary_pending: covers the summary aggregation (index-only) and the pending-actions
 *   top-5 per priority; its { userId, isDismissed, isRead } prefix serves the unread COUNT_SCAN.
 * Chat needs no new index: unread counts / mark-read / history use { roomId, sentAt } and the
 * existing chat_cursor index (bounded by members.lastReadAt, see chatRoom.model.js).
 *
 * Idempotent: each index is created only when no index with the same key pattern exists yet.
 * Two old indexes that are strict key prefixes of new ones are dropped — only once their
 * superseding index exists — to keep notification write cost flat. No document is modified.
 */
export const name = '058_chat_notification_indexes';

const INDEXES = [
  [InAppNotification, { userId: 1, isDismissed: 1, sentAt: -1, _id: -1 }, { name: 'feed_cursor' }],
  [InAppNotification, { userId: 1, isDismissed: 1, isRead: 1, sentAt: -1, _id: -1 }, { name: 'feed_read_cursor' }],
  [InAppNotification, { userId: 1, isDismissed: 1, category: 1, sentAt: -1, _id: -1 }, { name: 'feed_category_cursor' }],
  [InAppNotification, { userId: 1, isDismissed: 1, isRead: 1, priority: 1, category: 1, sentAt: -1, _id: -1 }, { name: 'feed_summary_pending' }],
];

// [retired key, superseding key]
const RETIRED = [
  [{ userId: 1, isDismissed: 1, sentAt: -1 }, { userId: 1, isDismissed: 1, sentAt: -1, _id: -1 }],
  [{ userId: 1, isDismissed: 1, category: 1, sentAt: -1 }, { userId: 1, isDismissed: 1, category: 1, sentAt: -1, _id: -1 }],
];

const sameKey = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function existing(model) {
  try { return await model.collection.indexes(); } catch { return []; } // collection may not exist yet
}

export async function up() {
  for (const [model, key, options] of INDEXES) {
    if ((await existing(model)).some((i) => sameKey(i.key, key))) continue;
    await model.collection.createIndex(key, { background: true, ...options });
    logger.info('Chat/notification read index created', { module: 'migration', collection: model.collection.name, key });
  }
  for (const [retired, superseding] of RETIRED) {
    const indexes = await existing(InAppNotification);
    const old = indexes.find((i) => sameKey(i.key, retired));
    if (old && indexes.some((i) => sameKey(i.key, superseding))) {
      await InAppNotification.collection.dropIndex(old.name);
      logger.info('Redundant notification index dropped', { module: 'migration', key: retired });
    }
  }
}

export async function down() {
  for (const [retired] of RETIRED) {
    if (!(await existing(InAppNotification)).some((i) => sameKey(i.key, retired))) {
      await InAppNotification.collection.createIndex(retired, { background: true });
    }
  }
  for (const [model, key] of INDEXES) {
    const index = (await existing(model)).find((i) => sameKey(i.key, key));
    if (index) await model.collection.dropIndex(index.name);
  }
}

export default { name, up, down };
