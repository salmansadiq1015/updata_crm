import siteRepository from './site.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class SiteService {
  async create(customerId, data, createdBy, meta = {}) {
    // Verify customer exists (lazy import to avoid circular deps)
    const customerRepository = (await import('./customer.repository.js')).default;
    const customer = await customerRepository.findById(customerId);
    if (!customer) throw new NotFoundError('Customer', customerId);

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

    // Check for active installations (lazy import to avoid circular deps)
    const Installation = (await import('./installation.model.js')).default;
    const activeInstallations = await Installation.countDocuments({
      siteId: id,
      status: 'active',
      isDeleted: false,
    });
    if (activeInstallations > 0) {
      throw new ConflictError('Cannot deactivate site with active installations. Please decommission all installations first.');
    }

    const updated = await siteRepository.updateById(id, { status: 'inactive' });
    await this._invalidateSiteCache(id);
    await this._invalidateCustomerSitesCache(site.customerId);

    eventBus.publish(EVENT_TYPES.SITE_DEACTIVATED, {
      siteId: id,
      customerId: site.customerId,
      deactivatedBy,
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

  async _invalidateSiteCache(id) {
    await cacheManager.del(`crm:site:${id}`);
  }

  async _invalidateCustomerSitesCache(customerId) {
    await cacheManager.del(`crm:sites:customer:${customerId}`);
  }
}

const siteService = new SiteService();
export default siteService;
