import logger from '../../../shared/logger/index.js';

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function normalizeAttachments(attachments = []) {
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return { attachments: [], oversized: false };
  }

  const totalBytes = attachments.reduce((sum, attachment) => sum + Number(attachment.sizeBytes || attachment.size || 0), 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    return { attachments: [], oversized: true };
  }

  return {
    oversized: false,
    attachments: attachments
      .filter((attachment) => attachment.content || attachment.path || attachment.href)
      .map((attachment) => ({
        filename: attachment.filename || attachment.fileName || 'attachment',
        content: attachment.content,
        path: attachment.path || attachment.href,
        contentType: attachment.contentType || attachment.mimeType,
      })),
  };
}

class EmailAdapter {
  async send(delivery, content) {
    try {
      if (!isValidEmail(delivery.recipientEmail)) {
        return { success: false, permanent: true, error: 'invalid_address' };
      }

      const sendMail = (await import('../../../shared/mail/mail.js')).default;
      const { attachments, oversized } = normalizeAttachments(content.attachments);
      const downloadLinks = Array.isArray(content.downloadLinks) ? content.downloadLinks : [];
      const body = [
        content.bodyHtml || content.body || '',
        oversized && downloadLinks.length > 0
          ? `<p>Attachments exceeded 10 MB. Secure download links: ${downloadLinks.map((link) => `<a href="${link.url || link.href}">${link.label || link.fileName || 'Download'}</a>`).join(', ')}</p>`
          : '',
      ].filter(Boolean).join('\n');

      await sendMail({
        email: delivery.recipientEmail,
        subject: content.subject || 'Benachrichtigung',
        template: 'notificationGeneric.ejs',
        data: {
          title: content.subject || '',
          body,
          deepLink: content.deepLink || null,
          recipientName: content.recipientName || '',
        },
        attachments: attachments.length > 0 ? attachments : undefined,
      });

      logger.info('Email notification sent', {
        module: 'notifications', channel: 'email',
        recipientEmail: delivery.recipientEmail,
        deliveryId: delivery._id?.toString(),
      });

      return { success: true, provider: 'email', providerMessageId: `email-${Date.now()}` };
    } catch (err) {
      logger.error('Email delivery failed', {
        module: 'notifications', channel: 'email',
        error: { message: err.message },
      });
      return { success: false, error: err.message };
    }
  }
}

const emailAdapter = new EmailAdapter();
export default emailAdapter;
