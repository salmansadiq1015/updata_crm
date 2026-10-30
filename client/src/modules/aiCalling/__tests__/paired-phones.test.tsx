// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  pairingCode: vi.fn(async () => ({ code: 'ABCD-EF23', expiresAt: new Date(Date.now() + 600_000).toISOString(), deviceId: 'd1' })),
  verifyAudio: vi.fn(async () => device({ audioVerified: true })),
  clear: vi.fn(async () => device()),
  revoke: vi.fn(async () => device({ revoked: true })),
  remove: vi.fn(async () => ({ id: 'd1', deleted: true })),
  archive: vi.fn(async () => device({ archived: true, archivedAt: new Date().toISOString() })),
  restore: vi.fn(async () => device({ archived: false, archivedAt: null })),
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

const openPhoneMenu = async (name = 'TECNO bridge') => { await userEvent.click(await screen.findByRole('button', { name: `Actions for ${name}` })); };

beforeEach(() => { HTMLElement.prototype.hasPointerCapture ??= vi.fn(() => false); HTMLElement.prototype.releasePointerCapture ??= vi.fn(); HTMLElement.prototype.scrollIntoView ??= vi.fn(); vi.clearAllMocks(); permissions.write = true; api.devices.mockResolvedValue([device()]); });

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
    expect(screen.queryByRole('button', { name: /Actions for/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Delete TECNO/ })).toBeNull();
  });
  it('edits the phone name and SIM label from the visible card actions', async () => {
    wrap(<PairedPhonesPanel />);
    await openPhoneMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Edit TECNO bridge' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Phone name' }), { target: { value: ' Sales phone ' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Phone / SIM label (optional)' }), { target: { value: ' SIM 2 ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('d1', { name: 'Sales phone', phoneLabel: 'SIM 2' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit phone' })).toBeNull());
  });

  it('requires confirmation to delete a phone and keeps the card if deletion fails', async () => {
    api.remove.mockRejectedValueOnce(new Error('Connection failed'));
    wrap(<PairedPhonesPanel />);
    await openPhoneMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete TECNO bridge' }));
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep phone' }));
    expect(api.remove).not.toHaveBeenCalled();
    await openPhoneMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete TECNO bridge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete phone' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('d1'));
    expect(screen.getByRole('article', { name: 'Paired phone TECNO bridge' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Delete TECNO bridge?' })).toBeTruthy();
  });

  it('blocks deletion during a call or while an uncertain call needs attention', async () => {
    api.devices.mockResolvedValueOnce([device({ currentCallId: 'call1' }), device({ id: 'd2', name: 'Other phone', attention: { needed: true, reason: 'Check the phone', at: new Date().toISOString() } })]);
    wrap(<PairedPhonesPanel />);
    await openPhoneMenu();
    expect(screen.getByRole('menuitem', { name: 'Delete TECNO bridge' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: 'Archive TECNO bridge' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.keyboard('{Escape}');
    await openPhoneMenu('Other phone');
    expect(screen.getByRole('menuitem', { name: 'Delete Other phone' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('archives through the menu after confirmation and restores the saved phone from the archive view', async () => {
    wrap(<PairedPhonesPanel />);
    await screen.findByRole('article', { name: 'Paired phone TECNO bridge' });
    expect(screen.queryByRole('button', { name: 'Edit TECNO bridge' })).toBeNull();
    expect(screen.queryByRole('menuitem')).toBeNull();
    await openPhoneMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive TECNO bridge' }));
    expect(api.archive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep active' }));
    expect(api.archive).not.toHaveBeenCalled();
    await openPhoneMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive TECNO bridge' }));
    api.devices.mockResolvedValue([device({ archived: true, archivedAt: new Date().toISOString() })]);
    fireEvent.click(screen.getByRole('button', { name: 'Archive phone' }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledWith('d1'));
    await screen.findByText('No active phones');
    fireEvent.click(screen.getByRole('button', { name: 'Archived phones (1)' }));
    await screen.findByRole('article', { name: 'Archived phone TECNO bridge' });
    expect(screen.queryByRole('button', { name: 'Phone setup' })).toBeNull();
    await openPhoneMenu();
    api.devices.mockResolvedValue([device({ archived: false, archivedAt: null })]);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Restore TECNO bridge' }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith('d1'));
    await screen.findByText('No archived phones');
    fireEvent.click(screen.getByRole('button', { name: 'Active phones (1)' }));
    expect(await screen.findByRole('article', { name: 'Paired phone TECNO bridge' })).toBeTruthy();
  });

  it('keeps the active card visible when archiving fails', async () => {
    api.archive.mockRejectedValueOnce(new Error('Busy'));
    wrap(<PairedPhonesPanel />);
    await openPhoneMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Archive TECNO bridge' }));
    fireEvent.click(screen.getByRole('button', { name: 'Archive phone' }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledWith('d1'));
    expect(screen.getByRole('dialog', { name: 'Archive TECNO bridge?' })).toBeTruthy();
    expect(screen.getByRole('article', { name: 'Paired phone TECNO bridge', hidden: true })).toBeTruthy();
  });

  it('links a saved offline phone using its own profile without creating another phone', async () => {
    api.devices.mockResolvedValue([device({ online: false })]);
    api.pairingCode.mockResolvedValueOnce({ code: 'ABCD-EF23', expiresAt: new Date(Date.now() + 600_000).toISOString(), deviceId: 'd1' });
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: /Link computer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create pairing code' }));
    expect(await screen.findByText('ABCD-EF23')).toBeTruthy();
    expect(api.pairingCode).toHaveBeenCalledWith({ deviceName: 'TECNO bridge', phoneLabel: 'Jazz SIM', deviceId: 'd1' });
    expect(screen.getByText(/pair --api .* --code ABCD-EF23 --profile d1/)).toBeTruthy();
    expect(screen.getByText('node bin/updata-gateway.mjs run --profile d1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download gateway' })).toBeTruthy();
  });

  it('replaces an expired pairing code on the same saved phone', async () => {
    api.devices.mockResolvedValue([]);
    api.pairingCode.mockResolvedValueOnce({ code: 'OLD-CODE', expiresAt: new Date(Date.now() - 1000).toISOString(), deviceId: 'd2' });
    wrap(<PairedPhonesPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Add paired phone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create pairing code' }));
    expect(await screen.findByText('This pairing code has expired')).toBeTruthy();
    expect(screen.queryByText(/--code OLD-CODE/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Get new code' }));
    await waitFor(() => expect(api.pairingCode).toHaveBeenLastCalledWith({ deviceName: 'My phone bridge', phoneLabel: '', deviceId: 'd2' }));
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
    api.devices.mockResolvedValue([device({ online: false })]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByRole('group', { name: 'ESP32 USB: Cannot check yet' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Phone Bluetooth: Cannot check yet' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Offline');
    const reconnect = screen.getByRole('button', { name: 'Reconnect gateway' });
    expect(reconnect).toBeEnabled();
    fireEvent.click(reconnect);
    expect(screen.getByRole('region', { name: 'Reconnect computer gateway' })).toHaveTextContent('node bin/updata-gateway.mjs run');
    expect(screen.getByRole('region', { name: 'Reconnect computer gateway' })).toHaveTextContent('--api');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Check gateway status' })).toBeEnabled());
    expect(api.setupAction).not.toHaveBeenCalled();
    expect(api.rotateKey).not.toHaveBeenCalled();
  });

  it('checks the server on reconnect, reports offline, and detects the gateway coming back', async () => {
    api.devices.mockResolvedValue([device({ online: false })]);
    wrap(<PairedPhonesPanel />);
    fireEvent.click(await screen.findByRole('button', { name: 'Reconnect gateway' }));
    await screen.findByText(/Gateway is still offline/);
    expect(api.devices).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region', { name: 'Reconnect computer gateway' })).toBeVisible();
    // Clicking again must check again, rather than merely hide the instructions.
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect gateway' }));
    await waitFor(() => expect(api.devices).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('region', { name: 'Reconnect computer gateway' })).toBeVisible();
    api.devices.mockResolvedValue([controllable()]);
    fireEvent.click(screen.getByRole('button', { name: 'Check gateway status' }));
    await screen.findByText(/Gateway is online/);
    expect(screen.getByRole('group', { name: 'Computer: Online' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Reconnect computer gateway' })).toBeNull();
    expect(api.setupAction).not.toHaveBeenCalled();
    expect(api.rotateKey).not.toHaveBeenCalled();
  });

  it('shows loading and a server error when a gateway status check cannot finish', async () => {
    api.devices.mockResolvedValue([device({ online: false })]);
    wrap(<PairedPhonesPanel />);
    const reconnect = await screen.findByRole('button', { name: 'Reconnect gateway' });
    let rejectCheck!: (reason: Error) => void;
    api.devices.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectCheck = reject; }));
    fireEvent.click(reconnect);
    expect(await screen.findByRole('button', { name: 'Checking gateway status…' })).toBeDisabled();
    rejectCheck(new Error('Network unavailable'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check gateway status. Network unavailable');
    expect(screen.getByRole('button', { name: 'Check gateway status' })).toBeEnabled();
  });

  it('reports command completion without requiring the user to open bridge details', async () => {
    api.devices.mockResolvedValue([{ ...controllable(), setup: { autoConnect: true, playbackGainDb: 0,
      command: { id: 'done', action: 'status', state: 'succeeded', expiresAt: new Date(Date.now() + 60_000).toISOString(), message: 'Gateway confirmed the action completed' } } }]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByText('Gateway confirmed the action completed')).toBeVisible();
  });

  it('does not present an earlier successful setup command as a current online connection', async () => {
    api.devices.mockResolvedValue([{ ...controllable(), online: false, setup: { autoConnect: true, playbackGainDb: 0,
      command: { id: 'done', action: 'status', state: 'succeeded', expiresAt: new Date(Date.now() + 60_000).toISOString(), message: 'Gateway confirmed the action completed' } } }]);
    wrap(<PairedPhonesPanel />);
    expect(await screen.findByText('The last setup action completed earlier. The gateway is currently offline.')).toBeVisible();
    expect(screen.queryByText('Gateway confirmed the action completed')).toBeNull();
  });

  it('keeps the phone and its recovery controls when a background refresh fails', async () => {
    api.devices.mockResolvedValue([device({ online: false })]);
    wrap(<PairedPhonesPanel />);
    await screen.findByRole('article', { name: 'Paired phone TECNO bridge' });
    api.devices.mockRejectedValueOnce(new Error('Network unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh bridge status' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not refresh phone status');
    expect(screen.getByRole('article', { name: 'Paired phone TECNO bridge' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reconnect gateway' })).toBeEnabled();
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
