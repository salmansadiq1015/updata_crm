import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class NotificationChannelEmailWorker extends BaseWorker {
  constructor() {
    super('notification-email');
  }

  async process(job) {
    const { deliveryId } = job.data;
    const notificationService = (await import('../modules/notifications/notification.service.js')).default;

    try {
      await notificationService.processChannelDelivery(deliveryId, 'EMAIL');
      return { deliveryId, channel: 'EMAIL', status: 'processed' };
    } catch (err) {
      logger.error('Email notification delivery failed', {
        module: 'jobs',
        action: 'notification-email',
        deliveryId,
        error: { message: err.message },
      });
      throw err;
    }
  }
}
