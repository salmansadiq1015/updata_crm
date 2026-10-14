import crypto from 'node:crypto';
import { accepted, ambiguous, rejected } from './providerResult.js';

const PROVIDER = 'meta_whatsapp';

export class MetaWhatsAppProvider {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    this.fetch = fetchImpl;
    this.accessToken = env.META_WHATSAPP_ACCESS_TOKEN || env.WHATSAPP_API_TOKEN || '';
    this.phoneNumberId = env.META_WHATSAPP_PHONE_NUMBER_ID || env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.wabaId = env.META_WHATSAPP_BUSINESS_ACCOUNT_ID || '';
    this.appSecret = env.META_APP_SECRET || '';
    this.verifyToken = env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN || '';
    this.graphVersion = env.META_GRAPH_API_VERSION || '';
    this.timeoutMs = Number(env.META_WHATSAPP_TIMEOUT_MS || 15000);
  }

  get configured() { return Boolean(this.accessToken && this.phoneNumberId && this.graphVersion); }

  async health() {
    if (!this.configured) return { configured: false, reachable: false, eligible: false, reason: 'not_configured' };
    try {
      const response = await this.fetch(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}?fields=id,display_phone_number,verified_name`, {
        headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(this.timeoutMs),
      });
      return { configured: true, reachable: response.ok, eligible: response.ok, reason: response.ok ? null : `http_${response.status}` };
    } catch { return { configured: true, reachable: false, eligible: false, reason: 'unreachable' }; }
  }

  async sendTemplate({ to, templateName, language, components = [] }) {
    if (!this.configured) return rejected(PROVIDER, { message: 'Meta WhatsApp is not configured', code: 'NOT_CONFIGURED', permanent: true });
    if (!templateName || !language) return rejected(PROVIDER, { message: 'An approved WhatsApp template and language are required', code: 'TEMPLATE_REQUIRED', permanent: true });
    let response;
    try {
      response = await this.fetch(`https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp', recipient_type: 'individual', to,
          type: 'template', template: { name: templateName, language: { code: language }, components },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return ambiguous(PROVIDER, error?.name === 'TimeoutError' ? 'Meta submission timed out' : 'Meta submission connection failed');
    }
    const json = await response.json().catch(() => ({}));
    const messageId = json.messages?.[0]?.id;
    if (response.ok && messageId) return accepted(PROVIDER, messageId, json.messages?.[0]?.message_status || 'accepted', { responseStatus: response.status });
    return rejected(PROVIDER, {
      message: json.error?.message || `Meta rejected the request (${response.status})`,
      code: json.error?.code || `HTTP_${response.status}`,
      status: response.status,
      permanent: response.status >= 400 && response.status < 500 && response.status !== 429,
      // A concrete non-2xx Graph response is evidence that this submission was
      // rejected. Network errors above remain ambiguous and never fall back.
      safeToFallback: true,
    });
  }

  async listTemplates() {
    if (!this.configured || !this.wabaId) throw new Error('Meta WABA template synchronization is not configured');
    const templates = [];
    let url = `https://graph.facebook.com/${this.graphVersion}/${this.wabaId}/message_templates?fields=name,language,status,category,components&limit=100`;
    for (let page = 0; url && page < 10; page += 1) {
      const response = await this.fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(this.timeoutMs),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error?.message || `Meta template sync failed (${response.status})`);
      templates.push(...(Array.isArray(json.data) ? json.data : []));
      url = json.paging?.next || null;
    }
    return templates;
  }

  verifyChallenge(mode, token) {
    return mode === 'subscribe' && Boolean(this.verifyToken) && token === this.verifyToken;
  }

  verifySignature(rawBody, signature) {
    if (!this.appSecret || !rawBody || !signature?.startsWith('sha256=')) return false;
    const expected = `sha256=${crypto.createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`;
    const left = Buffer.from(expected);
    const right = Buffer.from(signature);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }
}

export default new MetaWhatsAppProvider();
