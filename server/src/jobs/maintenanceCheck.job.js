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

  /**
   * Resolve active user ids whose role grants the given permission (module + action).
   * Returns [] when no matching permission/roles/users exist.
   */
  async _getRecipientIdsByPermission(module, action) {
    const [{ default: Permission }, { default: Role }, { default: User }] = await Promise.all([
      import('../modules/auth/permission.model.js'),
      import('../modules/auth/role.model.js'),
      import('../modules/auth/user.model.js'),
    ]);

    const permission = await Permission.findOne({ module, action })
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

  async _getSchedulingRecipientIds() {
    return this._getRecipientIdsByPermission('scheduling', 'read');
  }

  /**
   * Escalation recipients: scheduling recipients PLUS admins (users:admin).
   * De-duplicated so an admin who is also a scheduler is not notified twice.
   */
  async _getEscalationRecipientIds() {
    const [schedulingIds, adminIds] = await Promise.all([
      this._getSchedulingRecipientIds(),
      this._getRecipientIdsByPermission('users', 'admin'),
    ]);
    const seen = new Set();
    const merged = [];
    for (const id of [...schedulingIds, ...adminIds]) {
      const key = String(id);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(id);
    }
    return merged;
  }

  async process(_job) {
    const now = new Date();
    const lookaheadDays = config.maintenance?.lookaheadDays || 30;
    const lookaheadDate = new Date(now.getTime() + lookaheadDays * 24 * 60 * 60 * 1000);
    const escalationDays = config.maintenance?.escalationDays || 30;
    const escalationCutoff = new Date(now.getTime() - escalationDays * 24 * 60 * 60 * 1000);

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

    // Mark due: status was ok, nextDueDate is within 30 days but still in the future.
    // Items moving (back) into a non-overdue state clear any prior escalation so a
    // future lapse can escalate again (keeps escalation idempotent yet repeatable).
    const dueResult = await MaintenanceInterval.updateMany(
      {
        maintenanceStatus: 'ok',
        nextDueDate: { $lte: lookaheadDate, $gt: now },
        linkedServiceOrderId: null,
      },
      { $set: { maintenanceStatus: 'due', escalated: false } },
    );
    const updatedDue = dueResult.modifiedCount;

    // Escalate: still overdue, more than `escalationDays` past due, not linked to
    // service work, and not yet escalated. Setting `escalated: true` in the same
    // filtered update guarantees idempotency — already-escalated items are excluded
    // by the `escalated: false` predicate, so subsequent runs publish nothing.
    const escalationResult = await MaintenanceInterval.updateMany(
      {
        maintenanceStatus: 'overdue',
        nextDueDate: { $lte: escalationCutoff },
        linkedServiceOrderId: null,
        escalated: false,
      },
      { $set: { escalated: true } },
    );
    const updatedEscalated = escalationResult.modifiedCount;

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

    // Escalation targets schedulers AND admins. Only published for NEWLY escalated
    // items, so it never re-fires for items escalated on a prior run.
    if (updatedEscalated > 0) {
      eventBus.publish(EVENT_TYPES.MAINTENANCE_ESCALATED, {
        count: updatedEscalated,
        assignedTo: await this._getEscalationRecipientIds(),
      }, { source: 'jobs:maintenance-check' });
    }

    // Invalidate caches if anything changed
    if (updatedOverdue > 0 || updatedDue > 0 || updatedEscalated > 0) {
      await cacheManager.del('crm:maintenance:dashboard');
      await cacheManager.invalidatePattern(`${config.redis.keyPrefix}crm:maintenance:installation:*`);
    }

    logger.info('Maintenance check completed', {
      module: 'jobs',
      action: 'maintenance-check',
      updatedDue,
      updatedOverdue,
      updatedEscalated,
    });

    // Return shape kept stable ({ updatedDue, updatedOverdue }) for existing callers/tests.
    return { updatedDue, updatedOverdue };
  }
}

export default MaintenanceCheckWorker;
