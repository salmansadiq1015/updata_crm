import { BaseWorker } from '../shared/queue/BaseWorker.js';
import eventBus from '../shared/events/EventBus.js';
import EVENT_TYPES from '../shared/events/eventTypes.js';
import logger from '../shared/logger/index.js';

/**
 * Email dispatch job.
 *
 * Fetches an EmailRecord by ID, builds the nodemailer message,
 * attaches any document files from S3, sends via SMTP transporter,
 * and updates the record status.
 */
export class EmailDispatchWorker extends BaseWorker {
  constructor() {
    super('email-dispatch');
  }

  async process(job) {
    const { emailRecordId } = job.data;

    const EmailRecord = (await import('../modules/doctpl/emailRecord.model.js')).default;
    const record = await EmailRecord.findById(emailRecordId);

    if (!record) {
      logger.warn('EmailRecord not found for dispatch', {
        module: 'jobs',
        action: 'email-dispatch',
        emailRecordId,
      });
      return { sent: false, reason: 'record_not_found' };
    }

    try {
      // Build nodemailer message
      const message = {
        to: record.to.join(', '),
        subject: record.subject,
        html: record.bodyHtml,
        text: record.bodyText || undefined,
      };

      if (record.cc?.length) message.cc = record.cc.join(', ');
      if (record.bcc?.length) message.bcc = record.bcc.join(', ');

      if (record.senderAddress) {
        message.from = `${record.senderName || 'MB Boiler'} <${record.senderAddress}>`;
      }

      // Fetch attachment buffers from S3 if any
      if (record.attachments?.length) {
        const { default: fileService } = await import('../modules/files/file.service.js');
        const attachments = [];

        for (const att of record.attachments) {
          if (att.documentId) {
            try {
              const downloadUrl = await fileService.getDownloadUrl(att.documentId);
              attachments.push({
                filename: att.fileName || 'attachment.pdf',
                path: downloadUrl,
              });
            } catch (err) {
              logger.warn('Failed to fetch attachment for email', {
                module: 'jobs',
                action: 'email-dispatch',
                emailRecordId,
                documentId: att.documentId,
                error: { message: err.message },
              });
            }
          }
        }

        if (attachments.length) {
          message.attachments = attachments;
        }
      }

      // Send via nodemailer transporter
      const sendMail = (await import('../shared/mail/mail.js')).default;
      const info = await sendMail({
        email: record.to[0],
        subject: record.subject,
        template: null,
        data: {},
        fromName: record.senderName || 'MB Boiler',
        attachments: message.attachments,
        // Override: send raw HTML directly
        _rawHtml: record.bodyHtml,
      });

      // Update record to SENT
      await EmailRecord.findByIdAndUpdate(emailRecordId, {
        $set: {
          status: 'SENT',
          sentAt: new Date(),
          externalId: info?.messageId || '',
        },
      });

      // Publish event
      eventBus.publish(EVENT_TYPES.DOCTPL_EMAIL_SENT, {
        emailRecordId,
        to: record.to,
        subject: record.subject,
        externalId: info?.messageId || '',
      }, { source: 'jobs:email-dispatch' });

      logger.info('Email dispatched successfully', {
        module: 'jobs',
        action: 'email-dispatch',
        emailRecordId,
        to: record.to,
      });

      return { sent: true, messageId: info?.messageId };
    } catch (err) {
      // Update record to FAILED
      await EmailRecord.findByIdAndUpdate(emailRecordId, {
        $set: {
          status: 'FAILED',
          errorMessage: err.message,
        },
      });

      eventBus.publish(EVENT_TYPES.DOCTPL_EMAIL_FAILED, {
        emailRecordId,
        error: err.message,
      }, { source: 'jobs:email-dispatch' });

      logger.error('Email dispatch failed', {
        module: 'jobs',
        action: 'email-dispatch',
        emailRecordId,
        error: { message: err.message, stack: err.stack },
      });

      return { sent: false, error: err.message };
    }
  }
}

export default EmailDispatchWorker;
