import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { followUpsApi } from '../api/followUpsApi';
import { FollowUpsScreen } from '../screens/FollowUpsScreen';
import type { FollowUp } from '../types';

jest.mock('../api/followUpsApi', () => ({
  FOLLOW_UP_WINDOW_DAYS: { past: 30, future: 30 },
  followUpsApi: { list: jest.fn(), aiAction: jest.fn() },
}));

const HOUR = 60 * 60 * 1000;
const row = (id: string, offsetMs: number, name: string): FollowUp => ({
  contactLogId: id,
  followUpId: null,
  automation: null,
  leadId: `64b7f0c2a1b2c3d4e5f6071${id}`,
  leadNumber: null,
  leadName: name,
  followUpAt: new Date(Date.now() + offsetMs).toISOString(),
  followUpTimezone: null,
  channel: 'phone',
  subject: null,
  note: 'Call back about the offer',
});

async function renderScreen() {
  const navigation = { navigate: jest.fn() } as unknown as RootScreenProps<'FollowUps'>['navigation'];
  const route = { key: 'FollowUps', name: 'FollowUps' } as RootScreenProps<'FollowUps'>['route'];
  await renderWithProviders(<FollowUpsScreen navigation={navigation} route={route} />);
  return navigation;
}

beforeEach(() => jest.clearAllMocks());

describe('FollowUpsScreen', () => {
  it('shows overdue and upcoming sections; tap opens the lead, Call starts a call', async () => {
    jest
      .mocked(followUpsApi.list)
      .mockResolvedValue([row('1', -2 * HOUR, 'Overdue AG'), row('2', 72 * HOUR, 'Later GmbH')]);
    const navigation = await renderScreen();

    expect(await screen.findByText('Overdue · 1')).toBeTruthy();
    expect(screen.getByText('Upcoming · 1')).toBeTruthy();
    expect(followUpsApi.list).toHaveBeenCalledWith('mine', expect.anything());

    await fireEvent.press(screen.getByRole('button', { name: 'Call Overdue AG' }));
    expect(navigation.navigate).toHaveBeenCalledWith('CallSession', { leadId: '64b7f0c2a1b2c3d4e5f60711' });

    await fireEvent.press(screen.getByText('Later GmbH'));
    expect(navigation.navigate).toHaveBeenCalledWith('LeadDetail', { leadId: '64b7f0c2a1b2c3d4e5f60712' });

    await fireEvent.press(screen.getByRole('radio', { name: 'Everyone' }));
    await waitFor(() => expect(followUpsApi.list).toHaveBeenCalledWith('all', expect.anything()));
  });

  it('shows AI-managed follow-ups with agent, state and summary, and controls the AI from the app', async () => {
    const ai = (state: string): FollowUp => ({
      ...row('3', 2 * HOUR, 'Müller AG'), followUpId: 'fu-3',
      automation: { mode: 'ai', state, reason: 'CALLBACK_REQUESTED', agentId: 'a1', agentName: 'David', attempts: 0, lastError: null, callState: null, summary: 'Asked to be called back.' },
    });
    jest.mocked(followUpsApi.list).mockResolvedValue([ai('scheduled')]);
    jest.mocked(followUpsApi.aiAction).mockResolvedValue(undefined);
    await renderScreen();
    expect(await screen.findByText('AI · David')).toBeTruthy();
    expect(screen.getByText('Scheduled')).toBeTruthy();
    expect(screen.getByText('Asked to be called back.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Pause the AI follow-up for Müller AG' }));
    await waitFor(() => expect(followUpsApi.aiAction).toHaveBeenCalledWith('fu-3', 'pause'));
    await fireEvent.press(screen.getByRole('button', { name: 'Start the AI follow-up call to Müller AG now' }));
    await waitFor(() => expect(followUpsApi.aiAction).toHaveBeenCalledWith('fu-3', 'call-now'));
  });

  it('never offers an AI "call now" while the AI call is already on the line', async () => {
    jest.mocked(followUpsApi.list).mockResolvedValue([{
      ...row('4', HOUR, 'Live AG'), followUpId: 'fu-4',
      automation: { mode: 'ai', state: 'calling', reason: null, agentId: 'a1', agentName: 'David', attempts: 1, lastError: null, callState: 'in_progress', summary: null },
    }]);
    await renderScreen();
    expect(await screen.findByText('Calling')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Start the AI follow-up call/ })).toBeNull();
  });

  it('shows an empty state', async () => {
    jest.mocked(followUpsApi.list).mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText('No follow-ups planned')).toBeTruthy();
  });
});
