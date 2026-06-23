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
const DUPLICATE_WINDOW_HOURS = 24;
const DUPLICATE_DESCRIPTION_PREFIX_LENGTH = 160;
const SYSTEM_USER_ID = new mongoose.Types.ObjectId('000000000000000000000000');

const MAX_ATTACHMENTS = 1;
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

let widgetSubmissionRepository;
let widgetConfigRepository;
let fileService;

async function getSubmissionRepo() {
  if (!widgetSubmissionRepository) {
    const mod = await import('./widgetSubmission.repository.js');
    widgetSubmissionRepository = mod.default;
  }
  return widgetSubmissionRepository;
}

async function getFileService() {
  if (!fileService) {
    const mod = await import('../files/file.service.js');
    fileService = mod.default;
  }
  return fileService;
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
    this._validateConfiguredFields(normalized, widgetConfig);

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

    const recentByContact = await submissionRepo.findRecentByContact({
      email: normalized.contactEmail,
      phone: normalized.contactPhone,
      requestType: normalized.requestType,
      hoursBack: DUPLICATE_WINDOW_HOURS,
    });
    const duplicate = recentByContact.find((submission) =>
      this._isSimilarDescription(submission.description, normalized.description),
    );

    const referenceNumber = await submissionRepo.generateReferenceNumber();

    let submission = await submissionRepo.create({
      widgetId: normalized.widgetId,
      referenceNumber,
      contactName: normalized.contactName,
      contactEmail: normalized.contactEmail,
      contactPhone: normalized.contactPhone,
      contactAddress: normalized.contactAddress,
      requestType: normalized.requestType,
      priority: normalized.priority,
      description: normalized.description,
      preferredWindow: normalized.preferredWindow,
      captchaScore,
      sourceUrl: data.sourceUrl || meta.referer || null,
      ipAddress: meta.ipAddress || null,
      userAgent: meta.userAgent || null,
      language: normalized.language,
      processingStatus: duplicate ? 'duplicate' : 'pending',
      duplicateOf: duplicate?._id || null,
    });

    const [crmLink, assignedTo] = await Promise.all([
      duplicate ? Promise.resolve(null) : this._createCrmServiceRequest(submission, normalized, meta),
      this._getDispatcherRecipientIds(),
    ]);
    if (crmLink?.contactId) {
      submission = await submissionRepo.updateById(submission._id, {
        crmContactId: crmLink.contactId,
      });
    }

    // AC-12: urgent requests escalate to a high-priority notification when the
    // request type is a heating failure OR the caller flagged it as high priority.
    const isHighPriority = normalized.requestType === 'heizungsstoerung' || normalized.priority === 'hoch';

    eventBus.publish(
      EVENT_TYPES.WIDGET_SUBMISSION_RECEIVED,
      {
        submissionId: submission._id,
        referenceNumber,
        widgetId: normalized.widgetId,
        requestType: normalized.requestType,
        priority: normalized.priority,
        isHighPriority,
        contactEmail: normalized.contactEmail,
        contactPhone: normalized.contactPhone,
        crmCustomerId: crmLink?.customerId || null,
        crmContactId: crmLink?.contactId || null,
        assignedTo,
        isDuplicate: Boolean(duplicate),
        duplicateOf: duplicate?._id || null,
      },
      { source: 'integrations:widget' },
    );

    // AC-10: send confirmation email to the submitting customer (non-fatal).
    await this._sendConfirmationEmail({
      contactEmail: normalized.contactEmail,
      contactName: normalized.contactName,
      contactPhone: normalized.contactPhone,
      referenceNumber,
      requestType: normalized.requestType,
      description: normalized.description,
      preferredWindow: normalized.preferredWindow,
    });

    logger.info('Widget submission received', {
      module: 'integrations',
      action: 'widget.submit',
      submissionId: submission._id,
      referenceNumber,
      processingStatus: submission.processingStatus,
      duplicateOf: duplicate?._id || null,
    });

    return {
      submissionId: submission._id,
      referenceNumber,
      isDuplicate: Boolean(duplicate),
      duplicateOf: duplicate?._id || null,
      confirmationMessage: widgetConfig?.confirmationMessageDe
        || 'Ihre Anfrage wurde erfolgreich uebermittelt. Wir melden uns innerhalb von 24 Stunden.',
    };
  }

  /**
   * Send the customer-facing confirmation email (AC-10).
   * Non-fatal: a mail failure (including unconfigured SMTP transport) is
   * logged as a warning and never breaks submission creation.
   */
  async _sendConfirmationEmail(data) {
    if (!data.contactEmail) return;
    try {
      const { default: sendMail } = await import('../../shared/mail/mail.js');
      await sendMail({
        email: data.contactEmail,
        subject: `Ihre Anfrage ${data.referenceNumber} ist eingegangen`,
        template: 'widgetSubmissionConfirmation.ejs',
        data: {
          contactName: data.contactName || 'Kunde',
          contactPhone: data.contactPhone || null,
          referenceNumber: data.referenceNumber,
          requestType: data.requestType,
          description: data.description,
          preferredWindow: data.preferredWindow || null,
        },
      });
    } catch (err) {
      logger.warn('Failed to send widget submission confirmation email', {
        module: 'integrations',
        action: 'widget.confirmation_email',
        referenceNumber: data.referenceNumber,
        error: err.message,
      });
    }
  }

  async getById(id) {
    const repo = await getSubmissionRepo();
    const submission = await repo.findById(id);
    if (!submission) throw new NotFoundError('WidgetSubmission', id);
    return submission;
  }

  /**
   * Upload a single photo attachment for a widget submission.
   * Accepts a multer file object ({ buffer, originalname, mimetype, size })
   * or the normalized shape ({ buffer, originalName, mimeType, sizeBytes, uploadedBy }).
   * Spec limits: max 1 attachment, max 10 MB, JPEG/PNG only.
   */
  async uploadAttachment(submissionId, file = {}) {
    const buffer = file.buffer;
    const originalName = file.originalName || file.originalname || 'attachment';
    const mimeType = file.mimeType || file.mimetype || 'application/octet-stream';
    const sizeBytes = file.sizeBytes ?? file.size ?? (buffer ? buffer.length : 0);
    const uploadedBy = file.uploadedBy || SYSTEM_USER_ID;

    if (!buffer) {
      throw new AppError('No file provided', 400, ERROR_CODES.VALIDATION_ERROR);
    }

    if (sizeBytes > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new AppError(
        'Attachment exceeds the maximum allowed size of 10 MB',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(mimeType)) {
      throw new AppError(
        'Only JPEG and PNG image uploads are accepted',
        400,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const repo = await getSubmissionRepo();
    const submission = await repo.findById(submissionId);
    if (!submission) throw new NotFoundError('WidgetSubmission', submissionId);

    if ((submission.attachments?.length || 0) >= MAX_ATTACHMENTS) {
      throw new AppError(
        'A photo has already been uploaded for this submission (max 1)',
        409,
        ERROR_CODES.VALIDATION_ERROR,
      );
    }

    const files = await getFileService();
    const fileMetadata = await files.upload({
      buffer,
      originalName,
      mimeType,
      sizeBytes,
      module: 'integrations',
      entityType: 'widget_submission',
      entityId: submissionId,
      uploadedBy,
      bucket: 'general',
    });

    await repo.pushAttachment(submissionId, {
      fileId: fileMetadata._id,
      key: fileMetadata.key,
      originalName: fileMetadata.originalName,
      mimeType: fileMetadata.mimeType,
      sizeBytes: fileMetadata.sizeBytes,
    });

    logger.info('Widget submission attachment uploaded', {
      module: 'integrations',
      action: 'widget.attachment.upload',
      submissionId,
      fileId: fileMetadata._id,
    });

    return fileMetadata;
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
      confirmationMessageFr: config.confirmationMessageFr || null,
      confirmationMessageIt: config.confirmationMessageIt || null,
      languages: config.languages || [],
      maxFilesPerSubmission: config.maxFilesPerSubmission || MAX_ATTACHMENTS,
      maxFileSizeMb: config.maxFileSizeMb || 10,
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
      contactEmail: String(contact.email || data.contactEmail || data.email || '').trim().toLowerCase() || null,
      contactPhone: contact.phone || data.contactPhone || data.phone || null,
      contactAddress: {
        street: contactAddress.street || null,
        zip: contactAddress.zip || null,
        city: contactAddress.city || null,
      },
      requestType: data.requestType,
      priority: data.priority || 'mittel',
      description: data.description || data.message,
      preferredWindow: data.preferredWindow || null,
      captchaToken: data.captchaToken || null,
      language: data.language || data.locale || 'de',
    };
  }

  _validateConfiguredFields(normalized, widgetConfig) {
    const fields = widgetConfig?.fields || {};
    const requiredVisible = (key, fallback = false) => {
      const cfg = fields[key];
      if (!cfg) return fallback;
      return cfg.visible !== false && cfg.required === true;
    };

    const errors = [];
    if (requiredVisible('contactName', true) && !normalized.contactName) {
      errors.push({ field: 'contact.name', message: 'Contact name is required' });
    }
    if (requiredVisible('contactEmail') && !normalized.contactEmail) {
      errors.push({ field: 'contact.email', message: 'Contact email is required' });
    }
    if (requiredVisible('contactPhone') && !normalized.contactPhone) {
      errors.push({ field: 'contact.phone', message: 'Contact phone is required' });
    }
    if (requiredVisible('contactAddress')) {
      const address = normalized.contactAddress || {};
      if (!address.street && !address.zip && !address.city) {
        errors.push({ field: 'contact.address', message: 'Contact address is required' });
      }
    }
    if (requiredVisible('preferredWindow') && !normalized.preferredWindow) {
      errors.push({ field: 'preferredWindow', message: 'Preferred appointment window is required' });
    }

    if (errors.length > 0) {
      throw new AppError(
        'Widget submission is missing required configured fields',
        400,
        ERROR_CODES.VALIDATION_ERROR,
        errors,
      );
    }
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

      // AC-8: match an existing contact/customer by email first, then fall back
      // to phone/mobile when email is absent or did not match.
      const matchEmail = normalized.contactEmail || null;
      const matchPhone = normalized.contactPhone || null;

      let contact = matchEmail ? await Contact.findOne({ email: matchEmail }).lean() : null;
      if (!contact && matchPhone) {
        contact = await Contact.findOne({
          $or: [{ phone: matchPhone }, { mobile: matchPhone }],
        }).lean();
      }

      let customer = null;
      if (contact) {
        customer = await Customer.findById(contact.customerId).lean();
      } else if (matchEmail) {
        customer = await Customer.findOne({ email: matchEmail }).lean();
      }
      if (!customer && matchPhone) {
        customer = await Customer.findOne({
          $or: [{ phone: matchPhone }, { mobile: matchPhone }],
        }).lean();
      }

      if (!customer) {
        const customerNumber = await counterService.getNextCustomerNumber();
        customer = await Customer.create({
          customerNumber,
          name: normalized.contactName,
          type: 'private',
          street: normalized.contactAddress.street,
          postalCode: normalized.contactAddress.zip,
          city: normalized.contactAddress.city,
          phone: matchPhone,
          email: matchEmail,
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
          phone: matchPhone,
          email: matchEmail,
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
