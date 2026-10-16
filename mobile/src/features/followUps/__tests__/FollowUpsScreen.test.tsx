import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { followUpsApi } from '../api/followUpsApi';
import { FollowUpsScreen } from '../screens/FollowUpsScreen';
import type { FollowUp } from '../types';

jest.mock('../api/followUpsApi', () => ({
  FOLLOW_UP_WINDOW_DAYS: { past: 30, future: 30 },
  followUpsApi: { list: jest.fn() },
}));

const HOUR = 60 * 60 * 1000;
const row = (id: string, offsetMs: number, name: string): FollowUp => ({
  contactLogId: id,
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

  it('shows an empty state', async () => {
    jest.mocked(followUpsApi.list).mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText('No follow-ups planned')).toBeTruthy();
  });
});
