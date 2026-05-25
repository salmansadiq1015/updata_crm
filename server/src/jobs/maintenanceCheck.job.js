import { BaseWorker } from '../shared/queue/BaseWorker.js';
import cacheManager from '../shared/cache/CacheManager.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import config from '../config/index.js';
import logger from '../shared/logger/index.js';

/**
 * Maintenance check job.
 *
 * Scans all maintenance intervals and updates their status:
 * - Overdue: nextDueDate is in the past
 * - Due: nextDueDate is within the next 30 days
 *
 * Runs on a schedule (e.g., daily) to keep maintenance statuses current.
 */
export class MaintenanceCheckWorker extends BaseWorker {
  constructor() {
    super('maintenance-check');
  }

  async _getSchedulingRecipientIds() {
    const [{ default: Permission }, { default: Role }, { default: User }] = await Promise.all([
      import('../modules/auth/permission.model.js'),
      import('../modules/auth/role.model.js'),
      import('../modules/auth/user.model.js'),
    ]);

    const permission = await Permission.findOne({ module: 'scheduling', action: 'read' })
      .select('_id')
      .lean();
    if (!permission) return [];

    const roles = await Role.find({ permissions: permission._id })
      .select('_id')
      .lean();
    if (roles.length === 0) return [];

    const users = await User.find({
      role: { $in: roles.map((role) => role._id) },
      status: 'active',
    })
      .select('_id')
      .lean();

    return users.map((user) => user._id);
  }

  async process(_job) {
    const now = new Date();
    const lookaheadDays = config.maintenance?.lookaheadDays || 30;
    const lookaheadDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);

    // Lazy import to avoid circular dependencies
    const MaintenanceInterval = (await import('../modules/crm/maintenanceInterval.model.js')).default;

    // Mark overdue: status was ok or due, but nextDueDate has passed
    const overdueResult = await MaintenanceInterval.updateMany(
      {
        maintenanceStatus: { $in: ['ok', 'due'] },
        nextDueDate: { $lte: now },
        linkedServiceOrderId: null,
      },
      { $set: { maintenanceStatus: 'overdue' } },
    );
    const updatedOverdue = overdueResult.modifiedCount;

    // Mark due: status was ok, nextDueDate is within 30 days but still in the future
    const dueResult = await MaintenanceInterval.updateMany(
      {
        maintenanceStatus: 'ok',
        nextDueDate: { $lte: lookaheadDate, $gt: now },
        linkedServiceOrderId: null,
      },
      { $set: { maintenanceStatus: 'due' } },
    );
    const updatedDue = dueResult.modifiedCount;

    const assignedTo = updatedOverdue > 0 || updatedDue > 0
      ? await this._getSchedulingRecipientIds()
      : [];

    // Publish events if any records were updated
    if (updatedOverdue > 0) {
      eventBus.publish(EVENT_TYPES.MAINTENANCE_OVERDUE, {
        count: updatedOverdue,
        assignedTo,
      }, { source: 'jobs:maintenance-check' });
    }

    if (updatedDue > 0) {
      eventBus.publish(EVENT_TYPES.MAINTENANCE_DUE, {
        count: updatedDue,
        assignedTo,
      }, { source: 'jobs:maintenance-check' });
    }

    // Invalidate caches if anything changed
    if (updatedOverdue > 0 || updatedDue > 0) {
      await cacheManager.del('crm:maintenance:dashboard');
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}crm:maintenance:installation:*`);
    }

    logger.info('Maintenance check completed', {
      module: 'jobs',
      action: 'maintenance-check',
      updatedDue,
      updatedOverdue,
    });

    return { updatedDue, updatedOverdue };
  }
}

export default MaintenanceCheckWorker;
