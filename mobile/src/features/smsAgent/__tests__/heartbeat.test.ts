import type { SmsJournalEntry, TelephonyCapabilities } from '@/services/telephony/types';

import {
  applyCycle,
  buildHeartbeatPayload,
  EMPTY_ACTIVITY,
  maskSimNumber,
  shouldSendHeartbeat,
  type HeartbeatInputs,
} from '../domain/heartbeat';
import type { LoopStatus } from '../domain/agentLoop';
import { createHeartbeatSender, type HeartbeatDeps } from '../services/heartbeatService';

const caps: TelephonyCapabilities = {
  hasTelephony: true,
  sdkInt: 33,
  simState: 'ready',
  airplaneMode: false,
  callPhoneGranted: true,
  readPhoneStateGranted: true,
  dialerAvailable: true,
  smsComposerAvailable: true,
  isDefaultDialer: false,
  smsPermissionsDeclared: true,
  sendSmsGranted: true,
  receiveSmsGranted: false,
  notificationsGranted: true,
  directSmsSupported: true,
};

const journal: SmsJournalEntry[] = [
  { messageId: '64a000000000000000000001', status: 'attempting', errorCode: null, parts: 1, startedAt: 1, finishedAt: null, deliveredAt: null },
  { messageId: '64a000000000000000000002', status: 'unknown', errorCode: 'PARTIAL', parts: 2, startedAt: 1, finishedAt: 2000, deliveredAt: null },
  { messageId: '64a000000000000000000003', status: 'failed', errorCode: 'X', parts: 1, startedAt: 1, finishedAt: 3000, deliveredAt: null },
  { messageId: 'smsq-abc', status: 'failed', errorCode: 'X', parts: 1, startedAt: 1, finishedAt: 3000, deliveredAt: null },
];

function inputs(overrides: Partial<HeartbeatInputs> = {}): HeartbeatInputs {
  return {
    deviceId: 'android-123',
    platform: { manufacturer: 'TECNO', model: 'KJ5', osVersion: '13', sdkInt: 33 },
    appVersion: '0.1.7',
    buildNumber: '8',
    buildProfile: 'private',
    caps,
    batteryOptimizationIgnored: false,
    sims: [
      { subscriptionId: 1, slotIndex: 0, carrierName: 'Jazz', displayName: 'SIM 1', countryIso: 'pk', isEmbedded: false, isDefaultVoice: true, isDefaultSms: true, number: '+923001234567' },
      { subscriptionId: 2, slotIndex: 1, carrierName: 'Telenor', displayName: 'SIM 2', countryIso: 'pk', isEmbedded: false, isDefaultVoice: false, isDefaultSms: false, number: null },
    ],
    network: { type: 'cellular', isConnected: true, isInternetReachable: true },
    journal,
    inboundPending: 2,
    activity: EMPTY_ACTIVITY,
    agent: { running: true, lastCycleAt: 5000 },
    resyncCompleted: false,
    trigger: 'loop',
    ...overrides,
  };
}

describe('heartbeat payload', () => {
  it('masks SIM numbers and never sends a full number', () => {
    expect(maskSimNumber('+92 300 1234567')).toBe('•••• 4567');
    expect(maskSimNumber('12')).toBe('••••');
    expect(maskSimNumber(null)).toBeNull();
    const payload = buildHeartbeatPayload(inputs());
    expect(JSON.stringify(payload)).not.toContain('3001234567');
    expect(payload.sims[0]?.numberMasked).toBe('•••• 4567');
    expect(payload.sims[1]?.numberMasked).toBeNull();
  });

  it('maps permissions, SIM selection, network and build profile', () => {
    const payload = buildHeartbeatPayload(inputs());
    expect(payload.permissions).toEqual({
      smsDeclared: true,
      sendSms: true,
      receiveSms: false,
      readPhoneState: true,
      postNotifications: true,
      batteryOptimizationIgnored: false,
    });
    expect(payload.buildProfile).toBe('private');
    expect(payload.sims.map((s) => s.selected)).toEqual([true, false]);
    expect(payload.selectedSubscriptionId).toBe(1);
    expect(payload.network).toEqual({ type: 'cellular', connected: true, internetReachable: true, airplaneMode: false });
    const chosen = buildHeartbeatPayload(inputs({ activity: { ...EMPTY_ACTIVITY, lastSubscriptionId: 2 } }));
    expect(chosen.sims.map((s) => s.selected)).toEqual([false, true]);
  });

  it('counts the agent journal by status and leaves SMS-queue sends out', () => {
    const payload = buildHeartbeatPayload(inputs());
    expect(payload.queue).toEqual({ pending: 0, attempting: 1, unknown: 1, failed: 1, inboundPending: 2 });
    expect(payload.journal.map((j) => j.messageId)).not.toContain('smsq-abc');
    expect(payload.journal[1]).toEqual({ messageId: '64a000000000000000000002', status: 'unknown', finishedAt: new Date(2000).toISOString() });
  });

  it('folds cycles into activity timestamps and errors', () => {
    let a = applyCycle(EMPTY_ACTIVITY, { nextDelayMs: 1, reported: 1, uploaded: 2, sent: 'm1', error: null }, 1000, true);
    expect(a).toMatchObject({ leaseAt: 1000, sendAt: 1000, resultPostAt: 1000, inboundAt: 1000, lastError: null });
    a = applyCycle(a, { nextDelayMs: 1, reported: 0, uploaded: 0, sent: null, error: 'boom' }, 2000, true);
    expect(a.lastError).toEqual({ code: 'CYCLE_FAILED', message: 'boom', at: 2000 });
    expect(a.leaseAt).toBe(1000);
  });

  it('throttles loop heartbeats to the cadence and foreground ones to a minute', () => {
    expect(shouldSendHeartbeat('loop', null, 0)).toBe(true);
    expect(shouldSendHeartbeat('loop', 0, 4 * 60_000)).toBe(false);
    expect(shouldSendHeartbeat('loop', 0, 5 * 60_000)).toBe(true);
    expect(shouldSendHeartbeat('foreground', 0, 30_000)).toBe(false);
    expect(shouldSendHeartbeat('foreground', 0, 61_000)).toBe(true);
    expect(shouldSendHeartbeat('loop', 0, 1, { force: true })).toBe(true);
  });
});

describe('heartbeat sender', () => {
  const idle: LoopStatus = { running: false, lastCycleAt: null, lastResult: null, canSend: true };

  function setup(overrides: Partial<HeartbeatDeps> = {}) {
    let now = 1_000_000;
    let status = idle;
    const deps: HeartbeatDeps = {
      collect: jest.fn(async () => {
        const { activity: _a, resyncCompleted: _r, trigger: _t, agent: _g, ...base } = inputs();
        return base;
      }),
      post: jest.fn(async () => ({ resyncRequested: false, health: { status: 'online' as const, reasons: [] } })),
      uploadOnly: jest.fn(async () => undefined),
      loopStatus: () => status,
      kickLoop: jest.fn(),
      now: () => now,
      ...overrides,
    };
    return {
      deps,
      sender: createHeartbeatSender(deps),
      advance: (ms: number) => {
        now += ms;
      },
      setStatus: (s: LoopStatus) => {
        status = s;
      },
    };
  }

  it('sends once, then throttles, and publishes the CRM health', async () => {
    const { deps, sender, advance } = setup();
    const seen = jest.fn();
    sender.subscribe(seen);
    await sender.send('foreground');
    await sender.send('foreground');
    expect(deps.post).toHaveBeenCalledTimes(1);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ health: { status: 'online', reasons: [] } }));
    advance(61_000);
    await sender.send('foreground');
    expect(deps.post).toHaveBeenCalledTimes(2);
  });

  it('treats a 404 (older server) as unsupported and stops sending', async () => {
    const { deps, sender, advance } = setup({ post: jest.fn(async () => null) });
    expect(await sender.send('foreground')).toBeNull();
    advance(10 * 60_000);
    await sender.send('foreground');
    expect(deps.post).toHaveBeenCalledTimes(1);
    expect(sender.__state().unsupported).toBe(true);
  });

  it('survives a network failure without throwing', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { sender } = setup({ post: jest.fn(async () => Promise.reject(new Error('offline'))) });
    await expect(sender.send('headless')).resolves.toBeNull();
  });

  it('resync: re-uploads without sending, then reports resyncCompleted', async () => {
    const post = jest
      .fn()
      .mockResolvedValueOnce({ resyncRequested: true })
      .mockResolvedValue({ resyncRequested: false });
    const { deps, sender } = setup({ post });
    await sender.send('foreground');
    expect(deps.uploadOnly).toHaveBeenCalledWith('android-123');
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toMatchObject({ resyncCompleted: true, trigger: 'manual' });
  });

  it('resync while the loop runs: kicks the loop and reports after its next clean cycle', async () => {
    const post = jest
      .fn()
      .mockResolvedValueOnce({ resyncRequested: true })
      .mockResolvedValue({ resyncRequested: false });
    const { deps, sender, setStatus } = setup({ post });
    setStatus({ running: true, lastCycleAt: null, lastResult: null, canSend: true });
    await sender.send('foreground');
    expect(deps.uploadOnly).not.toHaveBeenCalled();
    expect(deps.kickLoop).toHaveBeenCalled();
    sender.onLoopStatus({
      running: true,
      lastCycleAt: 2_000_000,
      canSend: true,
      lastResult: { nextDelayMs: 5, reported: 3, uploaded: 0, sent: null, error: null },
    });
    await new Promise((r) => setImmediate(r));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1][0]).toMatchObject({ resyncCompleted: true, trigger: 'loop' });
    expect(post.mock.calls[1][0].last.resultPostAt).toBe(new Date(2_000_000).toISOString());
  });
});
