import maintenanceIntervalRepository from './maintenanceInterval.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };
const DASHBOARD_TTL = { l1Ttl: 30, l2Ttl: 60 };

class MaintenanceIntervalService {
  /**
   * Add frequencyMonths months to lastServiceDate.
   */
  static _calculateNextDueDate(lastServiceDate, frequencyMonths) {
    if (!lastServiceDate || !frequencyMonths) return null;
    const next = new Date(lastServiceDate);
    next.setMonth(next.getMonth() + frequencyMonths);
    return next;
  }

  /**
   * Determine status based on nextDueDate relative to now.
   */
  static _determineStatus(nextDueDate) {
    if (!nextDueDate) return 'ok';
    const now = new Date();
    if (nextDueDate <= now) return 'overdue';
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    if (nextDueDate <= thirtyDaysFromNow) return 'due';
    return 'ok';
  }

  async create(installationId, data, createdBy, meta = {}) {
    // Verify installation exists and is active (lazy import)
    const installationRepository = (await import('./installation.repository.js')).default;
    const installation = await installationRepository.findById(installationId);
    if (!installation) throw new NotFoundError('Installation', installationId);
    if (installation.status !== 'active') {
      throw new ConflictError('Cannot add maintenance interval to a decommissioned installation');
    }

    const nextDueDate = MaintenanceIntervalService._calculateNextDueDate(data.lastServiceDate, data.frequencyMonths);
    const maintenanceStatus = MaintenanceIntervalService._determineStatus(nextDueDate);

    const interval = await maintenanceIntervalRepository.create({
      ...data,
      installationId,
      nextDueDate,
      maintenanceStatus,
    });

    await this._invalidateInstallationMaintenanceCache(installationId);
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.MAINTENANCE_INTERVAL_CREATED, {
      maintenanceIntervalId: interval._id,
      installationId,
      maintenanceType: interval.maintenanceType,
      createdBy,
    }, { source: 'crm:maintenance' });

    auditService.logEvent({
      eventType: 'maintenance.interval.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { maintenanceIntervalId: interval._id, installationId },
      module: 'crm',
    });

    logger.info('Maintenance interval created', { module: 'crm', action: 'create', maintenanceIntervalId: interval._id, installationId });

    return maintenanceIntervalRepository.findById(interval._id);
  }

  async listByInstallation(installationId) {
    const cacheKey = `crm:maintenance:installation:${installationId}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => maintenanceIntervalRepository.findByInstallationId(installationId),
      LIST_TTL,
    );
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await maintenanceIntervalRepository.findById(id);
    if (!existing) throw new NotFoundError('MaintenanceInterval', id);

    // Recalculate nextDueDate and status if relevant fields changed
    if (data.lastServiceDate !== undefined || data.frequencyMonths !== undefined) {
      const lastServiceDate = data.lastServiceDate !== undefined ? data.lastServiceDate : existing.lastServiceDate;
      const frequencyMonths = data.frequencyMonths !== undefined ? data.frequencyMonths : existing.frequencyMonths;
      data.nextDueDate = MaintenanceIntervalService._calculateNextDueDate(lastServiceDate, frequencyMonths);
      data.maintenanceStatus = MaintenanceIntervalService._determineStatus(data.nextDueDate);
    }

    const updated = await maintenanceIntervalRepository.updateById(id, data);
    await this._invalidateInstallationMaintenanceCache(existing.installationId);
    await this._invalidateDashboardCache();

    eventBus.publish(EVENT_TYPES.MAINTENANCE_INTERVAL_UPDATED, {
      maintenanceIntervalId: id,
      installationId: existing.installationId,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'crm:maintenance' });

    auditService.logEvent({
      eventType: 'maintenance.interval.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { maintenanceIntervalId: id, changedFields: Object.keys(data) },
      module: 'crm',
    });

    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await maintenanceIntervalRepository.findById(id);
    if (!existing) throw new NotFoundError('MaintenanceInterval', id);

    await maintenanceIntervalRepository.deleteById(id);
    await this._invalidateInstallationMaintenanceCache(existing.installationId);
    await this._invalidateDashboardCache();

    auditService.logEvent({
      eventType: 'maintenance.interval.deleted',
      userId: deletedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { maintenanceIntervalId: id, installationId: existing.installationId },
      module: 'crm',
    });

    logger.info('Maintenance interval deleted', { module: 'crm', action: 'delete', maintenanceIntervalId: id, installationId: existing.installationId });
  }

  async getDashboard() {
    const cacheKey = 'crm:maintenance:dashboard';
    return cacheManager.getOrSet(
      cacheKey,
      () => maintenanceIntervalRepository.findDashboard(),
      DASHBOARD_TTL,
    );
  }

  async listDue(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return maintenanceIntervalRepository.findWithCursor({
      cursor,
      limit,
      sortBy: sortBy || 'nextDueDate',
      sortOrder: sortOrder || 'asc',
      filters: { ...filters, maintenanceStatus: 'due' },
    });
  }

  async listOverdue(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return maintenanceIntervalRepository.findWithCursor({
      cursor,
      limit,
      sortBy: sortBy || 'nextDueDate',
      sortOrder: sortOrder || 'asc',
      filters: { ...filters, maintenanceStatus: 'overdue' },
    });
  }

  async _invalidateInstallationMaintenanceCache(installationId) {
    await cacheManager.del(`crm:maintenance:installation:${installationId}`);
  }

  async _invalidateDashboardCache() {
    await cacheManager.del('crm:maintenance:dashboard');
  }
}

const maintenanceIntervalService = new MaintenanceIntervalService();
export default maintenanceIntervalService;
