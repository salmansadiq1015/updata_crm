import logger from '../../../shared/logger/index.js';

const TEMPLATE_NOT_FOUND_CODES = new Set([132001, 132005, 100]);

function normalizePhoneNumber(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.startsWith('00')
    ? `+${raw.slice(2).replace(/\D/g, '')}`
    : raw.startsWith('+')
      ? `+${raw.slice(1).replace(/\D/g, '')}`
      : null;
  if (!normalized || !/^\+[1-9]\d{7,14}$/.test(normalized)) return null;
  return normalized;
}

class WhatsAppAdapter {
  constructor() {
    this.enabled = !!process.env.WHATSAPP_API_TOKEN;
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.accessToken = process.env.WHATSAPP_API_TOKEN || null;
  }

  async send(delivery, content) {
    if (!this.enabled) {
      logger.info('WhatsApp skipped (not configured)', { module: 'notifications', channel: 'whatsapp', deliveryId: delivery._id });
      return {
        success: false,
        permanent: true,
        provider: 'whatsapp',
        error: 'WHATSAPP_API_TOKEN is not configured',
      };
    }

    try {
      const recipientPhone = normalizePhoneNumber(delivery.recipientPhone);
      if (!recipientPhone) {
        return { success: false, permanent: true, provider: 'whatsapp', error: 'invalid_phone_number' };
      }

      if (!this.phoneNumberId) {
        return { success: false, permanent: true, provider: 'whatsapp', error: 'WHATSAPP_PHONE_NUMBER_ID is not configured' };
      }

      const body = content.whatsappTemplateId ? {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'template',
        template: {
          name: content.whatsappTemplateId || 'generic_notification',
          language: { code: content.language || 'de' },
          components: content.templateComponents || [],
        },
      } : {
        messaging_product: 'whatsapp',
        to: recipientPhone,
        type: 'text',
        text: { body: content.text || content.body || '' },
      };

      let response = await this._submitMessage(body);
      if (response.status === 401 && await this._refreshToken()) {
        response = await this._submitMessage(body);
      }

      const result = await response.json().catch(() => ({}));
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') || 0);
        return {
          success: false,
          permanent: false,
          provider: 'whatsapp',
          error: result.error?.message || 'rate_limited',
          retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : undefined,
        };
      }

      if (!response.ok) {
        const code = Number(result.error?.code || 0);
        return {
          success: false,
          permanent: TEMPLATE_NOT_FOUND_CODES.has(code) || response.status === 400,
          provider: 'whatsapp',
          error: result.error?.message || `WhatsApp API failed with ${response.status}`,
        };
      }

      logger.info('WhatsApp notification sent', {
        module: 'notifications', channel: 'whatsapp',
        recipientPhone: recipientPhone ? `***${recipientPhone.slice(-4)}` : null,
      });

      return {
        success: true,
        provider: 'whatsapp',
        providerMessageId: result.messages?.[0]?.id || `wa-${Date.now()}`,
      };
    } catch (err) {
      logger.error('WhatsApp delivery failed', { module: 'notifications', channel: 'whatsapp', error: { message: err.message } });
      return { success: false, error: err.message };
    }
  }

  async _submitMessage(body) {
    return fetch(`${this.apiUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
  }

  async _refreshToken() {
    const refreshUrl = process.env.WHATSAPP_TOKEN_REFRESH_URL;
    if (!refreshUrl) return false;
    try {
      const response = await fetch(refreshUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: process.env.WHATSAPP_CLIENT_ID,
          clientSecret: process.env.WHATSAPP_CLIENT_SECRET,
          refreshToken: process.env.WHATSAPP_REFRESH_TOKEN,
        }),
      });
      const result = await response.json().catch(() => ({}));
      const token = result.access_token || result.accessToken;
      if (!response.ok || !token) return false;
      this.accessToken = token;
      return true;
    } catch (err) {
      logger.warn('WhatsApp token refresh failed', {
        module: 'notifications',
        channel: 'whatsapp',
        error: { message: err.message },
      });
      return false;
    }
  }
}

const whatsappAdapter = new WhatsAppAdapter();
export default whatsappAdapter;
