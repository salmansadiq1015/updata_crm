import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const WIDGET_CONFIG_TTL = { l1Ttl: 120, l2Ttl: 600 };
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

let widgetSubmissionRepository;
let widgetConfigRepository;

async function getSubmissionRepo() {
  if (!widgetSubmissionRepository) {
    const mod = await import('./widgetSubmission.repository.js');
    widgetSubmissionRepository = mod.default;
  }
  return widgetSubmissionRepository;
}

async function getConfigRepo() {
  if (!widgetConfigRepository) {
    const mod = await import('./widgetConfig.repository.js');
    widgetConfigRepository = mod.default;
  }
  return widgetConfigRepository;
}

class WidgetSubmissionService {
  async submit(data, meta = {}) {
    const configRepo = await getConfigRepo();
    const widgetConfig = await configRepo.findByWidgetId(data.widgetId || 'default');

    if (widgetConfig && widgetConfig.captchaEnabled && widgetConfig.captchaSecretKey) {
      await this._verifyCaptcha(
        data.captchaToken,
        widgetConfig.captchaSecretKey,
        widgetConfig.captchaScoreThreshold || 0.5,
        meta.ipAddress,
      );
    }

    const submissionRepo = await getSubmissionRepo();

    const recentFromIp = await submissionRepo.countByIpInLastHour(meta.ipAddress);
    const rateLimitPerHour = (widgetConfig && widgetConfig.rateLimitPerHour) || 10;
    if (recentFromIp >= rateLimitPerHour) {
      throw new AppError(
        'Too many submissions from this IP address',
        429,
        ERROR_CODES.WIDGET_RATE_LIMIT_EXCEEDED,
      );
    }

    let processingStatus = 'pending';
    let isDuplicate = false;

    if (data.email) {
      const recentByEmail = await submissionRepo.findRecentByEmail(
        data.email,
        data.requestType,
        24,
      );
      if (recentByEmail) {
        processingStatus = 'duplicate';
        isDuplicate = true;
      }
    }

    const referenceNumber = await submissionRepo.generateReferenceNumber();

    const submission = await submissionRepo.create({
      widgetId: data.widgetId || 'default',
      referenceNumber,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone,
      company: data.company,
      requestType: data.requestType,
      message: data.message,
      customFields: data.customFields || {},
      sourceUrl: data.sourceUrl || meta.referer || null,
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
      processingStatus,
      consentGiven: data.consentGiven || false,
      consentTimestamp: data.consentGiven ? new Date() : null,
    });

    eventBus.publish(
      EVENT_TYPES.WIDGET_SUBMISSION_RECEIVED,
      {
        submissionId: submission._id,
        referenceNumber,
        widgetId: data.widgetId || 'default',
        requestType: data.requestType,
        email: data.email,
        isDuplicate,
      },
      { source: 'integrations:widget' },
    );

    logger.info('Widget submission received', {
      module: 'integrations',
      action: 'widget.submit',
      submissionId: submission._id,
      referenceNumber,
      processingStatus,
    });

    const confirmationMessage = isDuplicate
      ? 'We have already received a similar request. Our team will review it shortly.'
      : 'Thank you for your submission. We will get back to you shortly.';

    return {
      submissionId: submission._id,
      referenceNumber,
      confirmationMessage,
    };
  }

  async getById(id) {
    const repo = await getSubmissionRepo();
    const submission = await repo.findById(id);
    if (!submission) throw new NotFoundError('WidgetSubmission', id);
    return submission;
  }

  async list(queryParams = {}) {
    const { cursor, limit = 25, sortBy = 'createdAt', sortOrder = 'desc', ...filters } = queryParams;
    const repo = await getSubmissionRepo();
    return repo.findWithCursor({
      cursor,
      limit,
      sortBy,
      sortOrder,
      filters,
    });
  }

  async markProcessed(id, { crmContactId, orderId } = {}, userId, meta = {}) {
    const repo = await getSubmissionRepo();
    const submission = await repo.findById(id);
    if (!submission) throw new NotFoundError('WidgetSubmission', id);

    const updateData = {
      processingStatus: 'processed',
      processedAt: new Date(),
      processedBy: userId,
    };
    if (crmContactId) updateData.crmContactId = crmContactId;
    if (orderId) updateData.orderId = orderId;

    const updated = await repo.updateById(id, updateData);

    eventBus.publish(
      EVENT_TYPES.WIDGET_SUBMISSION_PROCESSED,
      {
        submissionId: id,
        referenceNumber: submission.referenceNumber,
        crmContactId: crmContactId || null,
        orderId: orderId || null,
        processedBy: userId,
      },
      { source: 'integrations:widget' },
    );

    auditService.logEvent({
      eventType: 'widget.submission.processed',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { submissionId: id, referenceNumber: submission.referenceNumber, crmContactId, orderId },
      module: 'integrations',
    });

    logger.info('Widget submission processed', {
      module: 'integrations',
      action: 'widget.process',
      submissionId: id,
    });

    return updated;
  }

  async getConfig(widgetId) {
    const cacheKey = `integ:widget:config:${widgetId}`;
    return cacheManager.getOrSet(
      cacheKey,
      async () => {
        const configRepo = await getConfigRepo();
        return configRepo.findByWidgetId(widgetId);
      },
      WIDGET_CONFIG_TTL,
    );
  }

  /**
   * Return public-safe subset of the widget config (strips secret keys).
   */
  async getPublicConfig(widgetId) {
    const config = await this.getConfig(widgetId || 'default');
    if (!config) return null;
    return {
      widgetId: config.widgetId,
      branding: config.branding || {},
      fields: config.fields || {},
      requestTypes: (config.requestTypes || []).filter((rt) => rt.isActive !== false),
      confirmationMessageDe: config.confirmationMessageDe || null,
      languages: config.languages || [],
    };
  }

  async updateConfig(widgetId, data, userId, meta = {}) {
    const configRepo = await getConfigRepo();
    const updated = await configRepo.upsertByWidgetId(widgetId, {
      ...data,
      updatedBy: userId,
    });

    await cacheManager.del(`integ:widget:config:${widgetId}`);

    auditService.logEvent({
      eventType: 'widget.config.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { widgetId, changedFields: Object.keys(data) },
      module: 'integrations',
    });

    logger.info('Widget config updated', {
      module: 'integrations',
      action: 'widget.config.update',
      widgetId,
    });

    return updated;
  }

  async _verifyCaptcha(token, secretKey, scoreThreshold, ipAddress) {
    if (!token) {
      throw new AppError(
        'CAPTCHA token is required',
        400,
        ERROR_CODES.WIDGET_CAPTCHA_FAILED,
      );
    }

    try {
      const params = new URLSearchParams({
        secret: secretKey,
        response: token,
      });
      if (ipAddress) {
        params.append('remoteip', ipAddress);
      }

      const response = await fetch(RECAPTCHA_VERIFY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      const result = await response.json();

      if (!result.success) {
        logger.warn('CAPTCHA verification failed', {
          module: 'integrations',
          action: 'widget.captcha',
          errorCodes: result['error-codes'],
        });
        throw new AppError(
          'CAPTCHA verification failed',
          400,
          ERROR_CODES.WIDGET_CAPTCHA_FAILED,
        );
      }

      if (typeof result.score === 'number' && result.score < scoreThreshold) {
        logger.warn('CAPTCHA score below threshold', {
          module: 'integrations',
          action: 'widget.captcha',
          score: result.score,
          threshold: scoreThreshold,
        });
        throw new AppError(
          'CAPTCHA score too low, submission rejected as spam',
          400,
          ERROR_CODES.WIDGET_CAPTCHA_FAILED,
        );
      }
    } catch (err) {
      if (err.code === ERROR_CODES.WIDGET_CAPTCHA_FAILED) throw err;

      logger.error('CAPTCHA verification request failed', {
        module: 'integrations',
        action: 'widget.captcha',
        error: err.message,
      });
      throw new AppError(
        'CAPTCHA verification service unavailable',
        502,
        ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      );
    }
  }
}

const widgetSubmissionService = new WidgetSubmissionService();
export default widgetSubmissionService;
