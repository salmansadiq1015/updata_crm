import customerRepository from './customer.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { getQopTimelineEntries } from './activityTimeline.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

function blankToNull(value) {
  if (value === undefined) return undefined;
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeCustomerPayload(data = {}) {
  const normalized = { ...data };
  for (const key of ['name', 'ownerName', 'street', 'postalCode', 'city', 'canton', 'country', 'phone', 'mobile', 'email', 'website', 'uidNumber', 'vatNumber']) {
    if (normalized[key] !== undefined) normalized[key] = blankToNull(normalized[key]);
  }
  if (normalized.type && normalized.type !== 'business') {
    normalized.ownerName = null;
    normalized.uidNumber = null;
    normalized.vatNumber = null;
  }
  return normalized;
}

class CustomerService {
  async create(data, createdBy, meta = {}) {
    const payload = normalizeCustomerPayload(data);
    const duplicates = await customerRepository.findDuplicates(payload.name, payload.postalCode);
    const customerNumber = await counterService.getNextCustomerNumber();

    const customer = await customerRepository.create({
      ...payload,
      customerNumber,
      createdBy,
    });

    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CUSTOMER_CREATED, {
      customerId: customer._id,
      customerNumber,
      name: customer.name,
      type: customer.type,
      createdBy,
    }, { source: 'crm:customers' });

    auditService.logEvent({
      eventType: 'customer.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { customerId: customer._id, customerNumber },
      module: 'crm',
    });

    logger.info('Customer created', { module: 'crm', action: 'create', customerId: customer._id, customerNumber });

    const created = await customerRepository.findById(customer._id);
    return {
      ...created,
      duplicateWarning: duplicates.length > 0,
      duplicateCandidates: duplicates,
    };
  }

  async getById(id) {
    const cacheKey = `crm:customer:${id}`;
    const customer = await cacheManager.getOrSet(
      cacheKey,
      () => customerRepository.findById(id),
      ENTITY_TTL,
    );
    if (!customer) throw new NotFoundError('Customer', id);
    return customer;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `crm:customers:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => customerRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async search(searchTerm, limit = 25) {
    return customerRepository.textSearch(searchTerm, limit);
  }

  async checkDuplicates(name, postalCode) {
    const duplicates = await customerRepository.findDuplicates(name, postalCode);
    return { duplicates, hasDuplicates: duplicates.length > 0 };
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await customerRepository.findById(id);
    if (!existing) throw new NotFoundError('Customer', id);

    const updated = await customerRepository.updateById(id, normalizeCustomerPayload(data));
    await this._invalidateCustomerCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CUSTOMER_UPDATED, {
      customerId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'crm:customers' });

    auditService.logEvent({
      eventType: 'customer.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { customerId: id, changedFields: Object.keys(data) },
      module: 'crm',
    });

    return updated;
  }

  async archive(id, archivedBy, meta = {}) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError('Customer', id);
    if (customer.status === 'archived') {
      throw new ConflictError('Customer is already archived');
    }

    await customerRepository.updateById(id, { status: 'archived' });
    await this._invalidateCustomerCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CUSTOMER_ARCHIVED, {
      customerId: id,
      archivedBy,
    }, { source: 'crm:customers' });

    auditService.logEvent({
      eventType: 'customer.archived',
      userId: archivedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { customerId: id, name: customer.name },
      module: 'crm',
    });
  }

  async merge(sourceId, targetId, mergedBy, meta = {}, fieldOverrides = {}) {
    if (sourceId === targetId) {
      throw new ConflictError('Cannot merge a customer with itself');
    }

    const [source, target] = await Promise.all([
      customerRepository.findById(sourceId),
      customerRepository.findById(targetId),
    ]);
    if (!source) throw new NotFoundError('Source customer', sourceId);
    if (!target) throw new NotFoundError('Target customer', targetId);

    // Reassign contacts and sites (lazy imports to avoid circular deps)
    const Contact = (await import('./contact.model.js')).default;
    const Site = (await import('./site.model.js')).default;

    await Contact.updateMany({ customerId: sourceId }, { $set: { customerId: targetId } });
    await Site.updateMany({ customerId: sourceId }, { $set: { customerId: targetId } });

    // Reassign entity notes that target the source customer
    const EntityNote = (await import('./entityNote.model.js')).default;
    await EntityNote.updateMany(
      { entityType: 'customer', entityId: sourceId },
      { $set: { entityId: targetId } },
    );

    // Reassign QOP documents (quotations / orders / invoices).
    // The QOP module may be absent in some deployments — guard with try/catch
    // and degrade gracefully, mirroring activityTimeline.service.js.
    try {
      const [Quotation, Order, Invoice] = await Promise.all([
        import('../qop/quotation.model.js').then((module) => module.default),
        import('../qop/order.model.js').then((module) => module.default),
        import('../qop/invoice.model.js').then((module) => module.default),
      ]);
      await Promise.all([
        Quotation.updateMany({ customerId: sourceId }, { $set: { customerId: targetId } }),
        Order.updateMany({ customerId: sourceId }, { $set: { customerId: targetId } }),
        Invoice.updateMany({ customerId: sourceId }, { $set: { customerId: targetId } }),
      ]);
    } catch (err) {
      logger.warn('Could not reassign QOP documents during customer merge', {
        module: 'crm', action: 'merge', sourceId, targetId, error: err.message,
      });
    }

    // Apply field overrides to the target (user-selected values from source)
    const cleanOverrides = Object.fromEntries(
      Object.entries(fieldOverrides || {}).filter(([, v]) => v !== undefined),
    );
    if (Object.keys(cleanOverrides).length > 0) {
      await customerRepository.updateById(targetId, cleanOverrides);
    }

    // Archive source with merge pointer
    await customerRepository.updateById(sourceId, {
      status: 'archived',
      mergedIntoId: targetId,
    });

    // Invalidate caches
    await this._invalidateCustomerCache(sourceId);
    await this._invalidateCustomerCache(targetId);
    await this._invalidateListCache();
    await cacheManager.del(`crm:contacts:customer:${sourceId}`);
    await cacheManager.del(`crm:contacts:customer:${targetId}`);
    await cacheManager.del(`crm:sites:customer:${sourceId}`);
    await cacheManager.del(`crm:sites:customer:${targetId}`);

    eventBus.publish(EVENT_TYPES.CUSTOMER_MERGED, {
      sourceId,
      targetId,
      mergedBy,
    }, { source: 'crm:customers' });

    auditService.logEvent({
      eventType: 'customer.merged',
      userId: mergedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sourceId, targetId, sourceName: source.name, targetName: target.name },
      module: 'crm',
    });

    logger.info('Customers merged', { module: 'crm', action: 'merge', sourceId, targetId });
  }

  async bulkUpdate(ids, data, updatedBy, _meta = {}) {
    if (!ids?.length) return { modifiedCount: 0 };
    const customers = await customerRepository.findByIds(ids);
    if (customers.length !== ids.length) {
      const found = new Set(customers.map((c) => c._id.toString()));
      const missing = ids.filter((id) => !found.has(id));
      throw new NotFoundError('Customers', missing.join(', '));
    }

    const modifiedCount = await customerRepository.bulkUpdate(ids, data);
    for (const id of ids) await this._invalidateCustomerCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CUSTOMER_UPDATED, { customerIds: ids, changedFields: Object.keys(data), updatedBy, bulk: true }, { source: 'crm:customers' });
    return { modifiedCount };
  }

  async bulkDeactivate(ids, deactivatedBy, _meta = {}) {
    if (!ids?.length) return { deactivatedCount: 0 };
    const deactivatedCount = await customerRepository.bulkSoftDelete(ids);
    for (const id of ids) await this._invalidateCustomerCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CUSTOMER_DELETED, { customerIds: ids, deactivatedBy, bulk: true }, { source: 'crm:customers' });
    return { deactivatedCount };
  }

  /**
   * Stream matching customers as CSV text.
   * Uses the same filter set as list() but bypasses pagination (capped at 50k rows).
   * Swiss-friendly encoding: UTF-8 with BOM so Excel opens umlauts correctly.
   */
  async exportCsv(queryParams) {
    const { search, ...filters } = queryParams;
    const result = await customerRepository.findWithCursor({
      cursor: null,
      limit: 50000,
      sortBy: 'customerNumber',
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
      'CustomerNumber', 'Name', 'Type', 'Status',
      'OwnerName', 'UidNumber', 'VatNumber',
      'Street', 'AddressSupplement', 'PostalCode', 'City', 'Canton', 'Country',
      'Phone', 'Mobile', 'Email', 'Website',
      'NewsletterOptIn', 'NewsletterChannel', 'CreatedAt',
    ].join(';');
    const body = rows.map((c) => [
      c.customerNumber, c.name, c.type, c.status,
      c.ownerName, c.uidNumber, c.vatNumber,
      c.street, c.addressSupplement, c.postalCode, c.city, c.canton, c.country,
      c.phone, c.mobile, c.email, c.website,
      c.newsletterOptIn ? 'true' : 'false', c.newsletterChannel,
      c.createdAt ? new Date(c.createdAt).toISOString() : '',
    ].map(escape).join(';')).join('\n');

    return `\uFEFF${header}\n${body}`;
  }

  /**
   * Customer activity timeline — audit events for this customer plus
   * quotation / order / invoice events from the QOP module.
   *
   * All entries share a uniform shape so the client can render them the same way:
   *   { _id, eventType, timestamp, module, details }
   */
  async getActivity(customerId, { cursor, limit = 25, eventType } = {}) {
    const exists = await customerRepository.findById(customerId);
    if (!exists) throw new NotFoundError('Customer', customerId);

    const AuditLog = (await import('../auth/auditLog.model.js')).default;
    // --- 1. Audit-log entries (existing behaviour) -------------------------
    const auditFilter = {
      module: 'crm',
      $or: [
        { 'details.customerId': customerId },
        { 'details.sourceId': customerId },
        { 'details.targetId': customerId },
      ],
    };
    if (eventType && !eventType.startsWith('quotation.') && !eventType.startsWith('order.') && !eventType.startsWith('invoice.')) {
      auditFilter.eventType = eventType;
    }

    const auditPromise = AuditLog.find(auditFilter)
      .sort({ timestamp: -1 })
      .limit(500)          // fetch a generous window — we merge & re-paginate below
      .lean();

    // --- 2. QOP entries (quotations, orders, invoices) ---------------------
    // Helper moved to activityTimeline.service.js so site/installation can reuse it.
    const qopPromise = getQopTimelineEntries(customerId, eventType);

    const [auditDocs, qopDocs] = await Promise.all([auditPromise, qopPromise]);

    // --- 3. Merge, sort desc by timestamp, apply cursor pagination ---------
    let merged = [...auditDocs, ...qopDocs];
    merged.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply cursor filter on the merged array
    if (cursor) {
      const decoded = (await import('../../shared/utils/pagination.js')).decodeCursor(cursor);
      if (decoded) {
        const cursorDate = new Date(decoded.timestamp || decoded._id);
        merged = merged.filter((entry) => {
          const d = new Date(entry.timestamp);
          if (d < cursorDate) return true;
          if (d.getTime() === cursorDate.getTime()) return entry._id.toString() < decoded._id;
          return false;
        });
      }
    }

    // Take limit + 1 to determine hasNext
    const hasNext = merged.length > limit;
    const data = hasNext ? merged.slice(0, limit) : merged;
    const nextCursor = hasNext && data.length > 0
      ? (await import('../../shared/utils/pagination.js')).encodeCursor(
          { _id: data[data.length - 1]._id, timestamp: data[data.length - 1].timestamp },
          'timestamp',
        )
      : null;

    return {
      data,
      pagination: { hasNext, nextCursor, limit },
    };
  }

  async _invalidateCustomerCache(id) {
    await cacheManager.del(`crm:customer:${id}`);
  }

  async _invalidateListCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}crm:customers:list:*`);
  }
}

const customerService = new CustomerService();
export default customerService;
