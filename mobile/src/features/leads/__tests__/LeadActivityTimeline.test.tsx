import { screen } from '@testing-library/react-native';

import { renderWithProviders } from '@/test/renderWithProviders';
import { listLeadTimeline } from '../api/leadTimelineApi';
import { LeadActivityTimeline } from '../components/LeadActivityTimeline';

jest.mock('../api/leadTimelineApi');

it('shows email and call activity from the shared lead timeline', async () => {
  jest.mocked(listLeadTimeline).mockResolvedValue({
    data: [
      {
        id: 'email:1',
        type: 'provider_message',
        at: '2026-11-03T09:30:00Z',
        title: 'Your requested information',
        status: 'sent',
        body: 'Thanks for your time.',
      },
      {
        id: 'call:1',
        type: 'ai_call',
        at: '2026-11-03T09:00:00Z',
        title: 'Qualification call',
        status: 'answered_completed',
        summary: 'Lead requested information.',
      },
    ],
    pagination: { hasNext: false, nextCursor: null, limit: 10 },
  });
  await renderWithProviders(<LeadActivityTimeline leadId="lead-1" />);
  expect(await screen.findByText('Your requested information')).toBeTruthy();
  expect(screen.getByText('Qualification call')).toBeTruthy();
  expect(screen.getByText('Thanks for your time.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Load more activity' })).toBeNull();
});
