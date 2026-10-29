import emailRecordRepository from './emailRecord.repository.js';
import auditService from '../auth/audit.service.js';
import queueManager from '../../shared/queue/QueueManager.js';
import eventBus from '../../shared/events/EventBus.js';
import EVENT_TYPES from '../../shared/events/eventTypes.js';
import logger from '../../shared/logger/index.js';
import { NotFoundError, ConflictError } from '../../shared/errors/AppError.js';

class EmailService {
  async send({
    to, cc, bcc, subject, bodyHtml, bodyText,
    documentId, documentIds, fileAttachments, sourceModule, sourceRecordId,
    senderAddress, senderName, createdBy, meta: _meta = {},
  }) {
    const requestedDocumentIds = [...new Set([
      ...(documentId ? [documentId] : []),
      ...(Array.isArray(documentIds) ? documentIds : []),
    ].map((id) => id.toString()))];
    const attachments = [
      ...await this._resolveAttachments(requestedDocumentIds),
      ...await this._resolveFileAttachments(fileAttachments),
    ];
    const sender = await this._resolveSender({ senderAddress, senderName });

    // Create EmailRecord with status QUEUED
    const emailRecord = await emailRecordRepository.create({
      documentId: documentId || null,
      sourceModule,
      sourceRecordId,
      to,
      cc: cc || [],
      bcc: bcc || [],
      subject,
      bodyHtml,
      bodyText: bodyText || '',
      attachments,
      senderAddress: sender.senderAddress,
      senderName: sender.senderName,
      status: 'QUEUED',
      createdBy,
    });

    // Lead communication tracking: an email sent for a lead stamps that lead's
    // "last contacted" marker. Best-effort and isolated — a failure here must
    // never fail the email send. Lazy import avoids a doctpl ↔ crm module cycle.
    if (sourceModule === 'lead' && sourceRecordId) {
      try {
        const { default: Lead } = await import('../crm/lead.model.js');
        const contactedAt = new Date();
        await Lead.updateOne(
          { _id: sourceRecordId },
          { $set: { lastContactedAt: contactedAt, lastContactChannel: 'email' } },
        );
        const { default: leadSlaService } = await import('../crm/leadSla.service.js');
        await leadSlaService.recordFirstResponse(sourceRecordId, { at: contactedAt, channel: 'email' });
      } catch (err) {
        logger.warn('Could not stamp lead lastContactedAt after email send (ignored)', {
          module: 'doctpl',
          action: 'email.send',
          sourceRecordId,
          error: { message: err.message },
        });
      }
    }

    // Enqueue email dispatch job
    await queueManager.addJob('email-dispatch', `email-${emailRecord._id}`, {
      emailRecordId: emailRecord._id.toString(),
    });

    // Publish event
    eventBus.publish(EVENT_TYPES.DOCTPL_EMAIL_QUEUED, {
      emailRecordId: emailRecord._id,
      to,
      subject,
      sourceModule,
      sourceRecordId,
    }, { source: 'doctpl:email' });

    logger.info('Email queued', {
      module: 'doctpl',
      action: 'email.send',
      emailRecordId: emailRecord._id,
      to,
      sourceModule,
      sourceRecordId,
    });

    return emailRecord;
  }

  async _resolveSender({ senderAddress, senderName }) {
    if (senderAddress && senderName) return { senderAddress, senderName };

    const { default: CIConfiguration } = await import('./ciConfiguration.model.js');
    const ciConfig = await CIConfiguration
      .findOne({ isActive: true })
      .select('companyName companyDetails.email')
      .lean();

    return {
      senderAddress: senderAddress || ciConfig?.companyDetails?.email || process.env.COMPANY_EMAIL || process.env.SMTP_MAIL || undefined,
      // Keep public email branding independent from the legal/document
      // company identity stored in CIConfiguration.
      senderName: senderName || process.env.SMTP_FROM_NAME || ciConfig?.companyName || 'Updata.ai',
    };
  }

  async _resolveAttachments(documentIds = []) {
    if (!documentIds.length) return [];

    const { default: generatedDocumentRepository } = await import('./generatedDocument.repository.js');
    const attachments = [];

    for (const id of documentIds) {
      const doc = await generatedDocumentRepository.findById(id);
      if (!doc) throw new NotFoundError('GeneratedDocument', id);
      attachments.push({
        documentId: doc._id,
        fileId: doc.fileId,
        fileName: doc.fileName,
        fileUrl: '',
      });
    }

    return attachments;
  }

  // Resolve attachments that reference an already-stored file directly by its
  // FileMetadata id (uploaded object/project documents). The dispatch job pulls
  // the file from storage by fileId, so no re-upload is needed.
  async _resolveFileAttachments(fileAttachments = []) {
    if (!Array.isArray(fileAttachments) || !fileAttachments.length) return [];

    const { default: FileMetadata } = await import('../files/file.model.js');
    const attachments = [];
    for (const item of fileAttachments) {
      const file = await FileMetadata.findById(item.fileId).select('originalName').lean();
      if (!file) throw new NotFoundError('FileMetadata', item.fileId);
      attachments.push({
        documentId: null,
        fileId: item.fileId,
        fileName: item.fileName || file.originalName || 'attachment',
        fileUrl: '',
      });
    }
    return attachments;
  }

  async compose({ templateType, language = 'de', data, documentId }) {
    // Try to find email text from the document template textBlocks
    const DocumentTemplate = (await import('./documentTemplate.model.js')).default;
    const template = await DocumentTemplate.findOne({
      templateType,
      isActive: true,
      isDeleted: false,
    }).lean();

    let subject = `Dokument - Updata`;
    let bodyHtml = '<p>Bitte finden Sie das Dokument im Anhang.</p>';
    let bodyText = 'Bitte finden Sie das Dokument im Anhang.';

    if (template?.textBlocks?.[language]) {
      const block = template.textBlocks[language];
      if (block.emailSubject) {
        subject = block.emailSubject
          .replace(/\{\{documentNumber\}\}/g, data.documentNumber || '')
          .replace(/\{\{customerName\}\}/g, data.customerName || data.customer?.name || '');
      }
      if (block.emailBody) {
        bodyHtml = block.emailBody
          .replace(/\{\{documentNumber\}\}/g, data.documentNumber || '')
          .replace(/\{\{customerName\}\}/g, data.customerName || data.customer?.name || '');
        bodyText = bodyHtml.replace(/<[^>]*>/g, '');
      }
    }

    const recipient = await this._resolveRecipient(data);
    const to = recipient ? [recipient] : [];

    return { to, subject, bodyHtml, bodyText, documentId };
  }

  // Resolves the recipient address, preferring an explicit customerEmail and
  // falling back to a CRM customer lookup so the compose form can be pre-filled
  // from system data (DOC-008).
  async _resolveRecipient(data = {}) {
    const explicit = data.customerEmail || data.customer?.email;
    if (explicit) return explicit;

    const customerId = data.customerId || data.customer?._id || data.customer?.id;
    if (!customerId) return null;

    try {
      const { default: Customer } = await import('../crm/customer.model.js');
      const customer = await Customer.findById(customerId).select('email').lean();
      return customer?.email || null;
    } catch {
      return null;
    }
  }

  async getById(id) {
    const record = await emailRecordRepository.findById(id);
    if (!record) throw new NotFoundError('EmailRecord', id);
    return record;
  }

  async list(queryParams) {
    const { cursor, limit, sortBy, sortOrder, ...filters } = queryParams;
    return emailRecordRepository.findWithCursor({
      cursor, limit, sortBy, sortOrder, filters,
    });
  }

  async retry(id, userId, meta = {}) {
    const record = await emailRecordRepository.findById(id);
    if (!record) throw new NotFoundError('EmailRecord', id);

    if (!['FAILED', 'BOUNCED'].includes(record.status)) {
      throw new ConflictError('Only FAILED or BOUNCED emails can be retried');
    }

    const EmailRecord = (await import('./emailRecord.model.js')).default;
    await EmailRecord.updateOne({ _id: id }, { $set: { status: 'QUEUED' }, $inc: { retryCount: 1 } });

    // Re-enqueue dispatch job
    await queueManager.addJob('email-dispatch', `email-retry-${id}-${Date.now()}`, {
      emailRecordId: id.toString(),
    });

    auditService.logEvent({
      eventType: 'email.retried',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { emailRecordId: id, retryCount: record.retryCount + 1 },
      module: 'doctpl',
    });

    logger.info('Email retry queued', {
      module: 'doctpl',
      action: 'email.retry',
      emailRecordId: id,
    });

    return emailRecordRepository.findById(id);
  }
}

const emailService = new EmailService();
export default emailService;
