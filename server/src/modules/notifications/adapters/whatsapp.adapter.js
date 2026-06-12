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
      if (!this.phoneNumberId) {
        return { success: false, error: 'WHATSAPP_PHONE_NUMBER_ID is not configured' };
      }

      const body = content.whatsappTemplateId ? {
        messaging_product: 'whatsapp',
        to: delivery.recipientPhone,
        type: 'template',
        template: {
          name: content.whatsappTemplateId || 'generic_notification',
          language: { code: content.language || 'de' },
          components: content.templateComponents || [],
        },
      } : {
        messaging_product: 'whatsapp',
        to: delivery.recipientPhone,
        type: 'text',
        text: { body: content.text || content.body || '' },
      };

      const response = await fetch(`${this.apiUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error?.message || `WhatsApp API failed with ${response.status}`);
      }

      logger.info('WhatsApp notification sent', {
        module: 'notifications', channel: 'whatsapp',
        recipientPhone: delivery.recipientPhone ? `***${delivery.recipientPhone.slice(-4)}` : null,
      });

      return {
        success: true,
        providerMessageId: result.messages?.[0]?.id || `wa-${Date.now()}`,
      };
    } catch (err) {
      logger.error('WhatsApp delivery failed', { module: 'notifications', channel: 'whatsapp', error: { message: err.message } });
      return { success: false, error: err.message };
    }
  }
}

const whatsappAdapter = new WhatsAppAdapter();
export default whatsappAdapter;
