// Entry points into the SIM call queue (selection bar, Leads screen, Call Agent hub, lead
// picker) and the "Next lead" hand-back from the call screen. APIs and telephony are mocked.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import { aiAgentApi } from '@/features/aiAgent/api/aiAgentApi';
import { LeadSelectionBar } from '@/features/aiAgent/components/LeadSelectionBar';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { callAgentApi } from '@/features/callAgent/api/callAgentApi';
import { CallAgentHomeScreen } from '@/features/callAgent/screens/CallAgentHomeScreen';
import { CallAgentLeadPickerScreen } from '@/features/callAgent/screens/CallAgentLeadPickerScreen';
import { newOperation } from '@/features/communication/domain/operations';
import { CallSessionScreen } from '@/features/communication/screens/CallSessionScreen';
import { useOperationsStore } from '@/features/communication/store/operationsStore';
import { leadsApi } from '@/features/leads/api/leadsApi';
import { LeadsScreen } from '@/features/leads/screens/LeadsScreen';
import type { Lead } from '@/features/leads/types';
import type { MainTabScreenProps, RootScreenProps } from '@/navigation/navigationTypes';
import { __setNativeTelephonyForTests } from '@/services/telephony/telephonyService';
import { renderWithProviders } from '@/test/renderWithProviders';

import { createQueue } from '../domain/queue';
import { syncCallQueue } from '../hooks/useCallQueueRuntime';
import { useCallQueueStore } from '../store/callQueueStore';

const mockStartAiAgent = jest.fn();
jest.mock('@/features/aiAgent/hooks/useAiAgent', () => ({
  ...jest.requireActual('@/features/aiAgent/hooks/useAiAgent'),
  useStartAiAgent: () => mockStartAiAgent,
}));
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const { useEffect } = jest.requireActual('react');
  return { ...actual, useFocusEffect: (effect: () => void) => useEffect(effect, [effect]) };
});
jest.mock('@/features/leads/api/leadsApi');
jest.mock('@/features/callAgent/api/callAgentApi', () => ({
  callAgentApi: { defaults: jest.fn(), saveDefaults: jest.fn() },
}));
jest.mock('@/features/aiAgent/api/aiAgentApi', () => ({
  ...jest.requireActual('@/features/aiAgent/api/aiAgentApi'),
  aiAgentApi: {
    languages: jest.fn(),
    telephonyHealth: jest.fn(),
    messagingHealth: jest.fn(),
    listCallCampaigns: jest.fn(),
    listSmsCampaigns: jest.fn(),
  },
}));
jest.mock('@/features/communication/api/communicationApi', () => ({
  communicationApi: { eligibility: jest.fn(), appendEvents: jest.fn(), complete: jest.fn() },
}));

const USER = 'u1';
const A = '64b7f0c2a1b2c3d4e5f60701';
const B = '64b7f0c2a1b2c3d4e5f60702';
const C = '64b7f0c2a1b2c3d4e5f60703';

const lead = (id: string, name: string): Lead => ({
  id,
  leadNumber: null,
  name,
  type: 'business',
  status: 'new',
  source: 'manual',
  address: null,
  phone: '+41 44 123 45 67',
  mobile: null,
  email: null,
  website: null,
  mapsUrl: null,
  assignedTo: null,
  notes: null,
  tags: [],
  lastContactedAt: null,
  lastContactChannel: null,
  createdAt: null,
});
const LEADS = [lead(A, 'Acme AG'), lead(B, 'Beta GmbH'), lead(C, 'Gamma SA')];

const native = {
  getCapabilities: jest.fn(async () => ({
    hasTelephony: true,
    callPhoneGranted: true,
    readPhoneStateGranted: true,
    dialerAvailable: true,
    simState: 'ready',
    airplaneMode: false,
  })),
  getActiveSims: jest.fn(async () => []),
  normalizeNumber: jest.fn(),
  placeCall: jest.fn(),
  openSmsComposer: jest.fn(),
  startCallStateMonitoring: jest.fn(),
  stopCallStateMonitoring: jest.fn(),
  getCallStateEvents: jest.fn(async () => []),
  clearCallStateEvents: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
};

const navigation = {
  navigate: jest.fn(),
  replace: jest.fn(),
  goBack: jest.fn(),
  popTo: jest.fn(),
  setParams: jest.fn(),
  canGoBack: () => true,
};

function rootProps<T extends 'CallAgentLeadPicker' | 'CallSession'>(
  name: T,
  params: RootScreenProps<T>['route']['params'],
) {
  return {
    route: { key: name, name, params } as unknown as RootScreenProps<T>['route'],
    navigation: navigation as unknown as RootScreenProps<T>['navigation'],
  };
}

function tabProps<T extends 'Leads' | 'CallAgent'>(name: T) {
  return {
    route: { key: name, name } as MainTabScreenProps<T>['route'],
    navigation: navigation as unknown as MainTabScreenProps<T>['navigation'],
  };
}

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __setNativeTelephonyForTests(native as never);
  useSessionStore.getState().setAuthenticated({
    id: USER,
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
  await useOperationsStore.getState().activate(USER);
  await useCallQueueStore.getState().activate(USER);
  jest.mocked(leadsApi.list).mockResolvedValue({
    items: LEADS,
    pagination: { hasNext: false, nextCursor: null, limit: 25, total: 3 },
  });
  jest.mocked(leadsApi.get).mockImplementation(async (id: string) => LEADS.find((l) => l.id === id)!);
  jest.mocked(callAgentApi.defaults).mockResolvedValue(null);
  jest.mocked(aiAgentApi.languages).mockResolvedValue({ languages: [], defaultLanguage: 'en' });
  jest
    .mocked(aiAgentApi.telephonyHealth)
    .mockResolvedValue({ configured: false, livekitReady: true, reason: 'no_sip_trunk' });
  jest.mocked(aiAgentApi.messagingHealth).mockResolvedValue({
    settings: { providers: { textbeeEnabled: false, twilioEnabled: false } },
    providers: { textbee: { eligible: false, reason: null }, twilio: { eligible: false, reason: null } },
  } as never);
  jest.mocked(aiAgentApi.listCallCampaigns).mockResolvedValue({ items: [], total: 0 });
  jest.mocked(aiAgentApi.listSmsCampaigns).mockResolvedValue({ items: [], total: 0 });
});

afterEach(() => {
  __setNativeTelephonyForTests(undefined);
});

function startQueue(ids: string[]) {
  useCallQueueStore.getState().start(
    createQueue({
      id: 'q1',
      userId: USER,
      leads: ids.map((id) => ({ id, name: LEADS.find((l) => l.id === id)!.name })),
      now: 1,
    }),
  );
}

describe('LeadSelectionBar', () => {
  const base = {
    count: 2,
    shownCount: 3,
    onSelectShown: jest.fn(),
    onClear: jest.fn(),
    onDone: jest.fn(),
    onGiveToAgent: jest.fn(),
  };

  it('keeps the single AI agent action when no queue callback is given', async () => {
    await renderWithProviders(<LeadSelectionBar {...base} />);
    expect(screen.getByRole('button', { name: 'Give to AI agent (2)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Call one by one (2)' })).toBeNull();
  });

  it('offers "Call one by one" as a second action', async () => {
    const onCallOneByOne = jest.fn();
    await renderWithProviders(<LeadSelectionBar {...base} onCallOneByOne={onCallOneByOne} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Call one by one (2)' }));
    expect(onCallOneByOne).toHaveBeenCalledTimes(1);
    expect(base.onGiveToAgent).not.toHaveBeenCalled();
  });

  it('disables both actions with nothing selected', async () => {
    await renderWithProviders(<LeadSelectionBar {...base} count={0} onCallOneByOne={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Give to AI agent (0)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Call one by one (0)' })).toBeDisabled();
  });
});

describe('LeadsScreen → call queue', () => {
  it('has a labelled Select button and starts a queue in the order shown', async () => {
    await renderWithProviders(<LeadsScreen {...tabProps('Leads')} />);
    await screen.findByText('Acme AG');
    const select = screen.getByRole('button', { name: 'Select leads for the AI agent' });
    expect(screen.getByText('Select')).toBeTruthy();
    await fireEvent.press(select);
    // Picked out of order; the queue follows the order on screen.
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Gamma SA/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Acme AG/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Call one by one (2)' }));

    const queue = useCallQueueStore.getState().queue;
    expect(queue?.leadIds).toEqual([A, C]);
    expect(queue?.items.map((item) => item.leadName)).toEqual(['Acme AG', 'Gamma SA']);
    expect(navigation.navigate).toHaveBeenCalledWith('CallQueue');
    expect(mockStartAiAgent).not.toHaveBeenCalled();
    expect(native.placeCall).not.toHaveBeenCalled();
    // The banner offers to resume it.
    expect(await screen.findByText('Resume call queue (1 of 2)')).toBeTruthy();
  });

  it('asks before replacing an unfinished queue', async () => {
    startQueue([B]);
    await renderWithProviders(<LeadsScreen {...tabProps('Leads')} />);
    await fireEvent(await screen.findByRole('button', { name: /^Acme AG/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Call one by one (1)' }));
    expect(screen.getByText('You already have a call queue')).toBeTruthy();
    expect(useCallQueueStore.getState().queue?.leadIds).toEqual([B]);

    await fireEvent.press(screen.getByRole('button', { name: 'Continue current queue' }));
    expect(useCallQueueStore.getState().queue?.leadIds).toEqual([B]);
    expect(navigation.navigate).toHaveBeenCalledWith('CallQueue');

    await fireEvent(screen.getByRole('button', { name: /^Acme AG/ }), 'longPress');
    await fireEvent.press(screen.getByRole('button', { name: 'Call one by one (1)' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Replace with new selection' }));
    expect(useCallQueueStore.getState().queue?.leadIds).toEqual([A]);
  });
});

describe('Call Agent hub', () => {
  it('"Call queue" opens the picker for a new queue', async () => {
    await renderWithProviders(<CallAgentHomeScreen {...tabProps('CallAgent')} />);
    await fireEvent.press(await screen.findByRole('button', { name: /^Call queue\. Call chosen leads/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('CallAgentLeadPicker', { purpose: 'queue' });
  });

  it('resumes the active queue and shows its banner', async () => {
    startQueue([A, B, C]);
    await renderWithProviders(<CallAgentHomeScreen {...tabProps('CallAgent')} />);
    expect(await screen.findByText('Resume call queue (1 of 3)')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Call queue\. Continue with lead 1 of 3/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('CallQueue');
  });
});

describe('CallAgentLeadPicker (queue)', () => {
  it('starts a queue in the order picked and replaces itself with the queue screen', async () => {
    await renderWithProviders(
      <CallAgentLeadPickerScreen {...rootProps('CallAgentLeadPicker', { purpose: 'queue' })} />,
    );
    await screen.findByText('Acme AG');
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Beta GmbH/ }));
    await fireEvent.press(screen.getByRole('checkbox', { name: /^Acme AG/ }));
    await fireEvent.press(screen.getByRole('button', { name: 'Start call queue (2)' }));
    expect(useCallQueueStore.getState().queue?.leadIds).toEqual([B, A]);
    expect(useCallQueueStore.getState().queue?.items[0]?.leadName).toBe('Beta GmbH');
    expect(navigation.replace).toHaveBeenCalledWith('CallQueue');
    expect(navigation.navigate).not.toHaveBeenCalledWith('AiAgentLaunch', expect.anything());
  });
});

describe('CallSession in a queue', () => {
  it('after the outcome is saved, shows "Next lead" that returns to the queue', async () => {
    startQueue([A, B]);
    useOperationsStore.getState().put({
      ...newOperation({
        operationId: 'op1',
        userId: USER,
        leadId: A,
        leadName: 'Acme AG',
        channel: 'phone',
        destinationField: 'phone',
        sim: null,
        now: Date.now(),
      }),
      serverConfirmed: true,
      phase: 'done',
      dispatchedAt: Date.now(),
      route: 'telecom_direct',
      completePayload: { outcome: { disposition: 'interested', connected: 'yes', notes: 'ok' } },
    });
    useCallQueueStore.getState().change((q) => ({
      ...q,
      items: q.items.map((item, i) => (i === 0 ? { ...item, operationId: 'op1' } : item)),
    }));
    syncCallQueue();

    await renderWithProviders(
      <CallSessionScreen {...rootProps('CallSession', { leadId: A, operationId: 'op1', queueId: 'q1' })} />,
    );
    const next = await screen.findByRole('button', { name: 'Next lead' });
    expect(screen.queryByRole('button', { name: 'Back to lead' })).toBeNull();
    await fireEvent.press(next);
    expect(navigation.popTo).toHaveBeenCalledWith('CallQueue');
    expect(native.placeCall).not.toHaveBeenCalled();
  });

  it('without a queue it keeps "Back to lead"', async () => {
    useOperationsStore.getState().put({
      ...newOperation({
        operationId: 'op2',
        userId: USER,
        leadId: A,
        leadName: 'Acme AG',
        channel: 'phone',
        destinationField: 'phone',
        sim: null,
        now: Date.now(),
      }),
      serverConfirmed: true,
      phase: 'done',
      completePayload: { outcome: { disposition: 'busy', connected: 'no', notes: '' } },
    });
    await renderWithProviders(
      <CallSessionScreen {...rootProps('CallSession', { leadId: A, operationId: 'op2' })} />,
    );
    expect(await screen.findByRole('button', { name: 'Back to lead' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Next lead' })).toBeNull();
  });
});
