import notificationTemplateRepository from './notificationTemplate.repository.js';
import cacheManager from '../../shared/cache/CacheManager.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const ENTITY_TTL = { l1Ttl: 60, l2Ttl: 300 };
const TEMPLATE_TTL = { l1Ttl: 120, l2Ttl: 600 };

class NotificationTemplateService {
  async create(data, userId, meta = {}) {
    const maxVersion = await notificationTemplateRepository.findMaxVersion(
      data.type,
      data.channel,
      data.language || 'de',
    );

    const template = await notificationTemplateRepository.create({
      ...data,
      version: maxVersion + 1,
      isActive: true,
      createdBy: userId,
    });

    // Deactivate other versions of the same type/channel/language
    await notificationTemplateRepository.deactivateOthers(
      template.type,
      template.channel,
      template.language,
      template._id,
    );

    await this._invalidateTemplateCache(template.type, template.channel, template.language);

    auditService.logEvent({
      eventType: 'notification_template.created',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        templateId: template._id,
        type: template.type,
        channel: template.channel,
        language: template.language,
        version: template.version,
      },
      module: 'notifications',
    });

    logger.info('Notification template created', {
      module: 'notifications',
      action: 'createTemplate',
      templateId: template._id,
      type: template.type,
      channel: template.channel,
      version: template.version,
      userId,
    });

    return template;
  }

  async getById(id) {
    const cacheKey = `notif:template:id:${id}`;

    const template = await cacheManager.getOrSet(
      cacheKey,
      () => notificationTemplateRepository.findById(id),
      ENTITY_TTL,
    );

    if (!template) throw new NotFoundError('NotificationTemplate', id);

    return template;
  }

  async list(filters = {}) {
    const data = await notificationTemplateRepository.findAll(filters);
    return {
      data,
      pagination: { hasNext: false, nextCursor: null, limit: data.length },
    };
  }

  async update(id, data, userId, meta = {}) {
    const existing = await notificationTemplateRepository.findById(id);
    if (!existing) throw new NotFoundError('NotificationTemplate', id);

    // Create a new version instead of updating in place
    const maxVersion = await notificationTemplateRepository.findMaxVersion(
      existing.type,
      existing.channel,
      existing.language,
    );

    const newTemplate = await notificationTemplateRepository.create({
      type: existing.type,
      channel: existing.channel,
      language: existing.language,
      subjectTemplate: data.subjectTemplate !== undefined ? data.subjectTemplate : existing.subjectTemplate,
      bodyTemplate: data.bodyTemplate !== undefined ? data.bodyTemplate : existing.bodyTemplate,
      bodyHtmlTemplate: data.bodyHtmlTemplate !== undefined ? data.bodyHtmlTemplate : existing.bodyHtmlTemplate,
      whatsappTemplateId: data.whatsappTemplateId !== undefined ? data.whatsappTemplateId : existing.whatsappTemplateId,
      variables: data.variables !== undefined ? data.variables : existing.variables,
      metadata: data.metadata !== undefined ? data.metadata : existing.metadata,
      version: maxVersion + 1,
      isActive: true,
      createdBy: existing.createdBy,
      updatedBy: userId,
    });

    // Deactivate old versions
    await notificationTemplateRepository.deactivateOthers(
      newTemplate.type,
      newTemplate.channel,
      newTemplate.language,
      newTemplate._id,
    );

    await this._invalidateTemplateCache(newTemplate.type, newTemplate.channel, newTemplate.language);
    await cacheManager.del(`notif:template:id:${id}`);

    auditService.logEvent({
      eventType: 'notification_template.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: {
        previousTemplateId: id,
        newTemplateId: newTemplate._id,
        type: newTemplate.type,
        channel: newTemplate.channel,
        previousVersion: existing.version,
        newVersion: newTemplate.version,
      },
      module: 'notifications',
    });

    logger.info('Notification template updated (new version)', {
      module: 'notifications',
      action: 'updateTemplate',
      previousTemplateId: id,
      newTemplateId: newTemplate._id,
      version: newTemplate.version,
      userId,
    });

    return newTemplate;
  }

  async remove(id, userId, meta = {}) {
    const template = await notificationTemplateRepository.findById(id);
    if (!template) throw new NotFoundError('NotificationTemplate', id);

    await notificationTemplateRepository.softDelete(id);

    await this._invalidateTemplateCache(template.type, template.channel, template.language);
    await cacheManager.del(`notif:template:id:${id}`);

    auditService.logEvent({
      eventType: 'notification_template.deleted',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { templateId: id, type: template.type, channel: template.channel },
      module: 'notifications',
    });

    logger.info('Notification template deleted', {
      module: 'notifications',
      action: 'removeTemplate',
      templateId: id,
      userId,
    });

    return { deleted: true };
  }

  async preview(id, sampleData = {}) {
    const template = await notificationTemplateRepository.findById(id);
    if (!template) throw new NotFoundError('NotificationTemplate', id);

    const subject = template.subjectTemplate
      ? this._renderTemplate(template.subjectTemplate, sampleData)
      : null;
    const body = this._renderTemplate(template.bodyTemplate, sampleData);
    const bodyHtml = template.bodyHtmlTemplate
      ? this._renderTemplate(template.bodyHtmlTemplate, sampleData)
      : null;

    return { subject, body, bodyHtml, template };
  }

  async render(type, channel, language, variables = {}) {
    const cacheKey = `notif:template:${type}:${channel}:${language}`;

    const template = await cacheManager.getOrSet(
      cacheKey,
      () => notificationTemplateRepository.findActive(type, channel, language),
      TEMPLATE_TTL,
    );

    if (!template) {
      return null;
    }

    try {
      const subject = template.subjectTemplate
        ? this._renderTemplate(template.subjectTemplate, variables)
        : null;
      const body = this._renderTemplate(template.bodyTemplate, variables);
      const bodyHtml = template.bodyHtmlTemplate
        ? this._renderTemplate(template.bodyHtmlTemplate, variables)
        : null;

      return {
        subject,
        body,
        bodyHtml,
        templateId: template._id,
        templateVersion: template.version,
      };
    } catch (err) {
      logger.error('Template rendering failed', {
        module: 'notifications',
        action: 'render',
        type,
        channel,
        language,
        error: err.message,
      });
      throw new AppError(
        `Template rendering failed: ${err.message}`,
        500,
        ERROR_CODES.NOTIF_TEMPLATE_RENDER_FAILED,
      );
    }
  }

  _renderTemplate(templateString, variables) {
    if (!templateString) return '';

    return templateString.replace(/\{\{([\w.]+)\}\}/g, (match, key) => {
      const parts = key.split('.');
      let value = variables;

      for (const part of parts) {
        if (value === null || value === undefined) return '';
        value = value[part];
      }

      if (value === null || value === undefined) return '';
      return String(value);
    });
  }

  async _invalidateTemplateCache(type, channel, language) {
    await cacheManager.del(`notif:template:${type}:${channel}:${language}`);
  }
}

const notificationTemplateService = new NotificationTemplateService();
export default notificationTemplateService;
