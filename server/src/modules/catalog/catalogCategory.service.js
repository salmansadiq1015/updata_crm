import catalogCategoryRepository from './catalogCategory.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const TREE_TTL = { l1Ttl: 60, l2Ttl: 300 };
const LIST_TTL = { l1Ttl: 30, l2Ttl: 120 };

class CatalogCategoryService {
  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, search, ...filters } = queryParams;
    const filterKey = Object.entries(filters)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    const cacheKey = `catalog:categories:list:${cursor || ''}:${limit}:${sortBy}:${sortOrder}:${search || ''}:${filterKey}`;

    return cacheManager.getOrSet(
      cacheKey,
      () => catalogCategoryRepository.findWithCursor({ cursor, limit, sortBy, sortOrder, filters, search }),
      LIST_TTL,
    );
  }

  async getById(id) {
    const cacheKey = `catalog:category:${id}`;
    const category = await cacheManager.getOrSet(
      cacheKey,
      () => catalogCategoryRepository.findById(id),
      ENTITY_TTL,
    );
    if (!category) throw new NotFoundError('CatalogCategory', id);
    return category;
  }

  async getTree() {
    const cacheKey = 'catalog:categories:tree';
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const roots = await catalogCategoryRepository.findRoots();
        const all = await catalogCategoryRepository.findWithCursor({
          limit: 10000,
          sortBy: 'sortOrder',
          sortOrder: 'asc',
          filters: {},
        });

        const items = all.data || [];
        const map = new Map();
        for (const item of items) {
          map.set(item._id.toString(), { ...item, children: [] });
        }

        const tree = [];
        for (const item of items) {
          const node = map.get(item._id.toString());
          if (item.parentId) {
            const parent = map.get(item.parentId.toString());
            if (parent) parent.children.push(node);
          } else {
            tree.push(node);
          }
        }

        return tree;
      },
      TREE_TTL,
    );
  }

  async create(data, createdBy, meta = {}) {
    // Validate unique code
    const existing = await catalogCategoryRepository.findByCode(data.code);
    if (existing) throw new ConflictError(`Category with code '${data.code}' already exists`);

    // Build ancestors from parent
    if (data.parentId) {
      const parent = await catalogCategoryRepository.findById(data.parentId);
      if (!parent) throw new NotFoundError('CatalogCategory (parent)', data.parentId);
      data.ancestors = [...(parent.ancestors || []), data.parentId];
    } else {
      data.ancestors = [];
    }

    const category = await catalogCategoryRepository.create({ ...data, createdBy });
    await this._invalidateCaches(category._id);

    eventBus.publish(EVENT_TYPES.CATALOG_CATEGORY_CREATED, {
      categoryId: category._id,
      code: category.code,
      name: category.name,
      createdBy,
    }, { source: 'catalog:categories' });

    auditService.logEvent({
      eventType: 'catalog.category.created',
      userId: createdBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { categoryId: category._id, code: category.code },
      module: 'catalog',
    });

    logger.info('Catalog category created', { module: 'catalog', action: 'create', categoryId: category._id, code: category.code });

    return category;
  }

  async update(id, data, updatedBy, meta = {}) {
    const existing = await catalogCategoryRepository.findById(id);
    if (!existing) throw new NotFoundError('CatalogCategory', id);

    const updated = await catalogCategoryRepository.updateById(id, { ...data, updatedBy });
    await this._invalidateCaches(id);

    eventBus.publish(EVENT_TYPES.CATALOG_CATEGORY_UPDATED, {
      categoryId: id,
      changedFields: Object.keys(data),
      updatedBy,
    }, { source: 'catalog:categories' });

    auditService.logEvent({
      eventType: 'catalog.category.updated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { categoryId: id, changedFields: Object.keys(data) },
      module: 'catalog',
    });

    return updated;
  }

  async move(id, newParentId, updatedBy, meta = {}) {
    const category = await catalogCategoryRepository.findById(id);
    if (!category) throw new NotFoundError('CatalogCategory', id);

    let newAncestors = [];
    if (newParentId) {
      const newParent = await catalogCategoryRepository.findById(newParentId);
      if (!newParent) throw new NotFoundError('CatalogCategory (new parent)', newParentId);
      newAncestors = [...(newParent.ancestors || []), newParentId];
    }

    await catalogCategoryRepository.updateById(id, {
      parentId: newParentId || null,
      ancestors: newAncestors,
      updatedBy,
    });

    // Recalculate ancestors for all descendants
    const descendants = await catalogCategoryRepository.findSubtree(id);
    for (const desc of descendants) {
      const oldAncestorIdx = (desc.ancestors || []).findIndex(
        (a) => a.toString() === id.toString(),
      );
      const tailAncestors = oldAncestorIdx >= 0
        ? desc.ancestors.slice(oldAncestorIdx)
        : [id, ...(desc.ancestors || [])];
      await catalogCategoryRepository.updateById(desc._id, {
        ancestors: [...newAncestors, ...tailAncestors],
      });
    }

    await this._invalidateCaches(id);

    auditService.logEvent({
      eventType: 'catalog.category.moved',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { categoryId: id, newParentId },
      module: 'catalog',
    });

    return catalogCategoryRepository.findById(id);
  }

  async deactivate(id, updatedBy, meta = {}) {
    const category = await catalogCategoryRepository.findById(id);
    if (!category) throw new NotFoundError('CatalogCategory', id);

    const updated = await catalogCategoryRepository.updateById(id, {
      status: 'INACTIVE',
      updatedBy,
    });
    await this._invalidateCaches(id);

    auditService.logEvent({
      eventType: 'catalog.category.deactivated',
      userId: updatedBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { categoryId: id },
      module: 'catalog',
    });

    return updated;
  }

  async _invalidateCaches(id) {
    await cacheManager.del(`catalog:category:${id}`);
    await cacheManager.del('catalog:categories:tree');
    await cacheManager.invalidatePattern(`${config.redis.keyPrefix}catalog:categories:list:*`);
  }
}

const catalogCategoryService = new CatalogCategoryService();
export default catalogCategoryService;
