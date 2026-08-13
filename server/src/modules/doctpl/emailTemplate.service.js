import emailBodyTemplateRepository from './emailBodyTemplate.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
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

  async create(data, userId, meta = {}) {
    const created = await emailBodyTemplateRepository.create(data);
    await cacheManager.del(LIST_CACHE_KEY);

    auditService.logEvent({
      eventType: 'doctpl.email_template.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { emailTemplateId: created._id, templateType: created.templateType, language: created.language },
      module: 'doctpl',
    });

    return created;
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

  async duplicate(id, userId, meta = {}) {
    const existing = await emailBodyTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('EmailBodyTemplate', id);

    const copy = await emailBodyTemplateRepository.create({
      templateType: `${existing.templateType}_copy_${Date.now()}`,
      language: existing.language,
      subjectTemplate: `${existing.subjectTemplate} (Copy)`,
      bodyHtml: existing.bodyHtml,
      bodyText: existing.bodyText,
      isActive: existing.isActive,
    });

    await cacheManager.del(LIST_CACHE_KEY);

    auditService.logEvent({
      eventType: 'doctpl.email_template.duplicated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { sourceEmailTemplateId: id, emailTemplateId: copy._id },
      module: 'doctpl',
    });

    return copy;
  }

  /**
   * Fill a template's placeholders from the record the email is sent from.
   * Templates are written once with {{customerName}}, {{siteAddress}} and the
   * like; the caller passes whichever ids it has and the rest resolve to ''.
   */
  async render(id, { customerId, siteId, projectId, user } = {}) {
    const template = await this.getById(id);

    const vars = {
      customerName: '', customerEmail: '',
      siteName: '', siteAddress: '',
      projectName: '', projectNumber: '',
      senderName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || '',
      senderEmail: user?.email || '',
    };

    if (siteId) {
      const Site = (await import('../crm/site.model.js')).default;
      const site = await Site.findById(siteId).select('name street postalCode city customerId').lean();
      if (site) {
        vars.siteName = site.name || '';
        vars.siteAddress = [site.street, [site.postalCode, site.city].filter(Boolean).join(' ')]
          .filter(Boolean).join(', ');
        if (!customerId) customerId = site.customerId;
      }
    }
    if (projectId) {
      const Project = (await import('../pm/project.model.js')).default;
      const project = await Project.findById(projectId).select('name projectNumber customerId').lean();
      if (project) {
        vars.projectName = project.name || '';
        vars.projectNumber = project.projectNumber || '';
        if (!customerId) customerId = project.customerId;
      }
    }
    if (customerId) {
      const Customer = (await import('../crm/customer.model.js')).default;
      const customer = await Customer.findById(customerId).select('name email').lean();
      if (customer) {
        vars.customerName = customer.name || '';
        vars.customerEmail = customer.email || '';
      }
    }

    const fill = (text) => String(text || '').replace(
      /\{\{\s*([a-zA-Z]+)\s*\}\}/g,
      (match, key) => (key in vars ? vars[key] : match),
    );

    return {
      subject: fill(template.subjectTemplate),
      bodyHtml: fill(template.bodyHtml),
      bodyText: fill(template.bodyText),
    };
  }

  async remove(id, userId, meta = {}) {
    const existing = await emailBodyTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('EmailBodyTemplate', id);

    const removed = await emailBodyTemplateRepository.deleteById(id);
    await cacheManager.del(LIST_CACHE_KEY);

    auditService.logEvent({
      eventType: 'doctpl.email_template.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { emailTemplateId: id },
      module: 'doctpl',
    });

    return removed;
  }
}

const emailTemplateService = new EmailTemplateService();
export default emailTemplateService;
