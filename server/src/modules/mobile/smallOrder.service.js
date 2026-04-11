import counterService from './counter.service.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';

class SmallOrderService {
  async create(projectId, data, userId, meta = {}) {
    const smoNumber = await counterService.getNextSmallOrderNumber();

    const { default: assignmentService } = await import('../deploy/assignment.service.js');

    const assignment = await assignmentService.create({
      employeeIds: [data.assignedTo],
      projectId,
      assignmentType: 'PROJECT_WORK',
      title: data.title,
      startDatetime: data.dueDate || new Date(),
      endDatetime: data.dueDate || new Date(),
      instructions: data.description,
      priority: data.priority || 'NORMAL',
      smallOrderNumber: smoNumber,
    });

    eventBus.publish(EVENT_TYPES.MOBILE_SMALL_ORDER_CREATED, {
      smallOrderNumber: smoNumber,
      assignmentId: assignment._id,
      projectId,
      assignedTo: data.assignedTo,
      createdBy: userId,
    }, { source: 'mobile:small-orders' });

    auditService.logEvent({
      eventType: 'small_order.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { smallOrderNumber: smoNumber, assignmentId: assignment._id, projectId },
      module: 'mobile',
    });

    logger.info('Small order created', {
      module: 'mobile',
      action: 'small_order.create',
      smallOrderNumber: smoNumber,
      assignmentId: assignment._id,
    });

    return assignment;
  }

  async update(id, data, userId, meta = {}) {
    const { default: assignmentService } = await import('../deploy/assignment.service.js');
    const updated = await assignmentService.update(id, data);

    auditService.logEvent({
      eventType: 'small_order.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id, changedFields: Object.keys(data) },
      module: 'mobile',
    });

    return updated;
  }

  async cancel(id, userId, meta = {}) {
    const { default: assignmentService } = await import('../deploy/assignment.service.js');
    await assignmentService.delete(id);

    auditService.logEvent({
      eventType: 'small_order.cancelled',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assignmentId: id },
      module: 'mobile',
    });
  }
}

const smallOrderService = new SmallOrderService();
export default smallOrderService;
