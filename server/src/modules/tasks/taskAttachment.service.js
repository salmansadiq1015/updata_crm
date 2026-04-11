import taskAttachmentRepository from './taskAttachment.repository.js';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from './taskAttachment.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const ATTACHMENT_CACHE_TTL = { l1Ttl: 30, l2Ttl: 120 };
const MAX_ATTACHMENTS_PER_TASK = 50;

class TaskAttachmentService {
  async _ensureTaskExists(taskId) {
    const { default: taskRepository } = await import('./task.repository.js');
    const task = await taskRepository.findById(taskId);
    if (!task) throw new NotFoundError('Task', taskId);
    return task;
  }

  async _getFileService() {
    const { default: fileService } = await import('../files/file.service.js');
    return fileService;
  }

  async upload(taskId, file, userId, meta = {}) {
    await this._ensureTaskExists(taskId);

    const count = await taskAttachmentRepository.countByTaskId(taskId);
    if (count >= MAX_ATTACHMENTS_PER_TASK) {
      throw new AppError(
        `Maximum of ${MAX_ATTACHMENTS_PER_TASK} attachments per task exceeded`,
        400,
        ERROR_CODES.TASK_ATTACHMENT_LIMIT_EXCEEDED,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new AppError(
        `File size exceeds the maximum allowed size of ${MAX_FILE_SIZE} bytes`,
        400,
        ERROR_CODES.FILE_TOO_LARGE,
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new AppError(
        `File type "${file.mimetype}" is not allowed`,
        400,
        ERROR_CODES.FILE_TYPE_NOT_ALLOWED,
      );
    }

    // Upload via file service
    const fileService = await this._getFileService();
    const fileRecord = await fileService.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      module: 'tasks',
      entityType: 'task_attachment',
      entityId: taskId,
      uploadedBy: userId,
      bucket: 'general',
    });

    const attachment = await taskAttachmentRepository.create({
      taskId,
      fileId: fileRecord._id,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
      storagePath: fileRecord.key,
      uploadedBy: userId,
    });

    eventBus.publish(EVENT_TYPES.TASK_ATTACHMENT_ADDED, {
      taskId,
      attachmentId: attachment._id,
      fileId: fileRecord._id,
      fileName: file.originalname,
      uploadedBy: userId,
    }, { source: 'tasks' });

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_attachment.uploaded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, attachmentId: attachment._id, fileName: file.originalname, fileSize: file.size },
      module: 'tasks',
    });

    logger.info('Task attachment uploaded', {
      module: 'tasks',
      action: 'uploadAttachment',
      taskId,
      attachmentId: attachment._id,
      fileName: file.originalname,
      userId,
    });

    return attachment;
  }

  async getByTaskId(taskId) {
    const cacheKey = `tasks:attachments:${taskId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => taskAttachmentRepository.findByTaskId(taskId),
      ATTACHMENT_CACHE_TTL,
    );
  }

  async download(taskId, attachmentId) {
    const attachment = await taskAttachmentRepository.findById(attachmentId);
    if (!attachment) throw new NotFoundError('TaskAttachment', attachmentId);

    if (String(attachment.taskId) !== String(taskId)) {
      throw new NotFoundError('TaskAttachment', attachmentId);
    }

    const fileService = await this._getFileService();
    const url = await fileService.getDownloadUrl(attachment.fileId);

    return {
      url,
      fileName: attachment.fileName,
      mimeType: attachment.mimeType,
      fileSize: attachment.fileSize,
    };
  }

  async remove(taskId, attachmentId, userId, meta = {}) {
    const attachment = await taskAttachmentRepository.findById(attachmentId);
    if (!attachment) throw new NotFoundError('TaskAttachment', attachmentId);

    if (String(attachment.taskId) !== String(taskId)) {
      throw new NotFoundError('TaskAttachment', attachmentId);
    }

    await taskAttachmentRepository.softDelete(attachmentId);

    await this._invalidateCache(taskId);

    auditService.logEvent({
      eventType: 'task_attachment.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { taskId, attachmentId, fileName: attachment.fileName },
      module: 'tasks',
    });

    logger.info('Task attachment deleted', {
      module: 'tasks',
      action: 'removeAttachment',
      taskId,
      attachmentId,
      userId,
    });

    return { deleted: true };
  }

  async _invalidateCache(taskId) {
    await cacheManager.del(`tasks:attachments:${taskId}`);
  }
}

const taskAttachmentService = new TaskAttachmentService();
export default taskAttachmentService;
