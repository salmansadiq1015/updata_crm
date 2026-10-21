// Regressions from the 2026-10-21 SMS audit: destination country, duplicate-safe provider
// outcomes and multilingual STOP keywords. Pure units; no network, no database.
import { describe, expect, it, jest } from '@jest/globals';
import { normalizePhone } from '../../src/modules/businessDiscovery/engine/normalizer.js';
import { TextBeeSmsProvider } from '../../src/modules/messaging/providers/textbee.provider.js';
import { TwilioSmsProvider } from '../../src/modules/messaging/providers/twilio.provider.js';
import { isStopRequest } from '../../src/modules/simSms/engine/smsCopy.js';

const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, headers: {} });

describe('phone destination country', () => {
  it('reads a Pakistani local or bare number as +92 for a PK lead', () => {
    expect(normalizePhone('0300 1234567', 'PK')).toMatchObject({ e164: '+923001234567', valid: true });
    expect(normalizePhone('923001234567', 'PK')).toMatchObject({ e164: '+923001234567', valid: true });
    expect(normalizePhone('0300-1234567', 'pk').e164).toBe('+923001234567');
  });

  it('never borrows another country for an unknown region; international numbers still work', () => {
    expect(normalizePhone('0300 1234567', 'NL')).toMatchObject({ e164: null, valid: false });
    expect(normalizePhone('+31 6 12345678', 'NL')).toMatchObject({ e164: '+31612345678', valid: true });
  });

  it('keeps the existing Swiss default when no country is known', () => {
    expect(normalizePhone('079 555 99 99').e164).toBe('+41795559999');
    expect(normalizePhone('+92 344 0401514').e164).toBe('+923440401514');
  });
});

describe('provider outcomes that may already have sent the SMS', () => {
  it('TextBee 2xx without a batch id is ambiguous, never retryable or a fallback trigger', async () => {
    const fetch = jest.fn(async () => response(200, { data: { success: true } }));
    const provider = new TextBeeSmsProvider({ TEXTBEE_API_KEY: 'key' }, fetch);
    const result = await provider.send({ to: '+923001234567', text: 'Hi' });
    expect(result.outcome).toBe('ambiguous');
    expect(result.safeToFallback).not.toBe(true);
  });

  it('TextBee 2xx with an explicit success:false is a definite rejection', async () => {
    const fetch = jest.fn(async () => response(200, { data: { success: false, error: 'no enabled device' } }));
    const provider = new TextBeeSmsProvider({ TEXTBEE_API_KEY: 'key' }, fetch);
    await expect(provider.send({ to: '+923001234567', text: 'Hi' })).resolves.toMatchObject({ outcome: 'rejected' });
  });

  it.each([500, 502, 503, 409])('Twilio %i is ambiguous, not a retryable rejection', async (status) => {
    const fetch = jest.fn(async () => response(status, { message: 'upstream', code: 20500 }));
    const provider = new TwilioSmsProvider({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+15005550006' }, fetch);
    await expect(provider.send({ to: '+923001234567', text: 'Hi' })).resolves.toMatchObject({ outcome: 'ambiguous' });
  });

  it('Twilio 2xx without a sid is ambiguous; a 400 is still a definite rejection', async () => {
    const ok = new TwilioSmsProvider({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+15005550006' }, jest.fn(async () => response(201, {})));
    await expect(ok.send({ to: '+923001234567', text: 'Hi' })).resolves.toMatchObject({ outcome: 'ambiguous' });
    const bad = new TwilioSmsProvider({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_FROM_NUMBER: '+15005550006' }, jest.fn(async () => response(400, { message: 'Invalid To', code: 21211 })));
    await expect(bad.send({ to: '+923001234567', text: 'Hi' })).resolves.toMatchObject({ outcome: 'rejected', failureClass: 'permanent' });
  });
});

describe('STOP keywords', () => {
  it.each(['STOP', 'Stop.', 'stop!!', 'UNSUBSCRIBE', 'arrêt', 'بند کریں', 'band karo', 'رکیں'])('%s opts out', (text) => {
    expect(isStopRequest(text)).toBe(true);
  });
  it.each(['Stop by tomorrow?', 'yes', 'please call me', ''])('"%s" does not', (text) => {
    expect(isStopRequest(text)).toBe(false);
  });
});
