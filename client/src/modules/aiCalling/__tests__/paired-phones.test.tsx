// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { LanguageProvider } from '@/lib/i18n/language-context';
import type { ActiveCall, PairedDevice } from '../types/ai-calling-types';
import { pairedPhoneConnection } from '../paired-phone-connection';
const permissions = vi.hoisted(() => ({ write: true }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => permissions.write }) }));

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
  setupAction: vi.fn(async () => ({ autoConnect: true, playbackGainDb: 0, command: null })),
  setupSettings: vi.fn(async () => ({ autoConnect: true, playbackGainDb: 6, command: null })),
  startAudioTest: vi.fn(async () => ({ id: 'audio1', state: 'ringing', answeredAt: null, endedAt: null, durationSeconds: 0, answers: [], audio: null, failureMessage: null })),
  audioTestResult: vi.fn(async () => ({ id: 'audio1', state: 'ringing', answeredAt: null, endedAt: null, durationSeconds: 0, answers: [], audio: null, failureMessage: null })),
  downloadGateway: vi.fn(async () => new Blob(['package'])),
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

beforeEach(() => { vi.clearAllMocks(); permissions.write = true; api.devices.mockResolvedValue([device()]); });

describe('PairedPhonesPanel', () => {
  const controllable = () => device({ gateway: { version: '0.3.0', platform: 'darwin', hostname: 'mac' }, setup: { autoConnect: true, playbackGainDb: 0, command: null } });
  it('connects through the gateway button without rotating a key or requesting BOOT', async () => {
    const d = controllable();
    api.devices.mockResolvedValueOnce([{ ...d, state: { ...d.state, hfp: 'disconnected' } }]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Connect phone' }));
    await waitFor(() => expect(api.setupAction).toHaveBeenCalledWith('d1', 'connect_phone'));
    expect(api.rotateKey).not.toHaveBeenCalled();
  });

  it('lets an owner provision a pending key and saves volume through authenticated settings', async () => {
    api.devices.mockResolvedValue([controllable()]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Phone setup' }));
    expect(screen.getByText('Security key saved. No further action needed.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save security key' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sound & test call' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'AI voice volume' }), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save volume' }));
    await waitFor(() => expect(api.setupSettings).toHaveBeenCalledWith('d1', { playbackGainDb: 6 }));
    api.devices.mockResolvedValue([device()]);
  });

  it('requires a second number and explicit consent before making exactly one audio test request', async () => {
    api.devices.mockResolvedValueOnce([controllable()]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sound & test call' }));
    const call = await screen.findByRole('button', { name: 'Call my second phone once' });
    expect(call.getAttribute('disabled')).not.toBeNull();
    fireEvent.change(screen.getByRole('textbox', { name: 'Your second phone number' }), { target: { value: '+923001234567' } });
    expect(call.getAttribute('disabled')).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /I own this number/ }));
    fireEvent.click(call);
    await waitFor(() => expect(api.startAudioTest).toHaveBeenCalledWith('d1', { destination: '+923001234567', ownsDestination: true }));
    expect(api.startAudioTest).toHaveBeenCalledTimes(1);
    expect(api.verifyAudio).not.toHaveBeenCalled();
  });

  it('keeps setup controls unavailable to a read-only role', async () => {
    permissions.write = false;
    api.devices.mockResolvedValueOnce([controllable()]);
    wrap(<PairedPhonesPanel />);
    await screen.findByRole('article', { name: 'Paired phone TECNO bridge' });
    expect(screen.queryByRole('button', { name: 'Connect phone' })).toBeNull();
    expect(screen.getByRole('button', { name: /Add paired phone/ }).getAttribute('disabled')).not.toBeNull();
  });
  it('offers Connect even when USB is lost and explains that Bluetooth cannot be checked', async () => {
    const d = controllable();
    api.devices.mockResolvedValue([{ ...d, board: { ...d.board, connected: false }, lastError: { code: 'BOARD_OPEN_FAILED', message: 'Device error calling ioctl IOSSIOSPEED 921600', at: new Date().toISOString() } }]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByRole('group', { name: 'Phone Bluetooth: Cannot check yet' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Phone Bluetooth: Not connected' })).toBeNull();
    expect(screen.getByText(/Your phone may still show Bluetooth connected/)).toBeTruthy();
    expect(screen.queryByText(/ioctl/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Connect phone' }));
    await waitFor(() => expect(api.setupAction).toHaveBeenCalledWith('d1', 'connect_phone'));
    expect(api.rotateKey).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(screen.getByText(/ioctl/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
    expect(screen.queryByText(/ioctl/)).toBeNull();
  });

  it('opens the pending security step without generating another key', async () => {
    api.devices.mockResolvedValue([{ ...controllable(), keyState: 'pending' }]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Finish setup' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save security key' }));
    await waitFor(() => expect(api.setupAction).toHaveBeenCalledWith('d1', 'provision_key'));
    expect(api.rotateKey).not.toHaveBeenCalled();
    expect(screen.getByText(/Release it after the key is saved/)).toBeTruthy();
  });
  it('shows USB connected separately from a phone that has not connected over Bluetooth', async () => {
    const d = device();
    api.devices.mockResolvedValueOnce([device({ state: { ...d.state, hfp: 'disconnected', peer: null, device: 'bt_ready' } })]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByRole('group', { name: 'ESP32 USB: Connected' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Phone Bluetooth: Not connected' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Phone Bluetooth: Connected' })).toBeNull();
  });

  it('does not display cached Bluetooth connection flags as live when the gateway is offline', async () => {
    api.devices.mockResolvedValueOnce([device({ online: false })]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByRole('group', { name: 'ESP32 USB: Cannot check yet' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Phone Bluetooth: Cannot check yet' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Offline');
    const reconnect = screen.getByRole('button', { name: 'Reconnect gateway' });
    expect(reconnect).toBeEnabled();
    fireEvent.click(reconnect);
    expect(screen.getByRole('region', { name: 'Reconnect computer gateway' })).toHaveTextContent('node bin/updata-gateway.mjs run');
    expect(screen.getByRole('button', { name: 'Check gateway status' })).toBeEnabled();
    expect(api.setupAction).not.toHaveBeenCalled();
    expect(api.rotateKey).not.toHaveBeenCalled();
  });

  it('shows each setup check from the reported state and why the phone is not ready', async () => {
    wrap(<PairedPhonesPanel />);
    const card = await screen.findByRole('article', { name: 'Paired phone TECNO bridge' });
    expect(within(card).getByRole('status').textContent).toBe('Not ready');
    expect(within(card).queryByRole('list', { name: 'Setup checks' })).toBeNull();
    fireEvent.click(within(card).getByRole('button', { name: 'Show more' }));
    const checks = within(card).getByRole('list', { name: 'Setup checks' });
    expect(within(checks).getAllByLabelText('done')).toHaveLength(4); // gateway, board, key, phone
    expect(within(checks).getAllByLabelText('not yet')).toHaveLength(1); // audio not verified
    expect(within(card).getByText(/firmware 0.1.0/)).toBeTruthy();
    expect(within(card).getByText('2/20')).toBeTruthy();
  });

  it('explains a newly rotated CRM key even when the board still holds its previous key', async () => {
    api.devices.mockResolvedValueOnce([device({ keyState: 'pending' })]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Show more' }));
    expect(screen.getByText('Choose Finish setup, then hold BOOT while saving the security key.')).toBeTruthy();
    const checks = screen.getByRole('list', { name: 'Setup checks' });
    expect(within(checks).getAllByLabelText('not yet')).toHaveLength(2);
  });

  it('audio verification needs both directions confirmed', async () => {
    api.devices.mockResolvedValueOnce([controllable()]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sound & test call' }));
    fireEvent.click(await screen.findByRole('button', { name: /Verify call audio/ }));
    const confirm = await screen.findByRole('button', { name: /Confirm verified/ });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /AI correctly heard/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: /heard the AI voice clearly/ }));
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

describe('verified connection status', () => {
  it('requires the HFP service-level connection, not just a Bluetooth transport connection', () => {
    const d = device();
    expect(pairedPhoneConnection(d).phone).toBe('connected');
    expect(pairedPhoneConnection(device({ state: { ...d.state, hfp: 'connected' } })).phone).toBe('connecting');
  });

  it('expires a stale cached heartbeat and ignores a missing heartbeat', () => {
    const d = device();
    const now = Date.parse(d.lastHeartbeatAt!);
    expect(pairedPhoneConnection(d, now + 20_001)).toEqual({ gatewayOnline: false, board: 'unknown', phone: 'unknown' });
    expect(pairedPhoneConnection(device({ lastHeartbeatAt: null })).phone).toBe('unknown');
  });

  it('does not claim Bluetooth is connected when the board is unplugged or reports a fault', () => {
    const d = device();
    expect(pairedPhoneConnection(device({ board: { ...d.board, connected: false } }))).toEqual({ gatewayOnline: true, board: 'disconnected', phone: 'unknown' });
    expect(pairedPhoneConnection(device({ state: { ...d.state, device: 'fault' } }))).toEqual({ gatewayOnline: true, board: 'fault', phone: 'unknown' });
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

describe('deviceWaitSentence', () => {
  it('says how to fix a reason that needs a person (an unprovisioned dial key)', async () => {
    const { deviceWaitSentence } = await import('../ui/paired-call-health');
    const result = deviceWaitSentence(['key_not_provisioned']);
    expect(result.blocking).toBe(true);
    expect(result.text).toMatch(/^Calls are blocked: the dial key is not provisioned on the ESP32\. To fix: .*Finish setup → Save security key.*BOOT/);
  });

  it('only says "waiting" for reasons that clear by themselves', async () => {
    const { deviceWaitSentence } = await import('../ui/paired-call-health');
    const result = deviceWaitSentence(['cooldown', 'hourly_cap']);
    expect(result).toEqual({ blocking: false, text: 'Waiting: cooling down between calls · the hourly call limit is reached. Calls continue on their own once this clears.' });
  });
});
