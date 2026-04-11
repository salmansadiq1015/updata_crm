import mongoose from 'mongoose';
import taskReminderRepository from './taskReminder.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const REMINDER_CACHE_TTL = { l1Ttl: 30, l2Ttl: 120 };
const MAX_REMINDERS_PER_TASK = 5;

// Inline model for user reminder defaults
const userReminderDefaultsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    enabled: { type: Boolean, default: true },
    defaultOffsetMinutes: { type: Number, default: -1440 },
    defaultChannels: [{ type: String, enum: ['PUSH', 'IN_APP', 'EMAIL'] }],
  },
  { timestamps: true },
);

const UserReminderDefaults = mongoose.models.UserReminderDefaults
  || mongoose.model('UserReminderDefaults', userReminderDefaultsSchema);

class TaskReminderService {
  async _ensureTaskExists(taskId) {
    const { default: taskRepository } = await import('./task.repository.js');
    const task = await taskRepository.findById(taskId);
    if (!task) throw new NotFoundError('Task', taskId);
    return task;
  }

  async create(taskId, data, userId, meta = {}) {
    const task = await this._ensureTaskExists(taskId);

    const count = await taskReminderRepository.countByTaskId(taskId);
    if (count >= MAX_REMINDERS_PER_TASK) {
      throw new AppError(
        `Maximum of ${MAX_REMINDERS_PER_TASK} reminders per task exceeded`,
        400,
        ERROR_CODES.TASK_REMINDER_LIMIT_EXCEEDED,
      );
    }

    let fireAt;
    if (data.type === 'RELATIVE') {
      if (!task.dueDate) {
        throw new AppError(
          'Cannot create a relative reminder on a task without a due date',
          400,
          ERROR_CODES.TASK_REMINDER_LIMIT_EXCEEDED,
        );
      }
      fireAt = new Date(new Date(task.dueDate).getTime() + data.offsetMinutes * 60 * 1000);
    } else {
      fireAt = new Date(data.fireAt);
    }

    if (fireAt <= new Date()) {
      throw new AppError(
        'Reminder fire time must be in the future',
        400,
        ERROR_CODES.TASK_REMINDER_LIMIT_EXCEEDED,
      );
    }

    const reminder = await taskReminderRepository.create({
      taskId,
      userId,
      type: data.type,
      offsetMinutes: data.type === 'RELATIVE' ? data.offsetMinutes : null,
      fireAt,
      channels: data.channels,
      status: 'PENDING',
    });

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_reminder.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, reminderId: reminder._id, type: data.type, fireAt },
      module: 'tasks',
    });

    logger.info('Task reminder created', {
      module: 'tasks',
      action: 'createReminder',
      taskId,
      reminderId: reminder._id,
      userId,
    });

    return reminder;
  }

  async getByTaskId(taskId) {
    const cacheKey = `tasks:reminders:${taskId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => taskReminderRepository.findByTaskId(taskId),
      REMINDER_CACHE_TTL,
    );
  }

  async remove(taskId, reminderId, userId, meta = {}) {
    const reminder = await taskReminderRepository.findById(reminderId);
    if (!reminder) throw new NotFoundError('TaskReminder', reminderId);

    if (String(reminder.taskId) !== String(taskId)) {
      throw new NotFoundError('TaskReminder', reminderId);
    }

    await taskReminderRepository.deleteById(reminderId);

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_reminder.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, reminderId },
      module: 'tasks',
    });

    logger.info('Task reminder deleted', {
      module: 'tasks',
      action: 'removeReminder',
      taskId,
      reminderId,
      userId,
    });

    return { deleted: true };
  }

  async fireReminder(reminderId) {
    const reminder = await taskReminderRepository.findById(reminderId);
    if (!reminder) throw new NotFoundError('TaskReminder', reminderId);

    const now = new Date();
    await taskReminderRepository.updateById(reminderId, {
      status: 'FIRED',
      firedAt: now,
    });

    eventBus.publish(EVENT_TYPES.TASK_REMINDER_FIRED, {
      reminderId,
      taskId: reminder.taskId,
      userId: reminder.userId,
      channels: reminder.channels,
    }, { source: 'tasks' });

    if (reminder.channels.includes('EMAIL')) {
      try {
        const { default: sendMail } = await import('../../shared/mail/mail.js');
        const { default: taskRepository } = await import('./task.repository.js');
        const task = await taskRepository.findById(reminder.taskId);
        const User = (await import('mongoose')).default.model('User');
        const user = await User.findById(reminder.userId).select('email firstName').lean();

        if (user && task) {
          await sendMail({
            to: user.email,
            subject: `Reminder: ${task.title}`,
            html: `<p>Hi ${user.firstName},</p><p>This is a reminder for your task: <strong>${task.title}</strong>.</p>`,
          });
        }
      } catch (err) {
        logger.error('Failed to send reminder email', {
          module: 'tasks',
          action: 'fireReminder',
          reminderId,
          error: err.message,
        });
      }
    }

    logger.info('Task reminder fired', {
      module: 'tasks',
      action: 'fireReminder',
      reminderId,
      taskId: reminder.taskId,
      userId: reminder.userId,
    });

    return { fired: true };
  }

  async snoozeReminder(reminderId, snoozeDuration, userId) {
    const reminder = await taskReminderRepository.findById(reminderId);
    if (!reminder) throw new NotFoundError('TaskReminder', reminderId);

    const snoozedUntil = new Date(Date.now() + snoozeDuration * 60 * 1000);

    const updated = await taskReminderRepository.updateById(reminderId, {
      status: 'SNOOZED',
      snoozedUntil,
    });

    await this._invalidateCache(String(reminder.taskId));

    logger.info('Task reminder snoozed', {
      module: 'tasks',
      action: 'snoozeReminder',
      reminderId,
      snoozedUntil,
      userId,
    });

    return updated;
  }

  async recalculateReminders(taskId, newDueDate) {
    const reminders = await taskReminderRepository.findByTaskId(taskId);
    const relativeReminders = reminders.filter(
      (r) => r.type === 'RELATIVE' && r.status === 'PENDING',
    );

    if (!relativeReminders.length) return;

    if (!newDueDate) {
      await Promise.all(
        relativeReminders.map((r) =>
          taskReminderRepository.updateById(r._id, { status: 'CANCELLED' }),
        ),
      );
      logger.info('Relative reminders cancelled due to removed due date', {
        module: 'tasks',
        action: 'recalculateReminders',
        taskId,
        count: relativeReminders.length,
      });
      await this._invalidateCache(taskId);
      return;
    }

    const dueDateMs = new Date(newDueDate).getTime();
    await Promise.all(
      relativeReminders.map((r) => {
        const newFireAt = new Date(dueDateMs + r.offsetMinutes * 60 * 1000);
        return taskReminderRepository.updateById(r._id, { fireAt: newFireAt });
      }),
    );

    logger.info('Relative reminders recalculated', {
      module: 'tasks',
      action: 'recalculateReminders',
      taskId,
      count: relativeReminders.length,
      newDueDate,
    });

    await this._invalidateCache(taskId);
  }

  async getUserDefaults(userId) {
    const defaults = await UserReminderDefaults.findOne({ userId }).lean();
    if (defaults) return defaults;

    return {
      userId,
      enabled: true,
      defaultOffsetMinutes: -1440,
      defaultChannels: ['PUSH', 'IN_APP'],
    };
  }

  async setUserDefaults(userId, data) {
    const updated = await UserReminderDefaults.findOneAndUpdate(
      { userId },
      {
        userId,
        enabled: data.enabled,
        defaultOffsetMinutes: data.defaultOffsetMinutes,
        defaultChannels: data.defaultChannels,
      },
      { new: true, upsert: true, runValidators: true },
    ).lean();

    logger.info('User reminder defaults updated', {
      module: 'tasks',
      action: 'setUserDefaults',
      userId,
    });

    return updated;
  }

  async _invalidateCache(taskId) {
    await cacheManager.del(`tasks:reminders:${taskId}`);
  }
}

const taskReminderService = new TaskReminderService();
export default taskReminderService;
