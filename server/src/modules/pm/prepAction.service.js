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

  async _invalidateCache(projectId) {
    await cacheManager.del(`pm:prep-actions:project:${projectId}`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}pm:dashboard:*`);
  }
}

const prepActionService = new PrepActionService();
export default prepActionService;
