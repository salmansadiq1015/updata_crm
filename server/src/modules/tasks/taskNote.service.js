import taskNoteRepository from './taskNote.repository.js';
import taskAccessService from './taskAccess.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const NOTE_CACHE_TTL = { l1Ttl: 30, l2Ttl: 120 };
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function toId(value) {
  if (!value) return null;
  if (value._id) return value._id;
  return value;
}

class TaskNoteService {
  /**
   * Extract @mentions from HTML body.
   * Looks for data-user-id attributes in mention elements.
   */
  _extractMentions(bodyHtml) {
    const mentionRegex = /data-user-id=["']([a-f0-9]{24})["']/gi;
    const mentions = [];
    let match;
    while ((match = mentionRegex.exec(bodyHtml)) !== null) {
      if (!mentions.includes(match[1])) {
        mentions.push(match[1]);
      }
    }
    return mentions;
  }

  async _ensureTaskExists(taskId) {
    const { default: taskRepository } = await import('./task.repository.js');
    const task = await taskRepository.findById(taskId);
    if (!task) throw new NotFoundError('Task', taskId);
    return task;
  }

  async create(taskId, data, userId, meta = {}) {
    const task = await this._ensureTaskExists(taskId);
    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    const mentions = this._extractMentions(data.bodyHtml);

    const note = await taskNoteRepository.create({
      taskId,
      authorId: userId,
      bodyHtml: data.bodyHtml,
      mentions,
    });

    eventBus.publish(EVENT_TYPES.TASK_NOTE_ADDED, {
      taskId,
      noteId: note._id,
      authorId: userId,
      mentions,
      taskTitle: task.title,
    }, { source: 'tasks' });

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_note.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, noteId: note._id, mentionCount: mentions.length },
      module: 'tasks',
    });

    logger.info('Task note created', {
      module: 'tasks',
      action: 'createNote',
      taskId,
      noteId: note._id,
      userId,
    });

    return note;
  }

  async getByTaskId(taskId, userId) {
    const task = await this._ensureTaskExists(taskId);
    await taskAccessService.assertTaskAccess(task, userId, 'VIEWER');

    const cacheKey = `tasks:notes:${taskId}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const TaskNote = (await import('./taskNote.model.js')).default;
        return TaskNote.find({ taskId })
          .sort({ createdAt: 1 })
          .populate('authorId', 'firstName lastName avatar')
          .lean();
      },
      NOTE_CACHE_TTL,
    );
  }

  async update(taskId, noteId, data, userId, meta = {}) {
    const task = await this._ensureTaskExists(taskId);
    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    const note = await taskNoteRepository.findById(noteId);
    if (!note) throw new NotFoundError('TaskNote', noteId);

    if (String(note.taskId) !== String(taskId)) {
      throw new NotFoundError('TaskNote', noteId);
    }

    if (String(note.authorId) !== String(userId)) {
      throw new AppError('Only the author can edit this note', 403, ERROR_CODES.TASK_ACCESS_DENIED);
    }

    const elapsed = Date.now() - new Date(note.createdAt).getTime();
    if (elapsed > EDIT_WINDOW_MS) {
      throw new AppError(
        'Note can only be edited within 15 minutes of creation',
        400,
        ERROR_CODES.TASK_NOTE_EDIT_EXPIRED,
      );
    }

    const mentions = this._extractMentions(data.bodyHtml);

    const updated = await taskNoteRepository.updateById(noteId, {
      bodyHtml: data.bodyHtml,
      isEdited: true,
      mentions,
    });

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_note.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, noteId },
      module: 'tasks',
    });

    logger.info('Task note updated', {
      module: 'tasks',
      action: 'updateNote',
      taskId,
      noteId,
      userId,
    });

    return updated;
  }

  async remove(taskId, noteId, userId, meta = {}) {
    const task = await this._ensureTaskExists(taskId);
    await taskAccessService.assertTaskAccess(task, userId, 'EDITOR');

    const note = await taskNoteRepository.findById(noteId);
    if (!note) throw new NotFoundError('TaskNote', noteId);

    if (String(note.taskId) !== String(taskId)) {
      throw new NotFoundError('TaskNote', noteId);
    }

    // Allow author or admin (check via role on req is handled upstream;
    // here we allow if user is the author)
    if (String(note.authorId) !== String(userId)) {
      if (String(toId(task.createdBy)) !== String(userId)) {
        throw new AppError('Only the author or task owner can delete this note', 403, ERROR_CODES.TASK_ACCESS_DENIED);
      }
    }

    await taskNoteRepository.softDelete(noteId);

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_note.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, noteId },
      module: 'tasks',
    });

    logger.info('Task note deleted', {
      module: 'tasks',
      action: 'removeNote',
      taskId,
      noteId,
      userId,
    });

    return { deleted: true };
  }

  async _invalidateCache(taskId) {
    await cacheManager.del(`tasks:notes:${taskId}`);
  }
}

const taskNoteService = new TaskNoteService();
export default taskNoteService;
