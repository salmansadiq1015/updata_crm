import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class NotificationChannelPushWorker extends BaseWorker {
  constructor() {
    super('notification-push');
  }

  async process(job) {
    const { deliveryId } = job.data;
    const notificationService = (await import('../modules/notifications/notification.service.js')).default;

    try {
      await notificationService.processChannelDelivery(deliveryId, 'PUSH');
      return { deliveryId, channel: 'PUSH', status: 'processed' };
    } catch (err) {
      logger.error('Push notification delivery failed', {
        module: 'jobs',
        action: 'notification-push',
        deliveryId,
        error: { message: err.message },
      });
      throw err;
    }
  }
}
