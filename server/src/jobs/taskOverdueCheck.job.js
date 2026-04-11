import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

export class TaskOverdueCheckWorker extends BaseWorker {
  constructor() {
    super('task-overdue-check');
  }

  async process(job) {
    const taskRepository = (await import('../modules/tasks/task.repository.js')).default;

    const overdueTasks = await taskRepository.findOverdue();

    if (overdueTasks.length === 0) {
      return { overdueCount: 0 };
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

    return { overdueCount: overdueTasks.length };
  }
}
