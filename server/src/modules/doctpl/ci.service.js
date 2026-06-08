import CIConfiguration from './ciConfiguration.model.js';
import CIAsset from './ciAsset.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';

const CI_CACHE_TTL = { l1Ttl: 600, l2Ttl: 1800 };
const CI_CACHE_KEY = 'doctpl:ci:active';

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function mergeNested(base, patch) {
  if (!isPlainObject(patch)) return patch;

  const result = { ...(isPlainObject(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isPlainObject(value) ? mergeNested(result[key], value) : value;
  }
  return result;
}

class CIService {
  async getActiveConfig() {
    return cacheManager.getOrSet(
      CI_CACHE_KEY,
      () => CIConfiguration.findOne({ isActive: true }).lean(),
      CI_CACHE_TTL,
    );
  }

  async updateConfig(data, userId, meta = {}) {
    let config = await CIConfiguration.findOne({ isActive: true });

    if (config) {
      const current = config.toObject();
      const mergedData = mergeNested(current, data);
      Object.assign(config, mergedData, { updatedBy: userId });
      config.$inc('version', 1);
      await config.save();
    } else {
      config = await CIConfiguration.create({
        ...data,
        updatedBy: userId,
      });
    }

    await cacheManager.del(CI_CACHE_KEY);

    eventBus.publish(EVENT_TYPES.DOCTPL_CI_UPDATED, {
      configId: config._id,
      version: config.version,
      updatedBy: userId,
    }, { source: 'doctpl:ci' });

    auditService.logEvent({
      eventType: 'doctpl.ci.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { configId: config._id, version: config.version },
      module: 'doctpl',
    });

    logger.info('CI configuration updated', { module: 'doctpl', action: 'updateConfig', configId: config._id });

    return CIConfiguration.findById(config._id).lean();
  }

  async uploadAsset(fileData, assetType, userId, meta = {}) {
    // Lazy import to avoid circular dependencies
    const fileService = (await import('../files/file.service.js')).default;

    const result = await fileService.upload({
      buffer: fileData.buffer,
      originalName: fileData.originalname,
      mimeType: fileData.mimetype,
      sizeBytes: fileData.size,
      module: 'doctpl',
      entityType: 'ci-asset',
      entityId: assetType,
      uploadedBy: userId,
      bucket: 'documents',
    });

    const asset = await CIAsset.create({
      assetType,
      fileId: result._id,
      fileName: fileData.originalname,
      mimeType: fileData.mimetype,
      metadata: {},
      uploadedBy: userId,
    });

    auditService.logEvent({
      eventType: 'doctpl.ci.asset_uploaded',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: asset._id, assetType, fileName: fileData.originalname },
      module: 'doctpl',
    });

    logger.info('CI asset uploaded', { module: 'doctpl', action: 'uploadAsset', assetId: asset._id, assetType });

    return asset;
  }

  async listAssets() {
    return CIAsset.find().sort({ uploadedAt: -1 }).lean();
  }

  async deleteAsset(id, userId, meta = {}) {
    const asset = await CIAsset.findById(id);
    if (!asset) {
      const { NotFoundError } = await import('../../shared/errors/AppError.js');
      throw new NotFoundError('CIAsset', id);
    }

    // Lazy import to avoid circular dependencies
    const fileService = (await import('../files/file.service.js')).default;
    await fileService.delete(asset.fileId);

    await CIAsset.findByIdAndDelete(id);

    auditService.logEvent({
      eventType: 'doctpl.ci.asset_deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { assetId: id, assetType: asset.assetType, fileName: asset.fileName },
      module: 'doctpl',
    });

    logger.info('CI asset deleted', { module: 'doctpl', action: 'deleteAsset', assetId: id });
  }
}

const ciService = new CIService();
export default ciService;
