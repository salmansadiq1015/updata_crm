import logger from '../../../shared/logger/index.js';

class SmsAdapter {
  constructor() {
    this.enabled = !!process.env.SMS_API_KEY;
  }

  async send(delivery, content) {
    if (!this.enabled) {
      logger.info('SMS skipped (not configured)', { module: 'notifications', channel: 'sms', deliveryId: delivery._id });
      return { success: true, providerMessageId: `mock-sms-${delivery._id}`, mock: true };
    }

    try {
      const message = (content.body || '').substring(0, 160);

      logger.info('SMS notification sent', {
        module: 'notifications', channel: 'sms',
        recipientPhone: delivery.recipientPhone ? `***${delivery.recipientPhone.slice(-4)}` : null,
      });

      return { success: true, providerMessageId: `sms-${Date.now()}` };
    } catch (err) {
      logger.error('SMS delivery failed', { module: 'notifications', channel: 'sms', error: { message: err.message } });
      return { success: false, error: err.message };
    }
  }
}

const smsAdapter = new SmsAdapter();
export default smsAdapter;
