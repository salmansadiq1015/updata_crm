import sharp from 'sharp';
import entityImageRepository from './entityImage.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class EntityImageService {
  _cacheKey(entityType, entityId) {
    return `crm:images:${entityType}:${entityId}`;
  }

  /**
   * Resolve a single image record's file IDs into pre-signed download URLs.
   * Presigned URLs are valid ~15 min; the list cache TTL is <=2 min, so caching
   * the enriched records is safe (URLs won't expire within the cache window).
   */
  async _enrichImage(img, fileService) {
    if (!img) return img;
    const [url, thumbnailUrl, mediumUrl] = await Promise.all([
      img.fileId ? fileService.getDownloadUrl(img.fileId).catch(() => null) : null,
      img.thumbnailFileId ? fileService.getDownloadUrl(img.thumbnailFileId).catch(() => null) : null,
      img.mediumFileId ? fileService.getDownloadUrl(img.mediumFileId).catch(() => null) : null,
    ]);
    return { ...img, url, thumbnailUrl, mediumUrl };
  }

  async _enrichImages(images) {
    if (!Array.isArray(images) || images.length === 0) return images || [];
    const fileService = (await import('../files/file.service.js')).default;
    return Promise.all(images.map((img) => this._enrichImage(img, fileService)));
  }

  async create(entityType, entityId, fileData, uploadedBy, meta = {}) {
    const existingCount = await entityImageRepository.countByEntity(entityType, entityId);
    if (existingCount >= 50) {
      throw new ValidationError('Maximum of 50 images per entity reached', [
        { field: 'image', message: 'Maximum of 50 images per entity reached' },
      ]);
    }

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

    // --- Generate image variants (thumbnail + medium) ---
    let thumbnailFileId = null;
    let mediumFileId = null;

    try {
      const baseName = fileData.originalName.replace(/\.[^.]+$/, '');

      const [thumbnailBuffer, mediumBuffer] = await Promise.all([
        sharp(fileData.buffer)
          .resize(200, 200, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer(),
        sharp(fileData.buffer)
          .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toBuffer(),
      ]);

      const [thumbnailFile, mediumFile] = await Promise.all([
        fileService.upload({
          buffer: thumbnailBuffer,
          originalName: `${baseName}_thumb.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: thumbnailBuffer.length,
          module: 'crm',
          entityType,
          entityId,
          uploadedBy,
          bucket: 'images',
        }),
        fileService.upload({
          buffer: mediumBuffer,
          originalName: `${baseName}_medium.jpg`,
          mimeType: 'image/jpeg',
          sizeBytes: mediumBuffer.length,
          module: 'crm',
          entityType,
          entityId,
          uploadedBy,
          bucket: 'images',
        }),
      ]);

      thumbnailFileId = thumbnailFile._id;
      mediumFileId = mediumFile._id;
    } catch (variantErr) {
      logger.warn('Failed to generate image variants — continuing without them', {
        module: 'crm',
        action: 'image.variants',
        entityType,
        entityId,
        error: variantErr.message,
      });
    }

    const entityImage = await entityImageRepository.create({
      entityType,
      entityId,
      fileId: uploadedFile._id,
      thumbnailFileId,
      mediumFileId,
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

    // Return with resolved download URLs so the client can render immediately.
    const created = await entityImageRepository.findById(entityImage._id);
    return this._enrichImage(created, fileService);
  }

  async listByEntity(entityType, entityId) {
    const cacheKey = this._cacheKey(entityType, entityId);
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const images = await entityImageRepository.findByEntity(entityType, entityId);
        return this._enrichImages(images);
      },
      LIST_TTL,
    );
  }

  async delete(id, deletedBy, meta = {}) {
    const entityImage = await entityImageRepository.findById(id);
    if (!entityImage) throw new NotFoundError('EntityImage', id);

    // Lazy import to avoid circular dependencies
    const fileService = (await import('../files/file.service.js')).default;

    // Delete original + variant files
    const deletePromises = [fileService.delete(entityImage.fileId)];
    if (entityImage.thumbnailFileId) {
      deletePromises.push(fileService.delete(entityImage.thumbnailFileId));
    }
    if (entityImage.mediumFileId) {
      deletePromises.push(fileService.delete(entityImage.mediumFileId));
    }
    await Promise.all(deletePromises);

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
