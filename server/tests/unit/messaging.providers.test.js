import crypto from 'node:crypto';
import twilioSdk from 'twilio';
import { describe, expect, it, jest } from '@jest/globals';
import { TextBeeSmsProvider } from '../../src/modules/messaging/providers/textbee.provider.js';
import { TwilioSmsProvider } from '../../src/modules/messaging/providers/twilio.provider.js';
import { MetaWhatsAppProvider } from '../../src/modules/messaging/providers/metaWhatsApp.provider.js';
import { ExistingEmailProvider } from '../../src/modules/messaging/providers/existingEmail.provider.js';
import { createTransporter } from '../../src/shared/mail/mail.js';
import { fallbackPolicyAllows, mayFallbackAfterSubmission } from '../../src/modules/messaging/smsRoutingPolicy.js';
import { normalizeProviderStatus } from '../../src/modules/messaging/messaging.constants.js';

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: {} });
const corruptSignature = (value) => `${value.slice(0, -1)}${value.endsWith('0') ? '1' : '0'}`;

describe('messaging providers and safe fallback', () => {
  it('records TextBee acceptance using the batch id without claiming delivery', async () => {
    const fetch = jest.fn(async () => response(200, { data: { success: true, smsBatchId: 'batch-1' } }));
    const provider = new TextBeeSmsProvider({ TEXTBEE_API_KEY: 'key', TEXTBEE_API_URL: 'https://api.textbee.dev' }, fetch);
    await expect(provider.send({ to: '+41791234567', text: 'Hello' })).resolves.toMatchObject({ outcome: 'accepted', providerMessageId: 'batch-1', providerStatus: 'queued' });
  });

  it('reconciles a TextBee batch to the matching recipient status', async () => {
    const fetch = jest.fn(async () => response(200, { data: {
      batch: { _id: 'batch-1', status: 'partial_success', deliveredCount: 1 },
      messages: [
        { recipient: '+41790000000', status: 'failed', updatedAt: '2026-10-12T10:00:00.000Z' },
        { recipient: '+41791234567', status: 'delivered', updatedAt: '2026-10-12T10:01:00.000Z' },
      ],
    } }));
    const provider = new TextBeeSmsProvider({
      TEXTBEE_API_KEY: 'key', TEXTBEE_DEVICE_ID: 'device-1', TEXTBEE_API_URL: 'https://api.textbee.dev',
    }, fetch);

    await expect(provider.reconcile({ providerMessageId: 'batch-1', to: '+41 79 123 45 67' })).resolves.toMatchObject({
      checked: true, found: true, status: 'delivered',
      details: { batchStatus: 'partial_success', deliveredCount: 1, messageStatus: 'delivered' },
    });
  });

  it('verifies TextBee raw-body signatures and rejects parsed-body substitutions', () => {
    const rawBody = Buffer.from('{"webhookEvent":"MESSAGE_DELIVERED","smsBatchId":"batch-1"}');
    const webhookSecret = 'webhook-secret-at-least-20-characters';
    const signature = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const provider = new TextBeeSmsProvider({ TEXTBEE_WEBHOOK_SECRET: webhookSecret });

    expect(provider.verifyWebhook(rawBody, signature)).toBe(true);
    expect(provider.verifyWebhook(Buffer.from('{"smsBatchId":"batch-1","webhookEvent":"MESSAGE_DELIVERED"}'), signature)).toBe(false);
    expect(provider.verifyWebhook(rawBody, corruptSignature(signature))).toBe(false);
  });

  it('allows fallback for a documented TextBee device rejection but not invalid content', async () => {
    const offline = new TextBeeSmsProvider(
      { TEXTBEE_API_KEY: 'key' },
      jest.fn(async () => response(400, { success: false, error: 'No enabled device found. Enable a device or pass a deviceId.' })),
    );
    const invalidContent = new TextBeeSmsProvider(
      { TEXTBEE_API_KEY: 'key' },
      jest.fn(async () => response(400, { success: false, error: 'Message is required' })),
    );

    await expect(offline.send({ to: '+41791234567', text: 'Hello' })).resolves.toMatchObject({
      outcome: 'rejected', safeToFallback: true, errorMessage: expect.stringMatching(/no enabled device/i),
    });
    await expect(invalidContent.send({ to: '+41791234567', text: '' })).resolves.toMatchObject({
      outcome: 'rejected', safeToFallback: false, errorMessage: 'Message is required',
    });
  });

  it('classifies a TextBee timeout as ambiguous and forbids Twilio fallback', async () => {
    const fetch = jest.fn(async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; });
    const provider = new TextBeeSmsProvider({ TEXTBEE_API_KEY: 'key' }, fetch);
    const result = await provider.send({ to: '+41791234567', text: 'Hello' });
    expect(result).toMatchObject({ outcome: 'ambiguous', safeToFallback: false });
    expect(mayFallbackAfterSubmission(result)).toBe(false);
  });

  it('does not treat TextBee timeout-like or 5xx responses as proof of non-acceptance', async () => {
    const unavailable = new TextBeeSmsProvider(
      { TEXTBEE_API_KEY: 'key' },
      jest.fn(async () => response(503, { message: 'Gateway temporarily unavailable' })),
    );
    const rateLimited = new TextBeeSmsProvider(
      { TEXTBEE_API_KEY: 'key' },
      jest.fn(async () => response(429, { message: 'Rate limited' })),
    );

    await expect(unavailable.send({ to: '+41791234567', text: 'Hello' })).resolves.toMatchObject({
      outcome: 'ambiguous', safeToFallback: false, errorCode: 'HTTP_503',
    });
    await expect(rateLimited.send({ to: '+41791234567', text: 'Hello' })).resolves.toMatchObject({
      outcome: 'rejected', safeToFallback: true, errorCode: 'HTTP_429',
    });
  });

  it('allows fallback only for an explicit safe rejection and matching admin policy', () => {
    expect(mayFallbackAfterSubmission({ outcome: 'rejected', safeToFallback: true })).toBe(true);
    expect(mayFallbackAfterSubmission({ outcome: 'rejected', safeToFallback: false })).toBe(false);
    expect(fallbackPolicyAllows({ enabled: true, allowedCountries: ['CH'], allowedPurposes: ['support'] }, { country: 'CH', purpose: 'support' })).toBe(true);
    expect(fallbackPolicyAllows({ enabled: true, allowedCountries: ['US'], allowedPurposes: ['support'] }, { country: 'CH', purpose: 'support' })).toBe(false);
  });

  it('supports direct Twilio SMS and verifies signed callbacks', async () => {
    const fetch = jest.fn(async () => response(201, { sid: 'SM123', status: 'queued' }));
    const env = { TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM_NUMBER: '+12015550123' };
    const provider = new TwilioSmsProvider(env, fetch);
    await expect(provider.send({ to: '+12015550124', text: 'Hello' })).resolves.toMatchObject({ outcome: 'accepted', providerMessageId: 'SM123' });
    const url = 'https://example.com/webhook';
    const params = { MessageSid: 'SM123', MessageStatus: 'delivered' };
    const signature = twilioSdk.getExpectedTwilioSignature('secret', url, params);
    expect(provider.verifyWebhook({ signature, url, params })).toBe(true);
    expect(provider.verifyWebhook({ signature: corruptSignature(signature), url, params })).toBe(false);

    const rawBody = Buffer.from('{"MessageSid":"SM123","MessageStatus":"delivered"}');
    const bodyHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const jsonUrl = `${url}?bodySHA256=${bodyHash}`;
    const jsonSignature = twilioSdk.getExpectedTwilioSignature('secret', jsonUrl, {});
    expect(provider.verifyWebhook({
      signature: jsonSignature, url: jsonUrl, params: JSON.parse(rawBody.toString()),
      rawBody, contentType: 'application/json; charset=utf-8',
    })).toBe(true);
    expect(provider.verifyWebhook({
      signature: jsonSignature, url: jsonUrl, params: {}, rawBody: Buffer.from('{}'), contentType: 'application/json',
    })).toBe(false);
  });

  it('sends a Twilio WhatsApp fallback only with an approved Content SID mapping', async () => {
    const fetch = jest.fn(async () => response(201, { sid: 'SM-WA-1', status: 'queued' }));
    const provider = new TwilioSmsProvider({
      TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_WHATSAPP_FROM: '+14155238886',
    }, fetch);
    const result = await provider.sendWhatsAppTemplate({
      to: '+41791234567', contentSid: `HX${'a'.repeat(32)}`,
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }],
    });
    expect(result).toMatchObject({ provider: 'twilio_whatsapp', outcome: 'accepted', providerMessageId: 'SM-WA-1' });
    const body = new URLSearchParams(fetch.mock.calls[0][1].body);
    expect(body.get('To')).toBe('whatsapp:+41791234567');
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('ContentVariables')).toBe('{"1":"Ada"}');
  });

  it('keeps a Twilio WhatsApp timeout ambiguous and therefore unsafe to retry', async () => {
    const fetch = jest.fn(async () => { const error = new Error('timeout'); error.name = 'TimeoutError'; throw error; });
    const provider = new TwilioSmsProvider({
      TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_WHATSAPP_FROM: '+14155238886',
    }, fetch);
    await expect(provider.sendWhatsAppTemplate({ to: '+41791234567', contentSid: `HX${'a'.repeat(32)}` }))
      .resolves.toMatchObject({ provider: 'twilio_whatsapp', outcome: 'ambiguous', safeToFallback: false });
  });

  it('checks Twilio account health and reconciles an exact message SID', async () => {
    const fetch = jest.fn(async (url) => {
      if (String(url).endsWith('/Accounts/AC123.json')) return response(200, { sid: 'AC123', status: 'active' });
      return response(200, {
        sid: 'SM123', status: 'undelivered', error_code: 30003, error_message: 'Unreachable handset',
        price: '-0.0075', price_unit: 'usd', date_updated: '2026-10-12T10:02:00.000Z', num_segments: '1',
      });
    });
    const provider = new TwilioSmsProvider({
      TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'secret', TWILIO_FROM_NUMBER: '+12015550123',
    }, fetch);

    await expect(provider.health()).resolves.toMatchObject({ configured: true, reachable: true, eligible: true });
    await expect(provider.reconcile({ providerMessageId: 'SM123' })).resolves.toMatchObject({
      checked: true, found: true, status: 'undelivered',
      cost: { amount: 0.0075, currency: 'USD' },
      details: { errorCode: 30003, errorMessage: 'Unreachable handset', numSegments: 1 },
    });
  });

  it('sends only an approved-template-shaped Meta request and returns the WAMID', async () => {
    const fetch = jest.fn(async () => response(200, { messages: [{ id: 'wamid.1', message_status: 'accepted' }] }));
    const provider = new MetaWhatsAppProvider({ META_WHATSAPP_ACCESS_TOKEN: 'token', META_WHATSAPP_PHONE_NUMBER_ID: '123', META_GRAPH_API_VERSION: 'v23.0' }, fetch);
    const result = await provider.sendTemplate({ to: '+41791234567', templateName: 'intro', language: 'en_US', components: [] });
    expect(result).toMatchObject({ outcome: 'accepted', providerMessageId: 'wamid.1' });
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request).toMatchObject({ type: 'template', template: { name: 'intro', language: { code: 'en_US' } } });
  });

  it('distinguishes definite Meta rejection from an ambiguous network outcome', async () => {
    const rejectedProvider = new MetaWhatsAppProvider(
      { META_WHATSAPP_ACCESS_TOKEN: 'token', META_WHATSAPP_PHONE_NUMBER_ID: '123', META_GRAPH_API_VERSION: 'v23.0' },
      jest.fn(async () => response(400, { error: { code: 132001, message: 'Template does not exist' } })),
    );
    const ambiguousProvider = new MetaWhatsAppProvider(
      { META_WHATSAPP_ACCESS_TOKEN: 'token', META_WHATSAPP_PHONE_NUMBER_ID: '123', META_GRAPH_API_VERSION: 'v23.0' },
      jest.fn(async () => { throw new Error('connection reset'); }),
    );
    await expect(rejectedProvider.sendTemplate({ to: '+41791234567', templateName: 'intro', language: 'en_US' }))
      .resolves.toMatchObject({ outcome: 'rejected', safeToFallback: true });
    await expect(ambiguousProvider.sendTemplate({ to: '+41791234567', templateName: 'intro', language: 'en_US' }))
      .resolves.toMatchObject({ outcome: 'ambiguous', safeToFallback: false });
  });

  it('normalizes verified email delivery and bounce evidence', () => {
    expect(normalizeProviderStatus('existing_email', 'delivered')).toBe('delivered');
    expect(normalizeProviderStatus('existing_email', 'bounced')).toBe('failed');
  });

  it('verifies the real email transport before reporting it healthy', async () => {
    const verify = jest.fn(async () => true);
    const provider = new ExistingEmailProvider({
      SMTP_MAIL: 'sender@example.test', SMTP_PASSWORD: 'secret', SMTP_HOST: 'smtp.example.test',
    }, verify);

    await expect(provider.health()).resolves.toEqual({
      configured: true, reachable: true, eligible: true, reason: null,
    });
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it('distinguishes reachable SMTP authentication failure from a network timeout', async () => {
    const env = { SMTP_MAIL: 'sender@example.test', SMTP_PASSWORD: 'wrong', SMTP_SERVICE: 'gmail' };
    const authError = Object.assign(new Error('credentials rejected'), { code: 'EAUTH', responseCode: 535 });
    const timeoutError = Object.assign(new Error('connection timed out'), { code: 'ETIMEDOUT' });

    await expect(new ExistingEmailProvider(env, jest.fn(async () => { throw authError; })).health()).resolves.toMatchObject({
      configured: true, reachable: true, eligible: false, reason: 'authentication_failed',
    });
    await expect(new ExistingEmailProvider(env, jest.fn(async () => { throw timeoutError; })).health()).resolves.toMatchObject({
      configured: true, reachable: false, eligible: false, reason: 'timeout',
    });
  });

  it('validates SMTP certificates by default and requires an explicit private-server override', () => {
    const base = {
      SMTP_MAIL: 'sender@example.test', SMTP_PASSWORD: 'secret',
      SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_SERVICE: '',
    };
    const secure = createTransporter(base);
    const privateServer = createTransporter({ ...base, SMTP_TLS_REJECT_UNAUTHORIZED: 'false' });

    expect(secure.options.tls.rejectUnauthorized).toBe(true);
    expect(privateServer.options.tls.rejectUnauthorized).toBe(false);
    secure.close();
    privateServer.close();
  });

  it('synchronizes approved template definitions from the configured Meta WABA', async () => {
    const fetch = jest.fn(async () => response(200, { data: [{ name: 'intro', language: 'en_US', status: 'APPROVED', category: 'MARKETING', components: [] }] }));
    const provider = new MetaWhatsAppProvider({
      META_WHATSAPP_ACCESS_TOKEN: 'token', META_WHATSAPP_PHONE_NUMBER_ID: '123',
      META_WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba-1', META_GRAPH_API_VERSION: 'v23.0',
    }, fetch);
    await expect(provider.listTemplates()).resolves.toEqual([expect.objectContaining({ name: 'intro', status: 'APPROVED' })]);
    expect(fetch.mock.calls[0][0]).toContain('/waba-1/message_templates?');
  });
});
