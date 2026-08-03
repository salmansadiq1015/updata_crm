import crypto from 'crypto';
import mongoose from 'mongoose';
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
const PREVIEW_SAMPLE_LIMIT = 25;
const SYSTEM_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

class IghService {
  async getConfig() {
    return cacheManager.getOrSet(
      CONFIG_KEY,
      async () => this._maskConfig(await ighConfigRepository.getConfig()),
      CONFIG_TTL,
    );
  }

  async updateConfig(data, userId, meta = {}) {
    const update = this._buildConfigUpdate(data, userId);
    const updated = await ighConfigRepository.upsertConfig(update);

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

    logger.info('IGH config updated', {
      module: 'catalog',
      action: 'igh.config_update',
      changedFields: Object.keys(data),
    });

    return this._maskConfig(updated);
  }

  async previewImport(userId, type = 'FULL') {
    const { articles, checksum } = await this._fetchIghArticles(type);
    const previewData = await this._buildPreviewData(articles);

    const job = await ighImportJobRepository.create({
      type,
      status: 'PREVIEW',
      articlesCreated: previewData.newCount,
      articlesUpdated: previewData.updatedCount,
      articlesSkipped: previewData.obsoleteCount,
      errorsCount: previewData.validationErrors.length,
      previewData,
      sourceChecksum: checksum,
      log: `Preview generated. Total: ${previewData.total}, New: ${previewData.newCount}, Updated: ${previewData.updatedCount}, Obsolete: ${previewData.obsoleteCount}, Errors: ${previewData.validationErrors.length}`,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'catalog.igh.import_previewed',
      userId,
      ipAddress: 'internal',
      result: 'success',
      details: { jobId: job._id, type, ...previewData.counts },
      module: 'catalog',
    });

    return job;
  }

  /**
   * Upload-based import (yearly supplier catalog, e.g. Nussbaum DataExpert XML).
   * Parses the file, stores it (the worker re-reads it on approval) and creates
   * a PREVIEW job in the same review pipeline as URL imports. Deliberately does
   * NOT require the IGH endpoint configuration — file upload works standalone.
   */
  async previewUpload({ buffer, originalName, mimeType }, userId, meta = {}) {
    const xml = buffer.toString('utf-8');
    const { parseDataExpertXml, isDataExpertXml, parseIghXml } = await import('./igh-import-adapters.js');
    const articles = isDataExpertXml(xml) ? parseDataExpertXml(xml) : parseIghXml(xml);
    if (!articles.length) {
      throw new AppError(
        'No articles found — the file is not a recognized IGH/DataExpert catalog',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const { default: fileService } = await import('../files/file.service.js');
    const fileMeta = await fileService.upload({
      buffer,
      originalName,
      mimeType: mimeType || 'application/xml',
      sizeBytes: buffer.length,
      module: 'catalog',
      entityType: 'igh_import',
      uploadedBy: userId,
      bucket: 'documents',
      folderPath: 'catalog/igh-imports',
      category: 'igh_import',
    });

    const previewData = await this._buildPreviewData(articles);
    const job = await ighImportJobRepository.create({
      type: 'UPLOAD',
      status: 'PREVIEW',
      articlesCreated: previewData.newCount,
      articlesUpdated: previewData.updatedCount,
      articlesSkipped: previewData.obsoleteCount,
      errorsCount: previewData.validationErrors.length,
      previewData,
      sourceChecksum: crypto.createHash('sha256').update(xml).digest('hex'),
      sourceFileId: fileMeta._id,
      sourceFileName: originalName,
      log: `File "${originalName}" (${articles.length} articles) parsed. New: ${previewData.newCount}, Updated: ${previewData.updatedCount}, Errors: ${previewData.validationErrors.length}`,
      createdBy: userId,
    });

    auditService.logEvent({
      eventType: 'catalog.igh.upload_previewed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { jobId: job._id, fileName: originalName, articles: articles.length },
      module: 'catalog',
    });

    return job;
  }

  async approveImport(jobId, userId, meta = {}) {
    const job = await ighImportJobRepository.findById(jobId);
    if (!job) throw new NotFoundError('IghImportJob', jobId);
    if (job.status !== 'PREVIEW') {
      throw new ConflictError('Only preview import jobs can be approved');
    }

    const updated = await ighImportJobRepository.updateById(jobId, {
      status: 'PENDING',
      approvedBy: userId,
      approvedAt: new Date(),
      log: `${job.log || ''}\nApproved and queued for import.`,
    });

    await queueManager.addJob('igh-import', `igh-${job.type.toLowerCase()}-${jobId}`, {
      importJobId: jobId.toString(),
      type: job.type,
    });

    auditService.logEvent({
      eventType: 'catalog.igh.import_approved',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { jobId, type: job.type },
      module: 'catalog',
    });

    return updated;
  }

  async triggerFullImport(userId, meta = {}) {
    return this._triggerImport('FULL', userId, meta);
  }

  async triggerDeltaImport(userId, meta = {}) {
    return this._triggerImport('DELTA', userId, meta);
  }

  async runScheduledSync(now = new Date()) {
    const cfg = await ighConfigRepository.getConfig();
    if (!cfg || !cfg.isEnabled) {
      return { status: 'skipped', reason: 'disabled' };
    }

    const running = await ighImportJobRepository.findRunning();
    if (running) {
      return { status: 'skipped', reason: 'import_running', jobId: running._id };
    }

    if (!this._isScheduleDue(cfg.syncSchedule, cfg.lastSyncAt, now)) {
      return { status: 'skipped', reason: 'not_due', lastSyncAt: cfg.lastSyncAt || null };
    }

    const job = await this._triggerImport('DELTA', SYSTEM_USER_ID, {
      ipAddress: 'scheduler',
      userAgent: 'igh-scheduled-sync',
    });
    return { status: 'queued', type: 'DELTA', jobId: job._id };
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
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
    });
  }

  async _triggerImport(type, userId, meta = {}) {
    const cfg = await ighConfigRepository.getConfig();
    if (!cfg || !cfg.isEnabled) {
      throw new AppError('IGH integration is disabled', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }

    const running = await ighImportJobRepository.findRunning();
    if (running) {
      throw new ConflictError('An IGH import is already running');
    }

    const job = await ighImportJobRepository.create({
      type,
      status: 'PENDING',
      createdBy: userId,
    });

    await queueManager.addJob('igh-import', `igh-${type.toLowerCase()}-${job._id}`, {
      importJobId: job._id.toString(),
      type,
    });

    eventBus.publish(EVENT_TYPES.CATALOG_IGH_IMPORT_STARTED, {
      jobId: job._id,
      type,
      triggeredBy: userId,
    }, { source: 'catalog:igh' });

    auditService.logEvent({
      eventType: 'catalog.igh.import_triggered',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { jobId: job._id, type },
      module: 'catalog',
    });

    return job;
  }

  async _fetchIghArticles(type) {
    const cfg = await ighConfigRepository.getConfig();
    if (!cfg || !cfg.isEnabled) {
      throw new AppError('IGH integration is disabled', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }
    if (!cfg.endpointUrl) {
      throw new AppError('IGH endpoint URL is not configured', 400, ERROR_CODES.CATALOG_IGH_DISABLED);
    }

    const { default: axios } = await import('axios');
    const response = await axios.get(cfg.endpointUrl, {
      headers: cfg.credentials?.apiKey
        ? { Authorization: `Bearer ${cfg.credentials.apiKey}` }
        : {},
      params: type === 'DELTA' && cfg.lastSyncAt
        ? { since: cfg.lastSyncAt.toISOString() }
        : {},
      timeout: 120_000,
      responseType: 'text',
    });

    const raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    return {
      articles: await this._parseFeed(response),
      checksum: crypto.createHash('sha256').update(raw).digest('hex'),
    };
  }

  async _parseFeed(response) {
    const { parseIghCsv, parseIghJson, parseIghXml } = await import('./igh-import-adapters.js');
    const contentType = (response.headers['content-type'] ?? '').toLowerCase();
    const raw = response.data;
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw);

    if (contentType.includes('json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const json = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parseIghJson(Array.isArray(json) ? json : (json.articles ?? json.data ?? []));
    }
    if (contentType.includes('xml') || text.trim().startsWith('<')) {
      return parseIghXml(text);
    }
    return parseIghCsv(text);
  }

  async _buildPreviewData(articles) {
    const Article = (await import('./article.model.js')).default;
    const UnitOfMeasure = (await import('./unitOfMeasure.model.js')).default;
    const units = await UnitOfMeasure.find().select('code').lean();
    const unitCodes = new Set(units.map((unit) => unit.code));

    const validationErrors = [];
    const validArticles = [];
    articles.forEach((article, index) => {
      const errors = [];
      if (!article.ighArticleNumber) errors.push('IGH article number is required');
      if (!article.name) errors.push('Name is required');
      if (!unitCodes.has(article.unitOfMeasure)) {
        errors.push(`Unit '${article.unitOfMeasure}' does not exist`);
      }
      if (errors.length) {
        validationErrors.push({ row: index + 1, ighArticleNumber: article.ighArticleNumber || null, errors });
      } else {
        validArticles.push(article);
      }
    });

    const ighNumbers = validArticles.map((article) => article.ighArticleNumber);
    const existingArticles = await Article.find({
      ighArticleNumber: { $in: ighNumbers },
    }).select('ighArticleNumber').lean();

    const existingSet = new Set(existingArticles.map((article) => article.ighArticleNumber));
    const obsoleteCount = await Article.countDocuments({
      source: 'IGH',
      isDeleted: false,
      ighArticleNumber: { $nin: ighNumbers },
    });

    return {
      total: articles.length,
      validCount: validArticles.length,
      newCount: validArticles.filter((article) => !existingSet.has(article.ighArticleNumber)).length,
      updatedCount: validArticles.filter((article) => existingSet.has(article.ighArticleNumber)).length,
      obsoleteCount,
      validationErrors: validationErrors.slice(0, 100),
      sampleRows: validArticles.slice(0, PREVIEW_SAMPLE_LIMIT),
    };
  }

  _buildConfigUpdate(data, userId) {
    const set = { updatedBy: userId };
    if (data.endpointUrl !== undefined) set.endpointUrl = data.endpointUrl;
    if (data.syncSchedule !== undefined) set.syncSchedule = data.syncSchedule;
    if (data.isEnabled !== undefined) set.isEnabled = data.isEnabled;
    if (data.credentials?.username !== undefined) set['credentials.username'] = data.credentials.username;
    if (data.credentials?.apiKey) set['credentials.apiKey'] = data.credentials.apiKey;
    return { $set: set, $inc: { version: 1 } };
  }

  _maskConfig(configDoc) {
    if (!configDoc) return configDoc;
    return {
      ...configDoc,
      credentials: configDoc.credentials
        ? {
          ...configDoc.credentials,
          apiKey: configDoc.credentials.apiKey ? '********' : '',
        }
        : undefined,
    };
  }

  _isScheduleDue(schedule, lastSyncAt, now = new Date()) {
    const cron = String(schedule || '0 2 * * *').trim();
    const parts = cron.split(/\s+/);
    const lastSync = lastSyncAt ? new Date(lastSyncAt) : null;
    if (!lastSync || Number.isNaN(lastSync.getTime())) return true;

    if (parts.length !== 5) {
      return now.getTime() - lastSync.getTime() >= 24 * 60 * 60 * 1000;
    }

    const [minutePart, hourPart] = parts;
    if (/^\*\/\d+$/.test(minutePart) && hourPart === '*') {
      const minutes = Number(minutePart.slice(2));
      return minutes > 0 && now.getTime() - lastSync.getTime() >= minutes * 60 * 1000;
    }

    if (/^\d+$/.test(minutePart) && /^\*\/\d+$/.test(hourPart)) {
      const hours = Number(hourPart.slice(2));
      return hours > 0 && now.getTime() - lastSync.getTime() >= hours * 60 * 60 * 1000;
    }

    if (/^\d+$/.test(minutePart) && /^\d+$/.test(hourPart)) {
      const scheduled = new Date(now);
      scheduled.setHours(Number(hourPart), Number(minutePart), 0, 0);
      return now >= scheduled && lastSync < scheduled;
    }

    return now.getTime() - lastSync.getTime() >= 24 * 60 * 60 * 1000;
  }
}

const ighService = new IghService();
export default ighService;
