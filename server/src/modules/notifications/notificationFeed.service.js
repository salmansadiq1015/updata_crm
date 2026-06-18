import inAppNotificationRepository from './inAppNotification.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const FEED_TTL = { l1Ttl: 15, l2Ttl: 60 };
const UNREAD_TTL = { l1Ttl: 10, l2Ttl: 30 };

class NotificationFeedService {
  async getFeed(userId, { cursor, limit = 50, category, isRead, search } = {}) {
    const cacheKey = `notif:feed:${userId}:${cursor || ''}:${limit}:${category || ''}:${isRead ?? ''}:${search || ''}`;

    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const [feed, summary] = await Promise.all([
          inAppNotificationRepository.findByUserId(userId, { cursor, limit, category, isRead, search }),
          inAppNotificationRepository.getSummary(userId),
        ]);

        return {
          ...feed,
          summary,
        };
      },
      FEED_TTL,
    );
  }

  async getUnreadCount(userId) {
    const cacheKey = `notif:unread:${userId}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => inAppNotificationRepository.countUnread(userId),
      UNREAD_TTL,
    );
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

  async _invalidateFeedCache(userId) {
    await cacheManager.del(`notif:unread:${userId}`);
    await cacheManager.invalidatePattern(`notif:feed:${userId}:*`);
  }
}

const notificationFeedService = new NotificationFeedService();
export default notificationFeedService;
