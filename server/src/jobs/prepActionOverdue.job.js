import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Prep action overdue check job.
 *
 * Scans all preparatory actions and publishes PREP_ACTION_OVERDUE events
 * for any action whose dueDate has passed and is not yet completed,
 * rejected, or cancelled.
 *
 * Runs on a schedule (e.g., daily) to surface overdue actions.
 */
export class PrepActionOverdueWorker extends BaseWorker {
  constructor() {
    super('prep-action-overdue');
  }

  async process(job) {
    const now = new Date();

    // Lazy import to avoid circular dependencies
    const PreparatoryAction = (await import('../modules/pm/preparatoryAction.model.js')).default;

    // Find all overdue actions
    const overdueActions = await PreparatoryAction.find({
      dueDate: { $lte: now },
      status: { $nin: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
      isDeleted: false,
    }).lean();

    // Publish an event for each overdue action
    for (const action of overdueActions) {
      eventBus.publish(EVENT_TYPES.PREP_ACTION_OVERDUE, {
        projectId: action.projectId,
        actionId: action._id,
        title: action.title,
        dueDate: action.dueDate,
        assignedToId: action.assignedToId,
      }, { source: 'jobs:prep-action-overdue' });
    }

    logger.info('Prep action overdue check completed', {
      module: 'jobs',
      action: 'prep-action-overdue',
      overdueCount: overdueActions.length,
    });

    return { overdueCount: overdueActions.length };
  }
}

export default PrepActionOverdueWorker;
