import ighConfigRepository from './ighConfig.repository.js';
import ighImportJobRepository from './ighImportJob.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import queueManager from '../../shared/queue/QueueManager.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError, AppError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const CONFIG_TTL = { l1Ttl: 300, l2Ttl: 900 };
const CONFIG_KEY = 'catalog:igh:config';

class IghService {
  async getConfig() {
    return cacheManager.getOrSet(
      CONFIG_KEY,
      () => ighConfigRepository.getConfig(),
      CONFIG_TTL,
    );
  }

  async updateConfig(data, userId, meta = {}) {
    const updated = await ighConfigRepository.upsertConfig({
      ...data,
      updatedBy: userId,
      $inc: { version: 1 },
    });

    await cacheManager.del(CONFIG_KEY);

    auditService.logEvent({
      eventType: 'catalog.igh.config_updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { changedFields: Object.keys(data) },
      module: 'catalog',
    });

    logger.info('IGH config updated', { module: 'catalog', action: 'igh.config_update', changedFields: Object.keys(data) });

    return updated;
  }

  async triggerFullImport(userId, meta = {}) {
    const cfg = await ighConfigRepository.getConfig();
    if (!cfg || !cfg.isEnabled) {
      throw new AppError('IGH integration is disabled', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }

    const running = await ighImportJobRepository.findRunning();
    if (running) {
      throw new ConflictError('An IGH import is already running');
    }

    const job = await ighImportJobRepository.create({
      type: 'FULL',
      status: 'PENDING',
      createdBy: userId,
    });

    await queueManager.addJob('igh-import', { importJobId: job._id.toString(), type: 'FULL' });

    eventBus.publish(EVENT_TYPES.CATALOG_IGH_IMPORT_STARTED, {
      jobId: job._id,
      type: 'FULL',
      triggeredBy: userId,
    }, { source: 'catalog:igh' });

    auditService.logEvent({
      eventType: 'catalog.igh.import_triggered',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { jobId: job._id, type: 'FULL' },
      module: 'catalog',
    });

    return job;
  }

  async triggerDeltaImport(userId, meta = {}) {
    const cfg = await ighConfigRepository.getConfig();
    if (!cfg || !cfg.isEnabled) {
      throw new AppError('IGH integration is disabled', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }

    const running = await ighImportJobRepository.findRunning();
    if (running) {
      throw new ConflictError('An IGH import is already running');
    }

    const job = await ighImportJobRepository.create({
      type: 'DELTA',
      status: 'PENDING',
      createdBy: userId,
    });

    await queueManager.addJob('igh-import', { importJobId: job._id.toString(), type: 'DELTA' });

    eventBus.publish(EVENT_TYPES.CATALOG_IGH_IMPORT_STARTED, {
      jobId: job._id,
      type: 'DELTA',
      triggeredBy: userId,
    }, { source: 'catalog:igh' });

    auditService.logEvent({
      eventType: 'catalog.igh.import_triggered',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { jobId: job._id, type: 'DELTA' },
      module: 'catalog',
    });

    return job;
  }

  async getImportJob(jobId) {
    const job = await ighImportJobRepository.findById(jobId);
    if (!job) throw new NotFoundError('IghImportJob', jobId);
    return job;
  }

  async getImportLog(jobId) {
    const job = await ighImportJobRepository.findById(jobId);
    if (!job) throw new NotFoundError('IghImportJob', jobId);
    return { log: job.log };
  }

  async getImportHistory(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return ighImportJobRepository.findWithCursor({
      cursor, limit, sortBy, sortOrder, filters,
    });
  }
}

const ighService = new IghService();
export default ighService;
