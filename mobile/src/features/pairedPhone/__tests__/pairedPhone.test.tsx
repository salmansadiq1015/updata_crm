// Paired-phone feature: the API module against the real zod schemas with server-shaped fixtures
// (the HTTP client is mocked), the pure status rules, and the screen's owner actions.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { z } from 'zod';

import { api } from '@/services/api/apiClient';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { pairedPhoneApi } from '../api/pairedPhoneApi';
import {
  callAudioView,
  canHangUp,
  canTakeOver,
  deviceChecks,
  deviceHeadline,
  statsFresh,
} from '../domain/pairedPhoneDomain';
import { PairedPhonesScreen } from '../screens/PairedPhonesScreen';
import { activeCallSchema, pairedDeviceSchema } from '../types';

jest.mock('@/services/api/apiClient', () => ({ api: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

// Shaped like server/src/modules/pairedPhone/pairedPhone.service.js presentDevice().
const serverDevice = (over: Record<string, unknown> = {}) => ({
  id: 'd1',
  name: 'TECNO bridge',
  phoneLabel: 'Jazz SIM',
  kind: 'esp32_hfp',
  revoked: false,
  revokedAt: null,
  online: true,
  lastHeartbeatAt: '2026-10-23T12:00:00.000Z',
  gateway: { version: '0.2.0', platform: 'darwin', hostname: 'mac' },
  board: {
    connected: true,
    port: '/dev/cu.usbserial-1',
    bdaddr: '24:0A:C4:00:11:22',
    firmware: '0.1.0',
    idf: 'v5.5.6',
    chipRevision: 3,
    keyProvisioned: true,
  },
  state: {
    device: 'hfp_ready',
    hfp: 'slc',
    call: 0,
    callsetup: 0,
    audio: 'off',
    codec: 'none',
    signal: 4,
    battery: 5,
    peer: '04:01:BB:51:10:48',
  },
  stats: null,
  lastError: null,
  keyState: 'provisioned',
  audioVerified: true,
  audioVerifiedAt: '2026-10-22T10:00:00.000Z',
  limits: { cooldownSeconds: 60, maxCallsPerHour: 20, maxCallsPerDay: 100, ringTimeoutSeconds: 45 },
  currentCallId: null,
  currentCallSince: null,
  lastCallEndedAt: null,
  attention: null,
  readiness: { ok: true, reasons: [], messages: [], blocking: false },
  usage: { callsLastHour: 2, callsToday: 7 },
  createdAt: '2026-10-20T10:00:00.000Z',
  ...over,
});
const serverCall = (gateway: Record<string, unknown> | null) => ({
  callId: 'call_1',
  recordId: 'r1',
  leadName: 'Rahim Traders',
  leadNumber: 'L-1',
  state: 'in_progress',
  phase: 'ask',
  currentQuestion: 'Employees',
  answered: 1,
  total: 2,
  elapsedSeconds: 42,
  isTest: false,
  transport: gateway ? 'paired_phone' : 'cloud_sip',
  gateway,
});

const respond = (data: unknown) =>
  jest.fn(async (_url: string, ...rest: unknown[]) => {
    const schema = rest.find((arg) => arg && typeof (arg as z.ZodType).parse === 'function') as
      | z.ZodType
      | undefined;
    return { data: schema ? schema.parse(data) : data };
  });

beforeEach(() => jest.resetAllMocks());

describe('pairedPhoneApi', () => {
  it('parses devices and hides revoked ones', async () => {
    jest
      .mocked(api.get)
      .mockImplementation(respond([serverDevice(), serverDevice({ id: 'd2', revoked: true })]));
    const devices = await pairedPhoneApi.devices();
    expect(devices.map((d) => d.id)).toEqual(['d1']);
    expect(devices[0]).toMatchObject({ online: true, keyState: 'provisioned', usage: { callsToday: 7 } });
    expect(jest.mocked(api.get).mock.calls[0]?.[0]).toBe('/paired-phone/devices');
  });

  it('parses live calls of both transports', async () => {
    jest.mocked(api.get).mockImplementation(
      respond([
        serverCall({
          state: 'dialing',
          audioOpen: true,
          audioLost: false,
          takenOver: false,
          command: null,
          audioAgeSeconds: 1,
          audio: {
            rxLevelDbfs: -30,
            txLevelDbfs: -20,
            firstAiAudioMs: 1400,
            downUnderruns: 0,
            upFrames: 1,
          },
        }),
        serverCall(null),
      ]),
    );
    const calls = await pairedPhoneApi.activeCalls('c1');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.gateway).toBeNull();
    expect(jest.mocked(api.get).mock.calls[0]?.[0]).toBe('/ai-calling/campaigns/c1/active-calls');
  });

  it('sends the kill switch and call controls to the right endpoints', async () => {
    jest
      .mocked(api.put)
      .mockImplementation(
        respond({ voicePaused: true, pausedByEnv: false, pausedReason: 'x', pausedAt: null }),
      );
    jest.mocked(api.post).mockImplementation(respond({ ok: true }));
    await pairedPhoneApi.setVoicePaused(true);
    await pairedPhoneApi.takeover('r1');
    await pairedPhoneApi.hangup('r1');
    expect(jest.mocked(api.put).mock.calls[0]?.slice(0, 2)).toEqual([
      '/ai-calling/settings',
      { voicePaused: true, reason: 'Paused from the mobile app' },
    ]);
    expect(jest.mocked(api.post).mock.calls.map((c) => c[0])).toEqual([
      '/paired-phone/calls/r1/takeover',
      '/paired-phone/calls/r1/hangup',
    ]);
  });
});

describe('pairedPhoneDomain', () => {
  const device = (over: Record<string, unknown> = {}) => pairedDeviceSchema.parse(serverDevice(over));
  it('derives checks and the headline only from reported state', () => {
    expect(deviceChecks(device()).every((c) => c.ok)).toBe(true);
    expect(deviceHeadline(device())).toBe('ready');
    expect(deviceHeadline(device({ online: false }))).toBe('offline');
    expect(deviceHeadline(device({ attention: { needed: true, reason: 'x', at: null } }))).toBe('attention');
    expect(deviceHeadline(device({ currentCallId: 'c' }))).toBe('inCall');
    const notLinked = device({
      state: { hfp: 'disconnected', call: 0, callsetup: 0, audio: 'off' },
      readiness: { ok: false, reasons: ['phone_not_connected'] },
    });
    expect(deviceChecks(notLinked).find((c) => c.key === 'phone')?.ok).toBe(false);
    expect(deviceHeadline(notLinked)).toBe('notReady');
  });

  it('call audio view, stale stats and allowed controls', () => {
    const live = activeCallSchema.parse(
      serverCall({
        state: 'dialing',
        audioOpen: true,
        audioLost: false,
        takenOver: false,
        command: null,
        audioAgeSeconds: 2,
        audio: null,
      }),
    );
    expect(callAudioView(live)).toBe('live');
    expect(statsFresh(live)).toBe(true);
    expect(canTakeOver(live)).toBe(true);
    const stale = activeCallSchema.parse(
      serverCall({
        state: 'dialing',
        audioOpen: false,
        audioLost: true,
        takenOver: false,
        command: 'hangup',
        audioAgeSeconds: 30,
        audio: null,
      }),
    );
    expect(callAudioView(stale)).toBe('lost');
    expect(statsFresh(stale)).toBe(false);
    expect(canTakeOver(stale)).toBe(false);
    expect(canHangUp(stale)).toBe(false);
  });
});

describe('PairedPhonesScreen', () => {
  const navigation = { navigate: jest.fn() };
  const render = () =>
    renderWithProviders(
      <PairedPhonesScreen
        {...({
          navigation,
          route: { key: 'k', name: 'PairedPhones' },
        } as unknown as RootScreenProps<'PairedPhones'>)}
      />,
    );
  const routeGets = (devices: unknown[]) =>
    jest.mocked(api.get).mockImplementation(async (url: string, schema?: unknown) => {
      const data =
        url === '/ai-calling/settings'
          ? { voicePaused: false, pausedByEnv: false, pausedReason: '', pausedAt: null }
          : devices;
      return { data: (schema as z.ZodType).parse(data) };
    });

  it('shows each device with its checks and usage', async () => {
    routeGets([serverDevice()]);
    await render();
    expect(await screen.findByText('TECNO bridge')).toBeTruthy();
    expect(screen.getByText('Ready to call')).toBeTruthy();
    expect(screen.getByText('Two-way call audio verified')).toBeTruthy();
    expect(screen.getByText('Calls: 2/20 this hour · 7/100 today')).toBeTruthy();
  });

  it('stopping all calling needs confirmation', async () => {
    routeGets([serverDevice()]);
    jest
      .mocked(api.put)
      .mockImplementation(
        respond({ voicePaused: true, pausedByEnv: false, pausedReason: '', pausedAt: null }),
      );
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Stop all calling' }));
    expect(api.put).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'Stop all calling' });
    await fireEvent.press(buttons[buttons.length - 1]!);
    await waitFor(() => expect(api.put).toHaveBeenCalled());
  });

  it('a device held after an uncertain call can be cleared after confirmation', async () => {
    routeGets([
      serverDevice({
        attention: { needed: true, reason: 'The gateway lost track of a call', at: null },
        readiness: { ok: false, reasons: ['needs_attention'], messages: [], blocking: true },
      }),
    ]);
    jest.mocked(api.post).mockImplementation(respond(serverDevice()));
    await render();
    expect(await screen.findByText('The gateway lost track of a call')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Phone checked · clear' }));
    const confirm = screen.getAllByRole('button', { name: 'Phone checked · clear' });
    await fireEvent.press(confirm[confirm.length - 1]!);
    await waitFor(() =>
      expect(jest.mocked(api.post).mock.calls[0]?.[0]).toBe('/paired-phone/devices/d1/clear'),
    );
  });
});

describe('pairedCampaignReadiness', () => {
  const { pairedCampaignReadiness } = jest.requireActual('../domain/pairedPhoneDomain');
  const dev = (over: Record<string, unknown> = {}) => pairedDeviceSchema.parse(serverDevice(over));
  const q = (data: unknown) => ({ data, isPending: false, isError: false });
  it('gates a paired-phone campaign on the device, not on the cloud trunk', () => {
    expect(pairedCampaignReadiness(q([dev()]), 'd1')).toEqual({ state: 'ready' });
    expect(
      pairedCampaignReadiness(
        q([dev({ online: false, readiness: { ok: false, reasons: ['gateway_offline'] } })]),
        'd1',
      ),
    ).toEqual({ state: 'ready' });
    expect(pairedCampaignReadiness(q([dev({ audioVerified: false })]), 'd1')).toEqual({
      state: 'not_ready',
      reason: 'audio_not_verified',
    });
    expect(pairedCampaignReadiness(q([]), 'd1')).toEqual({
      state: 'not_ready',
      reason: 'paired_device_missing',
    });
    expect(pairedCampaignReadiness({ data: undefined, isPending: true, isError: false }, 'd1')).toEqual({
      state: 'checking',
    });
  });
});
