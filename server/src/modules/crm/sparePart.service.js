import { parse } from 'csv-parse/sync';
import sparePartRepository from './sparePart.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const CSV_IMPORT_LIMIT = 5000;
const SPARE_PART_CATEGORIES = new Set([
  'filter',
  'gasket',
  'pump_part',
  'valve',
  'sensor',
  'igniter',
  'burner_part',
  'control_board',
  'other',
]);

function getCsvValue(row, aliases) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') return row[alias];
  }
  return undefined;
}

function parseOptionalNumber(value, field, rowNumber, errors) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    errors.push({ row: rowNumber, field, message: `${field} must be a non-negative number` });
    return undefined;
  }
  return parsed;
}

function parseOptionalBoolean(value) {
  if (value === undefined || value === null || value === '') return undefined;
  return ['true', '1', 'yes', 'ja'].includes(String(value).trim().toLowerCase());
}

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

  async listOrderRequests(queryParams) {
    return sparePartRepository.findOrderRequests(queryParams);
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

    let link;
    try {
      link = await sparePartRepository.linkToInstallation({
        ...data,
        createdBy: userId,
      });
    } catch (err) {
      if (err?.code === 11000) {
        throw new ConflictError('Spare part is already linked to this installation');
      }
      throw err;
    }

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

  async flagForOrdering(installationId, sparePartId, data, userId, meta = {}) {
    const link = await sparePartRepository.findInstallationLink(installationId, sparePartId);
    if (!link) throw new NotFoundError('InstallationSparePart', `${installationId}/${sparePartId}`);

    const updated = await sparePartRepository.updateInstallationLink(installationId, sparePartId, {
      needsOrdering: true,
      orderQuantity: data.quantity,
      orderUrgency: data.urgency || 'normal',
      orderNotes: data.notes || null,
      orderFlaggedAt: new Date(),
      orderFlaggedBy: userId,
      orderStatus: 'requested',
    });

    await this._invalidateInstallationSparePartsCache(installationId);

    eventBus.publish(EVENT_TYPES.SPARE_PART_ORDER_REQUESTED, {
      installationId,
      sparePartId,
      needsOrdering: true,
      urgency: updated.orderUrgency,
      flaggedBy: userId,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.order_flagged',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        installationId,
        sparePartId,
        quantity: updated.orderQuantity,
        urgency: updated.orderUrgency,
      },
      module: 'crm',
    });

    return updated;
  }

  async updateOrderStatus(installationId, sparePartId, data, userId, meta = {}) {
    const link = await sparePartRepository.findInstallationLink(installationId, sparePartId);
    if (!link) throw new NotFoundError('InstallationSparePart', `${installationId}/${sparePartId}`);
    if (!link.orderStatus) throw new ValidationError('Spare part has no order request');
    if (['received', 'cancelled'].includes(link.orderStatus)) {
      throw new ConflictError(`Order request is already ${link.orderStatus}`);
    }

    const update = {
      orderStatus: data.status,
      orderNotes: data.notes || link.orderNotes || null,
    };
    let receivedQuantity = null;

    if (data.status === 'received') {
      receivedQuantity = data.receivedQuantity || link.orderQuantity || 1;
      const procurementService = (await import('./procurement.service.js')).default;
      await procurementService.receiveInstallationOrderRequest({
        sparePartId,
        quantity: receivedQuantity,
        installationId,
        notes: data.notes || link.orderNotes || null,
      }, userId, meta);
      update.needsOrdering = false;
      update.orderFulfilledAt = new Date();
      update.orderFulfilledBy = userId;
    } else if (data.status === 'cancelled') {
      update.needsOrdering = false;
    } else {
      update.needsOrdering = true;
    }

    const updated = await sparePartRepository.updateInstallationLink(installationId, sparePartId, update);
    await this._invalidateInstallationSparePartsCache(installationId);
    await this._invalidateSparePartCache(sparePartId);

    eventBus.publish(EVENT_TYPES.SPARE_PART_ORDER_STATUS_UPDATED, {
      installationId,
      sparePartId,
      status: data.status,
      receivedQuantity,
      updatedBy: userId,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.order_status_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        installationId,
        sparePartId,
        status: data.status,
        receivedQuantity,
      },
      module: 'crm',
    });

    return updated;
  }

  async getByInstallation(installationId) {
    const cacheKey = `crm:spare-parts:installation:${installationId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => sparePartRepository.findByInstallationId(installationId),
      LIST_TTL,
    );
  }

  async importCsv(fileBuffer, { upsert = false } = {}, userId, meta = {}) {
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new ValidationError('CSV file is required', [{ field: 'file', message: 'CSV file is required' }]);
    }

    const text = fileBuffer.toString('utf8').replace(/^\uFEFF/, '');
    const delimiter = text.split('\n', 1)[0].includes(';') ? ';' : ',';
    let records;
    try {
      records = parse(text, {
        bom: true,
        columns: true,
        delimiter,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err) {
      throw new ValidationError('Invalid spare parts CSV', [{ field: 'file', message: err.message }]);
    }

    if (records.length === 0) {
      throw new ValidationError('Invalid spare parts CSV', [{ field: 'file', message: 'CSV contains no rows' }]);
    }
    if (records.length > CSV_IMPORT_LIMIT) {
      throw new ValidationError('Invalid spare parts CSV', [
        { field: 'file', message: `CSV import supports at most ${CSV_IMPORT_LIMIT} rows` },
      ]);
    }

    const errors = [];
    const seenPartNumbers = new Set();
    const docs = records.map((row, index) => {
      const rowNumber = index + 2;
      const partNumber = getCsvValue(row, ['PartNumber', 'partNumber', 'part_number'])?.trim();
      const name = getCsvValue(row, ['Name', 'name'])?.trim();
      const category = getCsvValue(row, ['Category', 'category'])?.trim();

      if (!partNumber) errors.push({ row: rowNumber, field: 'PartNumber', message: 'PartNumber is required' });
      if (!name) errors.push({ row: rowNumber, field: 'Name', message: 'Name is required' });
      if (!category || !SPARE_PART_CATEGORIES.has(category)) {
        errors.push({ row: rowNumber, field: 'Category', message: 'Category is invalid' });
      }
      if (partNumber && seenPartNumbers.has(partNumber)) {
        errors.push({ row: rowNumber, field: 'PartNumber', message: 'Duplicate PartNumber in CSV' });
      }
      if (partNumber) seenPartNumbers.add(partNumber);

      return {
        partNumber,
        name,
        description: getCsvValue(row, ['Description', 'description']) || null,
        manufacturer: getCsvValue(row, ['Manufacturer', 'manufacturer']) || null,
        category,
        unitPrice: parseOptionalNumber(getCsvValue(row, ['UnitPrice', 'unitPrice', 'unit_price']), 'UnitPrice', rowNumber, errors),
        currency: getCsvValue(row, ['Currency', 'currency']) || 'CHF',
        unit: getCsvValue(row, ['Unit', 'unit']) || 'pcs',
        minStockLevel: parseOptionalNumber(getCsvValue(row, ['MinStockLevel', 'minStockLevel', 'min_stock_level']), 'MinStockLevel', rowNumber, errors) ?? 0,
        currentStock: parseOptionalNumber(getCsvValue(row, ['CurrentStock', 'currentStock', 'current_stock']), 'CurrentStock', rowNumber, errors) ?? 0,
        supplierPartNumber: getCsvValue(row, ['SupplierPartNumber', 'supplierPartNumber', 'supplier_part_number']) || null,
        compatibleInstallationTypes: (getCsvValue(row, ['CompatibleInstallationTypes', 'compatibleInstallationTypes', 'compatible_installation_types']) || '')
          .split('|')
          .map((value) => value.trim())
          .filter(Boolean),
        isActive: parseOptionalBoolean(getCsvValue(row, ['IsActive', 'isActive', 'is_active'])) ?? true,
      };
    });

    if (errors.length > 0) {
      throw new ValidationError('Invalid spare parts CSV', errors.slice(0, 100));
    }

    const partNumbers = docs.map((doc) => doc.partNumber);
    const existing = await sparePartRepository.findByPartNumbers(partNumbers);
    if (existing.length > 0 && !upsert) {
      throw new ConflictError(`Spare parts already exist: ${existing.map((doc) => doc.partNumber).join(', ')}`);
    }

    let result;
    if (upsert) {
      result = await sparePartRepository.bulkUpsert(docs.map((doc) => ({
        ...doc,
        updatedBy: userId,
        createdBy: userId,
      })));
    } else {
      const inserted = await sparePartRepository.insertMany(docs.map((doc) => ({
        ...doc,
        createdBy: userId,
      })));
      result = { insertedCount: inserted.length, modifiedCount: 0, upsertedCount: 0 };
    }

    await cacheManager.invalidatePattern('crm:spare-parts:*');

    eventBus.publish(EVENT_TYPES.SPARE_PART_CREATED, {
      imported: true,
      count: docs.length,
      importedBy: userId,
    }, { source: 'crm:spare-parts' });

    auditService.logEvent({
      eventType: 'spare_part.imported',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { count: docs.length, upsert },
      module: 'crm',
    });

    return {
      processed: docs.length,
      created: result.insertedCount || result.upsertedCount || 0,
      updated: result.modifiedCount || 0,
      failed: 0,
    };
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
    // eslint-disable-next-line no-irregular-whitespace
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
