import emailBodyTemplateRepository from './emailBodyTemplate.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import config from '../../config/index.js';
import logger from '../../shared/logger/index.js';

const LIST_TTL = { l1Ttl: 300, l2Ttl: 900 };
const LIST_CACHE_KEY = 'doctpl:email-templates:list';

class EmailTemplateService {
  async list() {
    return cacheManager.getOrSet(
      LIST_CACHE_KEY,
      () => emailBodyTemplateRepository.findAll(),
      LIST_TTL,
    );
  }

  async getById(id) {
    const template = await emailBodyTemplateRepository.findById(id);
    if (!template) throw new NotFoundError('EmailBodyTemplate', id);
    return template;
  }

  async update(id, data, userId, meta = {}) {
    const existing = await emailBodyTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('EmailBodyTemplate', id);

    const updated = await emailBodyTemplateRepository.updateById(id, data);

    await cacheManager.del(LIST_CACHE_KEY);

    auditService.logEvent({
      eventType: 'doctpl.email_template.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { emailTemplateId: id, changedFields: Object.keys(data) },
      module: 'doctpl',
    });

    logger.info('Email body template updated', { module: 'doctpl', action: 'updateEmailTemplate', emailTemplateId: id });

    return updated;
  }
}

const emailTemplateService = new EmailTemplateService();
export default emailTemplateService;
