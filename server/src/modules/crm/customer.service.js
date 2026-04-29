import customerRepository from './customer.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class CustomerService {
  async create(data, createdBy, meta = {}) {
    const customerNumber = await counterService.getNextCustomerNumber();

    const customer = await customerRepository.create({
      ...data,
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

    return customerRepository.findById(customer._id);
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

    const updated = await customerRepository.updateById(id, data);
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

  async merge(sourceId, targetId, mergedBy, meta = {}) {
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

  async bulkUpdate(ids, data, updatedBy, meta = {}) {
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

  async bulkDeactivate(ids, deactivatedBy, meta = {}) {
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
      'Street', 'PostalCode', 'City', 'Canton', 'Country',
      'Phone', 'Mobile', 'Email', 'Website',
      'NewsletterOptIn', 'NewsletterChannel', 'CreatedAt',
    ].join(';');
    const body = rows.map((c) => [
      c.customerNumber, c.name, c.type, c.status,
      c.street, c.postalCode, c.city, c.canton, c.country,
      c.phone, c.mobile, c.email, c.website,
      c.newsletterOptIn ? 'true' : 'false', c.newsletterChannel,
      c.createdAt ? new Date(c.createdAt).toISOString() : '',
    ].map(escape).join(';')).join('\n');

    return `﻿${header}\n${body}`;
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
    const {
      buildCursorQuery,
      buildCursorSort,
      buildCursorResponse,
    } = await import('../../shared/utils/pagination.js');

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
    const qopPromise = this._getQopTimelineEntries(customerId, eventType);

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

  /**
   * Fetch quotation / order / invoice documents for a customer and
   * transform them into timeline entries compatible with audit-log shape.
   * Uses try-catch with lazy imports so the CRM module keeps working
   * even if the QOP module is not deployed.
   */
  async _getQopTimelineEntries(customerId, eventTypeFilter) {
    const entries = [];

    try {
      // --- Quotations -------------------------------------------------------
      if (!eventTypeFilter || eventTypeFilter.startsWith('quotation.')) {
        const Quotation = (await import('../qop/quotation.model.js')).default;
        const quotations = await Quotation.find({ customerId })
          .sort({ createdAt: -1 })
          .limit(200)
          .select('quotationNumber title status grandTotalRounded currency createdAt sentAt acceptedAt declinedAt')
          .lean();

        for (const q of quotations) {
          // Always emit a "created" entry
          if (!eventTypeFilter || eventTypeFilter === 'quotation.created') {
            entries.push({
              _id: `qot-c-${q._id}`,
              eventType: 'quotation.created',
              timestamp: q.createdAt,
              module: 'qop',
              details: {
                entityId: q._id,
                entityType: 'quotation',
                quotationNumber: q.quotationNumber,
                title: q.title || q.quotationNumber,
                amount: q.grandTotalRounded,
                currency: q.currency,
                status: q.status,
              },
            });
          }
          // Sent
          if (q.sentAt && (!eventTypeFilter || eventTypeFilter === 'quotation.sent')) {
            entries.push({
              _id: `qot-s-${q._id}`,
              eventType: 'quotation.sent',
              timestamp: q.sentAt,
              module: 'qop',
              details: {
                entityId: q._id,
                entityType: 'quotation',
                quotationNumber: q.quotationNumber,
                title: q.title || q.quotationNumber,
              },
            });
          }
          // Accepted
          if (q.acceptedAt && (!eventTypeFilter || eventTypeFilter === 'quotation.accepted')) {
            entries.push({
              _id: `qot-a-${q._id}`,
              eventType: 'quotation.accepted',
              timestamp: q.acceptedAt,
              module: 'qop',
              details: {
                entityId: q._id,
                entityType: 'quotation',
                quotationNumber: q.quotationNumber,
                title: q.title || q.quotationNumber,
              },
            });
          }
          // Declined
          if (q.declinedAt && (!eventTypeFilter || eventTypeFilter === 'quotation.declined')) {
            entries.push({
              _id: `qot-d-${q._id}`,
              eventType: 'quotation.declined',
              timestamp: q.declinedAt,
              module: 'qop',
              details: {
                entityId: q._id,
                entityType: 'quotation',
                quotationNumber: q.quotationNumber,
                title: q.title || q.quotationNumber,
              },
            });
          }
        }
      }

      // --- Orders -----------------------------------------------------------
      if (!eventTypeFilter || eventTypeFilter.startsWith('order.')) {
        const Order = (await import('../qop/order.model.js')).default;
        const orders = await Order.find({ customerId })
          .sort({ createdAt: -1 })
          .limit(200)
          .select('orderNumber title status grandTotalRounded currency createdAt')
          .lean();

        for (const o of orders) {
          if (!eventTypeFilter || eventTypeFilter === 'order.created') {
            entries.push({
              _id: `ord-c-${o._id}`,
              eventType: 'order.created',
              timestamp: o.createdAt,
              module: 'qop',
              details: {
                entityId: o._id,
                entityType: 'order',
                orderNumber: o.orderNumber,
                title: o.title || o.orderNumber,
                amount: o.grandTotalRounded,
                currency: o.currency,
                status: o.status,
              },
            });
          }
        }
      }

      // --- Invoices ---------------------------------------------------------
      if (!eventTypeFilter || eventTypeFilter.startsWith('invoice.')) {
        const Invoice = (await import('../qop/invoice.model.js')).default;
        const invoices = await Invoice.find({ customerId })
          .sort({ createdAt: -1 })
          .limit(200)
          .select('invoiceNumber title invoiceType status grandTotalRounded currency createdAt sentAt paidAt')
          .lean();

        for (const inv of invoices) {
          if (!eventTypeFilter || eventTypeFilter === 'invoice.created') {
            entries.push({
              _id: `inv-c-${inv._id}`,
              eventType: 'invoice.created',
              timestamp: inv.createdAt,
              module: 'qop',
              details: {
                entityId: inv._id,
                entityType: 'invoice',
                invoiceNumber: inv.invoiceNumber,
                title: inv.title || inv.invoiceNumber,
                invoiceType: inv.invoiceType,
                amount: inv.grandTotalRounded,
                currency: inv.currency,
                status: inv.status,
              },
            });
          }
          // Sent
          if (inv.sentAt && (!eventTypeFilter || eventTypeFilter === 'invoice.sent')) {
            entries.push({
              _id: `inv-s-${inv._id}`,
              eventType: 'invoice.sent',
              timestamp: inv.sentAt,
              module: 'qop',
              details: {
                entityId: inv._id,
                entityType: 'invoice',
                invoiceNumber: inv.invoiceNumber,
                title: inv.title || inv.invoiceNumber,
              },
            });
          }
          // Paid
          if (inv.paidAt && (!eventTypeFilter || eventTypeFilter === 'invoice.paid')) {
            entries.push({
              _id: `inv-p-${inv._id}`,
              eventType: 'invoice.paid',
              timestamp: inv.paidAt,
              module: 'qop',
              details: {
                entityId: inv._id,
                entityType: 'invoice',
                invoiceNumber: inv.invoiceNumber,
                title: inv.title || inv.invoiceNumber,
                amount: inv.grandTotalRounded,
                currency: inv.currency,
              },
            });
          }
        }
      }
    } catch (err) {
      // QOP module may not be available — gracefully degrade
      logger.warn('Could not load QOP timeline entries', { module: 'crm', error: err.message });
    }

    return entries;
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
