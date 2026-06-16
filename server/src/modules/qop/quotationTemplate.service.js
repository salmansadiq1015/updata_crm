import quotationTemplateRepository from './quotationTemplate.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

const TTL = { l1Ttl: 60, l2Ttl: 300 };

class QuotationTemplateService {
  async list(queryParams = {}) {
    const cacheKey = `qop:qtpl:list:${JSON.stringify(queryParams)}`;
    return cacheManager.getOrSet(
      cacheKey,
      () => quotationTemplateRepository.list(queryParams),
      TTL,
    );
  }

  async getById(id) {
    const cacheKey = `qop:qtpl:${id}`;
    const tpl = await cacheManager.getOrSet(
      cacheKey,
      () => quotationTemplateRepository.findById(id),
      TTL,
    );
    if (!tpl) throw new NotFoundError('QuotationTemplate', id);
    return tpl;
  }

  async listCategories() {
    return quotationTemplateRepository.listCategories();
  }

  async create(data, userId) {
    const tpl = await quotationTemplateRepository.create({ ...data, createdBy: userId });
    await this._invalidateList();
    return tpl;
  }

  async update(id, data, userId) {
    await this.getById(id);
    const tpl = await quotationTemplateRepository.update(id, { ...data, updatedBy: userId });
    await Promise.all([
      cacheManager.del(`qop:qtpl:${id}`),
      this._invalidateList(),
    ]);
    return tpl;
  }

  async remove(id, userId) {
    await this.getById(id);
    await quotationTemplateRepository.softDelete(id, userId);
    await Promise.all([
      cacheManager.del(`qop:qtpl:${id}`),
      this._invalidateList(),
    ]);
  }

  async incrementUsage(id) {
    await quotationTemplateRepository.incrementUsage(id);
    await cacheManager.del(`qop:qtpl:${id}`);
  }

  async _invalidateList() {
    await cacheManager.deletePattern('qop:qtpl:list:*');
  }
}

export default new QuotationTemplateService();
