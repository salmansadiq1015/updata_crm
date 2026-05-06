import fileRepository from './file.repository.js';
import storageService from '../../shared/storage/StorageService.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import config from '../../config/index.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

/**
 * File service — business logic layer.
 *
 * Orchestrates:
 * - Validation → S3 upload → DB metadata creation → cache invalidation → event publishing
 * - Never touches Express req/res.
 * - Never calls Mongoose directly (delegates to repository).
 */

const ENTITY_CACHE_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_CACHE_TTL = { l1Ttl: 30, l2Ttl: 120 };

class FileService {
  /**
   * Upload a file.
   *
   * @param {object} params
   * @param {Buffer} params.buffer - File content
   * @param {string} params.originalName - Original filename
   * @param {string} params.mimeType - MIME type
   * @param {number} params.sizeBytes - File size
   * @param {string} params.module - Owning module
   * @param {string} params.entityType - Entity type
   * @param {string} params.entityId - Entity ID
   * @param {string} params.uploadedBy - User ID
   * @param {string} params.bucket - Storage bucket category
   */
  async upload({
    buffer, originalName, mimeType, sizeBytes,
    module, entityType, entityId, uploadedBy, bucket = 'general',
  }) {
    // 1. Validate file constraints
    storageService.validateFile(mimeType, sizeBytes, bucket);

    // 2. Build S3 key
    const key = storageService.buildKey({ module, entityType, entityId, originalName });

    // 3. Upload to S3
    const uploadResult = await storageService.upload({
      key,
      body: buffer,
      mimeType,
      metadata: { module, entityType, entityId: entityId?.toString() || '' },
    });

    // 4. Save metadata to DB
    const fileMetadata = await fileRepository.create({
      bucket,
      key,
      originalName,
      mimeType,
      sizeBytes,
      uploadedBy,
      module,
      entityType,
      entityId,
      storageBackend: config.storage.backend,
      checksumSha256: uploadResult.checksumSha256,
    });

    // 5. Invalidate related caches
    await this._invalidateEntityCache(module, entityType, entityId);

    // 6. Publish event
    eventBus.publish(EVENT_TYPES.FILE_UPLOADED, {
      fileId: fileMetadata._id,
      bucket,
      key,
      mimeType,
      sizeBytes,
      module,
      entityType,
      entityId,
    }, { source: 'core:files' });

    logger.info('File uploaded', {
      module: 'files',
      action: 'upload',
      fileId: fileMetadata._id,
      originalName,
      mimeType,
      sizeBytes,
    });

    return fileMetadata;
  }

  /**
   * Get file metadata by ID.
   */
  async getById(id) {
    const cacheKey = `core:file:${id}`;
    return cacheManager.getOrSet(cacheKey, () => fileRepository.findById(id), ENTITY_CACHE_TTL);
  }

  /**
   * Get pre-signed download URL.
   */
  async getDownloadUrl(id) {
    const file = await this.getById(id);
    if (!file) throw new NotFoundError('File', id);

    return storageService.getPresignedUrl(file.key);
  }

  /**
   * List files with cursor pagination and filters.
   */
  async list({ cursor, limit, sortBy, sortOrder, ...filters }) {
    // Build cache key from all params
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `core:files:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => fileRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters }),
      LIST_CACHE_TTL,
    );
  }

  /**
   * Soft-delete a file.
   */
  async delete(id) {
    const file = await fileRepository.findById(id);
    if (!file) throw new NotFoundError('File', id);

    await fileRepository.softDelete(id);

    // Invalidate caches
    await cacheManager.del(`core:file:${id}`);
    await this._invalidateEntityCache(file.module, file.entityType, file.entityId);

    // Publish event
    eventBus.publish(EVENT_TYPES.FILE_DELETED, {
      fileId: file._id,
      bucket: file.bucket,
      key: file.key,
    }, { source: 'core:files' });

    logger.info('File soft-deleted', {
      module: 'files',
      action: 'delete',
      fileId: id,
    });

    return { deleted: true };
  }

  /**
   * Get files for a specific entity (used by other modules).
   */
  async getByEntity(module, entityType, entityId) {
    const cacheKey = `core:files:${module}:${entityType}:${entityId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => fileRepository.findByEntities(module, entityType, [entityId]),
      ENTITY_CACHE_TTL,
    );
  }

  /**
   * Upload a raw buffer directly to S3 (no DB record — for temporary files like audio).
   * Returns { key } which serves as the download reference.
   */
  async uploadBuffer(buffer, { originalName, mimeType, folder = 'temp', uploadedBy }) {
    const key = storageService.buildKey({ module: folder, entityType: null, entityId: uploadedBy, originalName });
    await storageService.upload({ key, body: buffer, mimeType });
    logger.info('Buffer uploaded to S3', { module: 'files', action: 'uploadBuffer', key, mimeType });
    return { key };
  }

  /**
   * Download a buffer previously stored via uploadBuffer.
   */
  async downloadBuffer(key) {
    if (!key || key.startsWith('buffer://')) {
      throw new Error(`Audio was not stored in S3 (key: ${key}). Re-upload the audio file.`);
    }
    return storageService.download(key);
  }

  async _invalidateEntityCache(module, entityType, entityId) {
    if (entityId) {
      await cacheManager.del(`core:files:${module}:${entityType}:${entityId}`);
    }
    // Invalidate list caches (they depend on data changing)
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}core:files:list:*`);
  }
}

const fileService = new FileService();
export default fileService;
