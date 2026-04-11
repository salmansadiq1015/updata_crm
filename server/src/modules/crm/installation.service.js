import installationRepository from './installation.repository.js';
import counterService from './counter.service.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class InstallationService {
  async create(siteId, data, createdBy, meta = {}) {
    // Verify site exists (lazy import to avoid circular deps)
    const siteRepository = (await import('./site.repository.js')).default;
    const site = await siteRepository.findById(siteId);
    if (!site) throw new NotFoundError('Site', siteId);

    const installationNumber = await counterService.getNextInstallationNumber();

    const installation = await installationRepository.create({
      ...data,
      siteId,
      installationNumber,
      createdBy,
    });

    await this._invalidateSiteInstallationsCache(siteId);

    eventBus.publish(EVENT_TYPES.INSTALLATION_CREATED, {
      installationId: installation._id,
      siteId,
      installationNumber,
      type: installation.type,
      createdBy,
    }, { source: 'crm:installations' });

    auditService.logEvent({
      eventType: 'installation.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { installationId: installation._id, siteId, installationNumber },
      module: 'crm',
    });

    logger.info('Installation created', { module: 'crm', action: 'create', installationId: installation._id, siteId, installationNumber });

    return installationRepository.findById(installation._id);
  }

  async getById(id) {
    const cacheKey = `crm:installation:${id}`;
    const installation = await cacheManager.getOrSet(
      cacheKey,
      () => installationRepository.findById(id),
      ENTITY_TTL,
    );
    if (!installation) throw new NotFoundError('Installation', id);
    return installation;
  }

  async listBySite(siteId) {
    const cacheKey = `crm:installations:site:${siteId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => installationRepository.findBySiteId(siteId),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await installationRepository.findById(id);
    if (!existing) throw new NotFoundError('Installation', id);

    const updated = await installationRepository.updateById(id, data);
    await this._invalidateInstallationCache(id);
    await this._invalidateSiteInstallationsCache(existing.siteId);

    eventBus.publish(EVENT_TYPES.INSTALLATION_UPDATED, {
      installationId: id,
      siteId: existing.siteId,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'crm:installations' });

    auditService.logEvent({
      eventType: 'installation.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { installationId: id, changedFields: Object.keys(data) },
      module: 'crm',
    });

    return updated;
  }

  async decommission(id, reason, decommissionedBy, meta = {}) {
    const installation = await installationRepository.findById(id);
    if (!installation) throw new NotFoundError('Installation', id);

    if (installation.status === 'decommissioned') {
      throw new ConflictError('Installation is already decommissioned');
    }

    const updated = await installationRepository.updateById(id, {
      status: 'decommissioned',
      decommissionedDate: new Date(),
      decommissionReason: reason,
    });

    // Set all maintenance intervals for this installation to 'ok' (lazy import)
    const MaintenanceInterval = (await import('./maintenanceInterval.model.js')).default;
    await MaintenanceInterval.updateMany(
      { installationId: id },
      { $set: { maintenanceStatus: 'ok' } },
    );

    await this._invalidateInstallationCache(id);
    await this._invalidateSiteInstallationsCache(installation.siteId);
    await cacheManager.del(`crm:maintenance:installation:${id}`);
    await cacheManager.del('crm:maintenance:dashboard');

    eventBus.publish(EVENT_TYPES.INSTALLATION_DECOMMISSIONED, {
      installationId: id,
      siteId: installation.siteId,
      reason,
      decommissionedBy,
    }, { source: 'crm:installations' });

    auditService.logEvent({
      eventType: 'installation.decommissioned',
      userId: decommissionedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { installationId: id, siteId: installation.siteId, reason },
      module: 'crm',
    });

    logger.info('Installation decommissioned', { module: 'crm', action: 'decommission', installationId: id, siteId: installation.siteId });

    return updated;
  }

  async _invalidateInstallationCache(id) {
    await cacheManager.del(`crm:installation:${id}`);
  }

  async _invalidateSiteInstallationsCache(siteId) {
    await cacheManager.del(`crm:installations:site:${siteId}`);
  }
}

const installationService = new InstallationService();
export default installationService;
