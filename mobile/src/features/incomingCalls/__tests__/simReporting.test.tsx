// Phones section: reporting THIS phone's SIM cards to its paired device, with the native
// telephony module and Android permissions mocked (no device involved).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { z } from 'zod';

import { api } from '@/services/api/apiClient';
import { checkPermission, ensurePermission } from '@/services/permissions/permissionsService';
import { telephony } from '@/services/telephony/telephonyService';
import { renderWithProviders } from '@/test/renderWithProviders';

import { serverDevice } from '../__fixtures__/serverPayloads';
import { DevicesSection } from '../components/DevicesSection';
import { THIS_PHONE_DEVICE_KEY } from '../hooks/useThisPhoneSims';
import type { ReportedSim } from '../types';

jest.mock('@/services/api/apiClient', () => ({ api: { get: jest.fn(), put: jest.fn() } }));
// Plain functions (not jest.fn) so resetAllMocks keeps them working.
const mockPrefs = new Map<string, string>();
jest.mock('@/services/storage/preferencesStorage', () => ({
  preferencesStorage: {
    getItem: async (key: string) => mockPrefs.get(key) ?? null,
    setItem: async (key: string, value: string) => void mockPrefs.set(key, value),
    removeItem: async (key: string) => void mockPrefs.delete(key),
  },
}));
jest.mock('@/services/permissions/permissionsService', () => ({
  checkPermission: jest.fn(),
  ensurePermission: jest.fn(),
  openAppSettings: jest.fn(async () => undefined),
}));
jest.mock('@/services/telephony/telephonyService', () => {
  class TelephonyError extends Error {
    code: string;
    constructor(errorCode: string, message: string) {
      super(message);
      this.code = errorCode;
    }
  }
  return { TelephonyError, telephony: { isAvailable: jest.fn(), getActiveSims: jest.fn() } };
});

const NATIVE_SIMS = [
  { subscriptionId: 2, slotIndex: 0, displayName: 'Work', carrierName: 'Swisscom', number: '+41791112233' },
  { subscriptionId: 3, slotIndex: 1, displayName: 'Private', carrierName: 'Salt', number: null },
];
const REPORTED: ReportedSim[] = [
  { slot: 0, label: 'Work', carrier: 'Swisscom' },
  { slot: 1, label: 'Private', carrier: 'Salt' },
];

/** Server state: devices whose `sims` change when a report arrives. */
function server(devices: Record<string, unknown>[]) {
  const state = devices.map((d) => ({ ...d }));
  jest.mocked(api.get).mockImplementation(async (_url: string, schema?: unknown) => ({
    data: (schema as z.ZodType).parse(state),
  }));
  jest.mocked(api.put).mockImplementation(async (url: string, body: unknown, schema?: unknown) => {
    const id = url.split('/')[3];
    const sims = (body as { sims: ReportedSim[] }).sims;
    const device = state.find((d) => d.id === id);
    if (device) Object.assign(device, { sims, simsReportedAt: '2026-11-04T10:00:00.000Z' });
    return { data: (schema as z.ZodType).parse({ sims, removedSimAgents: 0 }) };
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  mockPrefs.clear();
  jest.mocked(telephony.isAvailable).mockReturnValue(true);
  jest.mocked(telephony.getActiveSims).mockResolvedValue(NATIVE_SIMS as never);
});

describe('one paired device (= this phone)', () => {
  it('reports this phone’s SIMs automatically when they were never reported', async () => {
    server([serverDevice()]);
    jest.mocked(checkPermission).mockResolvedValue('granted');
    await renderWithProviders(<DevicesSection />);
    await waitFor(() =>
      expect(jest.mocked(api.put).mock.calls[0]?.slice(0, 2)).toEqual([
        '/inbound-calls/devices/6721a0f4c2b1d3e4f5a6b7f2/sims',
        { sims: REPORTED },
      ]),
    );
    expect(await screen.findByText('SIM 1 · Work · Swisscom')).toBeTruthy();
    expect(screen.getByText('SIM 2 · Private · Salt')).toBeTruthy();
    // The automatic check never shows a permission dialog.
    expect(ensurePermission).not.toHaveBeenCalled();
  });

  it('does not report again when the server already has the same SIMs', async () => {
    server([serverDevice({ sims: REPORTED, simsReportedAt: '2026-11-03T08:00:00.000Z' })]);
    jest.mocked(checkPermission).mockResolvedValue('granted');
    await renderWithProviders(<DevicesSection />);
    await waitFor(() => expect(telephony.getActiveSims).toHaveBeenCalled());
    expect(await screen.findByText('SIM 1 · Work · Swisscom')).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('reports again when a SIM changed since the last report', async () => {
    server([serverDevice({ sims: [REPORTED[0]], simsReportedAt: '2026-11-03T08:00:00.000Z' })]);
    jest.mocked(checkPermission).mockResolvedValue('granted');
    await renderWithProviders(<DevicesSection />);
    await waitFor(() => expect(jest.mocked(api.put).mock.calls[0]?.[1]).toEqual({ sims: REPORTED }));
  });

  it('without the permission: explains, asks only on tap, and survives a denial', async () => {
    server([serverDevice()]);
    jest.mocked(checkPermission).mockResolvedValue('denied');
    jest.mocked(ensurePermission).mockResolvedValueOnce('denied').mockResolvedValueOnce('granted');
    await renderWithProviders(<DevicesSection />);
    expect(await screen.findByText(/Allow Updata to see this phone’s SIM cards/)).toBeTruthy();
    expect(screen.getByText('SIM cards unknown — open the Updata app on that phone')).toBeTruthy();
    expect(ensurePermission).not.toHaveBeenCalled();
    expect(telephony.getActiveSims).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Allow SIM detection' }));
    await waitFor(() => expect(ensurePermission).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Allow Updata to see this phone’s SIM cards/)).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();

    jest.mocked(checkPermission).mockResolvedValue('granted');
    await fireEvent.press(screen.getByRole('button', { name: 'Allow SIM detection' }));
    await waitFor(() => expect(jest.mocked(api.put).mock.calls[0]?.[1]).toEqual({ sims: REPORTED }));
    expect(await screen.findByText('SIM cards updated')).toBeTruthy();
  });

  it('permission blocked ("don’t ask again") points to the app settings', async () => {
    server([serverDevice()]);
    jest.mocked(checkPermission).mockResolvedValue('denied');
    jest.mocked(ensurePermission).mockResolvedValue('blocked');
    await renderWithProviders(<DevicesSection />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Allow SIM detection' }));
    expect(await screen.findByRole('button', { name: 'Open settings' })).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('several paired devices', () => {
  const two = () => [
    serverDevice({ id: '6721a0f4c2b1d3e4f5a6b7f2', name: 'Office phone' }),
    serverDevice({
      id: '6721a0f4c2b1d3e4f5a6b7f3',
      name: 'Mobile',
      sims: [{ slot: 0, label: 'Old', carrier: 'Sunrise' }],
      simsReportedAt: '2026-11-01T08:00:00.000Z',
    }),
  ];

  it('reports nothing until the owner says which one is this phone', async () => {
    server(two());
    jest.mocked(checkPermission).mockResolvedValue('granted');
    jest.mocked(ensurePermission).mockResolvedValue('granted');
    await renderWithProviders(<DevicesSection />);
    expect(await screen.findByText('Office phone')).toBeTruthy();
    expect(screen.getByText('SIM cards unknown — open the Updata app on that phone')).toBeTruthy();
    expect(screen.getByText('SIM 1 · Old · Sunrise')).toBeTruthy();
    expect(telephony.getActiveSims).not.toHaveBeenCalled();

    const buttons = screen.getAllByRole('button', { name: 'This is my phone' });
    expect(buttons).toHaveLength(2);
    await fireEvent.press(buttons[1]!);
    await waitFor(() =>
      expect(jest.mocked(api.put).mock.calls[0]?.slice(0, 2)).toEqual([
        '/inbound-calls/devices/6721a0f4c2b1d3e4f5a6b7f3/sims',
        { sims: REPORTED },
      ]),
    );
    expect(mockPrefs.get(THIS_PHONE_DEVICE_KEY)).toBe('6721a0f4c2b1d3e4f5a6b7f3');
    expect(await screen.findByText('This phone')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'This is my phone' })).toHaveLength(1);
  });

  it('keeps the remembered phone in sync automatically', async () => {
    mockPrefs.set(THIS_PHONE_DEVICE_KEY, '6721a0f4c2b1d3e4f5a6b7f3');
    server(two());
    jest.mocked(checkPermission).mockResolvedValue('granted');
    await renderWithProviders(<DevicesSection />);
    await waitFor(() =>
      expect(jest.mocked(api.put).mock.calls[0]?.[0]).toBe(
        '/inbound-calls/devices/6721a0f4c2b1d3e4f5a6b7f3/sims',
      ),
    );
    expect(api.put).toHaveBeenCalledTimes(1);
  });
});
