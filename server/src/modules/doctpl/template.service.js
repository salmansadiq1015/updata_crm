import documentTemplateRepository from './documentTemplate.repository.js';
import templateVersionRepository from './templateVersion.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 300, l2Ttl: 900 };
const LIST_TTL = { l1Ttl: 300, l2Ttl: 900 };
const MAX_VERSIONS_KEPT = 20;

class TemplateService {
  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `doctpl:templates:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => documentTemplateRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async create(data, userId, meta = {}) {
    const created = await documentTemplateRepository.create({ ...data, createdBy: userId });
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_UPDATED, {
      templateId: created._id,
      templateType: created.templateType,
      createdBy: userId,
    }, { source: 'doctpl:templates' });

    auditService.logEvent({
      eventType: 'doctpl.template.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: created._id, templateType: created.templateType },
      module: 'doctpl',
    });

    logger.info('Template created', { module: 'doctpl', action: 'create', templateId: created._id, templateType: created.templateType });

    return created;
  }

  async duplicate(id, userId, meta = {}) {
    const existing = await documentTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentTemplate', id);

    const {
      _id,
      __v,
      createdAt,
      updatedAt,
      deletedAt,
      currentVersion,
      createdBy,
      updatedBy,
      ...copyData
    } = existing;

    const copy = await documentTemplateRepository.create({
      ...copyData,
      name: `${existing.name} (Copy)`,
      currentVersion: 1,
      isDeleted: false,
      createdBy: userId,
    });

    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'doctpl.template.duplicated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sourceTemplateId: id, templateId: copy._id },
      module: 'doctpl',
    });

    return copy;
  }

  async getById(id) {
    const cacheKey = `doctpl:template:${id}`;
    const template = await cacheManager.getOrSet(
      cacheKey,
      () => documentTemplateRepository.findById(id),
      ENTITY_TTL,
    );
    if (!template) throw new NotFoundError('DocumentTemplate', id);
    return template;
  }

  async update(id, data, userId, meta = {}) {
    const existing = await documentTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentTemplate', id);

    // Create version snapshot of current state before update
    await templateVersionRepository.create({
      templateId: id,
      version: existing.currentVersion,
      changeDescription: data.changeDescription || '',
      templateSnapshot: existing,
      createdBy: userId,
    });

    // Remove changeDescription from update data (not a template field)
    const { changeDescription, ...updateData } = data;

    const updated = await documentTemplateRepository.updateById(id, { ...updateData, updatedBy: userId });

    // Prune old versions (keep MAX_VERSIONS_KEPT)
    await this._pruneVersions(id);

    await this._invalidateTemplateCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_UPDATED, {
      templateId: id,
      changedFields: Object.keys(updateData),
      updatedBy: userId,
    }, { source: 'doctpl:templates' });

    auditService.logEvent({
      eventType: 'doctpl.template.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: id, changedFields: Object.keys(updateData) },
      module: 'doctpl',
    });

    return updated;
  }

  async listVersions(templateId, params = {}) {
    const { limit = 25, offset = 0 } = params;
    const versions = await templateVersionRepository.findByTemplateId(templateId, { limit, offset });
    const total = await templateVersionRepository.countByTemplateId(templateId);
    return { data: versions, total };
  }

  async getVersion(templateId, version) {
    const versionDoc = await templateVersionRepository.findByTemplateIdAndVersion(templateId, version);
    if (!versionDoc) throw new NotFoundError('TemplateVersion', `${templateId}/v${version}`);
    return versionDoc;
  }

  async revertToVersion(templateId, version, userId, meta = {}) {
    const existing = await documentTemplateRepository.findById(templateId);
    if (!existing) throw new NotFoundError('DocumentTemplate', templateId);

    const oldVersion = await templateVersionRepository.findByTemplateIdAndVersion(templateId, version);
    if (!oldVersion) throw new NotFoundError('TemplateVersion', `${templateId}/v${version}`);

    // Create snapshot of current state before reverting
    await templateVersionRepository.create({
      templateId,
      version: existing.currentVersion,
      changeDescription: `Auto-snapshot before revert to v${version}`,
      templateSnapshot: existing,
      createdBy: userId,
    });

    // Apply old snapshot fields to template
    const { _id, __v, createdAt, updatedAt, isDeleted, deletedAt, currentVersion, ...snapshotFields } = oldVersion.templateSnapshot;

    const updated = await documentTemplateRepository.updateById(templateId, {
      ...snapshotFields,
      updatedBy: userId,
    });

    await this._pruneVersions(templateId);
    await this._invalidateTemplateCache(templateId);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_REVERTED, {
      templateId,
      revertedToVersion: version,
      newVersion: updated.currentVersion,
      updatedBy: userId,
    }, { source: 'doctpl:templates' });

    auditService.logEvent({
      eventType: 'doctpl.template.reverted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId, revertedToVersion: version, newVersion: updated.currentVersion },
      module: 'doctpl',
    });

    logger.info('Template reverted', { module: 'doctpl', action: 'revertToVersion', templateId, revertedToVersion: version });

    return updated;
  }

  async preview(templateId, sampleData = {}, language = 'de') {
    const template = await documentTemplateRepository.findById(templateId);
    if (!template) throw new NotFoundError('DocumentTemplate', templateId);

    const CIConfiguration = (await import('./ciConfiguration.model.js')).default;
    const ciConfig = await CIConfiguration.findOne({ isActive: true }).lean();

    const { DocumentRenderer } = await import('./renderer/index.js');
    const renderer = new DocumentRenderer();
    const buffer = await renderer.render(template, ciConfig, sampleData, language);

    const { default: fileService } = await import('../files/file.service.js');
    const fileMeta = await fileService.upload({
      buffer,
      originalName: `preview_${templateId}_${language}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: buffer.length,
      module: 'doctpl',
      entityType: 'preview',
      entityId: templateId,
      uploadedBy: sampleData._previewBy || null,
      bucket: 'documents',
    });

    const downloadUrl = await fileService.getDownloadUrl(fileMeta._id);

    logger.info('Template preview generated', {
      module: 'doctpl',
      action: 'preview',
      templateId,
      language,
      sizeBytes: buffer.length,
    });

    return { downloadUrl, sizeBytes: buffer.length };
  }

  async remove(id, userId, meta = {}) {
    const existing = await documentTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentTemplate', id);

    const removed = await documentTemplateRepository.softDelete(id);

    await this._invalidateTemplateCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'doctpl.template.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: id },
      module: 'doctpl',
    });

    return removed;
  }

  async _pruneVersions(templateId) {
    const count = await templateVersionRepository.countByTemplateId(templateId);
    if (count > MAX_VERSIONS_KEPT) {
      const TemplateVersion = (await import('./templateVersion.model.js')).default;
      const oldest = await TemplateVersion.find({ templateId })
        .sort({ version: 1 })
        .limit(count - MAX_VERSIONS_KEPT)
        .select('_id')
        .lean();
      const idsToDelete = oldest.map((v) => v._id);
      await TemplateVersion.deleteMany({ _id: { $in: idsToDelete } });
    }
  }

  async _invalidateTemplateCache(id) {
    await cacheManager.del(`doctpl:template:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}doctpl:templates:list:*`);
  }
}

const templateService = new TemplateService();
export default templateService;
