import CIConfiguration from './ciConfiguration.model.js';
import CIAsset from './ciAsset.model.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import logger from '../../shared/logger/index.js';

const CI_CACHE_TTL = { l1Ttl: 600, l2Ttl: 1800 };
const CI_CACHE_KEY = 'doctpl:ci:active';
const ASSET_CONFIG_FIELDS = {
  logo_cmyk: 'logo.cmykFileId',
  logo_rgb: 'logo.rgbFileId',
  logo_png: 'logo.pngFileId',
  font_300: 'fonts.weights.light.fileId',
  font_500: 'fonts.weights.medium.fileId',
  font_700: 'fonts.weights.bold.fileId',
};

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
      bucket: 'ci-assets',
    });

    const asset = await CIAsset.create({
      assetType,
      fileId: result._id,
      fileName: fileData.originalname,
      mimeType: fileData.mimetype,
      metadata: {},
      uploadedBy: userId,
    });

    await this._linkAssetToActiveConfig(assetType, result._id, userId);

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

  async getAuditReport() {
    const DocumentTemplate = (await import('./documentTemplate.model.js')).default;
    const [config, assets, templates] = await Promise.all([
      CIConfiguration.findOne({ isActive: true }).lean(),
      CIAsset.find().sort({ uploadedAt: -1 }).lean(),
      DocumentTemplate.find({ isDeleted: false }).select('name templateType layout sections tableColumns isActive currentVersion').lean(),
    ]);

    const checks = this._buildConfigAuditChecks(config, assets);
    const templateReports = templates.map((template) => this._auditTemplate(template));
    const issues = [
      ...checks.filter((check) => check.status !== 'passed'),
      ...templateReports.flatMap((template) => template.checks.filter((check) => check.status !== 'passed')),
    ];

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        status: issues.some((issue) => issue.severity === 'error') ? 'failed' : issues.length ? 'warning' : 'passed',
        templates: templates.length,
        activeTemplates: templates.filter((template) => template.isActive).length,
        assets: assets.length,
        issues: issues.length,
      },
      checks,
      templates: templateReports,
    };
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
    await this._unlinkAssetFromActiveConfig(asset.assetType, asset.fileId, userId);

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

  async _linkAssetToActiveConfig(assetType, fileId, userId) {
    const configField = ASSET_CONFIG_FIELDS[assetType];
    if (!configField) return;

    const updated = await CIConfiguration.findOneAndUpdate(
      { isActive: true },
      {
        $set: {
          [configField]: fileId,
          updatedBy: userId,
        },
        $inc: { version: 1 },
      },
      { new: true },
    ).lean();

    if (updated) {
      await cacheManager.del(CI_CACHE_KEY);
      eventBus.publish(EVENT_TYPES.DOCTPL_CI_UPDATED, {
        configId: updated._id,
        version: updated.version,
        updatedBy: userId,
      }, { source: 'doctpl:ci' });
    }
  }

  async _unlinkAssetFromActiveConfig(assetType, fileId, userId) {
    const configField = ASSET_CONFIG_FIELDS[assetType];
    if (!configField) return;

    const updated = await CIConfiguration.findOneAndUpdate(
      {
        isActive: true,
        [configField]: fileId,
      },
      {
        $set: {
          [configField]: null,
          updatedBy: userId,
        },
        $inc: { version: 1 },
      },
      { new: true },
    ).lean();

    if (updated) {
      await cacheManager.del(CI_CACHE_KEY);
      eventBus.publish(EVENT_TYPES.DOCTPL_CI_UPDATED, {
        configId: updated._id,
        version: updated.version,
        updatedBy: userId,
      }, { source: 'doctpl:ci' });
    }
  }

  _buildConfigAuditChecks(config, assets) {
    const assetTypes = new Set(assets.map((asset) => asset.assetType));
    return [
      {
        key: 'company',
        label: 'Company identity',
        status: config?.companyName ? 'passed' : 'failed',
        severity: 'error',
        message: config?.companyName ? 'Company name configured' : 'Company name is missing',
      },
      {
        key: 'logo',
        label: 'Logo asset',
        status: config?.logo?.pngFileId || config?.logo?.rgbFileId || assetTypes.has('logo_png') || assetTypes.has('logo_rgb') ? 'passed' : 'warning',
        severity: 'warning',
        message: 'PNG/RGB logo should be configured for PDF rendering',
      },
      {
        key: 'fonts',
        label: 'Museo font assets',
        status: ['font_300', 'font_500', 'font_700'].every((type) => assetTypes.has(type)) ? 'passed' : 'warning',
        severity: 'warning',
        message: 'Museo Sans 300/500/700 should be uploaded as TTF/OTF for embedded PDF rendering',
      },
      {
        key: 'colors',
        label: 'CI color palette',
        status: config?.colors?.primary && config?.colors?.secondary ? 'passed' : 'failed',
        severity: 'error',
        message: 'Primary and secondary CI colors are required',
      },
      {
        key: 'bank',
        label: 'Swiss QR bank details',
        status: config?.companyDetails?.bankDetails?.qrIban || config?.companyDetails?.bankDetails?.iban ? 'passed' : 'failed',
        severity: 'error',
        message: 'QR-IBAN or IBAN is required for invoice QR-bills',
      },
    ];
  }

  _auditTemplate(template) {
    const sectionTypes = new Set((template.sections || []).filter((section) => section.isVisible !== false).map((section) => section.type));
    const margins = template.layout?.margins || {};
    const checks = [
      {
        key: `${template._id}:header`,
        label: 'Header section',
        status: sectionTypes.has('header') ? 'passed' : 'failed',
        severity: 'error',
        message: 'Template should include a visible header section',
      },
      {
        key: `${template._id}:footer`,
        label: 'Footer section',
        status: sectionTypes.has('footer') ? 'passed' : 'failed',
        severity: 'error',
        message: 'Template should include a visible footer section',
      },
      {
        key: `${template._id}:margins`,
        label: 'Page margins',
        status: ['top', 'bottom', 'left', 'right'].every((side) => Number.isFinite(Number(margins[side]))) ? 'passed' : 'warning',
        severity: 'warning',
        message: 'All page margins should be explicitly configured',
      },
      {
        key: `${template._id}:columns`,
        label: 'Table columns',
        status: !template.tableColumns?.length || Math.abs(template.tableColumns.reduce((sum, column) => sum + (column.widthPercent || 0), 0) - 100) <= 1 ? 'passed' : 'failed',
        severity: 'error',
        message: 'Template table column widths must add up to 100%',
      },
    ];

    return {
      templateId: template._id,
      templateType: template.templateType,
      name: template.name,
      version: template.currentVersion,
      status: checks.some((check) => check.status === 'failed') ? 'failed' : checks.some((check) => check.status === 'warning') ? 'warning' : 'passed',
      checks,
    };
  }
}

const ciService = new CIService();
export default ciService;
