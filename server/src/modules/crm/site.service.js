import siteRepository from './site.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { buildEntityTimeline, exportCsv, exportPdf } from './activityTimeline.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const EXPORT_MAX_ENTRIES = 1000;

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class SiteService {
  async create(customerId, data, createdBy, meta = {}) {
    // Verify customer exists (lazy import to avoid circular deps)
    const customerRepository = (await import('./customer.repository.js')).default;
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new NotFoundError('Customer', customerId);
    if (customer.status !== 'active') {
      // Customers are deactivated, never archived — the wording lagged behind
      // the rename and named a state the record can no longer be in.
      throw new ConflictError('Cannot create a site for an inactive customer');
    }

    const siteNumber = await counterService.getNextSiteNumber(customerId);

    const site = await siteRepository.create({
      ...data,
      customerId,
      siteNumber,
      createdBy,
    });

    await this._invalidateCustomerSitesCache(customerId);

    eventBus.publish(EVENT_TYPES.SITE_CREATED, {
      siteId: site._id,
      customerId,
      siteNumber,
      name: site.name,
      createdBy,
    }, { source: 'crm:sites' });

    auditService.logEvent({
      eventType: 'site.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { siteId: site._id, customerId, siteNumber },
      module: 'crm',
    });

    logger.info('Site created', { module: 'crm', action: 'create', siteId: site._id, customerId, siteNumber });

    return siteRepository.findById(site._id);
  }

  async getById(id) {
    const cacheKey = `crm:site:${id}`;
    const site = await cacheManager.getOrSet(
      cacheKey,
      () => siteRepository.findById(id),
      ENTITY_TTL,
    );
    if (!site) throw new NotFoundError('Site', id);
    return site;
  }

  async listByCustomer(customerId) {
    const cacheKey = `crm:sites:customer:${customerId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => siteRepository.findByCustomerId(customerId),
      LIST_TTL,
    );
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    return siteRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search });
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await siteRepository.findById(id);
    if (!existing) throw new NotFoundError('Site', id);

    const updated = await siteRepository.updateById(id, data);
    await this._invalidateSiteCache(id);
    await this._invalidateCustomerSitesCache(existing.customerId);

    eventBus.publish(EVENT_TYPES.SITE_UPDATED, {
      siteId: id,
      customerId: existing.customerId,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'crm:sites' });

    auditService.logEvent({
      eventType: 'site.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { siteId: id, changedFields: Object.keys(data) },
      module: 'crm',
    });

    return updated;
  }

  async deactivate(id, deactivatedBy, meta = {}) {
    const site = await siteRepository.findById(id);
    if (!site) throw new NotFoundError('Site', id);

    if (site.status !== 'active') {
      throw new ConflictError('Site is already inactive');
    }

    const [Installation, MaintenanceInterval] = await Promise.all([
      import('./installation.model.js').then((module) => module.default),
      import('./maintenanceInterval.model.js').then((module) => module.default),
    ]);

    const activeInstallations = await Installation.find({
      siteId: id,
      status: 'active',
      isDeleted: false,
    }).select('_id').lean();
    const activeInstallationIds = activeInstallations.map((installation) => installation._id);

    if (activeInstallationIds.length > 0) {
      await Installation.updateMany(
        { _id: { $in: activeInstallationIds }, status: 'active', isDeleted: false },
        {
          $set: {
            status: 'decommissioned',
            decommissionedDate: new Date(),
            decommissionReason: 'Site deactivated',
          },
        },
        { runValidators: true },
      );
      await MaintenanceInterval.updateMany(
        { installationId: { $in: activeInstallationIds } },
        { $set: { maintenanceStatus: 'ok' } },
      );
    }

    const updated = await siteRepository.updateById(id, { status: 'inactive' });
    await this._invalidateSiteCache(id);
    await this._invalidateCustomerSitesCache(site.customerId);
    await cacheManager.del('crm:maintenance:dashboard');

    eventBus.publish(EVENT_TYPES.SITE_DEACTIVATED, {
      siteId: id,
      customerId: site.customerId,
      deactivatedBy,
      decommissionedInstallations: activeInstallationIds.length,
    }, { source: 'crm:sites' });

    auditService.logEvent({
      eventType: 'site.deactivated',
      userId: deactivatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { siteId: id, customerId: site.customerId, name: site.name },
      module: 'crm',
    });

    return updated;
  }

  /**
   * Unified site activity timeline: merges notes, images, maintenance,
   * service orders, QOP documents (via parent customer) and audit events
   * into one chronologically-sorted, cursor-paginated feed.
   */
  async getActivity(siteId, { cursor, limit = 25, type, dateFrom, dateTo, order = 'desc' } = {}) {
    const exists = await siteRepository.findById(siteId);
    if (!exists) throw new NotFoundError('Site', siteId);

    return buildEntityTimeline({
      entityType: 'site',
      entityId: siteId,
      type,
      dateFrom,
      dateTo,
      order,
      cursor,
      limit,
    });
  }

  /**
   * Export the (filtered) site activity timeline as CSV or PDF.
   * Returns { content, mimeType, extension }.
   */
  async exportActivity(siteId, { format = 'csv', type, dateFrom, dateTo, order = 'desc' } = {}) {
    const exists = await siteRepository.findById(siteId);
    if (!exists) throw new NotFoundError('Site', siteId);

    const entries = await buildEntityTimeline({
      entityType: 'site',
      entityId: siteId,
      type,
      dateFrom,
      dateTo,
      order,
      maxEntries: EXPORT_MAX_ENTRIES,
    });

    if (format === 'pdf') {
      const buffer = await exportPdf(entries, { title: `Site ${exists.siteNumber || ''} — Activity` });
      return { content: buffer, mimeType: 'application/pdf', extension: 'pdf' };
    }
    return { content: exportCsv(entries), mimeType: 'text/csv; charset=utf-8', extension: 'csv' };
  }

  async _invalidateSiteCache(id) {
    await cacheManager.del(`crm:site:${id}`);
  }

  async _invalidateCustomerSitesCache(customerId) {
    await cacheManager.del(`crm:sites:customer:${customerId}`);
  }
}

const siteService = new SiteService();
export default siteService;
