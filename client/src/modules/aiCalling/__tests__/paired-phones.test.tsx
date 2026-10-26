// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';
import type { ActiveCall, PairedDevice } from '../types/ai-calling-types';

const device = (over: Partial<PairedDevice> = {}): PairedDevice => ({
  id: 'd1', name: 'TECNO bridge', phoneLabel: 'Jazz SIM', kind: 'esp32_hfp', revoked: false, revokedAt: null, online: true,
  lastHeartbeatAt: new Date().toISOString(),
  gateway: { version: '0.2.0', platform: 'darwin', hostname: 'mac' },
  board: { connected: true, port: '/dev/cu.usbserial-1', bdaddr: '24:0A:C4:00:11:22', firmware: '0.1.0', idf: 'v5.5.6', chipRevision: 3, keyProvisioned: true },
  state: { device: 'hfp_ready', hfp: 'slc', call: 0, callsetup: 0, audio: 'off', codec: 'none', signal: 4, battery: 5, peer: '04:01:BB:51:10:48' },
  stats: null, lastError: null, keyState: 'provisioned', audioVerified: false, audioVerifiedAt: null,
  limits: { cooldownSeconds: 60, maxCallsPerHour: 20, maxCallsPerDay: 100, ringTimeoutSeconds: 45 },
  currentCallId: null, currentCallSince: null, lastCallEndedAt: null, attention: null,
  readiness: { ok: false, reasons: ['audio_not_verified'], messages: ['Two-way call audio has not been verified on this device yet'], blocking: true },
  usage: { callsLastHour: 2, callsToday: 7 }, createdAt: '2026-10-23T10:00:00Z',
  ...over,
});

const api = {
  devices: vi.fn(async () => [device()]),
  pairingCode: vi.fn(async () => ({ code: 'ABCD-EF23', expiresAt: new Date(Date.now() + 600_000).toISOString() })),
  verifyAudio: vi.fn(async () => device({ audioVerified: true })),
  clear: vi.fn(async () => device()),
  revoke: vi.fn(async () => device({ revoked: true })),
  rotateKey: vi.fn(async () => device()),
  update: vi.fn(async () => device()),
  takeover: vi.fn(async () => ({ ok: true })),
  hangup: vi.fn(async () => ({ ok: true })),
  voiceSettings: vi.fn(async () => ({ voicePaused: false, pausedByEnv: false, pausedReason: '', pausedAt: null })),
  setVoicePaused: vi.fn(async (p: boolean) => ({ voicePaused: p, pausedByEnv: false, pausedReason: '', pausedAt: null })),
};
vi.mock('../services/paired-phone-api', () => ({ pairedPhoneApi: api }));
vi.mock('@/lib/toast', () => ({ showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock('@/lib/socket/client', () => ({ onSocketConnect: () => () => {} }));

const { PairedPhonesPanel } = await import('../ui/paired-phones-panel');
const { PairedCallHealth } = await import('../ui/paired-call-health');
const { VoiceKillSwitch } = await import('../ui/voice-kill-switch');

const wrap = (ui: ReactNode) => render(
  <LanguageProvider initialLocale="en">
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>
  </LanguageProvider>,
);

beforeEach(() => vi.clearAllMocks());

describe('PairedPhonesPanel', () => {
  it('shows each setup check from the reported state and why the phone is not ready', async () => {
    wrap(<PairedPhonesPanel />);
    const card = await screen.findByRole('article', { name: 'Paired phone TECNO bridge' });
    expect(within(card).getByRole('status').textContent).toBe('Not ready');
    const checks = within(card).getByRole('list', { name: 'Setup checks' });
    expect(within(checks).getAllByLabelText('done')).toHaveLength(4); // gateway, board, key, phone
    expect(within(checks).getAllByLabelText('not yet')).toHaveLength(1); // audio not verified
    expect(within(card).getByText(/firmware 0.1.0/)).toBeTruthy();
    expect(within(card).getByText('2/20')).toBeTruthy();
  });

  it('audio verification needs both directions confirmed', async () => {
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Verify call audio/ }));
    const confirm = await screen.findByRole('button', { name: /Confirm verified/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /remote\.wav/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /heard the AI prompt/ }));
    fireEvent.click(confirm);
    await waitFor(() => expect(api.verifyAudio).toHaveBeenCalledWith('d1', { inboundPhraseHeard: true, outboundPhraseHeard: true, note: '' }));
  });

  it('an uncertain call holds the device until the owner confirms the phone is idle', async () => {
    api.devices.mockResolvedValueOnce([device({ attention: { needed: true, reason: 'The gateway lost track of a call', at: '2026-10-23T10:00:00Z' }, readiness: { ok: false, reasons: ['needs_attention'], messages: [], blocking: true } })]);
    wrap(<PairedPhonesPanel />);
    expect((await screen.findByRole('status')).textContent).toBe('Needs attention');
    fireEvent.click(screen.getByRole('button', { name: /Phone checked/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Phone is idle · clear/ }));
    await waitFor(() => expect(api.clear).toHaveBeenCalledWith('d1'));
  });

  it('adding a phone shows a one-time code with the exact gateway command', async () => {
    api.devices.mockResolvedValue([]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByText('No paired phone yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Add paired phone/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Create pairing code/ }));
    expect(await screen.findByText('ABCD-EF23')).toBeTruthy();
    expect(screen.getByText(/updata-gateway\.mjs pair --api .* --code ABCD-EF23/)).toBeTruthy();
    expect((api.pairingCode.mock.calls as unknown as unknown[][])[0][0]).toEqual({ deviceName: 'My phone bridge', phoneLabel: '' });
    api.devices.mockResolvedValue([device()]);
  });
});

describe('PairedCallHealth', () => {
  const call = (over: Partial<NonNullable<ActiveCall['gateway']>> = {}): ActiveCall => ({
    callId: 'call_1', recordId: 'r1', leadName: 'Rahim Traders', leadNumber: 'L-1', state: 'in_progress', phase: 'ask',
    currentQuestion: 'Employees', answered: 1, total: 2, elapsedSeconds: 42, isTest: false, transport: 'paired_phone',
    gateway: {
      state: 'dialing', audioOpen: true, audioLost: false, takenOver: false, command: null, audioAgeSeconds: 1,
      audio: { rxLevelDbfs: -28, txLevelDbfs: -22, upFrames: 900, downFrames: 880, upSeqGaps: 0, downUnderruns: 0, downOverruns: 0, firstAiAudioMs: 1400, agentConnected: true },
      ...over,
    },
  });

  it('shows real levels and lets the owner take the call over', async () => {
    wrap(<PairedCallHealth call={call()} />);
    expect(screen.getByText('Audio live')).toBeTruthy();
    expect(screen.getByText('-28 dBFS')).toBeTruthy();
    expect(screen.getByText(/AI first spoke after 1.4 s/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Take over on the phone/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Take over$/ }));
    await waitFor(() => expect(api.takeover).toHaveBeenCalledWith('r1'));
  });

  it('never shows stale numbers as live, and flags lost audio', () => {
    wrap(<PairedCallHealth call={call({ audioAgeSeconds: 20, audioLost: true, audioOpen: false })} />);
    expect(screen.getByText('Call audio lost')).toBeTruthy();
    expect(screen.queryByText('-28 dBFS')).toBeNull();
    expect(screen.queryByRole('button', { name: /Take over/ })).toBeNull();
  });
});

describe('VoiceKillSwitch', () => {
  it('stopping all calling asks for confirmation first', async () => {
    wrap(<VoiceKillSwitch />);
    fireEvent.click(await screen.findByRole('button', { name: /Stop all calling/ }));
    expect(api.setVoicePaused).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    fireEvent.click(within(dialog).getByRole('button', { name: /Stop all calling/ }));
    await waitFor(() => expect(api.setVoicePaused).toHaveBeenCalledWith(true, 'Paused from the CRM'));
  });
});
