import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class NotificationDispatchWorker extends BaseWorker {
  constructor() {
    super('notification-dispatch');
  }

  async process(job) {
    const { notificationId } = job.data;
    const notificationService = (await import('../modules/notifications/notification.service.js')).default;

    try {
      await notificationService.processDispatch(notificationId);
      return { notificationId, status: 'dispatched' };
    } catch (err) {
      logger.error('Notification dispatch failed', {
        module: 'jobs',
        action: 'notification-dispatch',
        notificationId,
        error: { message: err.message, stack: err.stack },
      });
      throw err; // Let BullMQ retry
    }
  }
}
