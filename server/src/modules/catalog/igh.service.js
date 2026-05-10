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

  async previewImport() {
    const cfg = await ighConfigRepository.getConfig();
    if (!cfg || !cfg.isEnabled) {
      throw new AppError('IGH integration is disabled', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }
    if (!cfg.endpointUrl) {
      throw new AppError('IGH endpoint URL is not configured', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }

    const { default: axios } = await import('axios');
    const { parseIghCsv, parseIghJson } = await import('./igh-import-adapters.js');
    const Article = (await import('./article.model.js')).default;

    // Fetch IGH data
    const response = await axios.get(cfg.endpointUrl, {
      headers: cfg.credentials?.apiKey
        ? { Authorization: `Bearer ${cfg.credentials.apiKey}` }
        : {},
      timeout: 60_000,
      responseType: 'text',
    });

    // Parse
    let articles;
    const contentType = (response.headers['content-type'] ?? '').toLowerCase();
    if (contentType.includes('json')) {
      const json = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
      articles = parseIghJson(Array.isArray(json) ? json : (json.articles ?? json.data ?? []));
    } else {
      articles = await parseIghCsv(response.data);
    }

    // Compare against existing catalog
    const ighNumbers = articles.map((a) => a.ighArticleNumber);
    const existingArticles = await Article.find({
      ighArticleNumber: { $in: ighNumbers },
    }).select('ighArticleNumber').lean();

    const existingSet = new Set(existingArticles.map((a) => a.ighArticleNumber));

    // Count obsolete: IGH articles currently in DB but NOT in the incoming feed
    const allIghInDb = await Article.countDocuments({
      source: 'IGH',
      isDeleted: false,
      ighArticleNumber: { $nin: ighNumbers },
    });

    return {
      total: articles.length,
      newCount: articles.filter((a) => !existingSet.has(a.ighArticleNumber)).length,
      updatedCount: articles.filter((a) => existingSet.has(a.ighArticleNumber)).length,
      obsoleteCount: allIghInDb,
    };
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
