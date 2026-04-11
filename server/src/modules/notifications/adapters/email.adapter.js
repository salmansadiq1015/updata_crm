import logger from '../../../shared/logger/index.js';

class EmailAdapter {
  async send(delivery, content) {
    try {
      const sendMail = (await import('../../../shared/mail/mail.js')).default;

      await sendMail({
        email: delivery.recipientEmail,
        subject: content.subject || 'Benachrichtigung',
        template: 'notificationGeneric.ejs',
        data: {
          title: content.subject || '',
          body: content.bodyHtml || content.body || '',
          deepLink: content.deepLink || null,
          recipientName: content.recipientName || '',
        },
      });

      logger.info('Email notification sent', {
        module: 'notifications', channel: 'email',
        recipientEmail: delivery.recipientEmail,
        deliveryId: delivery._id?.toString(),
      });

      return { success: true, providerMessageId: `email-${Date.now()}` };
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
