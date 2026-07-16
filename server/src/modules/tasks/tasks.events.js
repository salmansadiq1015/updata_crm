import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import { emitTaskRealtimeEvent } from '../../shared/socket/socketServer.js';

function emitTaskEvent(eventName, data) {
  emitTaskRealtimeEvent(eventName, {
    type: eventName,
    taskId: String(data.taskId),
    listId: data.listId ? String(data.listId) : null,
    version: data.version ?? data.task?.version ?? 0,
    updatedAt: data.updatedAt ?? data.task?.updatedAt ?? new Date().toISOString(),
    changedFields: data.changedFields,
    task: data.task,
  });
}

export function registerTasksEvents() {
  // EventBus delivers the full envelope { type, payload, … }; unwrap to the payload
  // (same convention as ai.events.js). Reading data.* directly left every field
  // undefined, so realtime task events carried no data and the client never updated.
  eventBus.subscribe(EVENT_TYPES.TASK_CREATED, async (envelope) => {
    emitTaskEvent('task_created', envelope.payload || envelope);
  });

  eventBus.subscribe(EVENT_TYPES.TASK_UPDATED, async (envelope) => {
    emitTaskEvent('task_updated', envelope.payload || envelope);
  });

  eventBus.subscribe(EVENT_TYPES.TASK_MOVED, async (envelope) => {
    emitTaskEvent('task_moved', envelope.payload || envelope);
  });

  eventBus.subscribe(EVENT_TYPES.TASK_DELETED, async (envelope) => {
    const data = envelope.payload || envelope;
    emitTaskRealtimeEvent('task_deleted', {
      type: 'task_deleted',
      taskId: String(data.taskId),
      listId: data.listId ? String(data.listId) : null,
      version: data.version ?? 0,
      updatedAt: data.updatedAt ?? new Date().toISOString(),
    });
  });

  // When a task is assigned to another user → send notification email
  eventBus.subscribe(EVENT_TYPES.TASK_ASSIGNED, async (envelope) => {
    const data = envelope.payload || envelope;
    try {
      if (data.assigneeId && String(data.assigneeId) !== String(data.assignedBy)) {
        // Lazy import to avoid circular deps
        const { sendTaskAssignedEmail } = await import('../../shared/mail/mail.js');
        const User = (await import('../auth/user.model.js')).default;

        const [assignee, assigner] = await Promise.all([
          User.findById(data.assigneeId).select('firstName lastName email').lean(),
          User.findById(data.assignedBy).select('firstName lastName').lean(),
        ]);

        if (assignee?.email) {
          await sendTaskAssignedEmail(assignee.email, {
            assigneeName: `${assignee.firstName} ${assignee.lastName}`,
            assignerName: `${assigner?.firstName || ''} ${assigner?.lastName || ''}`.trim(),
            taskTitle: data.taskTitle || data.title,
            taskId: data.taskId,
            dueDate: data.dueDate,
            priority: data.priority,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to send task assignment notification', {
        module: 'tasks',
        action: 'event.task_assigned',
        taskId: data.taskId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // When a task reminder fires with EMAIL channel → send reminder email
  eventBus.subscribe(EVENT_TYPES.TASK_REMINDER_FIRED, async (envelope) => {
    const data = envelope.payload || envelope;
    try {
      if (data.channels?.includes('EMAIL')) {
        const { sendTaskReminderEmail } = await import('../../shared/mail/mail.js');
        const User = (await import('../auth/user.model.js')).default;

        const user = await User.findById(data.userId).select('firstName lastName email').lean();
        if (user?.email) {
          await sendTaskReminderEmail(user.email, {
            userName: `${user.firstName} ${user.lastName}`,
            taskTitle: data.taskTitle,
            taskId: data.taskId,
            dueDate: data.dueDate,
            isOverdue: data.isOverdue || false,
          });
        }
      }
    } catch (err) {
      logger.error('Failed to send task reminder email', {
        module: 'tasks',
        action: 'event.task_reminder_fired',
        taskId: data.taskId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // When a task note mentions users → could send notification (placeholder for Module 13)
  eventBus.subscribe(EVENT_TYPES.TASK_NOTE_ADDED, async (envelope) => {
    const data = envelope.payload || envelope;
    try {
      if (data.mentions?.length > 0) {
        logger.info('Task note mentions detected — notification deferred to Module 13', {
          module: 'tasks',
          action: 'event.task_note_added',
          taskId: data.taskId,
          mentionCount: data.mentions.length,
        });
      }
    } catch (err) {
      logger.error('Failed to handle task note event', {
        module: 'tasks',
        action: 'event.task_note_added',
        error: { message: err.message },
      });
    }
  });

  // When task due date changes → recalculate reminders
  eventBus.subscribe(EVENT_TYPES.TASK_DUE_DATE_CHANGED, async (envelope) => {
    const data = envelope.payload || envelope;
    try {
      const taskReminderService = (await import('./taskReminder.service.js')).default;
      await taskReminderService.recalculateReminders(data.taskId, data.newDueDate);
    } catch (err) {
      logger.error('Failed to recalculate reminders after due date change', {
        module: 'tasks',
        action: 'event.task_due_date_changed',
        taskId: data.taskId,
        error: { message: err.message, stack: err.stack },
      });
    }
  });

  // When task is deleted → cancel all pending reminders
  eventBus.subscribe(EVENT_TYPES.TASK_DELETED, async (envelope) => {
    const data = envelope.payload || envelope;
    try {
      const taskReminderRepository = (await import('./taskReminder.repository.js')).default;
      await taskReminderRepository.cancelByTaskId(data.taskId);
    } catch (err) {
      logger.error('Failed to cancel reminders for deleted task', {
        module: 'tasks',
        action: 'event.task_deleted',
        taskId: data.taskId,
        error: { message: err.message },
      });
    }
  });

  logger.info('Task event handlers registered', {
    module: 'tasks',
    action: 'events.register',
    events: ['TASK_ASSIGNED', 'TASK_REMINDER_FIRED', 'TASK_NOTE_ADDED', 'TASK_DUE_DATE_CHANGED', 'TASK_DELETED'],
  });
}
