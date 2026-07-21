import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';
import config from '../config/index.js';
import { poolCutoffDate } from '../modules/tasks/taskPool.util.js';

export class TaskOverdueCheckWorker extends BaseWorker {
  constructor() {
    super('task-overdue-check');
  }

  async _fillPool(taskRepository) {
    const cutoff = poolCutoffDate(new Date(), config.tasks.poolAfterWorkingDays);
    const eligible = await taskRepository.findPoolEligible(cutoff);
    if (eligible.length === 0) return 0;

    const now = new Date();
    await taskRepository.markPooled(eligible.map((task) => task._id), now);

    for (const task of eligible) {
      try {
        eventBus.publish(EVENT_TYPES.TASK_POOLED, {
          taskId: task._id,
          taskTitle: task.title,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          pooledAt: now,
        }, { source: 'jobs:task-overdue-check' });
      } catch (err) {
        logger.error('Failed to publish task pooled event', {
          module: 'jobs', action: 'task-overdue-check', taskId: task._id, error: { message: err.message },
        });
      }
    }

    logger.info(`Added ${eligible.length} overdue tasks to the pool`, {
      module: 'jobs', action: 'task-overdue-check', pooledCount: eligible.length,
    });
    return eligible.length;
  }

  async process(job) {
    const taskRepository = (await import('../modules/tasks/task.repository.js')).default;

    const pooledCount = await this._fillPool(taskRepository);

    const overdueTasks = await taskRepository.findOverdue();

    if (overdueTasks.length === 0) {
      return { overdueCount: 0, pooledCount };
    }

    logger.info(`Found ${overdueTasks.length} overdue tasks`, {
      module: 'jobs',
      action: 'task-overdue-check',
      count: overdueTasks.length,
    });

    for (const task of overdueTasks) {
      try {
        eventBus.publish(EVENT_TYPES.TASK_OVERDUE, {
          taskId: task._id,
          taskTitle: task.title,
          assigneeId: task.assigneeId,
          dueDate: task.dueDate,
          projectId: task.projectId,
          orderId: task.orderId,
        }, { source: 'jobs:task-overdue-check' });
      } catch (err) {
        logger.error('Failed to publish task overdue event', {
          module: 'jobs',
          action: 'task-overdue-check',
          taskId: task._id,
          error: { message: err.message },
        });
      }
    }

    return { overdueCount: overdueTasks.length, pooledCount };
  }
}
