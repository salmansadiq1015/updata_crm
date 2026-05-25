import mongoose from 'mongoose';
import cacheManager from '../../shared/cache/CacheManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import auditService from '../auth/audit.service.js';
import { AppError, NotFoundError } from '../../shared/errors/AppError.js';
import ERROR_CODES from '../../shared/errors/errorCodes.js';
import logger from '../../shared/logger/index.js';

const WIDGET_CONFIG_TTL = { l1Ttl: 120, l2Ttl: 600 };
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';
const DEFAULT_WIDGET_ID = 'default';
const DEFAULT_WIDGET_RATE_LIMIT_PER_HOUR = 20;
const DUPLICATE_WINDOW_HOURS = 1;
const DUPLICATE_DESCRIPTION_PREFIX_LENGTH = 160;
const SYSTEM_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

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
    const normalized = this._normalizeSubmissionPayload(data);
    const configRepo = await getConfigRepo();
    const widgetConfig = await configRepo.findByWidgetId(normalized.widgetId);

    let captchaScore = null;
    const captchaConfig = widgetConfig?.captcha;
    if (captchaConfig?.secretKey) {
      captchaScore = await this._verifyCaptcha(
        normalized.captchaToken,
        captchaConfig.secretKey,
        captchaConfig.threshold ?? 0.5,
        meta.ipAddress,
      );
    }

    const submissionRepo = await getSubmissionRepo();

    const recentFromIp = await submissionRepo.countByIpInLastHour(meta.ipAddress);
    const rateLimitPerHour = widgetConfig?.rateLimitPerHour || DEFAULT_WIDGET_RATE_LIMIT_PER_HOUR;
    if (recentFromIp >= rateLimitPerHour) {
      throw new AppError(
        'Too many submissions from this IP address',
        429,
        ERROR_CODES.WIDGET_RATE_LIMIT_EXCEEDED,
      );
    }

    const recentByEmail = await submissionRepo.findRecentByEmail(
      normalized.contactEmail,
      normalized.requestType,
      DUPLICATE_WINDOW_HOURS,
    );
    const duplicate = recentByEmail.find((submission) =>
      this._isSimilarDescription(submission.description, normalized.description),
    );
    if (duplicate) {
      throw new AppError(
        'A similar request has already been received from this email address',
        409,
        ERROR_CODES.WIDGET_SUBMISSION_DUPLICATE,
        [{ field: 'contact.email', duplicateSubmissionId: duplicate._id }],
      );
    }

    const referenceNumber = await submissionRepo.generateReferenceNumber();

    let submission = await submissionRepo.create({
      widgetId: normalized.widgetId,
      referenceNumber,
      contactName: normalized.contactName,
      contactEmail: normalized.contactEmail,
      contactPhone: normalized.contactPhone,
      contactAddress: normalized.contactAddress,
      requestType: normalized.requestType,
      description: normalized.description,
      preferredWindow: normalized.preferredWindow,
      captchaScore,
      sourceUrl: data.sourceUrl || meta.referer || null,
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
      language: normalized.language,
      processingStatus: 'pending',
    });

    const [crmLink, assignedTo] = await Promise.all([
      this._createCrmServiceRequest(submission, normalized, meta),
      this._getDispatcherRecipientIds(),
    ]);
    if (crmLink?.contactId) {
      submission = await submissionRepo.updateById(submission._id, {
        crmContactId: crmLink.contactId,
      });
    }

    eventBus.publish(
      EVENT_TYPES.WIDGET_SUBMISSION_RECEIVED,
      {
        submissionId: submission._id,
        referenceNumber,
        widgetId: normalized.widgetId,
        requestType: normalized.requestType,
        contactEmail: normalized.contactEmail,
        crmCustomerId: crmLink?.customerId || null,
        crmContactId: crmLink?.contactId || null,
        assignedTo,
        isDuplicate: false,
      },
      { source: 'integrations:widget' },
    );

    logger.info('Widget submission received', {
      module: 'integrations',
      action: 'widget.submit',
      submissionId: submission._id,
      referenceNumber,
      processingStatus: submission.processingStatus,
    });

    return {
      submissionId: submission._id,
      referenceNumber,
      confirmationMessage: widgetConfig?.confirmationMessageDe
        || 'Ihre Anfrage wurde erfolgreich uebermittelt. Wir melden uns innerhalb von 24 Stunden.',
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
    const resolvedWidgetId = widgetId || DEFAULT_WIDGET_ID;
    const configRepo = await getConfigRepo();
    const updated = await configRepo.upsert(resolvedWidgetId, {
      ...data,
      updatedBy: userId,
    });

    await cacheManager.del(`integ:widget:config:${resolvedWidgetId}`);

    auditService.logEvent({
      eventType: 'widget.config.updated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { widgetId: resolvedWidgetId, changedFields: Object.keys(data) },
      module: 'integrations',
    });

    logger.info('Widget config updated', {
      module: 'integrations',
      action: 'widget.config.update',
      widgetId: resolvedWidgetId,
    });

    return updated;
  }

  _normalizeSubmissionPayload(data) {
    const contact = data.contact || {};
    const contactAddress = contact.address || {};
    return {
      widgetId: data.widgetId || DEFAULT_WIDGET_ID,
      contactName: contact.name || data.contactName || [data.firstName, data.lastName].filter(Boolean).join(' '),
      contactEmail: String(contact.email || data.contactEmail || data.email || '').trim().toLowerCase(),
      contactPhone: contact.phone || data.contactPhone || data.phone || null,
      contactAddress: {
        street: contactAddress.street || null,
        zip: contactAddress.zip || null,
        city: contactAddress.city || null,
      },
      requestType: data.requestType,
      description: data.description || data.message,
      preferredWindow: data.preferredWindow || null,
      captchaToken: data.captchaToken || null,
      language: data.language || 'de',
    };
  }

  _isSimilarDescription(existingDescription, newDescription) {
    const normalize = (value) => String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .slice(0, DUPLICATE_DESCRIPTION_PREFIX_LENGTH);
    const existing = normalize(existingDescription);
    const incoming = normalize(newDescription);
    return Boolean(existing && incoming && existing === incoming);
  }

  async _createCrmServiceRequest(submission, normalized, meta = {}) {
    try {
      const [{ default: Customer }, { default: Contact }, { default: EntityNote }, { default: counterService }] =
        await Promise.all([
          import('../crm/customer.model.js'),
          import('../crm/contact.model.js'),
          import('../crm/entityNote.model.js'),
          import('../crm/counter.service.js'),
        ]);

      let contact = await Contact.findOne({ email: normalized.contactEmail }).lean();
      let customer = contact
        ? await Customer.findById(contact.customerId).lean()
        : await Customer.findOne({ email: normalized.contactEmail }).lean();

      if (!customer) {
        const customerNumber = await counterService.getNextCustomerNumber();
        customer = await Customer.create({
          customerNumber,
          name: normalized.contactName,
          type: 'private',
          street: normalized.contactAddress.street,
          postalCode: normalized.contactAddress.zip,
          city: normalized.contactAddress.city,
          phone: normalized.contactPhone,
          email: normalized.contactEmail,
          notes: `Website widget request ${submission.referenceNumber}`,
          createdBy: SYSTEM_USER_ID,
        });
      }

      if (!contact) {
        const nameParts = this._splitContactName(normalized.contactName);
        contact = await Contact.create({
          customerId: customer._id,
          firstName: nameParts.firstName,
          lastName: nameParts.lastName,
          phone: normalized.contactPhone,
          email: normalized.contactEmail,
          isPrimary: true,
          notes: `Created from website widget request ${submission.referenceNumber}`,
        });
      }

      await EntityNote.create({
        entityType: 'customer',
        entityId: customer._id,
        text: this._buildServiceRequestNote(submission, normalized, meta),
        category: normalized.requestType === 'heizungsstoerung' ? 'warning' : 'general',
        isPinned: true,
        isWarning: normalized.requestType === 'heizungsstoerung',
        authorId: SYSTEM_USER_ID,
        editableUntil: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });

      return {
        customerId: customer._id,
        contactId: contact._id,
      };
    } catch (err) {
      logger.error('Failed to create CRM service request from widget submission', {
        module: 'integrations',
        action: 'widget.crm_link',
        submissionId: submission._id,
        error: err.message,
      });
      return null;
    }
  }

  async _getDispatcherRecipientIds() {
    const [{ default: Permission }, { default: Role }, { default: User }] = await Promise.all([
      import('../auth/permission.model.js'),
      import('../auth/role.model.js'),
      import('../auth/user.model.js'),
    ]);

    const permissions = await Permission.find({
      $or: [
        { module: 'scheduling', action: 'read' },
        { module: 'crm', action: 'write' },
      ],
    }).select('_id').lean();
    if (permissions.length === 0) return [];

    const roles = await Role.find({ permissions: { $in: permissions.map((permission) => permission._id) } })
      .select('_id')
      .lean();
    if (roles.length === 0) return [];

    const users = await User.find({
      role: { $in: roles.map((role) => role._id) },
      status: 'active',
    }).select('_id').lean();

    return users.map((user) => user._id);
  }

  _splitContactName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: 'Website', lastName: 'Kunde' };
    if (parts.length === 1) return { firstName: parts[0], lastName: 'Kunde' };
    return {
      firstName: parts.slice(0, -1).join(' '),
      lastName: parts[parts.length - 1],
    };
  }

  _buildServiceRequestNote(submission, normalized, meta) {
    const lines = [
      `Website service request ${submission.referenceNumber}`,
      `Type: ${normalized.requestType}`,
      `Preferred window: ${normalized.preferredWindow || 'not provided'}`,
      `Source IP: ${meta.ipAddress || 'unknown'}`,
      '',
      normalized.description,
    ];
    return lines.join('\n').slice(0, 2000);
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

      return typeof result.score === 'number' ? result.score : null;
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
