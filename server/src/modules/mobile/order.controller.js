import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { ConflictError, ValidationError } from '../../shared/errors/AppError.js';

const VALID_TRANSITIONS = {
  PLANNED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

class OrderController {
  async createOrder(req, res, next) {
    try {
      const { default: counterService } = await import('../deploy/counter.service.js');
      const { default: assignmentRepository } = await import('../deploy/assignment.repository.js');

      const {
        orderType, assignmentType,
        title, description, scopeOfWork, specialInstructions,
        priority, scheduledStart, scheduledEnd,
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

      const assignmentNumber = await counterService.getNextAssignmentNumber();

      const assignment = await assignmentRepository.create({
        assignmentNumber,
        assignmentType: resolvedType,
        title: title || null,
        instructions,
        priority: priority || 'NORMAL',
        startDatetime,
        endDatetime,
        employeeId: null,
        status: 'PLANNED',
        createdBy: req.user._id,
        // Store free-text customer/site info as appointment notes since there are no FK lookups here
        ...(customerName || customerPhone || customerEmail || siteAddress ? {
          isCustomerAppointment: true,
          appointment: {
            customerContactName: customerName || undefined,
            customerContactPhone: customerPhone || undefined,
            customerContactEmail: customerEmail || undefined,
            customerNotes: [siteAddress, accessInstructions, parkingInfo].filter(Boolean).join(' | ') || undefined,
          },
        } : {}),
      });

      eventBus.publish(EVENT_TYPES.SCHEDULE_ASSIGNMENT_CREATED, {
        assignmentId: assignment._id,
        assignmentNumber,
        assignmentType: resolvedType,
        createdBy: req.user._id,
      }, { source: 'mobile:orders' });

      return res.success({ data: assignment, message: 'Order created successfully', statusCode: 201 });
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
        return res.success({ data: result.data, pagination: result.pagination, syncTimestamp: new Date().toISOString() });
      }

      // Mobile technician view: return only assignments for the logged-in employee
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const data = await assignmentService.listByEmployee(
        req.user._id,
        query.dateFrom,
        query.dateTo,
      );
      return res.success({ data, syncTimestamp: new Date().toISOString() });
    } catch (err) { next(err); }
  }

  async getOrderDetail(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);
      // Field-ops can view any order; mobile technicians only their own
      return res.success({ data: assignment });
    } catch (err) { next(err); }
  }

  async updateOrder(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);
      const {
        orderType, assignmentType, title, description, scopeOfWork, specialInstructions,
        priority, scheduledStart, scheduledEnd,
        customerName, customerPhone, customerEmail,
        siteAddress, accessInstructions, parkingInfo,
        status,
      } = req.body;

      const updates = {};
      if (assignmentType || orderType) updates.assignmentType = assignmentType || orderType;
      if (title !== undefined) updates.title = title || null;
      if (priority) updates.priority = priority;
      if (status) updates.status = status;
      if (scheduledStart) updates.startDatetime = new Date(scheduledStart);
      if (scheduledEnd) updates.endDatetime = new Date(scheduledEnd);

      const instructionsParts = [description, scopeOfWork, specialInstructions].filter(Boolean);
      if (instructionsParts.length) updates.instructions = instructionsParts.join('\n\n');

      if (customerName || customerPhone || customerEmail || siteAddress) {
        updates.isCustomerAppointment = true;
        updates.appointment = {
          ...assignment.appointment,
          customerContactName: customerName ?? assignment.appointment?.customerContactName,
          customerContactPhone: customerPhone ?? assignment.appointment?.customerContactPhone,
          customerContactEmail: customerEmail ?? assignment.appointment?.customerContactEmail,
          customerNotes: [siteAddress, accessInstructions, parkingInfo].filter(Boolean).join(' | ') || assignment.appointment?.customerNotes,
        };
      }

      updates.updatedBy = req.user._id;

      const updated = await assignmentService.update(req.params.id, updates, req.user._id);
      return res.success({ data: updated, message: 'Order updated successfully' });
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

      const updated = await assignmentService.update(req.params.id, { status: newStatus });
      eventBus.publish(EVENT_TYPES.MOBILE_ORDER_STATUS_UPDATED, {
        orderId: req.params.id,
        previousStatus: currentStatus,
        newStatus,
        orderTitle: assignment.title || '',
        assignedTo: assignment.employeeId || null,
        updatedBy: req.user._id,
        managerIds: assignment.createdBy ? [assignment.createdBy] : [],
      }, { source: 'mobile:orders' });
      return res.success({ data: updated, message: 'Order status updated successfully' });
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
