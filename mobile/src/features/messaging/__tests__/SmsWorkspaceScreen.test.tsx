import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import { messagingApi } from '../api';
import { SmsCampaignCreateScreen, SmsCampaignDetailScreen } from '../SmsWorkspaceScreen';

jest.mock('../api', () => ({
  messagingApi: {
    services: jest.fn(),
    create: jest.fn(),
    campaign: jest.fn(),
    recipients: jest.fn(),
    action: jest.fn(),
    retry: jest.fn(),
  },
}));
jest.mock('@/features/leads/hooks/useLeads', () => ({
  useLeadList: () => ({
    isPending: false,
    isError: false,
    data: { pages: [{ items: [{ id: 'lead-1', name: 'Ada Test', mobile: '+41791234567', status: 'new' }] }] },
  }),
}));
const campaign = {
  _id: 'campaign-1',
  name: 'Welcome',
  status: 'draft',
  createdAt: '2026-11-03T10:00:00Z',
  content: { bodyText: 'Hi {{firstName}}' },
  routing: { smsProvider: 'textbee' },
  summary: { total: 1, eligible: 1, totalSegments: 1 },
};
const recipient = {
  _id: 'recipient-1',
  leadId: { _id: 'lead-1', name: 'Ada Test' },
  destination: '+41791234567',
  rendered: { bodyText: 'Hi Ada' },
  status: 'draft',
  eligibility: { eligible: true, reasons: [] },
};
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(messagingApi.services).mockResolvedValue([
    {
      id: 'textbee',
      name: 'TextBee',
      available: true,
      configured: true,
      sender: 'Office SIM',
      capabilities: { media: false, subject: false, deliveryReceipts: true, maxBodyLength: 10000 },
    },
    {
      id: 'twilio',
      name: 'Twilio',
      available: false,
      configured: false,
      reason: 'disabled',
      capabilities: { media: false, subject: false, deliveryReceipts: false, maxBodyLength: 10000 },
    },
  ]);
  jest.mocked(messagingApi.create).mockResolvedValue(campaign);
  jest.mocked(messagingApi.campaign).mockResolvedValue(campaign);
  jest.mocked(messagingApi.recipients).mockResolvedValue([recipient]);
  jest.mocked(messagingApi.action).mockResolvedValue({ ...campaign, status: 'queued' });
});
it('requires a provider, validates the URL, preserves personalization, and creates only a draft', async () => {
  const navigate = jest.fn();
  await renderWithProviders(
    <SmsCampaignCreateScreen
      {...({
        navigation: { navigate },
        route: { name: 'SmsCampaignCreate' },
      } as unknown as RootScreenProps<'SmsCampaignCreate'>)}
    />,
  );
  await waitFor(() => expect(screen.getByText('TextBee')).toBeTruthy());
  await fireEvent.press(screen.getByLabelText('Select TextBee'));
  await fireEvent.press(screen.getByText('Continue to message'));
  await fireEvent.changeText(screen.getByLabelText('Campaign title (internal)'), 'Welcome');
  await fireEvent.changeText(screen.getByLabelText('Message'), 'Hi {{firstName}}');
  await fireEvent.changeText(
    screen.getByLabelText('Website, booking or hosted image URL (optional)'),
    'javascript:alert(1)',
  );
  expect(screen.getByText('Enter a complete http:// or https:// URL')).toBeTruthy();
  await fireEvent.changeText(
    screen.getByLabelText('Website, booking or hosted image URL (optional)'),
    'https://example.com',
  );
  await fireEvent.press(screen.getByText('Choose recipients'));
  await fireEvent.press(screen.getByLabelText('Select Ada Test'));
  await fireEvent.press(screen.getByText('Create draft & review'));
  await waitFor(() => expect(messagingApi.create).toHaveBeenCalledTimes(1));
  expect(messagingApi.create).toHaveBeenCalledWith(
    expect.objectContaining({
      content: { language: 'auto', bodyText: 'Hi {{firstName}}\nhttps://example.com', fallbackValues: {} },
      routing: { smsProvider: 'textbee', allowFallback: false },
      selection: { mode: 'explicit', leadIds: ['lead-1'] },
      idempotencyKey: expect.any(String),
    }),
  );
  expect(messagingApi.action).not.toHaveBeenCalled();
});
it('shows actual personalized content and only sends after explicit confirmation', async () => {
  await renderWithProviders(
    <SmsCampaignDetailScreen
      {...({
        navigation: { navigate: jest.fn() },
        route: { params: { campaignId: 'campaign-1' } },
      } as unknown as RootScreenProps<'SmsCampaignDetail'>)}
    />,
  );
  await waitFor(() => expect(screen.getByText('Hi Ada')).toBeTruthy());
  expect(messagingApi.action).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('Confirm & send SMS'));
  await waitFor(() => expect(messagingApi.action).toHaveBeenCalledWith('campaign-1', 'start'));
});
it('never offers retry for an ambiguous provider submission', async () => {
  jest.mocked(messagingApi.campaign).mockResolvedValue({ ...campaign, status: 'completed' });
  jest
    .mocked(messagingApi.recipients)
    .mockResolvedValue([{ ...recipient, status: 'unknown', latestAttempt: { outcome: 'ambiguous' } }]);
  await renderWithProviders(
    <SmsCampaignDetailScreen
      {...({
        navigation: { navigate: jest.fn() },
        route: { params: { campaignId: 'campaign-1' } },
      } as unknown as RootScreenProps<'SmsCampaignDetail'>)}
    />,
  );
  await waitFor(() => expect(screen.getByText('Hi Ada')).toBeTruthy());
  expect(screen.queryByText('Retry failed message')).toBeNull();
  expect(screen.queryByText('Confirm & send SMS')).toBeNull();
});
