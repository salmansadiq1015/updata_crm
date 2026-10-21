// Readiness screen against a fake native telephony module and a mocked server check.
// Simulated device state only; real-device behaviour is recorded in LEAD-VOICE-CALLING.md.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { PermissionsAndroid } from 'react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';
import { renderWithProviders } from '@/test/renderWithProviders';

import { checkServer } from '../api';
import { MobileReadinessScreen } from '../screens/MobileReadinessScreen';

jest.mock('../api', () => ({ checkServer: jest.fn() }));
const server = jest.mocked(checkServer);

let granted = true;
const native = {
  getCapabilities: jest.fn(async () => ({
    hasTelephony: true,
    sdkInt: 33,
    simState: 'ready',
    airplaneMode: false,
    callPhoneGranted: granted,
    readPhoneStateGranted: granted,
    dialerAvailable: true,
    smsComposerAvailable: true,
    isDefaultDialer: false,
    smsPermissionsDeclared: false,
    sendSmsGranted: false,
    receiveSmsGranted: false,
    notificationsGranted: true,
    directSmsSupported: false,
  })),
  getActiveSims: jest.fn(async () =>
    granted
      ? [
          { subscriptionId: 2, slotIndex: 0, displayName: 'Telenor', carrierName: 'Telenor' },
          { subscriptionId: 3, slotIndex: 1, displayName: 'Jazz', carrierName: 'Jazz' },
        ]
      : [],
  ),
  isIgnoringBatteryOptimizations: jest.fn(async () => true),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
const navigation = { navigate: jest.fn() };
const check = jest.spyOn(PermissionsAndroid, 'check');
const request = jest.spyOn(PermissionsAndroid, 'request');

const render = () =>
  renderWithProviders(
    <MobileReadinessScreen
      {...({
        navigation,
        route: { key: 'k', name: 'MobileReadiness' },
      } as unknown as RootScreenProps<'MobileReadiness'>)}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  granted = true;
  __setNativeTelephonyForTests(native as never);
  check.mockImplementation(async () => granted);
  request.mockImplementation(async () => {
    granted = true;
    return PermissionsAndroid.RESULTS.GRANTED;
  });
  server.mockResolvedValue({
    state: 'ok',
    latencyMs: 42,
    data: { serverTime: null, ai: { configured: true }, cloudCalling: { configured: false } },
  });
});

afterEach(() => __setNativeTelephonyForTests(undefined));

describe('MobileReadinessScreen', () => {
  it('shows a SIM-ready phone without any trunk or cloud requirement and opens SIM call campaigns', async () => {
    await render();
    expect(await screen.findByText('Ready to call from your SIM')).toBeTruthy();
    expect(screen.getByText('2 SIMs: Telenor, Jazz. You choose one per campaign.')).toBeTruthy();
    expect(screen.getByText('Connected (42 ms).')).toBeTruthy();
    expect(screen.getByText('Not set up. Not needed: calls use your SIM.')).toBeTruthy();
    expect(screen.queryByText(/phone trunk/)).toBeNull();
    await fireEvent.press(screen.getByText('Call campaigns (your SIM)'));
    expect(navigation.navigate).toHaveBeenCalledWith('CallCampaigns');
  });

  it('asks for the phone permission from its row and updates once granted', async () => {
    granted = false;
    await render();
    expect(await screen.findByText(/Without it the dialer opens/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Allow phone access'));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        PermissionsAndroid.PERMISSIONS.READ_PHONE_STATE,
        expect.anything(),
      ),
    );
    expect(await screen.findByText('Ready to call from your SIM')).toBeTruthy();
  });

  it('offline: the CRM row blocks calling and offers a retry', async () => {
    server.mockResolvedValue({ state: 'offline' });
    await render();
    expect(await screen.findByText('No internet connection.')).toBeTruthy();
    expect(screen.getByText('Calling is not possible yet')).toBeTruthy();
    expect(screen.queryByText('Call campaigns (your SIM)')).toBeNull();
    server.mockResolvedValue({ state: 'ok', latencyMs: 30, data: null });
    await fireEvent.press(screen.getByText('Try again'));
    expect(
      await screen.findByText('Update the CRM server to see the AI status. Calling still works.'),
    ).toBeTruthy();
  });

  it('states that AI cannot speak or listen inside a SIM call', async () => {
    await render();
    expect(
      await screen.findByText(/Android doesn't let apps hear or speak inside a normal SIM call/),
    ).toBeTruthy();
  });
});
