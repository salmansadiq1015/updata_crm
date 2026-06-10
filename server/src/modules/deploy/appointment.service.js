import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import appointmentRepository from './appointment.repository.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

class AppointmentService {
  async getByAssignmentId(assignmentId) {
    const appointment = await appointmentRepository.findByAssignmentId(assignmentId);
    if (!appointment) throw new NotFoundError('AppointmentDetails', assignmentId);
    return appointment;
  }

  async create(assignmentId, data) {
    const appointment = await appointmentRepository.upsertByAssignmentId(assignmentId, data);

    logger.info('Appointment details created', { module: 'deploy', action: 'create', assignmentId });

    return appointment;
  }

  async syncForAssignment(assignmentId, data, userId, meta = {}) {
    const appointment = await appointmentRepository.upsertByAssignmentId(assignmentId, {
      ...data,
      reminderSent: false,
      reminderSentAt: null,
    });

    auditService.logEvent({
      eventType: 'appointment.synced',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId, changedFields: Object.keys(data) },
      module: 'deploy',
    });

    return appointment;
  }

  async update(assignmentId, data, userId, meta = {}) {
    const updated = await appointmentRepository.updateByAssignmentId(assignmentId, data);
    if (!updated) throw new NotFoundError('AppointmentDetails', assignmentId);

    auditService.logEvent({
      eventType: 'appointment.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId, changedFields: Object.keys(data) },
      module: 'deploy',
    });

    return updated;
  }

  async sendConfirmation(assignmentId, userId, meta = {}) {
    const appointment = await this.getByAssignmentId(assignmentId);

    if (!appointment.customerContactEmail) {
      throw new ConflictError('Cannot send confirmation: no customer contact email on file');
    }

    if (appointment.confirmationStatus === 'SENT' || appointment.confirmationStatus === 'CONFIRMED') {
      throw new ConflictError('Appointment confirmation has already been sent or confirmed');
    }

    await queueManager.addJob('auth-email', 'send-appointment-confirmation', {
      email: appointment.customerContactEmail,
      customerName: appointment.customerContactName,
      appointmentWindow: appointment.appointmentWindow,
      assignmentId,
    });

    const updated = await appointmentRepository.updateByAssignmentId(assignmentId, {
      confirmationStatus: 'SENT',
      confirmationSentAt: new Date(),
    });

    eventBus.publish(EVENT_TYPES.SCHEDULE_APPOINTMENT_CONFIRMED, {
      assignmentId,
      email: appointment.customerContactEmail,
    }, { source: 'deploy:appointments' });

    auditService.logEvent({
      eventType: 'appointment.confirmation_sent',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId },
      module: 'deploy',
    });

    logger.info('Appointment confirmation sent', { module: 'deploy', action: 'sendConfirmation', assignmentId });

    return updated;
  }

  async cancel(assignmentId, reason, userId, meta = {}) {
    const appointment = await this.getByAssignmentId(assignmentId);

    const updated = await appointmentRepository.updateByAssignmentId(assignmentId, {
      confirmationStatus: 'CANCELLED',
    });

    if (appointment.customerContactEmail) {
      await queueManager.addJob('auth-email', 'send-appointment-cancellation', {
        email: appointment.customerContactEmail,
        customerName: appointment.customerContactName,
        assignmentId,
        reason,
      });
    }

    eventBus.publish(EVENT_TYPES.SCHEDULE_APPOINTMENT_CANCELLED, {
      assignmentId,
      reason,
    }, { source: 'deploy:appointments' });

    auditService.logEvent({
      eventType: 'appointment.cancelled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId, reason },
      module: 'deploy',
    });

    logger.info('Appointment cancelled', { module: 'deploy', action: 'cancel', assignmentId });

    return updated;
  }

  async reschedule(assignmentId, newData, userId, meta = {}) {
    const appointment = await this.getByAssignmentId(assignmentId);

    const updated = await appointmentRepository.updateByAssignmentId(assignmentId, {
      ...newData,
      confirmationStatus: 'RESCHEDULED',
      reminderSent: false,
      reminderSentAt: null,
    });

    if (appointment.customerContactEmail) {
      await queueManager.addJob('auth-email', 'send-appointment-rescheduled', {
        email: appointment.customerContactEmail,
        customerName: appointment.customerContactName,
        assignmentId,
        ...newData,
      });
    }

    eventBus.publish(EVENT_TYPES.SCHEDULE_APPOINTMENT_RESCHEDULED, {
      assignmentId,
      newData,
    }, { source: 'deploy:appointments' });

    auditService.logEvent({
      eventType: 'appointment.rescheduled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId, newData },
      module: 'deploy',
    });

    logger.info('Appointment rescheduled', { module: 'deploy', action: 'reschedule', assignmentId });

    return updated;
  }

  async markAssignmentRescheduled(assignmentId, scheduleData, userId, meta = {}) {
    const appointment = await appointmentRepository.findByAssignmentId(assignmentId);
    if (!appointment) return null;

    const updated = await appointmentRepository.updateByAssignmentId(assignmentId, {
      confirmationStatus: 'RESCHEDULED',
      reminderSent: false,
      reminderSentAt: null,
    });

    if (appointment.customerContactEmail) {
      await queueManager.addJob('auth-email', 'send-appointment-rescheduled', {
        email: appointment.customerContactEmail,
        customerName: appointment.customerContactName,
        assignmentId,
        newStartDatetime: scheduleData.startDatetime,
        newEndDatetime: scheduleData.endDatetime,
      });
    }

    eventBus.publish(EVENT_TYPES.SCHEDULE_APPOINTMENT_RESCHEDULED, {
      assignmentId,
      newData: scheduleData,
    }, { source: 'deploy:appointments' });

    auditService.logEvent({
      eventType: 'appointment.assignment_rescheduled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId, scheduleData },
      module: 'deploy',
    });

    return updated;
  }
}

const appointmentService = new AppointmentService();
export default appointmentService;
