import { describe, expect, test } from '@jest/globals';
import { buildMessagingReadiness } from '../../src/modules/messaging/messagingReadiness.js';

function baseSettings(overrides = {}) {
  return {
    providers: { emailEnabled: false, metaWhatsappEnabled: false, textbeeEnabled: true, twilioEnabled: false },
    smsFallback: { enabled: false, allowedCountries: [], allowedPurposes: ['support'], dailySpendLimit: 0, monthlySpendLimit: 0 },
    countryRouting: { textbeeAllowedCountries: ['CH'], twilioAllowedCountries: [], whatsappAllowedCountries: [] },
    quotas: { daily: 50, monthly: 300, perCampaign: 100 },
    quietHours: { enabled: false, timezone: 'UTC' },
    pricing: { textbeeCarrierPerSegment: 0.08, twilioDefaultPerSegment: 0, metaMarketingPerMessage: 0, metaUtilityPerMessage: 0, metaServicePerMessage: 0 },
    ...overrides,
  };
}

const queue = { waiting: 0, failed: 0 };
const textbeeEnv = {
  MESSAGE_DESTINATION_HASH_SECRET: 'destination-secret-at-least-16',
  TEXTBEE_API_KEY: 'configured-api-key',
  TEXTBEE_DEVICE_ID: 'device-id',
  TEXTBEE_WEBHOOK_SECRET: 'webhook-secret-at-least-20-characters',
};

describe('messaging deployment readiness', () => {
  test('passes a bounded TextBee-only deployment without exposing secret values', () => {
    const result = buildMessagingReadiness(baseSettings(), {
      textbee: { configured: true, reachable: true, eligible: true },
    }, textbeeEnv, queue);

    expect(result).toMatchObject({ ready: true, counts: { fail: 0 } });
    expect(JSON.stringify(result)).not.toContain('configured-api-key');
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'textbee-config', status: 'pass' }),
      expect.objectContaining({ id: 'provider-health-textbee', status: 'pass' }),
    ]));
  });

  test('blocks enabled providers when required secrets, HTTPS callbacks, or queue are missing', () => {
    const settings = baseSettings({
      providers: { emailEnabled: true, metaWhatsappEnabled: false, textbeeEnabled: false, twilioEnabled: true },
      countryRouting: { textbeeAllowedCountries: [], twilioAllowedCountries: ['CH'], whatsappAllowedCountries: [] },
      pricing: { textbeeCarrierPerSegment: 0, twilioDefaultPerSegment: 0.08, metaMarketingPerMessage: 0, metaUtilityPerMessage: 0, metaServicePerMessage: 0 },
    });
    const result = buildMessagingReadiness(settings, {
      email: { configured: false, reachable: false, eligible: false, reason: 'not_configured' },
      twilio: { configured: true, reachable: true, eligible: true },
    }, {
      MESSAGE_DESTINATION_HASH_SECRET: 'too-short',
      SMTP_MAIL: 'ops@example.test',
      SMTP_PASSWORD: '',
      MESSAGE_UNSUBSCRIBE_SECRET: '',
      MESSAGING_PUBLIC_API_URL: 'http://api.example.test',
      TWILIO_ACCOUNT_SID: 'AC123',
      TWILIO_AUTH_TOKEN: 'private-value-that-must-not-leak',
      TWILIO_FROM_NUMBER: '+15005550006',
      TWILIO_STATUS_CALLBACK_URL: 'https://api.example.test/webhooks/twilio',
      TWILIO_WEBHOOK_PUBLIC_URL: 'https://wrong.example.test/webhooks/twilio',
    }, null);

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'destination-hash-secret', status: 'fail' }),
      expect.objectContaining({ id: 'outbound-queue', status: 'fail' }),
      expect.objectContaining({ id: 'public-api-url', status: 'fail' }),
      expect.objectContaining({ id: 'twilio-callback', status: 'fail' }),
    ]));
    expect(JSON.stringify(result)).not.toContain('private-value-that-must-not-leak');
  });

  test('allows TextBee default-device sending but warns that polling needs an explicit device id', () => {
    const env = { ...textbeeEnv };
    delete env.TEXTBEE_DEVICE_ID;
    const result = buildMessagingReadiness(baseSettings(), {
      textbee: { configured: true, reachable: true, eligible: true },
    }, env, queue);

    expect(result.ready).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'textbee-config', status: 'pass' }),
      expect.objectContaining({ id: 'textbee-device', status: 'warn' }),
    ]));
  });

  test('requires an explicit country scope and positive spend caps for fallback', () => {
    const settings = baseSettings({
      providers: { emailEnabled: false, metaWhatsappEnabled: false, textbeeEnabled: true, twilioEnabled: true },
      smsFallback: { enabled: true, allowedCountries: [], allowedPurposes: ['support'], dailySpendLimit: 0, monthlySpendLimit: 0 },
      countryRouting: { textbeeAllowedCountries: ['CH'], twilioAllowedCountries: ['CH'], whatsappAllowedCountries: [] },
      pricing: { textbeeCarrierPerSegment: 0.08, twilioDefaultPerSegment: 0.1, metaMarketingPerMessage: 0, metaUtilityPerMessage: 0, metaServicePerMessage: 0 },
    });
    const env = {
      ...textbeeEnv,
      TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'auth-token', TWILIO_FROM_NUMBER: '+15005550006',
      TWILIO_STATUS_CALLBACK_URL: 'https://api.example.test/api/v1/webhooks/messaging/twilio',
      TWILIO_WEBHOOK_PUBLIC_URL: 'https://api.example.test/api/v1/webhooks/messaging/twilio',
    };
    const result = buildMessagingReadiness(settings, {
      textbee: { configured: true, reachable: true, eligible: true },
      twilio: { configured: true, reachable: true, eligible: true },
    }, env, queue);

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'fallback-countries', status: 'fail' }),
      expect.objectContaining({ id: 'fallback-spending', status: 'fail' }),
    ]));
  });

  test('requires an explicit purpose scope for WhatsApp fallback', () => {
    const settings = baseSettings({
      providers: {
        emailEnabled: false, metaWhatsappEnabled: true, textbeeEnabled: false,
        twilioEnabled: false, twilioWhatsappEnabled: true,
      },
      whatsappFallback: {
        enabled: true, allowedCountries: ['CH'], allowedPurposes: [],
        dailySpendLimit: 5, monthlySpendLimit: 25,
      },
      countryRouting: {
        textbeeAllowedCountries: [], twilioAllowedCountries: [],
        whatsappAllowedCountries: ['CH'], twilioWhatsappAllowedCountries: ['CH'],
      },
    });
    const env = {
      MESSAGE_DESTINATION_HASH_SECRET: 'destination-secret-at-least-16',
      META_WHATSAPP_BUSINESS_ACCOUNT_ID: 'waba', META_WHATSAPP_PHONE_NUMBER_ID: 'phone',
      META_WHATSAPP_ACCESS_TOKEN: 'token', META_WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'verify',
      META_APP_SECRET: 'secret', META_GRAPH_API_VERSION: 'v23.0',
      TWILIO_ACCOUNT_SID: 'AC123', TWILIO_AUTH_TOKEN: 'auth-token',
      TWILIO_WHATSAPP_FROM: 'whatsapp:+15005550006',
      TWILIO_WHATSAPP_STATUS_CALLBACK_URL: 'https://api.example.test/api/v1/webhooks/messaging/twilio',
    };
    const result = buildMessagingReadiness(settings, {
      metaWhatsapp: { configured: true, reachable: true, eligible: true },
      twilioWhatsapp: { configured: true, reachable: true, eligible: true },
    }, env, queue);

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'whatsapp-fallback-purposes', status: 'fail' }),
    ]));
  });
});
