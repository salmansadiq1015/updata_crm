import crypto from 'crypto';
import mongoose from 'mongoose';
import { parse } from 'csv-parse/sync';
import Article from './article.model.js';
import CatalogCategory from './catalogCategory.model.js';
import catalogConnectionRepository from './catalogConnection.repository.js';
import catalogMarkupRuleRepository from './catalogMarkupRule.repository.js';
import catalogMarkupRuleService, { calculateCatalogPrice } from './catalogMarkupRule.service.js';
import { buildArticleSearchTokens, normalizeUnitCode } from './catalogNormalization.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const BATCH_SIZE = 500;
const SCHEDULE_ALIASES_MINUTES = new Map([
  ['@hourly', 60],
  ['hourly', 60],
  ['@daily', 1440],
  ['daily', 1440],
  ['@weekly', 10080],
  ['weekly', 10080],
]);

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function compactString(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeKey(value) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function getField(row, names, fallback = '') {
  const lookup = new Map(Object.entries(row || {}).map(([key, value]) => [normalizeKey(key), value]));
  for (const name of names) {
    const value = lookup.get(normalizeKey(name));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return fallback;
}

function parseMoney(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  let raw = String(value).trim().replace(/['\sA-Z]+/gi, '');
  raw = raw.replace(/[^\d,.-]/g, '');
  if (!raw) return fallback;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma > lastDot) {
    raw = raw.replace(/\./g, '').replace(',', '.');
  } else {
    raw = raw.replace(/,/g, '');
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? round2(parsed) : fallback;
}

function parseQuantity(value) {
  const parsed = parseMoney(value, null);
  return parsed === null ? null : Math.max(0, parsed);
}

function normalizeAvailability(value) {
  const raw = normalizeKey(value);
  if (!raw) return 'UNKNOWN';
  if (['instock', 'available', 'lager', 'lagernd', 'verfugbar', 'lieferbar', 'green'].includes(raw)) return 'IN_STOCK';
  if (['lowstock', 'limited', 'knapp', 'wenig', 'yellow'].includes(raw)) return 'LOW_STOCK';
  if (['outofstock', 'unavailable', 'nichtlieferbar', 'ausverkauft', 'red'].includes(raw)) return 'OUT_OF_STOCK';
  if (['discontinued', 'obsolete', 'eingestellt'].includes(raw)) return 'DISCONTINUED';
  return 'UNKNOWN';
}

function sourceForConnection(connection) {
  if (connection.type === 'MANUFACTURER') return 'MANUFACTURER';
  if (connection.type === 'SUPPLIER') return 'SUPPLIER';
  if (connection.type === 'IGH') return 'IGH';
  return 'SUPPLIER';
}

function safeArticleNumber(value, connection, externalId) {
  const supplied = compactString(value).toUpperCase().replace(/[^A-Z0-9_-]+/g, '-').slice(0, 20);
  if (supplied.length >= 3) return supplied;
  const provider = compactString(connection.providerKey, 'CAT').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 6) || 'CAT';
  const rawId = compactString(externalId || value || crypto.randomUUID(), provider);
  const cleanId = rawId.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 9);
  const hash = crypto.createHash('md5').update(`${provider}:${rawId}`).digest('hex').slice(0, 5).toUpperCase();
  return `${provider}-${cleanId || hash}`.slice(0, 14) + `-${hash}`;
}

function syncIntervalMinutes(schedule) {
  const value = String(schedule || '').trim();
  if (!value || value.toLowerCase() === 'manual') return null;
  const alias = SCHEDULE_ALIASES_MINUTES.get(value.toLowerCase());
  if (alias) return alias;
  if (/^\d+$/.test(value)) return Number(value);

  const parts = value.split(/\s+/);
  if (parts.length !== 5) return 1440;
  const [minute, hour, , , dayOfWeek] = parts;
  const everyMinute = minute.match(/^\*\/(\d+)$/);
  if (everyMinute) return Number(everyMinute[1]);
  if (minute === '0' && hour === '*') return 60;
  if (minute === '0' && /^\d+$/.test(hour) && dayOfWeek === '*') return 1440;
  if (minute === '0' && /^\d+$/.test(hour) && /^\d+$/.test(dayOfWeek)) return 10080;
  return 1440;
}

function isDue(connection, now = new Date()) {
  if (!connection.isEnabled || connection.lastSyncStatus === 'RUNNING') return false;
  const interval = syncIntervalMinutes(connection.syncSchedule);
  if (!interval) return false;
  if (!connection.lastSyncedAt) return true;
  return now.getTime() - new Date(connection.lastSyncedAt).getTime() >= interval * 60 * 1000;
}

function xmlValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
    if (match?.[1]) {
      return match[1]
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .trim();
    }
  }
  return '';
}

class CatalogConnectionService {
  async create(data, createdBy, meta = {}) {
    await this._validateReferences(data);
    const existing = await catalogConnectionRepository.findByProviderKey(String(data.providerKey || '').toUpperCase());
    if (existing) throw new ConflictError('Catalog connection providerKey already exists');
    const connection = await catalogConnectionRepository.create({ ...data, createdBy });
    await this._invalidateConnectionCaches();
    this._audit('catalog.connection.created', createdBy, connection, meta);
    eventBus.publish(EVENT_TYPES.CATALOG_CONNECTION_CHANGED, {
      connectionId: connection._id,
      action: 'created',
      changedBy: createdBy,
    }, { source: 'catalog:connections' });
    return this._sanitizeConnection(await catalogConnectionRepository.findById(connection._id));
  }

  async list(queryParams = {}) {
    const { cursor, limit, sortBy, sortOrder, q, search, ...filters } = queryParams;
    const result = await catalogConnectionRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
      search: String(search ?? q ?? '').trim(),
    });
    return {
      ...result,
      data: result.data.map((connection) => this._sanitizeConnection(connection)),
    };
  }

  async getById(id) {
    const connection = await catalogConnectionRepository.findById(id);
    if (!connection) throw new NotFoundError('CatalogConnection', id);
    return this._sanitizeConnection(connection);
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await catalogConnectionRepository.findById(id);
    if (!existing) throw new NotFoundError('CatalogConnection', id);
    await this._validateReferences(data);
    if (data.providerKey && String(data.providerKey).toUpperCase() !== existing.providerKey) {
      const duplicate = await catalogConnectionRepository.findByProviderKey(String(data.providerKey).toUpperCase());
      if (duplicate) throw new ConflictError('Catalog connection providerKey already exists');
    }
    const updated = await catalogConnectionRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateConnectionCaches();
    this._audit('catalog.connection.updated', updatedBy, updated, meta);
    eventBus.publish(EVENT_TYPES.CATALOG_CONNECTION_CHANGED, {
      connectionId: id,
      action: 'updated',
      changedBy: updatedBy,
    }, { source: 'catalog:connections' });
    return this._sanitizeConnection(updated);
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await catalogConnectionRepository.findById(id);
    if (!existing) throw new NotFoundError('CatalogConnection', id);
    await catalogConnectionRepository.softDelete(id);
    await this._invalidateConnectionCaches();
    this._audit('catalog.connection.deleted', deletedBy, existing, meta);
    eventBus.publish(EVENT_TYPES.CATALOG_CONNECTION_CHANGED, {
      connectionId: id,
      action: 'deleted',
      changedBy: deletedBy,
    }, { source: 'catalog:connections' });
  }

  async triggerSync(id, userId, mode = 'MANUAL') {
    const connection = await catalogConnectionRepository.findById(id);
    if (!connection) throw new NotFoundError('CatalogConnection', id);
    if (!connection.isEnabled) throw new ConflictError('Catalog connection is disabled');

    const { default: queueManager } = await import('../../shared/queue/QueueManager.js');
    const job = await queueManager.addJob('catalog-sync', `catalog-sync-${id}-${Date.now()}`, {
      connectionId: id,
      mode,
      triggeredBy: userId,
    });
    return { jobId: job.id, status: 'QUEUED', connectionId: id, mode };
  }

  async getLogs(id, params = {}) {
    await this.getById(id);
    const limit = Math.min(Number(params.limit) || 25, 100);
    return catalogConnectionRepository.findSyncLogs(id, { limit });
  }

  async syncDueConnections() {
    const candidates = await catalogConnectionRepository.findSyncCandidates();
    const due = candidates.filter((connection) => isDue(connection));
    const results = [];
    for (const connection of due) {
      try {
        results.push(await this.syncConnection(connection._id, { mode: 'SCHEDULED' }));
      } catch (err) {
        logger.error('Scheduled catalog sync failed', {
          module: 'catalog',
          action: 'sync.scheduled',
          connectionId: connection._id,
          error: { message: err.message },
        });
      }
    }
    return { scanned: candidates.length, queuedOrProcessed: due.length, results };
  }

  async syncConnection(connectionId, { mode = 'MANUAL', triggeredBy = null } = {}) {
    const connection = await catalogConnectionRepository.findById(connectionId);
    if (!connection) throw new NotFoundError('CatalogConnection', connectionId);
    if (!connection.isEnabled) throw new ConflictError('Catalog connection is disabled');

    const startedAt = new Date();
    const syncLog = await catalogConnectionRepository.createSyncLog({
      connectionId,
      mode,
      status: 'RUNNING',
      startedAt,
      triggeredBy,
    });

    await catalogConnectionRepository.updateSyncState(connectionId, {
      lastSyncStatus: 'RUNNING',
      lastSyncError: '',
    });

    try {
      const [rawPayload, defaultCategoryId, markupRules] = await Promise.all([
        this._fetchPayload(connection, mode),
        this._resolveDefaultCategory(connection),
        catalogMarkupRuleRepository.findActiveRules(),
      ]);
      const rows = this._parsePayload(rawPayload.data, connection.format);
      const prepared = [];
      const rowErrors = [];
      const seenExternalIds = [];

      for (const [index, row] of rows.entries()) {
        try {
          const article = this._normalizeRow(row, connection, defaultCategoryId, markupRules);
          prepared.push(article);
          if (article.externalCatalogItemId) seenExternalIds.push(article.externalCatalogItemId);
        } catch (err) {
          rowErrors.push({
            row: index + 1,
            articleNumber: compactString(row.articleNumber || row.ArticleNumber || row.sku || row.SKU),
            message: err.message,
          });
        }
      }

      const writeResult = await this._upsertArticles(prepared, connection, triggeredBy);
      const discontinued = await this._markMissingAsDiscontinued(connection, seenExternalIds, mode, triggeredBy);
      const summary = {
        parsed: rows.length,
        created: writeResult.created,
        updated: writeResult.updated,
        skipped: rowErrors.length,
        discontinued,
        errors: rowErrors.length + writeResult.errors.length,
      };

      await catalogConnectionRepository.updateSyncLog(syncLog._id, {
        status: 'COMPLETED',
        completedAt: new Date(),
        ...summary,
        rowErrors: [...rowErrors, ...writeResult.errors].slice(0, 200),
      });

      await catalogConnectionRepository.updateSyncState(connectionId, {
        lastSyncedAt: new Date(),
        lastSyncStatus: 'HEALTHY',
        lastSyncError: '',
        lastSyncSummary: summary,
      });

      await this._invalidateCatalogCaches();
      eventBus.publish(EVENT_TYPES.CATALOG_SYNC_COMPLETED, {
        connectionId,
        mode,
        ...summary,
      }, { source: 'catalog:sync' });
      this._audit('catalog.connection.synced', triggeredBy, connection, { source: 'catalog:sync' }, summary);
      return { connectionId, logId: syncLog._id, status: 'COMPLETED', ...summary };
    } catch (err) {
      await catalogConnectionRepository.updateSyncLog(syncLog._id, {
        status: 'FAILED',
        completedAt: new Date(),
        errors: 1,
        rowErrors: [{ row: null, articleNumber: '', message: err.message }],
      });
      await catalogConnectionRepository.updateSyncState(connectionId, {
        lastSyncStatus: 'FAILED',
        lastSyncError: err.message,
      });
      eventBus.publish(EVENT_TYPES.CATALOG_SYNC_FAILED, {
        connectionId,
        mode,
        error: err.message,
      }, { source: 'catalog:sync' });
      throw err;
    }
  }

  _parsePayload(payload, format) {
    const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const resolvedFormat = String(format || '').toUpperCase();
    if (resolvedFormat === 'JSON' || text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const json = typeof payload === 'string' ? JSON.parse(payload) : payload;
      if (Array.isArray(json)) return json;
      const rows = json.articles || json.items || json.products || json.data || [];
      return Array.isArray(rows) ? rows : [];
    }
    if (resolvedFormat === 'XML' || text.trim().startsWith('<')) {
      return this._parseXmlRows(text);
    }
    return parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
      delimiter: [',', ';', '\t'],
    });
  }

  _normalizeRow(row, connection, defaultCategoryId, markupRules) {
    const externalId = compactString(getField(row, [
      'externalCatalogItemId',
      'externalId',
      'supplierArticleNumber',
      'manufacturerPartNumber',
      'sku',
      'articleNumber',
      'Artikelnummer',
      'ARTIKEL_NR',
    ]));
    const rawArticleNumber = getField(row, ['articleNumber', 'article_no', 'Artikelnummer', 'ARTIKEL_NR', 'sku']);
    const articleNumber = safeArticleNumber(rawArticleNumber, connection, externalId);
    const name = compactString(getField(row, ['name', 'title', 'descriptionShort', 'BEZEICHNUNG', 'Artikelbezeichnung']));
    if (!name) throw new ConflictError('Catalog row is missing a product name');
    if (!defaultCategoryId) throw new ConflictError('Catalog connection requires a default category or an existing catalog category');

    const purchasePrice = parseMoney(getField(row, [
      'purchasePrice',
      'purchase_price',
      'cost',
      'netPrice',
      'EK',
      'Einkaufspreis',
      'price',
      'Preis',
    ]), 0);
    const rawSalesPrice = parseMoney(getField(row, [
      'salesPrice',
      'sales_price',
      'sellPrice',
      'listPrice',
      'recommendedSalesPrice',
      'VK',
      'Verkaufspreis',
    ]), null);

    const article = {
      articleNumber,
      name,
      description: compactString(getField(row, ['description', 'longDescription', 'BESCHREIBUNG'])),
      categoryId: this._objectIdValue(getField(row, ['categoryId'], defaultCategoryId)) || defaultCategoryId,
      type: String(getField(row, ['type', 'articleType'], 'MATERIAL')).trim().toUpperCase() === 'SERVICE' ? 'SERVICE' : 'MATERIAL',
      unitOfMeasure: normalizeUnitCode(getField(row, ['unitOfMeasure', 'unit', 'Einheit', 'EINHEIT'], 'STK')),
      purchasePrice,
      salesPrice: rawSalesPrice ?? purchasePrice,
      basePrice: rawSalesPrice ?? purchasePrice,
      currency: String(getField(row, ['currency', 'Waehrung', 'Währung'], 'CHF')).trim().toUpperCase().slice(0, 3) || 'CHF',
      catalogConnectionId: connection._id,
      externalCatalogItemId: externalId || articleNumber,
      supplierId: connection.supplierId?._id || connection.supplierId || null,
      supplierName: compactString(getField(row, ['supplierName', 'supplier', 'Lieferant'], connection.supplierName || connection.supplierId?.name || '')),
      supplierReference: compactString(getField(row, ['supplierReference', 'supplierArticleNumber', 'Lieferantennummer'], externalId)) || null,
      manufacturerName: compactString(getField(row, ['manufacturerName', 'manufacturer', 'Hersteller'], connection.manufacturerName || '')),
      manufacturerPartNumber: compactString(getField(row, ['manufacturerPartNumber', 'mpn', 'Herstellerartikelnummer'], '')) || null,
      productGroup: compactString(getField(row, ['productGroup', 'category', 'Warengruppe', 'Produktgruppe'], '')),
      ighArticleNumber: connection.type === 'IGH' ? externalId : null,
      source: sourceForConnection(connection),
      status: String(getField(row, ['status'], 'ACTIVE')).trim().toUpperCase() === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE',
      availabilityStatus: normalizeAvailability(getField(row, ['availabilityStatus', 'availability', 'stockStatus', 'Lagerstatus'])),
      availableQuantity: parseQuantity(getField(row, ['availableQuantity', 'quantityAvailable', 'stock', 'Lagerbestand'])),
      markupPercent: parseMoney(getField(row, ['markupPercent'], connection.defaultMarkupPercent), connection.defaultMarkupPercent),
      marginPercent: parseMoney(getField(row, ['marginPercent'], connection.defaultMarginPercent), connection.defaultMarginPercent),
      lastSyncedAt: new Date(),
    };

    const rule = catalogMarkupRuleService.pickBestRule(article, markupRules);
    const calculation = calculateCatalogPrice(article, rule);
    article.basePrice = calculation.basePrice;
    article.salesPrice = calculation.salesPrice;
    article.marginPercent = calculation.marginPercent;
    article.markupPercent = calculation.appliedMarkupPercent;
    article.searchTokens = buildArticleSearchTokens(article);
    return article;
  }

  async _upsertArticles(articles, connection, userId) {
    const totals = { created: 0, updated: 0, errors: [] };
    if (!articles.length) return totals;

    for (let index = 0; index < articles.length; index += BATCH_SIZE) {
      const batch = articles.slice(index, index + BATCH_SIZE);
      const ops = batch.map((article) => ({
        updateOne: {
          filter: article.externalCatalogItemId
            ? { catalogConnectionId: connection._id, externalCatalogItemId: article.externalCatalogItemId }
            : { articleNumber: article.articleNumber },
          update: {
            $set: {
              name: article.name,
              description: article.description,
              categoryId: article.categoryId,
              type: article.type,
              unitOfMeasure: article.unitOfMeasure,
              purchasePrice: article.purchasePrice,
              salesPrice: article.salesPrice,
              basePrice: article.basePrice,
              currency: article.currency,
              catalogConnectionId: article.catalogConnectionId,
              externalCatalogItemId: article.externalCatalogItemId,
              supplierId: article.supplierId,
              supplierName: article.supplierName,
              supplierReference: article.supplierReference,
              manufacturerName: article.manufacturerName,
              manufacturerPartNumber: article.manufacturerPartNumber,
              productGroup: article.productGroup,
              ighArticleNumber: article.ighArticleNumber,
              source: article.source,
              status: article.status,
              availabilityStatus: article.availabilityStatus,
              availableQuantity: article.availableQuantity,
              markupPercent: article.markupPercent,
              marginPercent: article.marginPercent,
              lastSyncedAt: article.lastSyncedAt,
              searchTokens: article.searchTokens,
              updatedBy: userId,
            },
            $setOnInsert: {
              articleNumber: article.articleNumber,
              createdBy: userId,
            },
            $inc: { version: 1 },
          },
          upsert: true,
        },
      }));

      try {
        const result = await Article.bulkWrite(ops, { ordered: false });
        totals.created += result.upsertedCount ?? 0;
        totals.updated += result.modifiedCount ?? 0;
      } catch (err) {
        totals.errors.push({ row: index + 1, articleNumber: '', message: err.message });
      }
    }
    return totals;
  }

  async _markMissingAsDiscontinued(connection, externalIds, mode, userId) {
    if (mode === 'DELTA' || !externalIds.length) return 0;
    const result = await Article.updateMany(
      {
        catalogConnectionId: connection._id,
        externalCatalogItemId: { $nin: externalIds },
        isDeleted: false,
      },
      {
        $set: {
          availabilityStatus: 'DISCONTINUED',
          availableQuantity: 0,
          lastSyncedAt: new Date(),
          updatedBy: userId,
        },
        $inc: { version: 1 },
      },
    );
    return result.modifiedCount ?? 0;
  }

  async _fetchPayload(connection, mode) {
    if (!connection.endpointUrl) throw new ConflictError('Catalog connection endpointUrl is required');
    const { default: axios } = await import('axios');
    const headers = connection.requestHeaders instanceof Map
      ? Object.fromEntries(connection.requestHeaders.entries())
      : { ...(connection.requestHeaders || {}) };
    const token = connection.credentials?.token || connection.credentials?.apiKey;
    if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`;
    const response = await axios.get(connection.endpointUrl, {
      headers,
      auth: connection.credentials?.username
        ? { username: connection.credentials.username, password: connection.credentials.password || '' }
        : undefined,
      params: mode === 'DELTA' && connection.lastSyncedAt ? { since: new Date(connection.lastSyncedAt).toISOString() } : {},
      timeout: 120_000,
      responseType: 'text',
    });
    return { data: response.data, contentType: response.headers?.['content-type'] || '' };
  }

  _parseXmlRows(text) {
    const blocks = String(text).match(/<(article|item|product)\b[\s\S]*?<\/\1>/gi) || [];
    return blocks.map((block) => ({
      articleNumber: xmlValue(block, ['articleNumber', 'ArticleNumber', 'ARTIKEL_NR', 'SKU']),
      name: xmlValue(block, ['name', 'Name', 'BEZEICHNUNG', 'title']),
      description: xmlValue(block, ['description', 'Description', 'BESCHREIBUNG']),
      unitOfMeasure: xmlValue(block, ['unitOfMeasure', 'unit', 'EINHEIT']),
      purchasePrice: xmlValue(block, ['purchasePrice', 'cost', 'price', 'PREIS_CHF']),
      salesPrice: xmlValue(block, ['salesPrice', 'sellPrice', 'listPrice']),
      manufacturerName: xmlValue(block, ['manufacturerName', 'manufacturer', 'Hersteller']),
      manufacturerPartNumber: xmlValue(block, ['manufacturerPartNumber', 'mpn']),
      supplierReference: xmlValue(block, ['supplierReference', 'supplierArticleNumber']),
      productGroup: xmlValue(block, ['productGroup', 'category']),
      availabilityStatus: xmlValue(block, ['availabilityStatus', 'availability']),
      availableQuantity: xmlValue(block, ['availableQuantity', 'stock']),
    }));
  }

  async _resolveDefaultCategory(connection) {
    const configuredId = this._objectIdValue(connection.defaultCategoryId?._id || connection.defaultCategoryId);
    if (configuredId) return configuredId;
    const providerCategory = await CatalogCategory.findOne({ code: connection.providerKey }).select('_id').lean();
    if (providerCategory?._id) return providerCategory._id;
    const fallback = await CatalogCategory.findOne({ status: 'ACTIVE' }).select('_id').lean();
    return fallback?._id ?? null;
  }

  _objectIdValue(value) {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    if (typeof value === 'object' && value._id) return this._objectIdValue(value._id);
    return mongoose.isValidObjectId(value) ? value : null;
  }

  async _validateReferences(data) {
    if (data.defaultCategoryId) {
      const category = await CatalogCategory.findById(data.defaultCategoryId).lean();
      if (!category) throw new NotFoundError('CatalogCategory', data.defaultCategoryId);
    }
    if (data.supplierId) {
      const Customer = (await import('../crm/customer.model.js')).default;
      const supplier = await Customer.findOne({ _id: data.supplierId, type: 'business', isDeleted: false }).lean();
      if (!supplier) throw new NotFoundError('Supplier', data.supplierId);
    }
  }

  _sanitizeConnection(connection) {
    if (!connection) return connection;
    const credentials = connection.credentials || {};
    return {
      ...connection,
      credentials: {
        hasUsername: Boolean(credentials.username),
        hasPassword: Boolean(credentials.password),
        hasApiKey: Boolean(credentials.apiKey),
        hasToken: Boolean(credentials.token),
      },
    };
  }

  async _invalidateConnectionCaches() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:connections:*`);
  }

  async _invalidateCatalogCaches() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:facets:*`);
  }

  _audit(eventType, userId, connection, meta = {}, details = {}) {
    auditService.logEvent({
      eventType,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        connectionId: connection?._id,
        providerKey: connection?.providerKey,
        type: connection?.type,
        ...details,
      },
      module: 'catalog',
    });
  }
}

const catalogConnectionService = new CatalogConnectionService();
export default catalogConnectionService;
export { isDue, syncIntervalMinutes };
