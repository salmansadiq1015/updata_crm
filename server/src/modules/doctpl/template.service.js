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
const COMPARABLE_TEMPLATE_FIELDS = [
  'name',
  'description',
  'layout',
  'sections',
  'textBlocks',
  'tableColumns',
  'isActive',
];

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
      _id: _templateId,
      __v: _versionKey,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      deletedAt: _deletedAt,
      currentVersion: _currentVersion,
      createdBy: _createdBy,
      updatedBy: _updatedBy,
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
    const { changeDescription: _changeDescription, ...updateData } = data;

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
    const currentTemplate = await documentTemplateRepository.findById(templateId);
    if (!currentTemplate) throw new NotFoundError('DocumentTemplate', templateId);

    const versions = await templateVersionRepository.findByTemplateId(templateId, { limit, offset });
    const total = await templateVersionRepository.countByTemplateId(templateId);
    const currentVersion = {
      _id: `${currentTemplate._id}:current`,
      templateId: currentTemplate._id,
      version: currentTemplate.currentVersion,
      changeDescription: 'Current active version',
      templateSnapshot: currentTemplate,
      createdBy: currentTemplate.updatedBy || currentTemplate.createdBy,
      createdAt: currentTemplate.updatedAt || currentTemplate.createdAt,
      isCurrent: true,
    };

    if (offset === 0) {
      return { data: [currentVersion, ...versions], total: total + 1 };
    }
    return { data: versions, total: total + 1 };
  }

  async getVersion(templateId, version) {
    const currentTemplate = await documentTemplateRepository.findById(templateId);
    if (!currentTemplate) throw new NotFoundError('DocumentTemplate', templateId);
    if (Number(version) === Number(currentTemplate.currentVersion)) {
      return {
        _id: `${currentTemplate._id}:current`,
        templateId: currentTemplate._id,
        version: currentTemplate.currentVersion,
        changeDescription: 'Current active version',
        templateSnapshot: currentTemplate,
        createdBy: currentTemplate.updatedBy || currentTemplate.createdBy,
        createdAt: currentTemplate.updatedAt || currentTemplate.createdAt,
        isCurrent: true,
      };
    }

    const versionDoc = await templateVersionRepository.findByTemplateIdAndVersion(templateId, version);
    if (!versionDoc) throw new NotFoundError('TemplateVersion', `${templateId}/v${version}`);
    return versionDoc;
  }

  async compareVersions(templateId, fromVersion, toVersion) {
    if (Number(fromVersion) === Number(toVersion)) {
      return {
        fromVersion: Number(fromVersion),
        toVersion: Number(toVersion),
        changes: [],
        summary: { added: 0, removed: 0, changed: 0 },
      };
    }

    const [fromSnapshot, toSnapshot] = await Promise.all([
      this._resolveVersionSnapshot(templateId, Number(fromVersion)),
      this._resolveVersionSnapshot(templateId, Number(toVersion)),
    ]);
    const changes = [];

    for (const field of COMPARABLE_TEMPLATE_FIELDS) {
      this._collectDiffs(fromSnapshot[field], toSnapshot[field], field, changes);
    }

    return {
      fromVersion: Number(fromVersion),
      toVersion: Number(toVersion),
      changes,
      summary: changes.reduce((summary, change) => {
        summary[change.type] += 1;
        return summary;
      }, { added: 0, removed: 0, changed: 0 }),
    };
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
    const {
      _id: _snapshotId,
      __v: _snapshotVersionKey,
      createdAt: _snapshotCreatedAt,
      updatedAt: _snapshotUpdatedAt,
      isDeleted: _snapshotIsDeleted,
      deletedAt: _snapshotDeletedAt,
      currentVersion: _snapshotCurrentVersion,
      ...snapshotFields
    } = oldVersion.templateSnapshot;

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
    const { default: ciRenderAssetsService } = await import('./ciRenderAssets.service.js');
    const renderCiConfig = await ciRenderAssetsService.prepare(ciConfig);

    const { DocumentRenderer } = await import('./renderer/index.js');
    const renderer = new DocumentRenderer();
    const buffer = await renderer.render(template, renderCiConfig, sampleData, language);

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

  async _resolveVersionSnapshot(templateId, version) {
    const versionDoc = await this.getVersion(templateId, version);
    return versionDoc.templateSnapshot || versionDoc;
  }

  _collectDiffs(before, after, path, changes) {
    if (this._stableStringify(before) === this._stableStringify(after)) return;

    if (before === undefined) {
      changes.push({ path, type: 'added', before: null, after });
      return;
    }
    if (after === undefined) {
      changes.push({ path, type: 'removed', before, after: null });
      return;
    }
    if (!this._isPlainObject(before) || !this._isPlainObject(after)) {
      changes.push({ path, type: 'changed', before, after });
      return;
    }

    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      this._collectDiffs(before[key], after[key], `${path}.${key}`, changes);
    }
  }

  _isPlainObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
  }

  _stableStringify(value) {
    if (value === undefined) return '__undefined__';
    if (!this._isPlainObject(value)) return JSON.stringify(value);
    const sorted = {};
    for (const key of Object.keys(value).sort()) {
      sorted[key] = value[key];
    }
    return JSON.stringify(sorted);
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
