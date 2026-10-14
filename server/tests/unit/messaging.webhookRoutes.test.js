import crypto from 'node:crypto';
import express from 'express';
import request from 'supertest';
import twilioSdk from 'twilio';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it, jest,
} from '@jest/globals';

const applyProviderEvent = jest.fn(async () => ({ accepted: true, matched: true }));
const suppressInbound = jest.fn(async () => ({ received: true, optOut: false }));
const unsubscribeEmail = jest.fn(async () => ({ unsubscribed: true }));

jest.unstable_mockModule('../../src/modules/messaging/messaging.service.js', () => ({
  default: { applyProviderEvent, suppressInbound, unsubscribeEmail },
}));

const originalEnv = {
  META_APP_SECRET: process.env.META_APP_SECRET,
  META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  TEXTBEE_WEBHOOK_SECRET: process.env.TEXTBEE_WEBHOOK_SECRET,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_WEBHOOK_PUBLIC_URL: process.env.TWILIO_WEBHOOK_PUBLIC_URL,
};

const metaSecret = 'meta-route-test-secret-2026';
const textBeeSecret = 'textbee-route-test-secret-2026';
const twilioSecret = 'twilio-route-test-secret-2026';
const twilioPublicUrl = 'https://crm.example.test/api/v1/webhooks/messaging/twilio';

let app;

beforeAll(async () => {
  process.env.META_APP_SECRET = metaSecret;
  process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'meta-verify-token';
  process.env.TEXTBEE_WEBHOOK_SECRET = textBeeSecret;
  process.env.TWILIO_AUTH_TOKEN = twilioSecret;
  process.env.TWILIO_WEBHOOK_PUBLIC_URL = twilioPublicUrl;

  const { default: messagingRoutes, messagingWebhookRoutes } = await import('../../src/modules/messaging/messaging.routes.js');
  const { responseEnvelope } = await import('../../src/shared/middleware/responseEnvelope.js');
  app = express();
  app.use(express.json({
    verify: (req, _res, buffer) => { req.rawBody = Buffer.from(buffer); },
  }));
  app.use(express.urlencoded({ extended: true }));
  app.use(responseEnvelope);
  app.use('/api/v1/messaging', messagingRoutes);
  app.use('/api/v1/webhooks/messaging', messagingWebhookRoutes);
});

afterAll(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

beforeEach(() => {
  applyProviderEvent.mockClear();
  suppressInbound.mockClear();
  unsubscribeEmail.mockClear();
});

describe('messaging webhook HTTP security boundary', () => {
  it('requires authentication before entering protected messaging routes', async () => {
    const response = await request(app).get('/api/v1/messaging/campaigns');

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NO_TOKEN' },
    });
  });

  it('rejects an invalid Meta signature before processing provider events', async () => {
    const response = await request(app)
      .post('/api/v1/webhooks/messaging/meta')
      .set('x-hub-signature-256', 'sha256=invalid')
      .send({ object: 'whatsapp_business_account', entry: [] });

    expect(response.status).toBe(401);
    expect(applyProviderEvent).not.toHaveBeenCalled();
    expect(suppressInbound).not.toHaveBeenCalled();
  });

  it('accepts a correctly signed Meta raw body and maps its delivery event', async () => {
    const rawBody = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ value: { statuses: [{ id: 'wamid.route-1', status: 'delivered', timestamp: '1791880000' }] } }] }],
    });
    const signature = `sha256=${crypto.createHmac('sha256', metaSecret).update(rawBody).digest('hex')}`;

    const response = await request(app)
      .post('/api/v1/webhooks/messaging/meta')
      .set('content-type', 'application/json')
      .set('x-hub-signature-256', signature)
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.text).toBe('EVENT_RECEIVED');
    expect(applyProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'meta_whatsapp', providerMessageId: 'wamid.route-1', status: 'delivered',
      eventKey: 'meta:wamid.route-1:delivered:1791880000',
    }));
  });

  it('rejects an invalid TextBee signature and accepts the exact signed raw body', async () => {
    const rawBody = JSON.stringify({
      webhookEvent: 'MESSAGE_DELIVERED', smsBatchId: 'batch-route-1', smsId: 'sms-route-1',
      idempotencyKey: 'event-route-1', deliveredAt: '2026-10-13T10:00:00.000Z',
    });
    const signature = crypto.createHmac('sha256', textBeeSecret).update(rawBody).digest('hex');

    const rejected = await request(app)
      .post('/api/v1/webhooks/messaging/textbee')
      .set('content-type', 'application/json')
      .set('x-signature', 'invalid')
      .send(rawBody);
    expect(rejected.status).toBe(401);
    expect(applyProviderEvent).not.toHaveBeenCalled();

    const accepted = await request(app)
      .post('/api/v1/webhooks/messaging/textbee')
      .set('content-type', 'application/json')
      .set('x-signature', signature)
      .send(rawBody);
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual({ received: true });
    expect(applyProviderEvent).toHaveBeenCalledTimes(1);
    expect(applyProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'textbee', providerMessageId: 'batch-route-1', status: 'delivered',
      eventKey: 'textbee:event-route-1',
    }));
  });

  it('validates Twilio form signatures against the configured external callback URL', async () => {
    const params = {
      MessageSid: 'SM-route-1', MessageStatus: 'delivered', To: '+12025550123', From: '+12025550100',
    };
    const signature = twilioSdk.getExpectedTwilioSignature(twilioSecret, twilioPublicUrl, params);

    const rejected = await request(app)
      .post('/api/v1/webhooks/messaging/twilio')
      .type('form')
      .set('x-twilio-signature', 'invalid')
      .send(params);
    expect(rejected.status).toBe(401);
    expect(applyProviderEvent).not.toHaveBeenCalled();

    const accepted = await request(app)
      .post('/api/v1/webhooks/messaging/twilio')
      .type('form')
      .set('x-twilio-signature', signature)
      .send(params);
    expect(accepted.status).toBe(200);
    expect(accepted.type).toMatch(/xml/);
    expect(accepted.text).toBe('<Response></Response>');
    expect(applyProviderEvent).toHaveBeenCalledTimes(1);
    expect(applyProviderEvent).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'twilio', providerMessageId: 'SM-route-1', status: 'delivered',
    }));
  });
});
