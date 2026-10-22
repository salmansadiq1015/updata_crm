// SMS queue screen with mocked lead API, contact flows and native telephony (simulated device).
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { PermissionsAndroid } from 'react-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import {
  ContactFlowError,
  startDirectSms,
  startSms,
  submitOutcome,
} from '@/features/communication/services/contactFlows';
import { useOperationsStore } from '@/features/communication/store/operationsStore';
import { leadsApi } from '@/features/leads/api/leadsApi';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';
import { renderWithProviders } from '@/test/renderWithProviders';

import { SmsQueueScreen } from '../screens/SmsQueueScreen';

jest.mock('@/features/leads/api/leadsApi', () => ({ leadsApi: { get: jest.fn() } }));
jest.mock('@/features/communication/services/contactFlows', () => {
  const actual = jest.requireActual('@/features/communication/services/contactFlows');
  return {
    ...actual,
    startSms: jest.fn(),
    startDirectSms: jest.fn(),
    submitOutcome: jest.fn(async () => undefined),
  };
});

const leads: Record<string, unknown> = {
  l1: { id: 'l1', name: 'Zafar Traders', address: { city: 'Lahore' }, mobile: '+923001234567', phone: null },
  l2: { id: 'l2', name: 'Bilal Store', address: { city: null }, mobile: null, phone: '+923009876543' },
  l3: { id: 'l3', name: 'No Number Co', address: { city: 'Karachi' }, mobile: null, phone: null },
};
let sendDeclared = true;
const native = {
  getCapabilities: jest.fn(async () => ({
    hasTelephony: true,
    simState: 'ready',
    smsPermissionsDeclared: sendDeclared,
    smsComposerAvailable: true,
  })),
  getActiveSims: jest.fn(async () => [
    { subscriptionId: 2, slotIndex: 0, displayName: 'Telenor', carrierName: 'Telenor' },
    { subscriptionId: 3, slotIndex: 1, displayName: 'Jazz', carrierName: 'Jazz' },
  ]),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};
const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const render = (leadIds = ['l1', 'l2', 'l3']) =>
  renderWithProviders(
    <SmsQueueScreen
      {...({
        navigation,
        route: { key: 'k', name: 'SmsQueue', params: { leadIds } },
      } as unknown as RootScreenProps<'SmsQueue'>)}
    />,
  );

beforeEach(() => {
  jest.clearAllMocks();
  sendDeclared = true;
  __setNativeTelephonyForTests(native as never);
  jest.mocked(leadsApi.get).mockImplementation(async (id: string) => leads[id] as never);
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  useSessionStore.getState().setAuthenticated({
    id: 'u1',
    email: 'u1@example.com',
    firstName: null,
    lastName: null,
    fullName: 'U1',
    phone: null,
    language: null,
    avatarUrl: null,
    roleName: null,
    status: null,
  });
});
afterEach(() => {
  __setNativeTelephonyForTests(undefined);
  useOperationsStore.setState({ operations: {} });
});

async function compose(text: string, leadIds?: string[]) {
  await render(leadIds);
  await fireEvent.changeText(await screen.findByLabelText('Message'), text);
  expect(await screen.findByText(`Preview for Zafar Traders`)).toBeTruthy();
}

describe('SmsQueueScreen', () => {
  it('Messages mode: one tap per lead, the user confirms each, every SMS is personalised and logged', async () => {
    jest.mocked(startSms).mockResolvedValueOnce('op1').mockResolvedValueOnce('op2');
    await compose('Salam {name}, from {city}!');
    expect(screen.getByText('Salam Zafar Traders, from Lahore!')).toBeTruthy();
    // Bilal Store has no city: the user is warned before anything is sent.
    expect(screen.getByText(/\{city\} is empty for 1 lead\(s\): Bilal Store/)).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue with 3 lead(s)'));

    // The lead without a number is marked, not texted.
    // …with the reason in words, and it already counts as processed in the progress bar.
    expect(await screen.findByText(/Cannot text · No valid mobile number/)).toBeTruthy();
    expect(screen.getByRole('progressbar').props.accessibilityValue).toEqual({ min: 0, max: 3, now: 1 });
    expect(screen.getByText('1 of 3 done')).toBeTruthy();
    await fireEvent.press(screen.getByText('Open Messages'));
    expect(startSms).toHaveBeenCalledWith(
      expect.objectContaining({
        lead: { id: 'l1', name: 'Zafar Traders' },
        destinationField: 'mobile',
        body: 'Salam Zafar Traders, from Lahore!',
      }),
    );
    await fireEvent.press(await screen.findByText('Yes, sent'));
    // "Sent" here is the user's own report, never carrier delivery.
    expect(await screen.findByText(/Delivery is not confirmed/)).toBeTruthy();
    expect(submitOutcome).toHaveBeenCalledWith(
      'op1',
      expect.objectContaining({
        disposition: 'sent',
        sms: expect.objectContaining({ sendStatus: 'user_reported_sent' }),
      }),
    );

    await fireEvent.press(await screen.findByText('Open Messages'));
    expect(startSms).toHaveBeenLastCalledWith(
      expect.objectContaining({ destinationField: 'phone', body: 'Salam Bilal Store, from!' }),
    );
    await fireEvent.press(await screen.findByText('No'));
    expect(submitOutcome).toHaveBeenLastCalledWith(
      'op2',
      expect.objectContaining({
        disposition: 'not_sent',
        sms: expect.objectContaining({ sendStatus: 'user_reported_not_sent' }),
      }),
    );
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(startDirectSms).not.toHaveBeenCalled();
  });

  it('Automatic mode: needs a SIM choice and a confirmation, then sends from that SIM and reports each result', async () => {
    jest
      .mocked(startDirectSms)
      .mockResolvedValueOnce({ operationId: 'a1', status: 'sent', errorCode: null })
      .mockRejectedValueOnce(new ContactFlowError('NOT_AUTHORISED'));
    await compose('Hi {name}');
    await fireEvent.press(screen.getByText('Send automatically from my SIM'));
    expect(screen.getByText('Continue with 3 lead(s)')).toBeDisabled();
    await fireEvent.press(screen.getByText('Jazz'));
    await fireEvent.press(screen.getByText('Continue with 3 lead(s)'));
    expect(await screen.findByText('Send 2 SMS automatically?')).toBeTruthy();
    expect(screen.getByText(/They go out from Jazz now/)).toBeTruthy();
    expect(startDirectSms).not.toHaveBeenCalled(); // nothing before the confirmation

    await fireEvent.press(screen.getByText('Send now'));
    await waitFor(() => expect(startDirectSms).toHaveBeenCalledTimes(1));
    expect(startDirectSms).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'Hi Zafar Traders',
        sim: expect.objectContaining({ subscriptionId: 3 }),
      }),
    );
    await waitFor(() => expect(startDirectSms).toHaveBeenCalledTimes(2), { timeout: 9000 });
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(screen.getByText('Sent')).toBeTruthy();
    expect(screen.getByText(/Cannot text · NOT_AUTHORISED/)).toBeTruthy();
  }, 15000);

  it('Automatic mode: a network refusal shows the radio code and what to check', async () => {
    jest
      .mocked(startDirectSms)
      .mockResolvedValueOnce({ operationId: 'a1', status: 'failed', errorCode: 'GENERIC_FAILURE' });
    await compose('Hi {name}', ['l1']);
    await fireEvent.press(screen.getByText('Send automatically from my SIM'));
    await fireEvent.press(screen.getByText('Telenor'));
    await fireEvent.press(screen.getByText('Continue with 1 lead(s)'));
    await fireEvent.press(await screen.findByText('Send now'));
    expect(await screen.findByText('Done')).toBeTruthy();
    expect(screen.getByText(/Not sent · GENERIC_FAILURE/)).toBeTruthy();
    expect(screen.getByText(/usually no SMS balance or bundle on this SIM/)).toBeTruthy();
  });

  it('a lead texted recently is skipped but can be included before sending; a failed SMS does not count', async () => {
    const op = (leadId: string, disposition: string) => ({
      operationId: `op-${leadId}`,
      userId: 'u1',
      leadId,
      channel: 'sms',
      phase: 'done',
      createdAt: Date.now() - 60_000,
      completePayload: { outcome: { disposition } },
    });
    useOperationsStore.setState({
      operations: { a: op('l1', 'sent'), b: op('l2', 'not_sent') } as never,
    });
    jest.mocked(startDirectSms).mockResolvedValue({ operationId: 'x', status: 'sent', errorCode: null });
    await compose('Hi {name}', ['l1', 'l2']);
    await fireEvent.press(screen.getByText('Send automatically from my SIM'));
    await fireEvent.press(screen.getByText('Jazz'));
    await fireEvent.press(screen.getByText('Continue with 2 lead(s)'));
    // l1 was sent minutes ago: skipped; l2's SMS failed: texted again.
    expect(await screen.findByText('Send 1 SMS automatically?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Include them'));
    expect(await screen.findByText('Send 2 SMS automatically?')).toBeTruthy();
  });

  it('without SEND_SMS in this build only the Messages mode is offered', async () => {
    sendDeclared = false;
    await compose('Hi {name}');
    expect(screen.queryByText('Send automatically from my SIM')).toBeNull();
    expect(screen.getByText(/Automatic sending is not available in this app version/)).toBeTruthy();
  });

  it('warns about placeholders the app cannot fill', async () => {
    await compose('Hi {name}, your {offer}');
    expect(screen.getByText(/Unknown placeholder\(s\): offer/)).toBeTruthy();
  });
});
