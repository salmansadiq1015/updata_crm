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
    documentId, documentIds, sourceModule, sourceRecordId,
    senderAddress, senderName, createdBy, meta: _meta = {},
  }) {
    const requestedDocumentIds = [...new Set([
      ...(documentId ? [documentId] : []),
      ...(Array.isArray(documentIds) ? documentIds : []),
    ].map((id) => id.toString()))];
    const attachments = await this._resolveAttachments(requestedDocumentIds);

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
      senderAddress,
      senderName: senderName || 'MB Boiler',
      status: 'QUEUED',
      createdBy,
    });

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

  async compose({ templateType, language = 'de', data, documentId }) {
    // Try to find email text from the document template textBlocks
    const DocumentTemplate = (await import('./documentTemplate.model.js')).default;
    const template = await DocumentTemplate.findOne({
      templateType,
      isActive: true,
      isDeleted: false,
    }).lean();

    let subject = `Dokument - MB Boiler`;
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

    const to = data.customerEmail ? [data.customerEmail] : [];

    return { to, subject, bodyHtml, bodyText, documentId };
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
