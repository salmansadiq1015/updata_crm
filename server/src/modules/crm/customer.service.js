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

/**
 * Sites are cached per id (crm:site:<id>), so reassigning them to another
 * customer behind the repository's back leaves stale owners in the cache.
 */
async function invalidateMovedSiteCaches(siteIds = []) {
  for (const id of siteIds) await cacheManager.del(`crm:site:${id}`);
}

/** Ids matching a filter, so a bulk reassignment can be replayed in reverse. */
async function idsOf(Model, filter) {
  const docs = await Model.find(filter).select('_id').lean();
  return docs.map((d) => d._id);
}

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

  async search(searchTerm, limit = 25, { includeInactive = false } = {}) {
    return customerRepository.textSearch(searchTerm, limit, { includeInactive });
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

  /**
   * Deactivate a customer. Customers are never archived away or soft-deleted:
   * the record stays listed and searchable, only flagged inactive, and
   * reactivate() puts it back.
   */
  async deactivate(id, deactivatedBy, meta = {}) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError('Customer', id);
    if (customer.status === 'inactive') {
      throw new ConflictError('Customer is already deactivated');
    }

    await customerRepository.updateById(id, { status: 'inactive' });
    await this._invalidateCustomerCache(id);
    await this._invalidateListCache();

    eventBus.publish(EVENT_TYPES.CUSTOMER_ARCHIVED, {
      customerId: id,
      deactivatedBy,
    }, { source: 'crm:customers' });

    auditService.logEvent({
      eventType: 'customer.deactivated',
      userId: deactivatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { customerId: id, name: customer.name },
      module: 'crm',
    });
  }

  async reactivate(id, reactivatedBy, meta = {}) {
    const customer = await customerRepository.findById(id);
    if (!customer) throw new NotFoundError('Customer', id);
    if (customer.status === 'active') {
      throw new ConflictError('Customer is already active');
    }
    if (customer.mergedIntoId) {
      throw new ConflictError('This customer was merged into another one — undo the merge instead');
    }

    await customerRepository.updateById(id, { status: 'active' });
    await this._invalidateCustomerCache(id);
    await this._invalidateListCache();

    auditService.logEvent({
      eventType: 'customer.reactivated',
      userId: reactivatedBy,
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
    const EntityNote = (await import('./entityNote.model.js')).default;

    // Capture the ids *before* moving them: updateMany reports a count, not a
    // list, and an undo must not hand the target's own rows to the source.
    const moved = {
      contacts: await idsOf(Contact, { customerId: sourceId }),
      sites: await idsOf(Site, { customerId: sourceId }),
      notes: await idsOf(EntityNote, { entityType: 'customer', entityId: sourceId }),
      quotations: [],
      orders: [],
      invoices: [],
    };

    await Contact.updateMany({ _id: { $in: moved.contacts } }, { $set: { customerId: targetId } });
    await Site.updateMany({ _id: { $in: moved.sites } }, { $set: { customerId: targetId } });
    await EntityNote.updateMany({ _id: { $in: moved.notes } }, { $set: { entityId: targetId } });

    // Reassign QOP documents (quotations / orders / invoices).
    // The QOP module may be absent in some deployments — guard with try/catch
    // and degrade gracefully, mirroring activityTimeline.service.js.
    try {
      const [Quotation, Order, Invoice] = await Promise.all([
        import('../qop/quotation.model.js').then((module) => module.default),
        import('../qop/order.model.js').then((module) => module.default),
        import('../qop/invoice.model.js').then((module) => module.default),
      ]);
      moved.quotations = await idsOf(Quotation, { customerId: sourceId });
      moved.orders = await idsOf(Order, { customerId: sourceId });
      moved.invoices = await idsOf(Invoice, { customerId: sourceId });
      await Promise.all([
        Quotation.updateMany({ _id: { $in: moved.quotations } }, { $set: { customerId: targetId } }),
        Order.updateMany({ _id: { $in: moved.orders } }, { $set: { customerId: targetId } }),
        Invoice.updateMany({ _id: { $in: moved.invoices } }, { $set: { customerId: targetId } }),
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
    const targetFieldsBefore = {};
    if (Object.keys(cleanOverrides).length > 0) {
      // Snapshot what the overrides are about to replace, so undo can restore it.
      Object.keys(cleanOverrides).forEach((field) => {
        targetFieldsBefore[field] = target[field] ?? null;
      });
      await customerRepository.updateById(targetId, cleanOverrides);
    }

    // Deactivate source with merge pointer
    await customerRepository.updateById(sourceId, {
      status: 'inactive',
      mergedIntoId: targetId,
    });

    const CustomerMerge = (await import('./customerMerge.model.js')).default;
    const mergeRecord = await CustomerMerge.create({
      sourceId,
      targetId,
      sourceName: source.name,
      targetName: target.name,
      moved,
      targetFieldsBefore,
      sourceStatusBefore: source.status || 'active',
      mergedBy,
    });

    // Invalidate caches
    await this._invalidateCustomerCache(sourceId);
    await this._invalidateCustomerCache(targetId);
    await this._invalidateListCache();
    await cacheManager.del(`crm:contacts:customer:${sourceId}`);
    await cacheManager.del(`crm:contacts:customer:${targetId}`);
    await cacheManager.del(`crm:sites:customer:${sourceId}`);
    await cacheManager.del(`crm:sites:customer:${targetId}`);
    await invalidateMovedSiteCaches(moved.sites);

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
      details: { sourceId, targetId, sourceName: source.name, targetName: target.name, mergeId: mergeRecord._id },
      module: 'crm',
    });

    logger.info('Customers merged', { module: 'crm', action: 'merge', sourceId, targetId, mergeId: mergeRecord._id });

    return { mergeId: mergeRecord._id };
  }

  /**
   * List merges, newest first, so a key user can pick one to reverse.
   */
  async listMerges({ limit = 20, includeUndone = false } = {}) {
    const CustomerMerge = (await import('./customerMerge.model.js')).default;
    const filter = includeUndone ? {} : { undoneAt: null };
    const docs = await CustomerMerge.find(filter)
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(limit) || 20, 100))
      .populate({ path: 'mergedBy', select: 'firstName lastName' })
      .populate({ path: 'undoneBy', select: 'firstName lastName' })
      .lean();

    return docs.map((d) => ({
      ...d,
      counts: {
        contacts: d.moved?.contacts?.length || 0,
        sites: d.moved?.sites?.length || 0,
        notes: d.moved?.notes?.length || 0,
        quotations: d.moved?.quotations?.length || 0,
        orders: d.moved?.orders?.length || 0,
        invoices: d.moved?.invoices?.length || 0,
      },
    }));
  }

  /**
   * Reverse a merge: hand every recorded document back to the source, restore
   * the target fields the merge overwrote, and reactivate the source.
   *
   * Documents deleted since the merge are simply not found and stay absent —
   * the undo is best-effort per row and never fails the whole operation.
   */
  async undoMerge(mergeId, undoneBy, meta = {}) {
    const CustomerMerge = (await import('./customerMerge.model.js')).default;
    const record = await CustomerMerge.findById(mergeId);
    if (!record) throw new NotFoundError('Merge record', mergeId);
    if (record.undoneAt) {
      throw new ConflictError('This merge has already been undone');
    }

    const sourceId = String(record.sourceId);
    const targetId = String(record.targetId);

    const source = await customerRepository.findById(sourceId);
    if (!source) throw new NotFoundError('Source customer', sourceId);
    const target = await customerRepository.findById(targetId);
    if (!target) throw new NotFoundError('Target customer', targetId);

    const Contact = (await import('./contact.model.js')).default;
    const Site = (await import('./site.model.js')).default;
    const EntityNote = (await import('./entityNote.model.js')).default;
    const moved = record.moved || {};

    const restored = { contacts: 0, sites: 0, notes: 0, quotations: 0, orders: 0, invoices: 0 };

    restored.contacts = (await Contact.updateMany(
      { _id: { $in: moved.contacts || [] }, customerId: targetId },
      { $set: { customerId: sourceId } },
    )).modifiedCount;
    restored.sites = (await Site.updateMany(
      { _id: { $in: moved.sites || [] }, customerId: targetId },
      { $set: { customerId: sourceId } },
    )).modifiedCount;
    restored.notes = (await EntityNote.updateMany(
      { _id: { $in: moved.notes || [] }, entityType: 'customer', entityId: targetId },
      { $set: { entityId: sourceId } },
    )).modifiedCount;

    try {
      const [Quotation, Order, Invoice] = await Promise.all([
        import('../qop/quotation.model.js').then((module) => module.default),
        import('../qop/order.model.js').then((module) => module.default),
        import('../qop/invoice.model.js').then((module) => module.default),
      ]);
      restored.quotations = (await Quotation.updateMany(
        { _id: { $in: moved.quotations || [] }, customerId: targetId },
        { $set: { customerId: sourceId } },
      )).modifiedCount;
      restored.orders = (await Order.updateMany(
        { _id: { $in: moved.orders || [] }, customerId: targetId },
        { $set: { customerId: sourceId } },
      )).modifiedCount;
      restored.invoices = (await Invoice.updateMany(
        { _id: { $in: moved.invoices || [] }, customerId: targetId },
        { $set: { customerId: sourceId } },
      )).modifiedCount;
    } catch (err) {
      logger.warn('Could not restore QOP documents while undoing a customer merge', {
        module: 'crm', action: 'undoMerge', sourceId, targetId, error: err.message,
      });
    }

    // Put back the target fields the merge overwrote.
    const before = record.targetFieldsBefore || {};
    if (Object.keys(before).length > 0) {
      await customerRepository.updateById(targetId, before);
    }

    // Reactivate the source and drop the merge pointer.
    await customerRepository.updateById(sourceId, {
      status: record.sourceStatusBefore || 'active',
      mergedIntoId: null,
    });

    record.undoneAt = new Date();
    record.undoneBy = undoneBy;
    await record.save();

    await this._invalidateCustomerCache(sourceId);
    await this._invalidateCustomerCache(targetId);
    await this._invalidateListCache();
    await cacheManager.del(`crm:contacts:customer:${sourceId}`);
    await cacheManager.del(`crm:contacts:customer:${targetId}`);
    await cacheManager.del(`crm:sites:customer:${sourceId}`);
    await cacheManager.del(`crm:sites:customer:${targetId}`);
    await invalidateMovedSiteCaches(moved.sites);

    auditService.logEvent({
      eventType: 'customer.mergeUndone',
      userId: undoneBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { mergeId, sourceId, targetId, restored },
      module: 'crm',
    });

    logger.info('Customer merge undone', { module: 'crm', action: 'undoMerge', mergeId, sourceId, targetId, restored });

    return { mergeId, sourceId, targetId, restored };
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
    const deactivatedCount = await customerRepository.bulkDeactivate(ids);
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
    const salesStatusLabel = {
      zusage: 'Zusage',
      offer_received: 'Nur Offerte erhalten',
      absage: 'Absage',
    };
    const header = [
      'CustomerNumber', 'Name', 'Type', 'Status', 'SalesStatus',
      'OwnerName', 'UidNumber', 'VatNumber',
      'Street', 'AddressSupplement', 'PostalCode', 'City', 'Canton', 'Country',
      'Phone', 'Mobile', 'Email', 'Website',
      'NewsletterOptIn', 'NewsletterChannel', 'CreatedAt',
    ].join(';');
    const body = rows.map((c) => [
      c.customerNumber, c.name, c.type, c.status, salesStatusLabel[c.salesStatus] || '',
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

  async cleanupAudit() {
    return customerRepository.cleanupAudit();
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
