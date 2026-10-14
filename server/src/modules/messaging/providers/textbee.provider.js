import crypto from 'node:crypto';
import { accepted, ambiguous, rejected } from './providerResult.js';

const PROVIDER = 'textbee';

export class TextBeeSmsProvider {
  constructor(env = process.env, fetchImpl = globalThis.fetch) {
    this.fetch = fetchImpl;
    this.apiKey = env.TEXTBEE_API_KEY || '';
    this.deviceId = env.TEXTBEE_DEVICE_ID || '';
    this.webhookSecret = env.TEXTBEE_WEBHOOK_SECRET || '';
    this.baseUrl = (env.TEXTBEE_API_URL || 'https://api.textbee.dev').replace(/\/$/, '');
    this.timeoutMs = Number(env.TEXTBEE_TIMEOUT_MS || 15000);
  }

  verifyWebhook(rawBody, signature) {
    if (!this.webhookSecret || !Buffer.isBuffer(rawBody) || !signature) return false;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex');
    const received = String(signature).toLowerCase();
    const left = Buffer.from(expected);
    const right = Buffer.from(received);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  get configured() { return Boolean(this.apiKey); }

  async health() {
    if (!this.configured) return { configured: false, reachable: false, eligible: false, reason: 'not_configured' };
    try {
      const path = this.deviceId
        ? `/api/v1/gateway/devices/${encodeURIComponent(this.deviceId)}`
        : '/api/v1/gateway/devices';
      const response = await this.fetch(`${this.baseUrl}${path}`, {
        headers: { 'x-api-key': this.apiKey }, signal: AbortSignal.timeout(this.timeoutMs),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) return { configured: true, reachable: true, eligible: false, reason: `http_${response.status}` };
      const data = json.data;
      const device = Array.isArray(data)
        ? data.find((item) => item?._id === this.deviceId) || data.find((item) => item?.isDefault) || data[0]
        : data;
      if (!device) return { configured: true, reachable: true, eligible: false, reason: 'no_device' };
      if (device.enabled === false) return { configured: true, reachable: true, eligible: false, reason: 'device_disabled' };
      const lastHeartbeat = device.lastHeartbeat ? new Date(device.lastHeartbeat) : null;
      const stale = lastHeartbeat && Date.now() - lastHeartbeat.getTime() > 15 * 60 * 1000;
      return {
        configured: true, reachable: true, eligible: !stale,
        reason: stale ? 'device_offline' : null,
        device: {
          id: device._id, name: device.name || device.model || 'Android gateway',
          enabled: device.enabled !== false, lastHeartbeat: device.lastHeartbeat || null,
          batteryPercent: device.batteryInfo?.percentage ?? null,
          networkType: device.networkInfo?.networkType ?? null,
        },
      };
    } catch (error) {
      return { configured: true, reachable: false, eligible: false, reason: error?.name === 'TimeoutError' ? 'timeout' : 'unreachable' };
    }
  }

  async send({ to, text, scheduledAt = null }) {
    if (!this.configured) return rejected(PROVIDER, { message: 'TextBee is not configured', code: 'NOT_CONFIGURED', permanent: true, safeToFallback: true });
    const body = { recipients: [to], message: text };
    if (this.deviceId) body.deviceId = this.deviceId;
    if (scheduledAt) body.scheduledAt = scheduledAt;
    let response;
    try {
      response = await this.fetch(`${this.baseUrl}/api/v1/gateway/send-sms`, {
        method: 'POST',
        headers: { 'x-api-key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      // A network error can occur after the server accepted the body. Without a
      // provider id there is no safe proof that it was not queued.
      return ambiguous(PROVIDER, error?.name === 'TimeoutError' ? 'TextBee submission timed out' : 'TextBee submission connection failed');
    }

    const json = await response.json().catch(() => ({}));
    const data = json.data || json;
    if (response.ok && data?.success !== false && data?.smsBatchId) {
      return accepted(PROVIDER, data.smsBatchId, 'queued', { responseStatus: response.status });
    }

    const message = data?.error || data?.message || json?.error || json?.message || `TextBee rejected the request (${response.status})`;
    if ([408, 409, 500, 502, 503, 504].includes(response.status)) {
      // These responses do not provide strong enough evidence that submission
      // was never accepted. Treat them like a network ambiguity and reconcile
      // instead of risking a duplicate through another provider.
      return ambiguous(PROVIDER, message, json?.code || `HTTP_${response.status}`);
    }
    const permanent = [400, 401, 403, 404, 422].includes(response.status);
    const documentedGatewayRejection = response.status === 400
      && /no enabled device|device (?:is )?disabled|push(?:ed)? to (?:the )?phone|email (?:is )?not verified/i.test(message);
    // A documented 400 gateway/device rejection and 401/403/404/422/429 prove
    // that TextBee did not accept this request. Content/recipient validation
    // errors remain non-fallback failures so Twilio is not tried blindly.
    const safeToFallback = documentedGatewayRejection || [401, 403, 404, 422, 429].includes(response.status);
    return rejected(PROVIDER, {
      message, code: json?.code || `HTTP_${response.status}`, status: response.status,
      permanent, safeToFallback,
    });
  }

  async reconcile({ providerMessageId, to }) {
    if (!providerMessageId || !this.deviceId || !this.configured) {
      return { checked: false, found: false, reason: 'not_configured' };
    }
    try {
      const response = await this.fetch(
        `${this.baseUrl}/api/v1/gateway/devices/${encodeURIComponent(this.deviceId)}/sms-batch/${encodeURIComponent(providerMessageId)}`,
        { headers: { 'x-api-key': this.apiKey }, signal: AbortSignal.timeout(this.timeoutMs) },
      );
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          checked: true, found: false, reason: response.status === 404 ? 'not_found' : `http_${response.status}`,
          responseStatus: response.status,
        };
      }
      const data = json.data || json;
      const batch = data?.batch || data;
      const messages = Array.isArray(data?.messages) ? data.messages : [];
      const digits = (value) => String(value || '').replace(/\D/g, '');
      const requested = digits(to);
      const message = messages.find((item) => {
        const candidate = item.recipient || item.to || item.phoneNumber || item.phone;
        return requested && digits(candidate) === requested;
      }) || (messages.length === 1 ? messages[0] : null);
      const status = String(message?.status || batch?.status || '').toLowerCase() || null;
      const occurredAt = message?.updatedAt || message?.deliveredAt || message?.sentAt
        || message?.failedAt || message?.receivedAt || batch?.statusCheckedAt
        || batch?.completedAt || batch?.updatedAt || null;
      return {
        checked: true, found: true, status, occurredAt,
        evidenceKey: `${status || 'unchanged'}:${occurredAt || batch?._id || providerMessageId}`,
        details: {
          batchStatus: batch?.status || null,
          successCount: batch?.successCount ?? null,
          failureCount: batch?.failureCount ?? null,
          pendingCount: batch?.pendingCount ?? null,
          dispatchedCount: batch?.dispatchedCount ?? null,
          sentCount: batch?.sentCount ?? null,
          deliveredCount: batch?.deliveredCount ?? null,
          messageStatus: message?.status || null,
          errorCode: message?.errorCode || message?.error?.code || null,
          errorMessage: message?.errorMessage || message?.error?.message || null,
        },
      };
    } catch (error) {
      return {
        checked: false, found: false,
        reason: error?.name === 'TimeoutError' ? 'timeout' : 'unreachable',
      };
    }
  }
}

export default new TextBeeSmsProvider();
