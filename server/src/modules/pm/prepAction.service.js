import prepActionRepository from './prepAction.repository.js';
import auditService from '../auth/audit.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };

class PrepActionService {
  async create(projectId, data, createdBy, meta = {}) {
    // Lazy import to avoid circular dependencies
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId);
    if (!project) throw new NotFoundError('Project', projectId);

    const actionData = {
      ...data,
      projectId,
      createdBy,
    };

    // Set type-specific details
    if (data.actionType === 'FUNDING_APPLICATION' && data.fundingDetails) {
      actionData.fundingDetails = data.fundingDetails;
    }
    if (data.actionType === 'MATERIAL_ORDER' && data.materialOrderDetails) {
      actionData.materialOrderDetails = data.materialOrderDetails;
    }

    const action = await prepActionRepository.create(actionData);

    await this._invalidateCache(projectId);

    eventBus.publish(EVENT_TYPES.PREP_ACTION_CREATED, {
      actionId: action._id,
      projectId,
      actionType: data.actionType,
      title: data.title,
      isMandatory: data.isMandatory || false,
      assignedToId: data.assignedToId || null,
      createdBy,
    }, { source: 'pm:prep-actions' });

    auditService.logEvent({
      eventType: 'prep_action.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { actionId: action._id, projectId, actionType: data.actionType },
      module: 'pm',
    });

    logger.info('Preparatory action created', {
      module: 'pm',
      action: 'create',
      actionId: action._id,
      projectId,
    });

    return prepActionRepository.findById(action._id);
  }

  async getById(id) {
    const action = await prepActionRepository.findById(id);
    if (!action) throw new NotFoundError('PreparatoryAction', id);
    return action;
  }

  async listByProject(projectId) {
    const cacheKey = `pm:prep-actions:project:${projectId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => prepActionRepository.findByProjectId(projectId),
      ENTITY_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await prepActionRepository.findById(id);
    if (!existing) throw new NotFoundError('PreparatoryAction', id);

    const updated = await prepActionRepository.updateById(id, {
      ...data,
      updatedBy,
    });

    await this._invalidateCache(existing.projectId);

    eventBus.publish(EVENT_TYPES.PREP_ACTION_UPDATED, {
      actionId: id,
      projectId: existing.projectId,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'pm:prep-actions' });

    auditService.logEvent({
      eventType: 'prep_action.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { actionId: id, projectId: existing.projectId, changedFields: Object.keys(data) },
      module: 'pm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await prepActionRepository.findById(id);
    if (!existing) throw new NotFoundError('PreparatoryAction', id);

    await prepActionRepository.softDelete(id);

    await this._invalidateCache(existing.projectId);

    eventBus.publish(EVENT_TYPES.PREP_ACTION_DELETED, {
      actionId: id,
      projectId: existing.projectId,
      deletedBy,
    }, { source: 'pm:prep-actions' });

    auditService.logEvent({
      eventType: 'prep_action.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { actionId: id, projectId: existing.projectId },
      module: 'pm',
    });

    logger.info('Preparatory action deleted', {
      module: 'pm',
      action: 'delete',
      actionId: id,
      projectId: existing.projectId,
    });
  }

  async addAttachment(actionId, fileData, uploadedBy, meta = {}) {
    const existing = await prepActionRepository.findById(actionId);
    if (!existing) throw new NotFoundError('PreparatoryAction', actionId);

    // Mirror the project-document upload flow: persist the file via file.service,
    // then store the fileId reference on the action.
    const fileService = (await import('../files/file.service.js')).default;
    const fileMeta = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalName,
      mimeType: fileData.mimeType,
      sizeBytes: fileData.sizeBytes,
      module: 'pm',
      entityType: 'prep-action',
      entityId: actionId,
      uploadedBy,
      bucket: 'documents',
    });

    const attachment = {
      fileId: fileMeta._id,
      fileName: fileData.originalName,
      uploadedBy,
      uploadedAt: new Date(),
    };

    const updated = await prepActionRepository.addAttachment(actionId, attachment);

    await this._invalidateCache(existing.projectId);

    auditService.logEvent({
      eventType: 'prep_action.attachment_added',
      userId: uploadedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { actionId, projectId: existing.projectId, fileId: fileMeta._id, fileName: fileData.originalName },
      module: 'pm',
    });

    logger.info('Preparatory action attachment added', {
      module: 'pm',
      action: 'attachment.add',
      actionId,
      projectId: existing.projectId,
      fileId: fileMeta._id,
    });

    return updated.attachments;
  }

  async listAttachments(actionId) {
    const action = await prepActionRepository.findById(actionId);
    if (!action) throw new NotFoundError('PreparatoryAction', actionId);
    return action.attachments || [];
  }

  async getAttachmentDownloadUrl(actionId, fileId) {
    const action = await prepActionRepository.findById(actionId);
    if (!action) throw new NotFoundError('PreparatoryAction', actionId);

    const attachment = (action.attachments || []).find(
      (a) => String(a.fileId) === String(fileId),
    );
    if (!attachment) throw new NotFoundError('Attachment', fileId);

    const fileService = (await import('../files/file.service.js')).default;
    return fileService.getDownloadUrl(attachment.fileId);
  }

  async getHistory(actionId) {
    const action = await prepActionRepository.findById(actionId);
    if (!action) throw new NotFoundError('PreparatoryAction', actionId);

    const mongoose = (await import('mongoose')).default;
    const candidates = [String(actionId)];
    if (mongoose.Types.ObjectId.isValid(actionId)) {
      candidates.push(new mongoose.Types.ObjectId(actionId));
    }

    return auditService.queryByEntity({
      module: 'pm',
      detailsKey: 'actionId',
      entityId: candidates,
      eventTypePrefix: 'prep_action.',
      limit: 100,
    });
  }

  async _invalidateCache(projectId) {
    await cacheManager.del(`pm:prep-actions:project:${projectId}`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:dashboard:*`);
  }
}

const prepActionService = new PrepActionService();
export default prepActionService;
