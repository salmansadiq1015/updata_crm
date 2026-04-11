import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class ScheduledNotificationPollWorker extends BaseWorker {
  constructor() {
    super('scheduled-notification-poll');
  }

  async process(job) {
    const scheduledNotificationService = (await import('../modules/notifications/scheduledNotification.service.js')).default;

    try {
      const result = await scheduledNotificationService.processDueSchedules();

      if (result.processed > 0) {
        logger.info('Scheduled notifications processed', {
          module: 'jobs',
          action: 'scheduled-notification-poll',
          processed: result.processed,
          failed: result.failed,
        });
      }

      return result;
    } catch (err) {
      logger.error('Scheduled notification poll failed', {
        module: 'jobs',
        action: 'scheduled-notification-poll',
        error: { message: err.message, stack: err.stack },
      });
      throw err;
    }
  }
}
