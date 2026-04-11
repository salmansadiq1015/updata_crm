import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import logger from '../../shared/logger/index.js';

/**
 * QOP domain event handlers.
 *
 * Subscribes to cross-cutting events that affect QOP state (customer updates,
 * scheduling appointment changes). All handlers are defensive — errors are
 * logged but never re-thrown to avoid breaking the publisher.
 */
export function registerQopEvents() {
  // --- CUSTOMER_UPDATED ---
  // Sync customer name across open quotations, orders, and invoices.
  eventBus.on(EVENT_TYPES.CUSTOMER_UPDATED, async (event) => {
    try {
      const { customerId, changes } = event.payload;
      if (!changes || !changes.name) return;

      const newName = changes.name;

      const { default: quotationRepo } = await import('./quotation.repository.js');
      const { default: orderRepo } = await import('./order.repository.js');

      // Bulk update customerName on open documents
      const [quotationCount, orderCount] = await Promise.all([
        quotationRepo.bulkUpdateCustomerName(customerId, newName),
        orderRepo.bulkUpdateCustomerName
          ? orderRepo.bulkUpdateCustomerName(customerId, newName)
          : Promise.resolve(0),
      ]);

      // Update invoices via model directly (repo may not have bulk method)
      const { default: Invoice } = await import('./invoice.model.js');
      const invoiceResult = await Invoice.updateMany(
        { customerId, isDeleted: { $ne: true } },
        { $set: { customerName: newName } },
      );
      const invoiceCount = invoiceResult.modifiedCount;

      // Invalidate caches
      await cacheManager.del(`qop:customer:${customerId}:documents`);

      logger.info('QOP customer name synced after CUSTOMER_UPDATED', {
        module: 'qop',
        action: 'event.customer_updated',
        customerId,
        quotationCount,
        orderCount,
        invoiceCount,
      });
    } catch (err) {
      logger.error('Failed to handle CUSTOMER_UPDATED event in QOP', {
        module: 'qop',
        action: 'event.customer_updated',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_APPOINTMENT_CONFIRMED ---
  // Create reminders for confirmed appointments.
  eventBus.on(EVENT_TYPES.SCHEDULE_APPOINTMENT_CONFIRMED, async (event) => {
    try {
      const { appointmentId, customerId, scheduledDate, channel, language } = event.payload;

      const { default: appointmentReminderService } = await import('./appointmentReminder.service.js');

      // Create a reminder 24 hours before the appointment
      const reminderDate = new Date(scheduledDate);
      reminderDate.setDate(reminderDate.getDate() - 1);

      await appointmentReminderService.create({
        appointmentId,
        customerId,
        channel: channel || 'email',
        language: language || 'de',
        scheduledAt: reminderDate,
        status: 'PENDING',
      });

      logger.info('Appointment reminder created for confirmed appointment', {
        module: 'qop',
        action: 'event.appointment_confirmed',
        appointmentId,
        customerId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_APPOINTMENT_CONFIRMED event in QOP', {
        module: 'qop',
        action: 'event.appointment_confirmed',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_APPOINTMENT_RESCHEDULED ---
  // Cancel existing reminders and create new ones for the rescheduled date.
  eventBus.on(EVENT_TYPES.SCHEDULE_APPOINTMENT_RESCHEDULED, async (event) => {
    try {
      const { appointmentId, customerId, newScheduledDate, channel, language } = event.payload;

      const { default: AppointmentReminder } = await import('./appointmentReminder.model.js');
      const { default: appointmentReminderService } = await import('./appointmentReminder.service.js');

      // Cancel all pending reminders for this appointment
      await AppointmentReminder.updateMany(
        { appointmentId, status: 'PENDING' },
        { $set: { status: 'CANCELLED' } },
      );

      // Create new reminder 24 hours before the rescheduled date
      const reminderDate = new Date(newScheduledDate);
      reminderDate.setDate(reminderDate.getDate() - 1);

      await appointmentReminderService.create({
        appointmentId,
        customerId,
        channel: channel || 'email',
        language: language || 'de',
        scheduledAt: reminderDate,
        status: 'PENDING',
      });

      logger.info('Appointment reminders rescheduled', {
        module: 'qop',
        action: 'event.appointment_rescheduled',
        appointmentId,
        customerId,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_APPOINTMENT_RESCHEDULED event in QOP', {
        module: 'qop',
        action: 'event.appointment_rescheduled',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // --- SCHEDULE_APPOINTMENT_CANCELLED ---
  // Cancel all pending reminders for the cancelled appointment.
  eventBus.on(EVENT_TYPES.SCHEDULE_APPOINTMENT_CANCELLED, async (event) => {
    try {
      const { appointmentId } = event.payload;

      const { default: AppointmentReminder } = await import('./appointmentReminder.model.js');

      const result = await AppointmentReminder.updateMany(
        { appointmentId, status: 'PENDING' },
        { $set: { status: 'CANCELLED' } },
      );

      logger.info('Pending appointment reminders cancelled', {
        module: 'qop',
        action: 'event.appointment_cancelled',
        appointmentId,
        cancelledCount: result.modifiedCount,
      });
    } catch (err) {
      logger.error('Failed to handle SCHEDULE_APPOINTMENT_CANCELLED event in QOP', {
        module: 'qop',
        action: 'event.appointment_cancelled',
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  logger.info('QOP event handlers registered', { module: 'qop', action: 'events.register' });
}

export default registerQopEvents;
