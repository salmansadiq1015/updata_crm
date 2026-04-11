import { BaseWorker } from '../shared/queue/BaseWorker.js';
import logger from '../shared/logger/index.js';

export class TaskReminderDispatchWorker extends BaseWorker {
  constructor() {
    super('task-reminder-dispatch');
  }

  async process(job) {
    const taskReminderService = (await import('../modules/tasks/taskReminder.service.js')).default;
    const taskReminderRepository = (await import('../modules/tasks/taskReminder.repository.js')).default;

    const now = new Date();
    const dueReminders = await taskReminderRepository.findDueReminders(now);

    if (dueReminders.length === 0) {
      return { processed: 0 };
    }

    logger.info(`Processing ${dueReminders.length} due task reminders`, {
      module: 'jobs',
      action: 'task-reminder-dispatch',
      count: dueReminders.length,
    });

    let processed = 0;
    let failed = 0;

    for (const reminder of dueReminders) {
      try {
        await taskReminderService.fireReminder(reminder._id);
        processed++;
      } catch (err) {
        failed++;
        logger.error('Failed to fire task reminder', {
          module: 'jobs',
          action: 'task-reminder-dispatch',
          reminderId: reminder._id,
          error: { message: err.message },
        });
      }
    }

    logger.info('Task reminder dispatch complete', {
      module: 'jobs',
      action: 'task-reminder-dispatch',
      processed,
      failed,
    });

    return { processed, failed };
  }
}
