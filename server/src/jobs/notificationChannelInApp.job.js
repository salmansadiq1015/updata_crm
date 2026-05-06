import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class NotificationChannelInAppWorker extends BaseWorker {
  constructor() {
    super('notification-in-app');
  }

  async process(job) {
    const { deliveryId } = job.data;
    const notificationService = (await import('../modules/notifications/notification.service.js')).default;

    try {
      await notificationService.processChannelDelivery(deliveryId, 'IN_APP');
      return { deliveryId, channel: 'IN_APP', status: 'processed' };
    } catch (err) {
      logger.error('In-app notification delivery failed', {
        module: 'jobs',
        action: 'notification-in-app',
        deliveryId,
        error: { message: err.message },
      });
      throw err;
    }
  }
}
