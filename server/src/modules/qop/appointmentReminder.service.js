import appointmentReminderRepository from './appointmentReminder.repository.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

class AppointmentReminderService {
  async create(data, createdBy) {
    const reminder = await appointmentReminderRepository.create({
      ...data,
    });

    logger.info('Appointment reminder created', {
      module: 'qop',
      action: 'createAppointmentReminder',
      reminderId: reminder._id,
      appointmentId: data.appointmentId,
    });

    return reminder;
  }

  async list(queryParams) {
    const { appointmentId, customerId, status } = queryParams;
    const filter = {};
    if (appointmentId) filter.appointmentId = appointmentId;
    if (customerId) filter.customerId = customerId;
    if (status) filter.status = status;

    const AppointmentReminder = (await import('./appointmentReminder.model.js')).default;
    return AppointmentReminder.find(filter).sort({ scheduledAt: -1 }).lean();
  }

  async getById(id) {
    const reminder = await appointmentReminderRepository.findById(id);
    if (!reminder) throw new NotFoundError('AppointmentReminder', id);
    return reminder;
  }

  async updateStatus(id, status, additionalData = {}) {
    const reminder = await appointmentReminderRepository.findById(id);
    if (!reminder) throw new NotFoundError('AppointmentReminder', id);

    return appointmentReminderRepository.updateStatus(id, { status, ...additionalData });
  }

  async getPendingForDispatch() {
    return appointmentReminderRepository.findPendingForDispatch();
  }

  async markSent(id, messageContent) {
    return appointmentReminderRepository.updateStatus(id, {
      status: 'SENT',
      sentAt: new Date(),
      messageContent: messageContent || '',
    });
  }

  async markFailed(id, error) {
    const reminder = await appointmentReminderRepository.findById(id);
    if (!reminder) throw new NotFoundError('AppointmentReminder', id);

    return appointmentReminderRepository.updateStatus(id, {
      status: 'FAILED',
      lastError: error ? String(error).slice(0, 1000) : null,
      retryCount: (reminder.retryCount || 0) + 1,
    });
  }

  async recordResponse(id, response) {
    return appointmentReminderRepository.updateStatus(id, {
      status: 'RESPONDED',
      customerResponse: response,
    });
  }
}

const appointmentReminderService = new AppointmentReminderService();
export default appointmentReminderService;
