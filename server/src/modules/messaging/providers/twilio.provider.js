import twilioSdk from 'twilio';
import { accepted, ambiguous, rejected } from './providerResult.js';

const PROVIDER = 'twilio';

export class TwilioSmsProvider {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    this.fetch = fetchImpl;
    this.accountSid = env.TWILIO_ACCOUNT_SID || '';
    this.authToken = env.TWILIO_AUTH_TOKEN || '';
    this.from = env.TWILIO_FROM_NUMBER || '';
    this.messagingServiceSid = env.TWILIO_MESSAGING_SERVICE_SID || '';
    this.statusCallback = env.TWILIO_STATUS_CALLBACK_URL || '';
    this.whatsappFrom = env.TWILIO_WHATSAPP_FROM || '';
    this.whatsappMessagingServiceSid = env.TWILIO_WHATSAPP_MESSAGING_SERVICE_SID || '';
    this.whatsappStatusCallback = env.TWILIO_WHATSAPP_STATUS_CALLBACK_URL || this.statusCallback;
    this.timeoutMs = Number(env.TWILIO_TIMEOUT_MS || 15000);
  }

  get whatsappConfigured() {
    return Boolean(this.accountSid && this.authToken && (this.whatsappFrom || this.whatsappMessagingServiceSid));
  }

  get configured() {
    return Boolean(this.accountSid && this.authToken && (this.from || this.messagingServiceSid));
  }

  async health() {
    return this._accountHealth(this.configured);
  }

  async whatsappHealth() {
    return this._accountHealth(this.whatsappConfigured);
  }

  async _accountHealth(configured) {
    if (!configured) return { configured: false, reachable: false, eligible: false, reason: 'not_configured' };
    try {
      const response = await this.fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}.json`, {
        headers: { Authorization: this._authorization() }, signal: AbortSignal.timeout(this.timeoutMs),
      });
      const json = await response.json().catch(() => ({}));
      const active = response.ok && (!json.status || json.status === 'active');
      return {
        configured: true, reachable: response.ok, eligible: active,
        reason: active ? null : (response.ok ? `account_${json.status || 'ineligible'}` : `http_${response.status}`),
      };
    } catch (error) {
      return { configured: true, reachable: false, eligible: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
    }
  }

  _authorization() {
    return `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`;
  }

  async send({ to, text }) {
    if (!this.configured) return rejected(PROVIDER, { message: 'Twilio SMS is not configured', code: 'NOT_CONFIGURED', permanent: true });
    const form = new URLSearchParams({ To: to, Body: text });
    if (this.messagingServiceSid) form.set('MessagingServiceSid', this.messagingServiceSid);
    else form.set('From', this.from);
    if (this.statusCallback) form.set('StatusCallback', this.statusCallback);

    let response;
    try {
      response = await this.fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: this._authorization(),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return ambiguous(PROVIDER, error?.name === 'TimeoutError' ? 'Twilio submission timed out' : 'Twilio submission connection failed');
    }
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.sid) {
      return accepted(PROVIDER, json.sid, json.status || 'queued', {
        responseStatus: response.status,
        cost: json.price ? { amount: Math.abs(Number(json.price)), currency: String(json.price_unit || 'USD').toUpperCase() } : undefined,
      });
    }
    return rejected(PROVIDER, {
      message: json.message || `Twilio rejected the request (${response.status})`,
      code: json.code || `HTTP_${response.status}`,
      status: response.status,
      permanent: response.status >= 400 && response.status < 500 && response.status !== 429,
      safeToFallback: false,
    });
  }

  async sendWhatsAppTemplate({ to, contentSid, components = [] }) {
    const provider = 'twilio_whatsapp';
    if (!this.whatsappConfigured) return rejected(provider, { message: 'Twilio WhatsApp fallback is not configured', code: 'NOT_CONFIGURED', permanent: true });
    if (!contentSid) return rejected(provider, { message: 'A mapped Twilio Content Template SID is required', code: 'CONTENT_SID_REQUIRED', permanent: true });
    const textParameters = components.flatMap((component) => component.parameters || [])
      .filter((parameter) => parameter.type === 'text').map((parameter) => parameter.text);
    const variables = Object.fromEntries(textParameters.map((value, index) => [String(index + 1), String(value)]));
    const destination = String(to).startsWith('whatsapp:') ? String(to) : `whatsapp:${to}`;
    const form = new URLSearchParams({ To: destination, ContentSid: contentSid });
    if (textParameters.length) form.set('ContentVariables', JSON.stringify(variables));
    if (this.whatsappMessagingServiceSid) form.set('MessagingServiceSid', this.whatsappMessagingServiceSid);
    else form.set('From', String(this.whatsappFrom).startsWith('whatsapp:') ? this.whatsappFrom : `whatsapp:${this.whatsappFrom}`);
    if (this.whatsappStatusCallback) form.set('StatusCallback', this.whatsappStatusCallback);
    let response;
    try {
      response = await this.fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
        method: 'POST',
        headers: { Authorization: this._authorization(), 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(), signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return ambiguous(provider, error?.name === 'TimeoutError' ? 'Twilio WhatsApp submission timed out' : 'Twilio WhatsApp submission connection failed');
    }
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.sid) return accepted(provider, json.sid, json.status || 'queued', { responseStatus: response.status });
    return rejected(provider, {
      message: json.message || `Twilio WhatsApp rejected the request (${response.status})`,
      code: json.code || `HTTP_${response.status}`, status: response.status,
      permanent: response.status >= 400 && response.status < 500 && response.status !== 429,
    });
  }

  async reconcile({ providerMessageId }) {
    if (!providerMessageId || !this.configured) {
      return { checked: false, found: false, reason: 'not_configured' };
    }
    try {
      const response = await this.fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages/${encodeURIComponent(providerMessageId)}.json`,
        { headers: { Authorization: this._authorization() }, signal: AbortSignal.timeout(this.timeoutMs) },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          checked: true, found: false, reason: response.status === 404 ? 'not_found' : `http_${response.status}`,
          responseStatus: response.status,
        };
      }
      const occurredAt = json.date_updated || json.date_sent || json.date_created || null;
      return {
        checked: true, found: true, status: String(json.status || '').toLowerCase() || null,
        occurredAt, evidenceKey: `${json.status || 'unchanged'}:${occurredAt || json.sid || providerMessageId}`,
        cost: json.price == null ? null : {
          amount: Math.abs(Number(json.price)), currency: String(json.price_unit || 'USD').toUpperCase(),
        },
        details: {
          errorCode: json.error_code || null, errorMessage: json.error_message || null,
          numSegments: json.num_segments == null ? null : Number(json.num_segments),
        },
      };
    } catch (error) {
      return {
        checked: false, found: false,
        reason: error?.name === 'TimeoutError' ? 'timeout' : 'unreachable',
      };
    }
  }

  verifyWebhook({ signature, url, params, rawBody, contentType = '' }) {
    if (!signature || !this.authToken || !url) return false;
    try {
      if (String(contentType).toLowerCase().includes('application/json')) {
        if (!Buffer.isBuffer(rawBody)) return false;
        return twilioSdk.validateRequestWithBody(this.authToken, String(signature), url, rawBody.toString('utf8'));
      }
      return twilioSdk.validateRequest(this.authToken, String(signature), url, params || {});
    } catch {
      return false;
    }
  }
}

export default new TwilioSmsProvider();
