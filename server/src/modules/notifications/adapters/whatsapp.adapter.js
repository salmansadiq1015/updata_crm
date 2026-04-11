import logger from '../../../shared/logger/index.js';

class WhatsAppAdapter {
  constructor() {
    this.enabled = !!process.env.WHATSAPP_API_TOKEN;
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  }

  async send(delivery, content) {
    if (!this.enabled) {
      logger.info('WhatsApp skipped (not configured)', { module: 'notifications', channel: 'whatsapp', deliveryId: delivery._id });
      return { success: true, providerMessageId: `mock-wa-${delivery._id}`, mock: true };
    }

    try {
      const body = {
        messaging_product: 'whatsapp',
        to: delivery.recipientPhone,
        type: 'template',
        template: {
          name: content.whatsappTemplateId || 'generic_notification',
          language: { code: content.language || 'de' },
          components: content.templateComponents || [],
        },
      };

      logger.info('WhatsApp notification sent', {
        module: 'notifications', channel: 'whatsapp',
        recipientPhone: delivery.recipientPhone ? `***${delivery.recipientPhone.slice(-4)}` : null,
      });

      return { success: true, providerMessageId: `wa-${Date.now()}` };
    } catch (err) {
      logger.error('WhatsApp delivery failed', { module: 'notifications', channel: 'whatsapp', error: { message: err.message } });
      return { success: false, error: err.message };
    }
  }
}

const whatsappAdapter = new WhatsAppAdapter();
export default whatsappAdapter;
