// Campaign list + guided creation against a mocked API (no backend, no calls).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';

import { callCampaignApi } from '../api/callCampaignApi';
import { CallCampaignCreateScreen } from '../screens/CallCampaignCreateScreen';
import { CallCampaignsScreen } from '../screens/CallCampaignsScreen';
import { useCampaignOutbox } from '../store/campaignOutbox';
import { callCampaignSchema } from '../types';

jest.mock('../api/callCampaignApi', () => ({
  callCampaignApi: { campaigns: jest.fn(), create: jest.fn() },
}));
const api = jest.mocked(callCampaignApi);
const navigation = { navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn() };

const camp = (id: string, name: string, status: string, summary: object = {}) =>
  callCampaignSchema.parse({
    _id: id,
    name,
    status,
    summary: { total: 4, ...summary },
    lastActivityAt: new Date().toISOString(),
  });

beforeEach(async () => {
  jest.clearAllMocks();
  Object.values(api).forEach((fn) => fn.mockReset());
  await AsyncStorage.clear();
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
  await useCampaignOutbox.getState().activate('u1');
});

describe('CallCampaignsScreen', () => {
  it('lists server campaigns with progress, review and callback counts; filters by status', async () => {
    api.campaigns.mockResolvedValue({
      data: [
        camp('c1', 'Garages', 'running', { completed: 2, needsReview: 1, callbacksDue: 1, callbacks: 1 }),
        camp('c2', 'Bakeries', 'draft'),
      ],
      page: { total: 2, pages: 1 },
    });
    await renderWithProviders(
      <CallCampaignsScreen
        {...({
          navigation,
          route: { key: 'k', name: 'CallCampaigns' },
        } as unknown as RootScreenProps<'CallCampaigns'>)}
      />,
    );
    expect(await screen.findByText('Garages')).toBeTruthy();
    expect(screen.getByText('2 of 4 done · 2 left')).toBeTruthy();
    expect(screen.getByText('To review: 1')).toBeTruthy();
    expect(screen.getByText('Callbacks due: 1')).toBeTruthy();
    await fireEvent.press(screen.getByText('Paused'));
    await waitFor(() =>
      expect(api.campaigns).toHaveBeenLastCalledWith({ status: 'paused', q: undefined }, expect.anything()),
    );
    await fireEvent.press(screen.getByText('Bakeries'));
    expect(navigation.navigate).toHaveBeenCalledWith('CallCampaignDetail', { campaignId: 'c2' });
  });

  it('warns about results still on the phone', async () => {
    api.campaigns.mockResolvedValue({ data: [], page: {} });
    useCampaignOutbox.getState().enqueue({
      kind: 'complete',
      taskId: 't',
      campaignId: 'c1',
      attemptId: 'a1',
      body: { attemptId: 'a1', outcome: 'busy' },
    });
    await renderWithProviders(
      <CallCampaignsScreen
        {...({
          navigation,
          route: { key: 'k', name: 'CallCampaigns' },
        } as unknown as RootScreenProps<'CallCampaigns'>)}
      />,
    );
    expect(await screen.findByText('Results waiting to sync: 1')).toBeTruthy();
    expect(await screen.findByText('No call campaigns yet.')).toBeTruthy();
  });
});

describe('CallCampaignCreateScreen', () => {
  const route = { key: 'k', name: 'CallCampaignCreate', params: { leadIds: ['l1', 'l2', 'l1'] } };
  const render = () =>
    renderWithProviders(
      <CallCampaignCreateScreen
        {...({ navigation, route } as unknown as RootScreenProps<'CallCampaignCreate'>)}
      />,
    );

  it('walks details → questions → calling → review and saves once to the server', async () => {
    api.create.mockResolvedValue(camp('new1', 'Q4 garages', 'draft'));
    await render();
    expect(screen.getByText('Selected leads: 2')).toBeTruthy(); // duplicates removed
    await fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText('Enter a name')).toBeTruthy(); // cannot continue without a name
    await fireEvent.changeText(screen.getByLabelText('Campaign name'), 'Q4 garages');
    await fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText('Offer read-aloud of questions')).toBeTruthy();
    await fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText('Dial the next lead automatically after the pause')).toBeTruthy();
    await fireEvent.press(screen.getByText('20 s'));
    await fireEvent.press(screen.getByText('Continue'));
    expect(await screen.findByText('Leads: 2')).toBeTruthy();
    const save = screen.getByText('Create campaign');
    await fireEvent.press(save);
    await fireEvent.press(save);
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('CallCampaignDetail', { campaignId: 'new1' }),
    );
    expect(api.create).toHaveBeenCalledTimes(1);
    const input = api.create.mock.calls[0]![0];
    expect(input).toMatchObject({
      name: 'Q4 garages',
      leadIds: ['l1', 'l2'],
      settings: expect.objectContaining({ countdownSeconds: 20, autoDial: false, readAloud: true }),
    });
    expect(input.questionnaire.questions.length).toBeGreaterThan(0);
    expect(input.questionnaire.questions.map((q) => q.order)).toEqual(
      input.questionnaire.questions.map((_, i) => i + 1),
    );
  });

  it('shows the server error and stays on review', async () => {
    api.create.mockRejectedValue(
      new ApiError({ kind: 'http', status: 400, message: 'Selected leads are unavailable' }),
    );
    await render();
    await fireEvent.changeText(screen.getByLabelText('Campaign name'), 'X');
    for (let i = 0; i < 3; i += 1) await fireEvent.press(screen.getByText('Continue'));
    await fireEvent.press(await screen.findByText('Create campaign'));
    expect(await screen.findByText('Selected leads are unavailable')).toBeTruthy();
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
