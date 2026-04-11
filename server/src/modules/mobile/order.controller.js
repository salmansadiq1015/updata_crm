import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { AuthorizationError, ConflictError } from '../../shared/errors/AppError.js';

const VALID_TRANSITIONS = {
  PLANNED: 'IN_PROGRESS',
  IN_PROGRESS: 'COMPLETED',
};

class OrderController {
  async listOrders(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const query = req._validatedQuery || req.query;
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

      if (String(assignment.employeeId) !== String(req.user._id)) {
        throw new AuthorizationError('You do not have access to this order.');
      }

      return res.success({ data: assignment });
    } catch (err) { next(err); }
  }

  async updateStatus(req, res, next) {
    try {
      const { default: assignmentService } = await import('../deploy/assignment.service.js');
      const assignment = await assignmentService.getById(req.params.id);

      if (String(assignment.employeeId) !== String(req.user._id)) {
        throw new AuthorizationError('You do not have access to this order.');
      }

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
        employeeId: req.user._id,
      }, { source: 'mobile:orders' });

      return res.success({ data: updated, message: 'Order status updated successfully' });
    } catch (err) { next(err); }
  }

  async getOrderHistory(req, res, next) {
    try {
      // Placeholder: cross-module aggregation deferred
      return res.success({ data: [] });
    } catch (err) { next(err); }
  }
}

const orderController = new OrderController();
export default orderController;
