import { BaseWorker } from '../shared/queue/BaseWorker.js';
import queueManager from '../shared/queue/QueueManager.js';
import logger from '../shared/logger/index.js';

/**
 * QOP appointment reminder dispatch job.
 *
 * Finds pending appointment reminders whose scheduledAt has arrived,
 * dispatches them via the auth-email queue, and updates their status.
 * Runs every 15 minutes.
 */
export class QopAppointmentReminderDispatchWorker extends BaseWorker {
  constructor() {
    super('qop-appointment-dispatch');
  }

  async process(job) {
    const now = new Date();

    // Lazy import
    const { default: appointmentReminderRepo } = await import(
      '../modules/qop/appointmentReminder.repository.js'
    );

    const pending = await appointmentReminderRepo.findPendingForDispatch();

    let sentCount = 0;
    let failedCount = 0;

    for (const reminder of pending) {
      try {
        await queueManager.addJob('auth-email', 'send-qop-appointment-reminder', {
          email: reminder.channel,
          data: {
            reminderId: reminder._id,
            appointmentId: reminder.appointmentId,
            customerId: reminder.customerId,
            language: reminder.language,
          },
        });

        await appointmentReminderRepo.updateStatus(reminder._id, {
          status: 'SENT',
          sentAt: now,
          messageContent: `Appointment reminder dispatched for appointment ${reminder.appointmentId}`,
        });

        sentCount++;
      } catch (err) {
        const newRetryCount = (reminder.retryCount || 0) + 1;
        const updateData = {
          retryCount: newRetryCount,
          lastError: err.message ? err.message.slice(0, 1000) : String(err).slice(0, 1000),
        };

        if (newRetryCount >= 3) {
          updateData.status = 'FAILED';
        }

        await appointmentReminderRepo.updateStatus(reminder._id, updateData);

        failedCount++;

        logger.warn('Failed to dispatch appointment reminder', {
          module: 'jobs',
          action: 'qop-appointment-dispatch',
          reminderId: reminder._id,
          error: { message: err.message },
        });
      }
    }

    logger.info('QOP appointment reminder dispatch completed', {
      module: 'jobs',
      action: 'qop-appointment-dispatch',
      sentCount,
      failedCount,
    });

    return { sentCount, failedCount };
  }
}

export default QopAppointmentReminderDispatchWorker;
