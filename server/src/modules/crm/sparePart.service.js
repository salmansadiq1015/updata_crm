import sparePartRepository from './sparePart.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class SparePartService {
  async create(data, createdBy, meta = {}) {
    const sparePart = await sparePartRepository.create({
      ...data,
      createdBy,
    });

    eventBus.publish(EVENT_TYPES.SPARE_PART_CREATED, {
      sparePartId: sparePart._id,
      partNumber: sparePart.partNumber,
      category: sparePart.category,
      createdBy,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sparePartId: sparePart._id, partNumber: sparePart.partNumber },
      module: 'crm',
    });

    logger.info('Spare part created', { module: 'crm', action: 'create', sparePartId: sparePart._id, partNumber: sparePart.partNumber });

    return sparePartRepository.findById(sparePart._id);
  }

  async getById(id) {
    const cacheKey = `crm:spare-part:${id}`;
    const sparePart = await cacheManager.getOrSet(
      cacheKey,
      () => sparePartRepository.findById(id),
      ENTITY_TTL,
    );
    if (!sparePart) throw new NotFoundError('SparePart', id);
    return sparePart;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    return sparePartRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search });
  }

  async search(term, limit = 20) {
    return sparePartRepository.textSearch(term, limit);
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await sparePartRepository.findById(id);
    if (!existing) throw new NotFoundError('SparePart', id);

    const updated = await sparePartRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateSparePartCache(id);

    eventBus.publish(EVENT_TYPES.SPARE_PART_UPDATED, {
      sparePartId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sparePartId: id, changedFields: Object.keys(data) },
      module: 'crm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await sparePartRepository.findById(id);
    if (!existing) throw new NotFoundError('SparePart', id);

    await sparePartRepository.softDelete(id);
    await this._invalidateSparePartCache(id);

    eventBus.publish(EVENT_TYPES.SPARE_PART_DELETED, {
      sparePartId: id,
      partNumber: existing.partNumber,
      deletedBy,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sparePartId: id, partNumber: existing.partNumber },
      module: 'crm',
    });

    logger.info('Spare part deleted', { module: 'crm', action: 'delete', sparePartId: id, partNumber: existing.partNumber });
  }

  // --- Installation ↔ SparePart linking ---

  async linkToInstallation(data, userId, meta = {}) {
    // Verify spare part exists
    const sparePart = await sparePartRepository.findById(data.sparePartId);
    if (!sparePart) throw new NotFoundError('SparePart', data.sparePartId);

    // Verify installation exists (lazy import to avoid circular deps)
    const installationRepository = (await import('./installation.repository.js')).default;
    const installation = await installationRepository.findById(data.installationId);
    if (!installation) throw new NotFoundError('Installation', data.installationId);

    const link = await sparePartRepository.linkToInstallation({
      ...data,
      createdBy: userId,
    });

    await this._invalidateInstallationSparePartsCache(data.installationId);

    eventBus.publish(EVENT_TYPES.SPARE_PART_LINKED, {
      installationId: data.installationId,
      sparePartId: data.sparePartId,
      linkedBy: userId,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.linked',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { installationId: data.installationId, sparePartId: data.sparePartId },
      module: 'crm',
    });

    return link;
  }

  async unlinkFromInstallation(installationId, sparePartId, userId, meta = {}) {
    const result = await sparePartRepository.unlinkFromInstallation(installationId, sparePartId);
    if (!result) throw new NotFoundError('InstallationSparePart', `${installationId}/${sparePartId}`);

    await this._invalidateInstallationSparePartsCache(installationId);

    eventBus.publish(EVENT_TYPES.SPARE_PART_UNLINKED, {
      installationId,
      sparePartId,
      unlinkedBy: userId,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.unlinked',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { installationId, sparePartId },
      module: 'crm',
    });
  }

  async getByInstallation(installationId) {
    const cacheKey = `crm:spare-parts:installation:${installationId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => sparePartRepository.findByInstallationId(installationId),
      LIST_TTL,
    );
  }

  /**
   * Export spare parts as CSV.
   * Swiss-friendly encoding: UTF-8 with BOM so Excel opens umlauts correctly.
   */
  async exportCsv(queryParams) {
    const { search, ...filters } = queryParams;
    const result = await sparePartRepository.findWithCursor({
      cursor: null,
      limit: 50000,
      sortBy: 'partNumber',
      sortOrder: 'asc',
      filters,
      search,
    });

    const rows = result.data || [];
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n;]/.test(s) ? `"${s}"` : s;
    };
    const header = [
      'PartNumber', 'Name', 'Description', 'Manufacturer', 'Category',
      'UnitPrice', 'Currency', 'Unit', 'MinStockLevel', 'CurrentStock',
      'SupplierPartNumber', 'IsActive', 'CreatedAt',
    ].join(';');
    const body = rows.map((p) => [
      p.partNumber, p.name, p.description, p.manufacturer, p.category,
      p.unitPrice, p.currency, p.unit, p.minStockLevel, p.currentStock,
      p.supplierPartNumber, p.isActive ? 'true' : 'false',
      p.createdAt ? new Date(p.createdAt).toISOString() : '',
    ].map(escape).join(';')).join('\n');

    return `﻿${header}\n${body}`;
  }

  // --- Cache helpers ---

  async _invalidateSparePartCache(id) {
    await cacheManager.del(`crm:spare-part:${id}`);
  }

  async _invalidateInstallationSparePartsCache(installationId) {
    await cacheManager.del(`crm:spare-parts:installation:${installationId}`);
  }
}

const sparePartService = new SparePartService();
export default sparePartService;
