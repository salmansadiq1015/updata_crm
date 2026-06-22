import ProjectStatusHistory from './projectStatusHistory.model.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';

const ACTIVE_PROJECT_STATUSES = [
  'DRAFT',
  'PLANNING',
  'SCHEDULED',
  'WAITING_FOR_MATERIAL',
  'IN_PROGRESS',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_QUOTATION_APPROVAL',
  'ON_HOLD',
  'COMPLETED',
  'INVOICED',
];

const VALID_TRANSITIONS = Object.fromEntries(
  ACTIVE_PROJECT_STATUSES.map((status) => [
    status,
    ACTIVE_PROJECT_STATUSES.filter((target) => target !== status),
  ]),
);
VALID_TRANSITIONS.COMPLETED = ['IN_PROGRESS', 'INVOICED', 'ARCHIVED'];
VALID_TRANSITIONS.ARCHIVED = [];

class StatusService {
  async transitionStatus(projectId, targetStatus, { comment = null, override = false, overrideReason = null } = {}, userId, meta = {}) {
    // Lazy import to avoid circular dependencies
    const Project = (await import('./project.model.js')).default;

    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const currentStatus = project.status;

    // Validate transition
    if (!VALID_TRANSITIONS[currentStatus]?.includes(targetStatus)) {
      throw new ConflictError(
        `Cannot transition from ${currentStatus} to ${targetStatus}`,
      );
    }

    // ON_HOLD requires a comment
    if (targetStatus === 'ON_HOLD' && !comment) {
      throw new ConflictError('A comment is required when placing a project on hold');
    }

    // IN_PROGRESS from PLANNING or ON_HOLD — check mandatory prep actions
    if (targetStatus === 'IN_PROGRESS' && (currentStatus === 'PLANNING' || currentStatus === 'ON_HOLD')) {
      const PreparatoryAction = (await import('./preparatoryAction.model.js')).default;
      const incompleteActions = await PreparatoryAction.find({
        projectId,
        isMandatory: true,
        status: { $nin: ['COMPLETED'] },
        isDeleted: false,
      }).select('title status').lean();

      if (incompleteActions.length > 0 && !override) {
        throw new ConflictError(
          `Cannot transition to IN_PROGRESS: ${incompleteActions.length} mandatory preparatory action(s) are not completed`,
          { outstanding: incompleteActions.map((a) => ({ id: String(a._id), title: a.title, status: a.status })) },
        );
      }

      if (override && !overrideReason) {
        throw new ConflictError('An override reason is required when overriding preconditions');
      }
    }

    // COMPLETED — check milestones
    if (targetStatus === 'COMPLETED') {
      const ScheduleEntry = (await import('./scheduleEntry.model.js')).default;
      const Task = (await import('../tasks/task.model.js')).default;
      const incompleteMilestones = await ScheduleEntry.countDocuments({
        projectId,
        entryType: 'MILESTONE',
        status: { $nin: ['COMPLETED', 'WAIVED', 'CANCELLED'] },
        isDeleted: false,
      });

      if (incompleteMilestones > 0 && !override) {
        throw new ConflictError(
          `Cannot complete project: ${incompleteMilestones} milestone(s) are not completed, waived, or cancelled`,
        );
      }

      const openTasks = await Task.find({
        projectId,
        status: { $in: ['OPEN', 'IN_PROGRESS', 'ON_HOLD'] },
        isDeleted: false,
      }).select('title status assigneeId dueDate').limit(100).lean();

      if (openTasks.length > 0 && !override) {
        throw new ConflictError(
          `Cannot complete project: ${openTasks.length} task(s) are still open`,
          {
            outstandingTasks: openTasks.map((task) => ({
              id: String(task._id),
              title: task.title,
              status: task.status,
              assigneeId: task.assigneeId ? String(task.assigneeId) : null,
              dueDate: task.dueDate,
            })),
          },
        );
      }

      if (override && !overrideReason) {
        throw new ConflictError('An override reason is required when overriding preconditions');
      }
    }

    // Reopen from COMPLETED — requires override
    if (targetStatus === 'IN_PROGRESS' && currentStatus === 'COMPLETED') {
      if (!override || !overrideReason) {
        throw new ConflictError('Reopening a completed project requires an override with a reason');
      }
    }

    // Update project status
    project.status = targetStatus;
    await project.save();

    // Create history record
    const historyRecord = await ProjectStatusHistory.create({
      projectId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      comment,
      isOverride: override,
      overrideReason,
      changedAt: new Date(),
      changedBy: userId,
    });

    // Invalidate caches
    await cacheManager.del(`pm:project:${projectId}`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:projects:list:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:dashboard:*`);

    // Publish event
    const eventType = override
      ? EVENT_TYPES.PROJECT_STATUS_OVERRIDDEN
      : EVENT_TYPES.PROJECT_STATUS_CHANGED;

    eventBus.publish(eventType, {
      projectId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      comment,
      isOverride: override,
      overrideReason,
      changedBy: userId,
    }, { source: 'pm:status' });

    // Enqueue status notification email. Fan out to the project manager plus any
    // configured CC recipients (PROJ-002 AC-6).
    await queueManager.addJob('auth-email', 'send-status-notification', {
      projectId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      comment,
      changedBy: userId,
      ccRecipients: config.pm?.statusNotificationCc || [],
    });

    // Audit log
    auditService.logEvent({
      eventType: override ? 'project.status.overridden' : 'project.status.changed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { projectId, fromStatus: currentStatus, toStatus: targetStatus, isOverride: override },
      module: 'pm',
    });

    logger.info('Project status changed', {
      module: 'pm',
      action: 'transitionStatus',
      projectId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      isOverride: override,
    });

    return {
      projectId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      changedAt: historyRecord.changedAt,
      preconditionsMet: !override,
    };
  }

  async getStatusHistory(projectId) {
    return ProjectStatusHistory.find({ projectId })
      .sort({ changedAt: -1 })
      .populate('changedBy', 'firstName lastName')
      .lean();
  }
}

const statusService = new StatusService();
export default statusService;
