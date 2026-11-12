import inAppNotificationRepository from './inAppNotification.repository.js';
import { bumpNotificationGeneration, cachedNotificationRead } from './notificationFeedCache.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const FEED_TTL = { l1Ttl: 15, l2Ttl: 60 };
const UNREAD_TTL = { l1Ttl: 10, l2Ttl: 30 };

class NotificationFeedService {
  /**
   * Feed page + summary. Both are cached under the user's notification
   * generation (bumped by every InAppNotification write), so a page is never
   * served stale after a write; the summary is cached once per generation and
   * shared by every page / filter combination.
   */
  async getFeed(userId, { cursor, limit = 50, category, isRead, search } = {}) {
    const params = { cursor: cursor || '', limit, category: category || '', isRead: isRead ?? '', search: search || '' };
    const [feed, summary] = await Promise.all([
      cachedNotificationRead('feed', userId, params,
        () => inAppNotificationRepository.findByUserId(userId, { cursor, limit, category, isRead, search }), FEED_TTL),
      this.getSummary(userId),
    ]);

    return {
      ...feed,
      summary,
    };
  }

  async getSummary(userId) {
    return cachedNotificationRead('summary', userId, undefined,
      () => inAppNotificationRepository.getSummary(userId), FEED_TTL);
  }

  /** Hot path (badge polled on every page): one Redis MGET + L1/L2 hit, else an index-only COUNT_SCAN. */
  async getUnreadCount(userId) {
    return cachedNotificationRead('unread', userId, undefined,
      () => inAppNotificationRepository.countUnread(userId), UNREAD_TTL);
  }

  async markRead(id, userId) {
    const result = await inAppNotificationRepository.markRead(id, userId);
    if (!result) throw new NotFoundError('InAppNotification', id);

    await this._invalidateFeedCache(userId);

    logger.info('In-app notification marked as read', {
      module: 'notifications',
      action: 'markRead',
      notificationId: id,
      userId,
    });

    return result;
  }

  async markAllRead(userId) {
    const modifiedCount = await inAppNotificationRepository.markAllRead(userId);

    await this._invalidateFeedCache(userId);

    logger.info('All in-app notifications marked as read', {
      module: 'notifications',
      action: 'markAllRead',
      userId,
      modifiedCount,
    });

    return { modifiedCount };
  }

  async dismiss(id, userId) {
    const result = await inAppNotificationRepository.dismiss(id, userId);
    if (!result) throw new NotFoundError('InAppNotification', id);

    await this._invalidateFeedCache(userId);

    logger.info('In-app notification dismissed', {
      module: 'notifications',
      action: 'dismiss',
      notificationId: id,
      userId,
    });

    return result;
  }

  // Model middleware already bumps on every write; awaiting here makes the shared (Redis)
  // bump visible before the response returns, so the client's immediate refetch is fresh.
  async _invalidateFeedCache(userId) {
    await bumpNotificationGeneration(userId);
  }
}

const notificationFeedService = new NotificationFeedService();
export default notificationFeedService;
