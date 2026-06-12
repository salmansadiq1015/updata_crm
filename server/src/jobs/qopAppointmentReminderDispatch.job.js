import { BaseWorker } from '../shared/queue/BaseWorker.js';
import queueManager from '../shared/queue/QueueManager.js';
import logger from '../shared/logger/index.js';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function normalizePhone(value) {
  if (!value) return null;
  return String(value).replace(/[^\d+]/g, '');
}

async function loadReminderContext(reminder) {
  const Customer = (await import('../modules/crm/customer.model.js')).default;
  const customer = await Customer.findById(reminder.customerId)
    .select('name email phone mobile street postalCode city')
    .lean();

  let appointment = null;
  let assignment = null;
  if (reminder.appointmentId) {
    const AppointmentDetails = (await import('../modules/deploy/appointmentDetails.model.js')).default;
    const Assignment = (await import('../modules/deploy/assignment.model.js')).default;
    appointment = await AppointmentDetails.findOne({
      $or: [
        { _id: reminder.appointmentId },
        { assignmentId: reminder.appointmentId },
      ],
    }).lean();
    const assignmentId = appointment?.assignmentId || reminder.appointmentId;
    assignment = await Assignment.findById(assignmentId).lean();
  }

  const cityLine = [customer?.postalCode, customer?.city].filter(Boolean).join(' ');
  const siteAddress = [customer?.street, cityLine].filter(Boolean).join(', ');
  const appointmentDate = formatDate(assignment?.startDatetime || reminder.scheduledAt);
  const phone = normalizePhone(
    appointment?.customerContactPhone || customer?.mobile || customer?.phone,
  );

  return {
    email: appointment?.customerContactEmail || customer?.email || null,
    phone,
    customerName: appointment?.customerContactName || customer?.name || 'Kunde',
    appointmentDate,
    appointmentTime: appointment?.appointmentWindow || '',
    serviceDescription: assignment?.assignmentType || '',
    siteAddress,
    contactPhone: appointment?.customerContactPhone || customer?.mobile || customer?.phone || '',
  };
}

/**
 * QOP appointment reminder dispatch job.
 *
 * Finds pending appointment reminders whose scheduledAt has arrived,
 * dispatches them via configured channels, and updates their status.
 * Runs every 15 minutes.
 */
export class QopAppointmentReminderDispatchWorker extends BaseWorker {
  constructor() {
    super('qop-appointment-dispatch');
  }

  async process(_job) {
    const now = new Date();
    const { default: appointmentReminderRepo } = await import(
      '../modules/qop/appointmentReminder.repository.js'
    );

    const pending = await appointmentReminderRepo.findPendingForDispatch();

    let sentCount = 0;
    let failedCount = 0;

    for (const reminder of pending) {
      try {
        const context = await loadReminderContext(reminder);
        const channels = reminder.channel === 'both'
          ? ['email', 'whatsapp']
          : [reminder.channel || 'email'];
        const dispatched = [];

        if (channels.includes('email')) {
          if (!context.email) throw new Error('No email recipient for appointment reminder');
          await queueManager.addJob('auth-email', 'send-qop-appointment-reminder', {
            reminderId: reminder._id,
            appointmentId: reminder.appointmentId,
            customerId: reminder.customerId,
            email: context.email,
            language: reminder.language,
            ...context,
          });
          dispatched.push('email');
        }

        if (channels.includes('whatsapp')) {
          if (!context.phone) throw new Error('No WhatsApp recipient phone for appointment reminder');
          const { default: whatsappAdapter } = await import('../modules/notifications/adapters/whatsapp.adapter.js');
          const result = await whatsappAdapter.send(
            { _id: reminder._id, recipientPhone: context.phone },
            {
              language: reminder.language,
              whatsappTemplateId: 'appointment_reminder',
              templateComponents: [],
              text: `Termin ${context.appointmentDate} ${context.appointmentTime}`.trim(),
            },
          );
          if (!result.success) throw new Error(result.error || 'WhatsApp dispatch failed');
          dispatched.push('whatsapp');
        }

        await appointmentReminderRepo.updateStatus(reminder._id, {
          status: 'SENT',
          sentAt: now,
          messageContent: `Appointment reminder dispatched via ${dispatched.join(', ')}`,
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
