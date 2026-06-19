import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

export function registerMeetingEvents() {
  const invalidateMeetingLists = async (event) => {
    try {
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}meetings:list:*`);
      logger.info('Meeting caches invalidated', {
        module: 'meetings',
        action: 'event.invalidate',
        eventType: event.type,
        meetingId: event.payload?.meetingId,
      });
    } catch (err) {
      logger.error('Failed to invalidate meeting caches', {
        module: 'meetings',
        action: 'event.invalidate',
        error: { message: err.message, stack: err.stack },
      });
    }
  };

  eventBus.on(EVENT_TYPES.MEETING_CREATED, invalidateMeetingLists);
  eventBus.on(EVENT_TYPES.MEETING_UPDATED, invalidateMeetingLists);
  eventBus.on(EVENT_TYPES.MEETING_CANCELLED, invalidateMeetingLists);
  eventBus.on(EVENT_TYPES.MEETING_TASK_CREATED, invalidateMeetingLists);

  logger.info('Meeting event handlers registered', { module: 'meetings', action: 'events.register' });
}

export default registerMeetingEvents;
