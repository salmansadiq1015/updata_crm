import type { SimInfo, TelephonyCapabilities } from '@/services/telephony/types';

import {
  buildReadiness,
  capabilityCodes,
  diagnosticReport,
  summarize,
  type ReadinessInput,
} from '../domain/mobileReadiness';

const caps = (overrides: Partial<TelephonyCapabilities> = {}): TelephonyCapabilities => ({
  hasTelephony: true,
  sdkInt: 33,
  simState: 'ready',
  airplaneMode: false,
  callPhoneGranted: true,
  readPhoneStateGranted: true,
  dialerAvailable: true,
  smsComposerAvailable: true,
  isDefaultDialer: false,
  smsPermissionsDeclared: false,
  sendSmsGranted: false,
  receiveSmsGranted: false,
  notificationsGranted: true,
  directSmsSupported: false,
  ...overrides,
});

const sim = (id: number, name: string): SimInfo => ({
  subscriptionId: id,
  slotIndex: id - 1,
  carrierName: name,
  displayName: name,
  countryIso: 'pk',
  isEmbedded: false,
  isDefaultVoice: false,
  isDefaultSms: false,
  number: null,
});

const input = (overrides: Partial<ReadinessInput> = {}): ReadinessInput => ({
  caps: caps(),
  sims: [sim(2, 'Telenor'), sim(3, 'Jazz')],
  distribution: 'play',
  microphone: 'denied',
  batteryUnrestricted: null,
  blockedPermissions: new Set(),
  server: {
    state: 'ok',
    latencyMs: 120,
    data: {
      serverTime: null,
      ai: { configured: true },
      cloudCalling: { configured: false, reason: 'no_sip_trunk' },
    },
  },
  ...overrides,
});

const item = (items: ReturnType<typeof buildReadiness>, key: string) => items.find((i) => i.key === key);

describe('mobile calling readiness', () => {
  it('a dual-SIM phone with permissions and a reachable CRM is ready, with no SIP or cloud requirement', () => {
    const items = buildReadiness(input());
    expect(item(items, 'sim')).toMatchObject({
      state: 'ok',
      reason: 'simsReady',
      values: { count: 2, names: 'Telenor, Jazz' },
    });
    expect(item(items, 'phone')).toMatchObject({ state: 'ok' });
    expect(item(items, 'cloudCalling')).toMatchObject({ state: 'info', reason: 'cloudOptional' });
    expect(summarize(items)).toEqual({ state: 'ready', attention: 0, canCall: true });
  });

  it('never presents AI voice inside a SIM call as available', () => {
    expect(item(buildReadiness(input()), 'callAudio')).toMatchObject({
      state: 'info',
      reason: 'callAudioUnsupported',
    });
  });

  it.each([
    [{ hasTelephony: false }, 'noTelephony'],
    [{ airplaneMode: true }, 'airplane'],
    [{ simState: 'absent' as const }, 'noSim'],
    [{ simState: 'locked' as const }, 'simNotReady'],
  ])('blocks calling when %o', (override, reason) => {
    const items = buildReadiness(input({ caps: caps(override) }));
    expect(item(items, 'sim')).toMatchObject({ state: 'blocked', reason });
    expect(summarize(items)).toMatchObject({ state: 'blocked', canCall: false });
  });

  it('asks for the phone permission, and points to Settings once Android stops asking', () => {
    const missing = caps({ callPhoneGranted: false });
    expect(item(buildReadiness(input({ caps: missing })), 'phone')).toMatchObject({
      state: 'action',
      action: 'allowPhone',
    });
    expect(
      item(buildReadiness(input({ caps: missing, blockedPermissions: new Set(['phone']) })), 'phone'),
    ).toMatchObject({ action: 'openSettings' });
  });

  it('shareable build: SMS opens the messaging app (no SMS permission is requested)', () => {
    expect(item(buildReadiness(input()), 'sms')).toMatchObject({ state: 'info', reason: 'smsComposer' });
    expect(item(buildReadiness(input({ caps: caps({ smsComposerAvailable: false }) })), 'sms')).toMatchObject(
      {
        state: 'blocked',
        reason: 'noSmsApp',
      },
    );
  });

  it('company build: automatic SMS needs SMS, notification and background permissions', () => {
    const items = buildReadiness(
      input({
        distribution: 'private',
        caps: caps({ smsPermissionsDeclared: true, notificationsGranted: false }),
        batteryUnrestricted: false,
      }),
    );
    expect(item(items, 'sms')).toMatchObject({ state: 'action', action: 'allowSms' });
    expect(item(items, 'notifications')).toMatchObject({ state: 'action', action: 'allowNotifications' });
    expect(item(items, 'background')).toMatchObject({ state: 'action', action: 'allowBackground' });
    expect(summarize(items)).toMatchObject({ state: 'attention', attention: 3, canCall: true });
  });

  it('server problems: offline blocks with retry; an older server is reachable but cannot report AI status', () => {
    const offline = buildReadiness(input({ server: { state: 'offline' } }));
    expect(item(offline, 'server')).toMatchObject({ state: 'blocked', reason: 'offline', action: 'retry' });
    expect(summarize(offline).canCall).toBe(false);

    const older = buildReadiness(input({ server: { state: 'ok', latencyMs: 90, data: null } }));
    expect(item(older, 'server')).toMatchObject({ state: 'ok' });
    expect(item(older, 'ai')).toMatchObject({ state: 'info', reason: 'serverOutdated' });
    expect(summarize(older).canCall).toBe(true);
  });

  it('AI off on the server is information, not a calling blocker', () => {
    const items = buildReadiness(
      input({
        server: {
          state: 'ok',
          latencyMs: 80,
          data: { serverTime: null, ai: { configured: false }, cloudCalling: { configured: false } },
        },
      }),
    );
    expect(item(items, 'ai')).toMatchObject({ state: 'info', reason: 'aiOff' });
    expect(summarize(items)).toMatchObject({ state: 'ready', canCall: true });
  });

  it('is "checking" until the phone and server answer', () => {
    expect(summarize(buildReadiness(input({ caps: null, server: { state: 'checking' } }))).state).toBe(
      'checking',
    );
  });
});

describe('capability codes and diagnostic report', () => {
  it('never reports AI voice over a SIM call, even when everything else is ready', () => {
    const codes = capabilityCodes(
      buildReadiness(
        input({ distribution: 'shared', caps: caps({ smsPermissionsDeclared: true, sendSmsGranted: true }) }),
      ),
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'SIM_CALLING_AVAILABLE',
        'CALL_STATE_TRACKING_AVAILABLE',
        'SMS_AVAILABLE',
        'AI_AUDIO_INPUT_UNAVAILABLE',
        'AI_AUDIO_OUTPUT_UNAVAILABLE',
        'AUTONOMOUS_CELLULAR_AI_UNSUPPORTED',
      ]),
    );
  });

  it('reflects missing permissions and composer-only SMS', () => {
    const codes = capabilityCodes(
      buildReadiness(input({ caps: caps({ callPhoneGranted: false, readPhoneStateGranted: false }) })),
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'SIM_CALLING_UNAVAILABLE',
        'CALL_STATE_TRACKING_UNAVAILABLE',
        'SMS_COMPOSER_ONLY',
      ]),
    );
  });

  it('the report lists states and codes but no phone numbers', () => {
    const report = diagnosticReport({
      items: buildReadiness(input({ sims: [{ ...sim(3, 'Jazz'), number: '+923054949624' }] })),
      appVersion: '0.1.5',
      distribution: 'shared',
      unsyncedOperations: 2,
      now: new Date('2026-10-22T09:00:00Z'),
    });
    expect(report).toContain('app: 0.1.5 (shared)');
    expect(report).toContain('unsynced CRM records: 2');
    expect(report).toContain('AUTONOMOUS_CELLULAR_AI_UNSUPPORTED');
    expect(report).not.toMatch(/\+?92305/);
  });
});
