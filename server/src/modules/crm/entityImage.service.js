import sharp from 'sharp';
import entityImageRepository from './entityImage.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import config from '../../config/index.js';
import { NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class EntityImageService {
  _cacheKey(entityType, entityId) {
    return `crm:images:${entityType}:${entityId}`;
  }

  /**
   * Normalize an uploaded image (CRM-010 AC-2 + AC-3):
   * - HEIF/HEIC → JPEG (broad browser compatibility)
   * - Compress to at most config.crm.maxImageBytes (default 2 MB), reducing
   *   JPEG quality then dimensions until under budget.
   * Falls back to the original buffer if sharp cannot process it (e.g. HEIF
   * decoder unavailable) — the 'images' bucket also allows heic/heif so the
   * original still stores.
   */
  async _normalizeImage({ buffer, originalName, mimeType, sizeBytes }) {
    const maxBytes = config.crm?.maxImageBytes ?? 2 * 1024 * 1024;
    const isHeif = /hei[cf]/i.test(mimeType || '');

    // Small, non-HEIF images need no processing.
    if (!isHeif && sizeBytes <= maxBytes) {
      return { buffer, originalName, mimeType, sizeBytes };
    }

    try {
      let quality = 85;
      let dimension = 4096;
      let out = await sharp(buffer, { failOn: 'none' }).rotate().jpeg({ quality }).toBuffer();

      // Iteratively shrink until under budget (bounded iterations).
      while (out.length > maxBytes && quality > 40) {
        quality -= 10;
        dimension = Math.round(dimension * 0.85);
        out = await sharp(buffer, { failOn: 'none' })
          .rotate()
          .resize(dimension, dimension, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality })
          .toBuffer();
      }

      const jpgName = (originalName || 'image').replace(/\.[^.]+$/, '') + '.jpg';
      return { buffer: out, originalName: jpgName, mimeType: 'image/jpeg', sizeBytes: out.length };
    } catch (err) {
      logger.warn('Image normalization failed — storing original', {
        module: 'crm', action: 'image.normalize', mimeType, error: err.message,
      });
      return { buffer, originalName, mimeType, sizeBytes };
    }
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
    const maxImages = config.crm?.maxImagesPerEntity ?? 50;
    const existingCount = await entityImageRepository.countByEntity(entityType, entityId);
    if (existingCount >= maxImages) {
      throw new ValidationError(`Maximum of ${maxImages} images per entity reached`, [
        { field: 'image', message: `Maximum of ${maxImages} images per entity reached` },
      ]);
    }

    // HEIF→JPEG conversion + 2 MB compression (CRM-010 AC-2 / AC-3).
    const normalized = await this._normalizeImage(fileData);

    // Lazy import to avoid circular dependencies
    const fileService = (await import('../files/file.service.js')).default;

    const uploadedFile = await fileService.upload({
      buffer: normalized.buffer,
      originalName: normalized.originalName,
      mimeType: normalized.mimeType,
      sizeBytes: normalized.sizeBytes,
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
      const baseName = normalized.originalName.replace(/\.[^.]+$/, '');

      const [thumbnailBuffer, mediumBuffer] = await Promise.all([
        sharp(normalized.buffer, { failOn: 'none' })
          .rotate()
          .resize(200, 200, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer(),
        sharp(normalized.buffer, { failOn: 'none' })
          .rotate()
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
