import entityImageRepository from './entityImage.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class EntityImageService {
  _cacheKey(entityType, entityId) {
    return `crm:images:${entityType}:${entityId}`;
  }

  async create(entityType, entityId, fileData, uploadedBy, meta = {}) {
    // Lazy import to avoid circular dependencies
    const fileService = (await import('../files/file.service.js')).default;

    const uploadedFile = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalName,
      mimeType: fileData.mimeType,
      sizeBytes: fileData.sizeBytes,
      module: 'crm',
      entityType,
      entityId,
      uploadedBy,
      bucket: 'images',
    });

    const entityImage = await entityImageRepository.create({
      entityType,
      entityId,
      fileId: uploadedFile._id,
      caption: fileData.caption || null,
      category: fileData.category || 'general',
      sortOrder: fileData.sortOrder || 0,
      uploadedBy,
    });

    await this._invalidateCache(entityType, entityId);

    eventBus.publish(EVENT_TYPES.IMAGE_LINKED, {
      imageId: entityImage._id,
      fileId: uploadedFile._id,
      entityType,
      entityId,
      uploadedBy,
    }, { source: 'crm:images' });

    auditService.logEvent({
      eventType: 'image.linked',
      userId: uploadedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { imageId: entityImage._id, fileId: uploadedFile._id, entityType, entityId },
      module: 'crm',
    });

    logger.info('Entity image created', { module: 'crm', action: 'image.create', imageId: entityImage._id, entityType, entityId });

    // Return with populated fileId
    return entityImageRepository.findById(entityImage._id);
  }

  async listByEntity(entityType, entityId) {
    const cacheKey = this._cacheKey(entityType, entityId);
    return cacheManager.getOrSet(
      cacheKey,
      () => entityImageRepository.findByEntity(entityType, entityId),
      LIST_TTL,
    );
  }

  async delete(id, deletedBy, meta = {}) {
    const entityImage = await entityImageRepository.findById(id);
    if (!entityImage) throw new NotFoundError('EntityImage', id);

    // Lazy import to avoid circular dependencies
    const fileService = (await import('../files/file.service.js')).default;

    await fileService.delete(entityImage.fileId);
    await entityImageRepository.deleteById(id);
    await this._invalidateCache(entityImage.entityType, entityImage.entityId);

    eventBus.publish(EVENT_TYPES.IMAGE_UNLINKED, {
      imageId: id,
      fileId: entityImage.fileId,
      entityType: entityImage.entityType,
      entityId: entityImage.entityId,
      deletedBy,
    }, { source: 'crm:images' });

    auditService.logEvent({
      eventType: 'image.unlinked',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { imageId: id, fileId: entityImage.fileId, entityType: entityImage.entityType, entityId: entityImage.entityId },
      module: 'crm',
    });

    logger.info('Entity image deleted', { module: 'crm', action: 'image.delete', imageId: id });
  }

  async _invalidateCache(entityType, entityId) {
    await cacheManager.del(this._cacheKey(entityType, entityId));
  }
}

const entityImageService = new EntityImageService();
export default entityImageService;
