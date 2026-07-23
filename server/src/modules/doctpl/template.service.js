import documentTemplateRepository from './documentTemplate.repository.js';
import templateVersionRepository from './templateVersion.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors/AppError.js';
import { sanitizeObject } from '../../shared/utils/sanitize.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 300, l2Ttl: 900 };
const LIST_TTL = { l1Ttl: 300, l2Ttl: 900 };
const MAX_VERSIONS_KEPT = 20;
const LANGUAGES = ['de', 'fr', 'it', 'en'];
const PAGE_SIZES_MM = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
};
const REQUIRED_VISIBLE_SECTIONS = {
  quotation: ['header', 'body', 'table', 'totals', 'footer'],
  order_confirmation: ['header', 'body', 'table', 'totals', 'footer'],
  invoice_standard: ['header', 'body', 'table', 'totals', 'qr_bill', 'footer'],
  invoice_advance: ['header', 'body', 'totals', 'qr_bill', 'footer'],
  invoice_final: ['header', 'body', 'table', 'deductions', 'totals', 'qr_bill', 'footer'],
  cover_letter: ['header', 'body', 'footer'],
  service_report: ['header', 'body', 'footer'],
  inspection_certificate: ['header', 'body', 'footer'],
};
const COMPARABLE_TEMPLATE_FIELDS = [
  'name',
  'description',
  'layout',
  'sections',
  'textBlocks',
  'tableColumns',
  'isActive',
];
// Content fields whose change invalidates an existing approval (back to draft).
const APPROVAL_RESETTING_FIELDS = [
  'templateType',
  'layout',
  'sections',
  'textBlocks',
  'tableColumns',
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
    const cleanData = sanitizeObject(data);
    this._validateTemplateForSave(cleanData);
    const created = await documentTemplateRepository.create({ ...cleanData, createdBy: userId });
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
    const cleanData = sanitizeObject(data);
    const expectedVersion = cleanData.expectedVersion ? Number(cleanData.expectedVersion) : null;
    if (expectedVersion && Number(existing.currentVersion) !== expectedVersion) {
      throw new ConflictError('Template has changed since it was loaded', {
        expectedVersion,
        currentVersion: existing.currentVersion,
      });
    }

    // Remove changeDescription from update data (not a template field)
    const { changeDescription: _changeDescription, expectedVersion: _expectedVersion, ...updateData } = cleanData;
    this._validateTemplateForSave({ ...existing, ...updateData });

    // Editing the content of an already-submitted/approved template resets it to
    // draft so the changes must be re-approved before they can be used.
    const contentChanged = APPROVAL_RESETTING_FIELDS.some((field) => field in updateData);
    const approvalReset = (contentChanged && (existing.approvalStatus || 'draft') !== 'draft')
      ? {
        approvalStatus: 'draft',
        approvalRequestedBy: null,
        approvalRequestedAt: null,
        approvedBy: null,
        approvedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
      }
      : {};

    // Create version snapshot of current state before update.
    await templateVersionRepository.create({
      templateId: id,
      version: existing.currentVersion,
      changeDescription: cleanData.changeDescription || '',
      templateSnapshot: existing,
      createdBy: userId,
    });

    const updated = await documentTemplateRepository.updateById(
      id,
      { ...updateData, ...approvalReset, updatedBy: userId },
      expectedVersion,
    );
    if (!updated) {
      throw new ConflictError('Template has changed since it was loaded', { expectedVersion });
    }

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

  async requestApproval(id, userId, note = '', meta = {}) {
    const existing = await documentTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentTemplate', id);
    const status = existing.approvalStatus || 'draft';
    if (status === 'pending') {
      throw new ValidationError('Template is already pending approval', [{ field: 'approvalStatus', message: 'Template is already pending approval' }]);
    }
    if (status === 'approved') {
      throw new ValidationError('Template is already approved', [{ field: 'approvalStatus', message: 'Template is already approved' }]);
    }
    // A template must be complete (sections, four-language labels/footers) before it can be submitted.
    this._validateTemplateForSave({ ...existing, isActive: true });

    const updated = await documentTemplateRepository.updateApprovalState(id, {
      approvalStatus: 'pending',
      approvalRequestedBy: userId,
      approvalRequestedAt: new Date(),
      approvalNote: `${note || ''}`.slice(0, 1000),
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      updatedBy: userId,
    });
    if (!updated) throw new NotFoundError('DocumentTemplate', id);

    await this._invalidateTemplateCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_APPROVAL_REQUESTED, {
      templateId: id,
      requestedBy: userId,
    }, { source: 'doctpl:templates' });

    auditService.logEvent({
      eventType: 'doctpl.template.approval_requested',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: id },
      module: 'doctpl',
    });

    return updated;
  }

  async approve(id, userId, note = '', meta = {}) {
    const existing = await documentTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentTemplate', id);
    if ((existing.approvalStatus || 'draft') !== 'pending') {
      throw new ValidationError('Only templates pending approval can be approved', [{ field: 'approvalStatus', message: 'Template is not pending approval' }]);
    }

    const updated = await documentTemplateRepository.updateApprovalState(id, {
      approvalStatus: 'approved',
      approvedBy: userId,
      approvedAt: new Date(),
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      approvalNote: `${note || ''}`.slice(0, 1000) || existing.approvalNote || '',
      updatedBy: userId,
    });
    if (!updated) throw new NotFoundError('DocumentTemplate', id);

    await this._invalidateTemplateCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_APPROVED, {
      templateId: id,
      approvedBy: userId,
    }, { source: 'doctpl:templates' });

    auditService.logEvent({
      eventType: 'doctpl.template.approved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: id },
      module: 'doctpl',
    });

    logger.info('Template approved', { module: 'doctpl', action: 'approve', templateId: id });

    return updated;
  }

  async reject(id, userId, reason, meta = {}) {
    const trimmedReason = `${reason || ''}`.trim();
    if (!trimmedReason) {
      throw new ValidationError('A rejection reason is required', [{ field: 'reason', message: 'A rejection reason is required' }]);
    }
    const existing = await documentTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('DocumentTemplate', id);
    if ((existing.approvalStatus || 'draft') !== 'pending') {
      throw new ValidationError('Only templates pending approval can be rejected', [{ field: 'approvalStatus', message: 'Template is not pending approval' }]);
    }

    const updated = await documentTemplateRepository.updateApprovalState(id, {
      approvalStatus: 'rejected',
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectionReason: trimmedReason.slice(0, 1000),
      approvedBy: null,
      approvedAt: null,
      updatedBy: userId,
    });
    if (!updated) throw new NotFoundError('DocumentTemplate', id);

    await this._invalidateTemplateCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.DOCTPL_TEMPLATE_REJECTED, {
      templateId: id,
      rejectedBy: userId,
      reason: trimmedReason,
    }, { source: 'doctpl:templates' });

    auditService.logEvent({
      eventType: 'doctpl.template.rejected',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: id, reason: trimmedReason },
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

  async revertToVersion(templateId, version, userId, meta = {}, expectedVersion = null) {
    const existing = await documentTemplateRepository.findById(templateId);
    if (!existing) throw new NotFoundError('DocumentTemplate', templateId);
    if (expectedVersion && Number(existing.currentVersion) !== Number(expectedVersion)) {
      throw new ConflictError('Template has changed since it was loaded', {
        expectedVersion: Number(expectedVersion),
        currentVersion: existing.currentVersion,
      });
    }

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
    this._validateTemplateForSave({ ...snapshotFields, isActive: snapshotFields.isActive ?? existing.isActive });

    const updated = await documentTemplateRepository.updateById(templateId, {
      ...snapshotFields,
      updatedBy: userId,
    }, expectedVersion ? Number(expectedVersion) : null);
    if (!updated) {
      throw new ConflictError('Template has changed since it was loaded', { expectedVersion });
    }

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

  async preview(templateId, sampleData = {}, language = 'de', draftTemplate = null) {
    const template = await documentTemplateRepository.findById(templateId);
    if (!template) throw new NotFoundError('DocumentTemplate', templateId);
    const renderTemplate = draftTemplate ? this._buildDraftPreviewTemplate(template, draftTemplate) : template;

    return this._renderPreview(templateId, renderTemplate, sampleData, language, `preview_${templateId}_${language}.pdf`);
  }

  async previewVersion(templateId, version, sampleData = {}, language = 'de') {
    const versionDoc = await this.getVersion(templateId, version);
    const renderTemplate = versionDoc.templateSnapshot || versionDoc;
    return this._renderPreview(templateId, renderTemplate, sampleData, language, `preview_${templateId}_v${version}_${language}.pdf`);
  }

  async _renderPreview(templateId, renderTemplate, sampleData = {}, language = 'de', originalName = `preview_${templateId}_${language}.pdf`) {
    const CIConfiguration = (await import('./ciConfiguration.model.js')).default;
    const ciConfig = await CIConfiguration.findOne({ isActive: true }).lean();
    const { default: ciRenderAssetsService } = await import('./ciRenderAssets.service.js');
    const renderCiConfig = await ciRenderAssetsService.prepare(ciConfig);

    const { DocumentRenderer } = await import('./renderer/index.js');
    const renderer = new DocumentRenderer();
    const previewData = this._buildPreviewData(renderTemplate, sampleData, language);
    const buffer = await renderer.render(renderTemplate, renderCiConfig, previewData, language);

    const { default: fileService } = await import('../files/file.service.js');
    const fileMeta = await fileService.upload({
      buffer,
      originalName,
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

  _buildDraftPreviewTemplate(existing, draftTemplate) {
    const draft = sanitizeObject(draftTemplate);
    const previewTemplate = {
      ...existing,
      templateType: draft.templateType || existing.templateType,
      name: draft.name || existing.name,
      description: draft.description ?? existing.description,
      isActive: draft.isActive ?? existing.isActive,
      currentVersion: existing.currentVersion,
      layout: draft.layout || existing.layout,
      sections: draft.sections || existing.sections,
      textBlocks: draft.textBlocks || existing.textBlocks,
      tableColumns: draft.tableColumns || existing.tableColumns,
    };

    const details = [];
    this._validateLayout(previewTemplate.layout, details);
    this._validateColumns(previewTemplate.tableColumns || [], false, details);
    if (details.length) throw new ValidationError('Document preview validation failed', details);

    return previewTemplate;
  }

  _buildPreviewData(template, sampleData = {}, language = 'de') {
    const templateType = sampleData.templateType || template.templateType || 'quotation';
    const hasInvoiceDeductions = templateType === 'invoice_final';
    const isAdvanceInvoice = templateType === 'invoice_advance';
    const isServiceReport = templateType === 'service_report';
    const isInspection = templateType === 'inspection_certificate';
    const base = {
      templateType,
      documentNumber: 'PREVIEW-2026-0001',
      documentDate: '2026-06-15',
      dueDate: '2026-07-15',
      validUntil: '2026-07-15',
      reference: 'PREVIEW',
      currency: 'CHF',
      customer: {
        name: 'Muster AG',
        addressLine1: 'Bahnhofstrasse 1',
        zip: '8001',
        city: 'Zürich',
        country: 'CH',
      },
      introduction: template.textBlocks?.[language]?.introduction || 'Preview document generated from the active template layout.',
      textBlocks: template.textBlocks || {},
      lineItems: [
        { position: 1, description: 'Boiler service package', quantity: 1, unitPrice: 1200, discountPercent: 0, total: 1200 },
        { position: 2, description: 'Installation material', quantity: 2, unitPrice: 150, discountPercent: 0, total: 300 },
      ],
      subtotal: 1500,
      vatBreakdown: [{ rate: 0.081, amount: 121.50 }],
      grandTotal: 1621.50,
      grandTotalRounded: 1621.50,
      qrBill: {
        iban: 'CH4431999123000889012',
        amount: 1621.50,
        currency: 'CHF',
        reference: '210000000003139471430009017',
        debtor: {
          name: 'Muster AG',
          address: 'Bahnhofstrasse 1',
          zip: '8001',
          city: 'Zürich',
          country: 'CH',
        },
      },
      advanceDeductions: hasInvoiceDeductions ? [
        {
          invoiceNumber: 'AK-2026-0001',
          date: '2026-05-15',
          netAmount: 500,
          vatAmount: 40.50,
          totalAmount: 540.50,
          amount: 540.50,
        },
      ] : [],
      netBalance: hasInvoiceDeductions ? 1081 : undefined,
      ...(isAdvanceInvoice ? {
        milestoneDescription: 'Akontozahlung bei Auftragsbestätigung gemäss Zahlungsplan.',
        advancePercentage: 30,
        advanceAmount: 486.45,
      } : {}),
      ...(isServiceReport ? {
        equipment: { name: 'Viessmann Vitodens 200', model: 'B2HF', serialNumber: 'SN-0012345', location: 'UG / Heizraum' },
        findings: 'Leichte Kalkablagerungen im Wärmetauscher, Brennerdruck im Normbereich.',
        workPerformed: 'Wärmetauscher gereinigt, Düse geprüft, Funktionstest durchgeführt.',
        materialsUsed: [{ description: 'Reinigungsmittel', quantity: 1, unit: 'Stk' }],
        recommendations: 'Nächste Wartung in 12 Monaten empfohlen.',
        timeSpent: '2.0 h',
        technician: { name: 'Hans Muster' },
      } : {}),
      ...(isInspection ? {
        checklist: [
          { label: 'Dichtheitsprüfung', status: 'pass' },
          { label: 'Abgaswerte', status: 'pass' },
          { label: 'Sicherheitsventil', status: 'pass' },
        ],
        overallResult: 'pass',
        inspector: { name: 'Anna Beispiel' },
        nextInspectionDate: '2027-06-15',
      } : {}),
    };

    return {
      ...base,
      ...sampleData,
      customer: { ...base.customer, ...(sampleData.customer || {}) },
      qrBill: { ...base.qrBill, ...(sampleData.qrBill || {}) },
      textBlocks: sampleData.textBlocks || base.textBlocks,
      lineItems: sampleData.lineItems || base.lineItems,
      advanceDeductions: sampleData.advanceDeductions || base.advanceDeductions,
    };
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

  _validateTemplateForSave(template) {
    const details = [];
    this._validateLayout(template.layout, details);
    this._validateColumns(template.tableColumns || [], template.isActive, details);
    if (template.isActive !== false) {
      this._validateRequiredSections(template, details);
      this._validateLanguageCompleteness(template.textBlocks || {}, details);
    }
    if (details.length) throw new ValidationError('Document template validation failed', details);
  }

  _validateLayout(layout = {}, details) {
    const margins = layout.margins || {};
    const page = PAGE_SIZES_MM[layout.pageSize || 'A4'] || PAGE_SIZES_MM.A4;
    const top = Number(margins.top ?? 25);
    const bottom = Number(margins.bottom ?? 20);
    const left = Number(margins.left ?? 20);
    const right = Number(margins.right ?? 15);
    for (const [side, value] of [['top', top], ['bottom', bottom], ['left', left], ['right', right]]) {
      if (!Number.isInteger(value)) {
        details.push({ field: `layout.margins.${side}`, message: 'Margins must be set in whole millimetres (1mm increments)' });
      }
    }
    if (top + bottom > page.height - 80) {
      details.push({ field: 'layout.margins', message: 'Vertical margins leave too little printable space' });
    }
    if (left + right > page.width - 80) {
      details.push({ field: 'layout.margins', message: 'Horizontal margins leave too little printable space' });
    }
  }

  _validateColumns(columns, isActive, details) {
    if (!columns.length) return;
    const total = columns.reduce((sum, column) => sum + Number(column.widthPercent || 0), 0);
    if (Math.abs(total - 100) > 1) {
      details.push({ field: 'tableColumns', message: 'Column widths must sum to 100%' });
    }
    if (isActive !== false) {
      for (const [index, column] of columns.entries()) {
        for (const lang of LANGUAGES) {
          if (!`${column.label?.[lang] || ''}`.trim()) {
            details.push({ field: `tableColumns.${index}.label.${lang}`, message: 'Active templates require table labels in DE/FR/IT/EN' });
          }
        }
      }
    }
  }

  _validateRequiredSections(template, details) {
    const required = REQUIRED_VISIBLE_SECTIONS[template.templateType] || ['header', 'body', 'footer'];
    const visibleTypes = new Set((template.sections || [])
      .filter((section) => section.isVisible !== false)
      .map((section) => section.type));
    for (const type of required) {
      if (!visibleTypes.has(type)) {
        details.push({ field: 'sections', message: `Active ${template.templateType} templates require a visible ${type} section` });
      }
    }
  }

  _validateLanguageCompleteness(textBlocks, details) {
    for (const lang of LANGUAGES) {
      const block = textBlocks[lang] || {};
      if (!`${block.footer || ''}`.trim()) {
        details.push({ field: `textBlocks.${lang}.footer`, message: 'Active templates require footer text in DE/FR/IT/EN' });
      }
    }
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
