import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import {
  serializeMobileAssignment,
  serializeMobileAssignments,
} from '../deploy/mobileAssignment.serializer.js';

const VALID_TRANSITIONS = {
  PLANNED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

class OrderController {
  async createOrder(req, res, next) {
    try {
      const { default: counterService } = await import('../deploy/counter.service.js');
      const { default: assignmentRepository } = await import('../deploy/assignment.repository.js');
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const { default: appointmentService } = await import('../deploy/appointment.service.js');

      const {
        orderType, assignmentType,
        title, description, scopeOfWork, specialInstructions,
        priority, scheduledStart, scheduledEnd,
        employeeId,
        customerName, customerPhone, customerEmail,
        siteAddress, accessInstructions, parkingInfo,
      } = req.body;

      const resolvedType = assignmentType || orderType;
      if (!resolvedType) {
        throw new ValidationError('orderType is required');
      }

      const now = new Date();
      const startDatetime = scheduledStart ? new Date(scheduledStart) : now;
      const endDatetime = scheduledEnd ? new Date(scheduledEnd) : new Date(now.getTime() + 8 * 3600 * 1000);

      const instructionsParts = [description, scopeOfWork, specialInstructions].filter(Boolean);
      const instructions = instructionsParts.join('\n\n') || null;
      const appointment = customerName || customerPhone || customerEmail || siteAddress || accessInstructions || parkingInfo
        ? {
          customerContactName: customerName || undefined,
          customerContactPhone: customerPhone || undefined,
          customerContactEmail: customerEmail || undefined,
          customerNotes: [siteAddress, accessInstructions, parkingInfo].filter(Boolean).join(' | ') || undefined,
        }
        : null;

      let assignment;
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };

      if (employeeId) {
        const [created] = await assignmentService.create({
          employeeIds: [employeeId],
          assignmentType: resolvedType,
          title: title || null,
          instructions,
          priority: priority || 'NORMAL',
          startDatetime,
          endDatetime,
          status: 'PLANNED',
          isCustomerAppointment: Boolean(appointment),
          appointment,
          overrideConflicts: req.body.overrideConflicts,
          overrideReason: req.body.overrideReason,
        }, req.user._id, meta);
        assignment = await assignmentService.getById(created.id);
      } else {
        const assignmentNumber = await counterService.getNextAssignmentNumber();
        assignment = await assignmentRepository.create({
          assignmentNumber,
          assignmentType: resolvedType,
          title: title || null,
          instructions,
          priority: priority || 'NORMAL',
          startDatetime,
          endDatetime,
          employeeId: null,
          status: 'PLANNED',
          isCustomerAppointment: Boolean(appointment),
          createdBy: req.user._id,
        });

        if (appointment) {
          await appointmentService.syncForAssignment(assignment._id, appointment, req.user._id, meta);
        }

        eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, {
          assignmentId: assignment._id,
          assignmentNumber,
          assignmentType: resolvedType,
          title: assignment.title,
          employeeIds: [],
          createdBy: req.user._id,
        }, { source: 'mobile:orders' });
      }

      const data = await serializeMobileAssignment(assignment);
      return res.success({ data, message: 'Order created successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }

  async listOrders(req, res, next) {
    try {
      const query = req._validatedQuery || req.query;

      // Field-ops / admin view: return all assignments with optional filters
      if (query.all === 'true' || query.all === true) {
        const { default: assignmentRepository } = await import('../deploy/assignment.repository.js');
        const filters = {};
        if (query.status) filters.status = query.status;
        if (query.orderType || query.type) filters.assignmentType = query.orderType || query.type;
        if (query.employeeId) filters.employeeId = query.employeeId;
        const result = await assignmentRepository.findWithCursor({
          limit: query.limit ? parseInt(query.limit, 10) : 100,
          cursor: query.cursor,
          sortBy: query.sortBy || 'createdAt',
          sortOrder: query.sortOrder || 'desc',
          filters,
          search: query.search,
        });
        const syncTimestamp = new Date().toISOString();
        const data = await serializeMobileAssignments(result.data, { syncTimestamp });
        return res.success({ data, pagination: result.pagination, syncTimestamp });
      }

      // Mobile technician view: return only assignments for the logged-in employee
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignments = await assignmentService.listByEmployee(
        req.user._id,
        query.dateFrom,
        query.dateTo,
      );
      const syncTimestamp = new Date().toISOString();
      const data = await serializeMobileAssignments(assignments, { syncTimestamp });
      return res.success({ data, syncTimestamp });
    } catch (err) { next(err); }
  }

  async getOrderDetail(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);
      // Field-ops can view any order; mobile technicians only their own
      const data = await serializeMobileAssignment(assignment);
      return res.success({ data });
    } catch (err) { next(err); }
  }

  async updateOrder(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const {
        orderType, assignmentType, title, description, scopeOfWork, specialInstructions,
        priority, scheduledStart, scheduledEnd,
        employeeId,
        customerName, customerPhone, customerEmail,
        siteAddress, accessInstructions, parkingInfo,
        status, overrideConflicts, overrideReason,
      } = req.body;

      const updates = {};
      if (assignmentType || orderType) updates.assignmentType = assignmentType || orderType;
      if (title !== undefined) updates.title = title || null;
      if (priority) updates.priority = priority;
      if (status) updates.status = status;
      if (employeeId !== undefined) updates.employeeId = employeeId || null;
      if (scheduledStart) updates.startDatetime = new Date(scheduledStart);
      if (scheduledEnd) updates.endDatetime = new Date(scheduledEnd);

      const instructionsParts = [description, scopeOfWork, specialInstructions].filter(Boolean);
      if (instructionsParts.length) updates.instructions = instructionsParts.join('\n\n');

      if (customerName || customerPhone || customerEmail || siteAddress || accessInstructions || parkingInfo) {
        updates.isCustomerAppointment = true;
        updates.appointment = {
          customerContactName: customerName || undefined,
          customerContactPhone: customerPhone || undefined,
          customerContactEmail: customerEmail || undefined,
          customerNotes: [siteAddress, accessInstructions, parkingInfo].filter(Boolean).join(' | ') || undefined,
        };
      }

      if (overrideConflicts !== undefined) updates.overrideConflicts = overrideConflicts;
      if (overrideReason !== undefined) updates.overrideReason = overrideReason;

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const updated = await assignmentService.update(req.params.id, updates, req.user._id, meta);
      const data = await serializeMobileAssignment(updated);
      return res.success({ data, message: 'Order updated successfully' });
    } catch (err) { next(err); }
  }

  async deleteOrder(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await assignmentService.delete(req.params.id, req.user._id, meta);
      return res.success({ message: 'Order deleted successfully' });
    } catch (err) { next(err); }
  }

  async bulkDeleteOrders(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const { ids } = req.body;
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      await Promise.all(ids.map((id) => assignmentService.delete(id, req.user._id, meta)));
      return res.success({ message: `${ids.length} orders deleted successfully` });
    } catch (err) { next(err); }
  }

  async updateStatus(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);
      const currentStatus = assignment.status;
      const newStatus = req.body.status;

      if (VALID_TRANSITIONS[currentStatus] !== newStatus) {
        throw new ConflictError(
          `Invalid status transition from ${currentStatus} to ${newStatus}. Allowed: ${VALID_TRANSITIONS[currentStatus] || 'none'}.`,
        );
      }

      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const updated = await assignmentService.update(req.params.id, { status: newStatus }, req.user._id, meta);
      eventBus.publish(EVENT_TYPES.MOBILE_ORDER_STATUS_UPDATED, {
        orderId: req.params.id,
        previousStatus: currentStatus,
        newStatus,
        orderTitle: assignment.title || '',
        assignedTo: assignment.employeeId?._id || assignment.employeeId || null,
        updatedBy: req.user._id,
        managerIds: assignment.createdBy ? [assignment.createdBy] : [],
      }, { source: 'mobile:orders' });
      const data = await serializeMobileAssignment(updated);
      return res.success({ data, message: 'Order status updated successfully' });
    } catch (err) { next(err); }
  }

  async getOrderHistory(_req, res, next) {
    try {
      return res.success({ data: [] });
    } catch (err) { next(err); }
  }
}

const orderController = new OrderController();
export default orderController;
