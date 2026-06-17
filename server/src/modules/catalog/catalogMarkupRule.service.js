import catalogMarkupRuleRepository from './catalogMarkupRule.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { ConflictError, NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';

const SCOPE_WEIGHT = {
  GLOBAL: 10,
  SUPPLIER: 20,
  MANUFACTURER: 30,
  CATEGORY: 40,
  PRODUCT_GROUP: 50,
  ARTICLE: 60,
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function sameId(a, b) {
  if (!a || !b) return false;
  return a.toString() === b.toString();
}

export function calculateCatalogPrice(article = {}, rule = null, manualSalesPrice = null) {
  const purchasePrice = round2(article.purchasePrice ?? 0);
  const configuredSalesPrice = round2(article.salesPrice ?? article.basePrice ?? 0);
  const ruleMarkup = rule?.markupPercent;
  const ruleMargin = rule?.marginPercent;
  const articleMarkup = article.markupPercent;
  const articleMargin = article.marginPercent;
  const appliedMarkupPercent = ruleMarkup ?? articleMarkup ?? null;
  const targetMarginPercent = appliedMarkupPercent === null ? (ruleMargin ?? articleMargin ?? null) : null;

  let salesPrice = manualSalesPrice === null || manualSalesPrice === undefined
    ? configuredSalesPrice
    : round2(manualSalesPrice);
  let calculationMode = 'FIXED';

  if (manualSalesPrice === null || manualSalesPrice === undefined) {
    if (purchasePrice > 0 && appliedMarkupPercent !== null && appliedMarkupPercent !== undefined) {
      salesPrice = round2(purchasePrice * (1 + toNumber(appliedMarkupPercent) / 100));
      calculationMode = 'MARKUP';
    } else if (purchasePrice > 0 && targetMarginPercent !== null && targetMarginPercent !== undefined) {
      const margin = Math.min(toNumber(targetMarginPercent), 99.99);
      salesPrice = round2(purchasePrice / (1 - margin / 100));
      calculationMode = 'MARGIN';
    }
  } else {
    calculationMode = 'MANUAL_OVERRIDE';
  }

  const marginPercent = salesPrice > 0
    ? round2(((salesPrice - purchasePrice) / salesPrice) * 100)
    : null;

  return {
    purchasePrice,
    salesPrice,
    basePrice: salesPrice,
    appliedMarkupPercent,
    targetMarginPercent,
    marginPercent,
    calculationMode,
    ruleId: rule?._id ?? null,
    ruleName: rule?.name ?? null,
  };
}

class CatalogMarkupRuleService {
  async create(data, createdBy, meta = {}) {
    this._assertPricingConfigured(data);
    await this._validateReferences(data);
    const rule = await catalogMarkupRuleRepository.create({ ...data, createdBy });
    await this._invalidateCache();
    this._audit('catalog.markup_rule.created', createdBy, rule, meta);
    eventBus.publish(EVENT_TYPES.CATALOG_MARKUP_RULE_CHANGED, {
      ruleId: rule._id,
      action: 'created',
      changedBy: createdBy,
    }, { source: 'catalog:markup-rules' });
    return catalogMarkupRuleRepository.findById(rule._id);
  }

  async list(queryParams = {}) {
    const { cursor, limit, sortBy, sortOrder, q, search, ...filters } = queryParams;
    return catalogMarkupRuleRepository.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
      search: String(search ?? q ?? '').trim(),
    });
  }

  async getById(id) {
    const rule = await catalogMarkupRuleRepository.findById(id);
    if (!rule) throw new NotFoundError('CatalogMarkupRule', id);
    return rule;
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await catalogMarkupRuleRepository.findById(id);
    if (!existing) throw new NotFoundError('CatalogMarkupRule', id);
    this._assertPricingConfigured({ ...existing, ...data });
    await this._validateReferences(data);
    const updated = await catalogMarkupRuleRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateCache();
    this._audit('catalog.markup_rule.updated', updatedBy, updated, meta);
    eventBus.publish(EVENT_TYPES.CATALOG_MARKUP_RULE_CHANGED, {
      ruleId: id,
      action: 'updated',
      changedBy: updatedBy,
    }, { source: 'catalog:markup-rules' });
    return updated;
  }

  async delete(id, deletedBy, meta = {}) {
    const existing = await catalogMarkupRuleRepository.findById(id);
    if (!existing) throw new NotFoundError('CatalogMarkupRule', id);
    await catalogMarkupRuleRepository.softDelete(id);
    await this._invalidateCache();
    this._audit('catalog.markup_rule.deleted', deletedBy, existing, meta);
    eventBus.publish(EVENT_TYPES.CATALOG_MARKUP_RULE_CHANGED, {
      ruleId: id,
      action: 'deleted',
      changedBy: deletedBy,
    }, { source: 'catalog:markup-rules' });
  }

  async resolveForArticle(article) {
    const rules = await catalogMarkupRuleRepository.findActiveCandidates(article);
    const rule = this.pickBestRule(article, rules);
    return {
      rule,
      calculation: calculateCatalogPrice(article, rule),
    };
  }

  pickBestRule(article = {}, rules = []) {
    return rules
      .filter((rule) => this._matchesRule(article, rule))
      .sort((a, b) => {
        const priorityDelta = toNumber(b.priority) - toNumber(a.priority);
        if (priorityDelta !== 0) return priorityDelta;
        return (SCOPE_WEIGHT[b.scope] ?? 0) - (SCOPE_WEIGHT[a.scope] ?? 0);
      })[0] ?? null;
  }

  _matchesRule(article, rule) {
    switch (rule.scope) {
      case 'GLOBAL':
        return true;
      case 'MANUFACTURER':
        return Boolean(article.manufacturerName) && article.manufacturerName === rule.manufacturerName;
      case 'SUPPLIER':
        return sameId(article.supplierId, rule.supplierId);
      case 'CATEGORY':
        return sameId(article.categoryId, rule.categoryId);
      case 'PRODUCT_GROUP':
        return Boolean(article.productGroup) && article.productGroup === rule.productGroup;
      case 'ARTICLE':
        return sameId(article._id, rule.articleId);
      default:
        return false;
    }
  }

  _assertPricingConfigured(data) {
    if (data.markupPercent === undefined && data.marginPercent === undefined) {
      throw new ConflictError('Markup rule requires either markupPercent or marginPercent');
    }
    if (data.markupPercent === null && data.marginPercent === null) {
      throw new ConflictError('Markup rule requires either markupPercent or marginPercent');
    }
  }

  async _validateReferences(data) {
    if (data.categoryId) {
      const catalogCategoryRepository = (await import('./catalogCategory.repository.js')).default;
      const category = await catalogCategoryRepository.findById(data.categoryId);
      if (!category) throw new NotFoundError('CatalogCategory', data.categoryId);
    }
    if (data.articleId) {
      const articleRepository = (await import('./article.repository.js')).default;
      const article = await articleRepository.findById(data.articleId);
      if (!article) throw new NotFoundError('Article', data.articleId);
    }
  }

  async _invalidateCache() {
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:articles:list:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:picker:*`);
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:markup-rules:*`);
  }

  _audit(eventType, userId, rule, meta = {}) {
    auditService.logEvent({
      eventType,
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { ruleId: rule?._id, scope: rule?.scope, name: rule?.name },
      module: 'catalog',
    });
  }
}

const catalogMarkupRuleService = new CatalogMarkupRuleService();
export default catalogMarkupRuleService;
