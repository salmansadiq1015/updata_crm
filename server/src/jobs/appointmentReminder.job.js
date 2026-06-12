import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Appointment reminder job.
 *
 * Scans for appointments scheduled for tomorrow that have not yet
 * received a reminder. Enqueues reminder emails and marks them as sent.
 *
 * Runs on a schedule (e.g., daily at 16:00) to give customers advance notice.
 */
export class AppointmentReminderWorker extends BaseWorker {
  constructor() {
    super('appointment-reminder');
  }

  async process(_job) {
    const now = new Date();

    const { default: reminderSettingsService } = await import('../modules/qop/reminderSettings.service.js');
    const settings = await reminderSettingsService.getEffectiveSettings();
    const reminderHours = settings.appointmentReminderHours;
    const primaryHours = reminderHours[0] ?? 24;

    const windowStart = new Date(now.getTime() + primaryHours * 60 * 60 * 1000);
    const windowEnd = new Date(windowStart.getTime() + 24 * 60 * 60 * 1000);

    // Lazy imports to avoid circular dependencies
    const AppointmentDetails = (await import('../modules/deploy/appointmentDetails.model.js')).default;
    const Assignment = (await import('../modules/deploy/assignment.model.js')).default;
    const queueManager = (await import('../shared/queue/QueueManager.js')).default;

    // Find appointments where reminder has not been sent
    const pendingAppointments = await AppointmentDetails.find({
      reminderSent: false,
    }).lean();

    let remindersCount = 0;

    for (const appointment of pendingAppointments) {
      // Join with assignment to check if it falls in the reminder window
      const assignment = await Assignment.findById(appointment.assignmentId)
        .populate([
          { path: 'employeeId', select: 'firstName lastName email' },
        ])
        .lean();

      if (!assignment) continue;

      const assignmentStart = new Date(assignment.startDatetime);
      if (assignmentStart < windowStart || assignmentStart > windowEnd) continue;
      if (!appointment.customerContactEmail) continue;

      // Enqueue reminder email
      try {
        await queueManager.addJob('auth-email', 'send-appointment-reminder', {
          email: appointment.customerContactEmail,
          customerName: appointment.customerContactName,
          contactPhone: appointment.customerContactPhone,
          assignmentId: assignment._id,
          appointmentDate: assignmentStart.toISOString().split('T')[0],
          appointmentWindow: appointment.appointmentWindow || null,
          technicianName: assignment.employeeId
            ? `${assignment.employeeId.firstName} ${assignment.employeeId.lastName}`
            : 'Technician',
        });

        // Mark reminder as sent
        await AppointmentDetails.findByIdAndUpdate(appointment._id, {
          $set: {
            reminderSent: true,
            reminderSentAt: new Date(),
          },
        });

        remindersCount++;
      } catch (err) {
        logger.error('Failed to enqueue appointment reminder', {
          module: 'jobs',
          action: 'appointment-reminder',
          appointmentId: appointment._id,
          error: { message: err.message, stack: err.stack },
        });
      }
    }

    // Publish event if any reminders were sent
    if (remindersCount > 0) {
      eventBus.publish(EVENT_TYPES.SCHEDULE_APPOINTMENT_REMINDER, {
        count: remindersCount,
      }, { source: 'jobs:appointment-reminder' });
    }

    logger.info('Appointment reminder job completed', {
      module: 'jobs',
      action: 'appointment-reminder',
      remindersCount,
    });

    return { remindersCount };
  }
}

export default AppointmentReminderWorker;
