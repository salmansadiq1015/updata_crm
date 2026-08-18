import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import appointmentRepository from './appointment.repository.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

/**
 * The identifying payload the QOP reminder handlers subscribe to: which
 * appointment, for which customer, and when it takes place. The schedule and
 * the customer live on the assignment; the linked order is the fallback for
 * assignments booked without a customer of their own.
 *
 * Publishing less than this used to leave the handlers with undefined values,
 * so no reminder was ever created.
 */
async function buildAppointmentEventPayload(assignmentId, appointment) {
  const { default: Assignment } = await import('./assignment.model.js');
  const assignment = await Assignment.findById(assignmentId)
    .select('customerId orderId startDatetime')
    .lean();

  let customerId = assignment?.customerId || null;
  if (!customerId && assignment?.orderId) {
    const { default: Order } = await import('../qop/order.model.js');
    const order = await Order.findById(assignment.orderId).select('customerId').lean();
    customerId = order?.customerId || null;
  }

  return {
    appointmentId: appointment?._id || null,
    assignmentId,
    customerId,
    scheduledDate: assignment?.startDatetime || null,
    email: appointment?.customerContactEmail || null,
  };
}

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
    let appointment = await appointmentRepository.upsertByAssignmentId(assignmentId, {
      ...data,
      reminderSent: false,
      reminderSentAt: null,
    });

    if (!appointment.statusHistory?.length) {
      appointment = await appointmentRepository.updateStatusByAssignmentId(assignmentId, 'PENDING', {
        changedBy: userId,
        note: 'Appointment details created',
      });
    }

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

    const updated = await appointmentRepository.updateStatusByAssignmentId(assignmentId, 'SENT', {
      changedBy: userId,
      note: 'Confirmation sent to customer',
      extra: {
        confirmationSentAt: new Date(),
      },
    });

    eventBus.publish(
      EVENT_TYPES.SCHEDULE_APPOINTMENT_CONFIRMED,
      await buildAppointmentEventPayload(assignmentId, appointment),
      { source: 'deploy:appointments' },
    );

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

    const updated = await appointmentRepository.updateStatusByAssignmentId(assignmentId, 'CANCELLED', {
      changedBy: userId,
      note: reason,
      extra: {
        cancellationReason: reason,
      },
    });

    if (appointment.customerContactEmail) {
      await queueManager.addJob('auth-email', 'send-appointment-cancellation', {
        email: appointment.customerContactEmail,
        customerName: appointment.customerContactName,
        assignmentId,
        reason,
      });
    }

    eventBus.publish(
      EVENT_TYPES.SCHEDULE_APPOINTMENT_CANCELLED,
      { ...(await buildAppointmentEventPayload(assignmentId, appointment)), reason },
      { source: 'deploy:appointments' },
    );

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

    const updated = await appointmentRepository.updateStatusByAssignmentId(assignmentId, 'RESCHEDULED', {
      changedBy: userId,
      note: 'Appointment rescheduled',
      extra: {
        ...newData,
        reminderSent: false,
        reminderSentAt: null,
      },
    });

    if (appointment.customerContactEmail) {
      await queueManager.addJob('auth-email', 'send-appointment-rescheduled', {
        email: appointment.customerContactEmail,
        customerName: appointment.customerContactName,
        assignmentId,
        ...newData,
      });
    }

    eventBus.publish(
      EVENT_TYPES.SCHEDULE_APPOINTMENT_RESCHEDULED,
      {
        ...(await buildAppointmentEventPayload(assignmentId, appointment)),
        newScheduledDate: newData?.startDatetime || newData?.newStartDatetime || null,
        newData,
      },
      { source: 'deploy:appointments' },
    );

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

    const updated = await appointmentRepository.updateStatusByAssignmentId(assignmentId, 'RESCHEDULED', {
      changedBy: userId,
      note: 'Assignment time changed',
      extra: {
        reminderSent: false,
        reminderSentAt: null,
      },
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

    eventBus.publish(
      EVENT_TYPES.SCHEDULE_APPOINTMENT_RESCHEDULED,
      {
        ...(await buildAppointmentEventPayload(assignmentId, appointment)),
        newScheduledDate: scheduleData?.startDatetime || null,
        newData: scheduleData,
      },
      { source: 'deploy:appointments' },
    );

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

  async updateStatus(assignmentId, status, userId, meta = {}) {
    const appointment = await this.getByAssignmentId(assignmentId);

    if (appointment.confirmationStatus === 'CANCELLED') {
      throw new ConflictError('Cancelled appointments cannot be moved to another status');
    }

    const updated = await appointmentRepository.updateStatusByAssignmentId(assignmentId, status, {
      changedBy: userId,
      note: meta.note,
    });

    auditService.logEvent({
      eventType: 'appointment.status_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId, status, note: meta.note },
      module: 'deploy',
    });

    logger.info('Appointment status updated', {
      module: 'deploy',
      action: 'updateStatus',
      assignmentId,
      status,
    });

    return updated;
  }
}

const appointmentService = new AppointmentService();
export default appointmentService;
