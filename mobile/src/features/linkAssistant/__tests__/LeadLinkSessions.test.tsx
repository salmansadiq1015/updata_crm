import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { ApiError } from '@/services/api/apiErrors';
import { renderWithProviders } from '@/test/renderWithProviders';

import { linkAssistantApi } from '../api';
import { LeadLinkSessions } from '../components/LeadLinkSessions';

jest.mock('../api', () => ({
  linkAssistantApi: {
    leadSessions: jest.fn(),
    session: jest.fn(),
    contactStatus: jest.fn(),
    reportStop: jest.fn(),
  },
}));

const session = (funnel: Record<string, string>, status = 'issued') => ({
  id: 's1',
  campaignId: 'c1',
  leadId: 'l1',
  status,
  language: 'en',
  turns: 0,
  funnel,
  lastActivityAt: '2026-10-22T08:00:00.000Z',
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(linkAssistantApi.contactStatus).mockResolvedValue({
    leadId: 'l1',
    smsBlocked: false,
    callsBlocked: false,
    optedOut: false,
    lastOptOut: null,
  } as never);
});

describe('LeadLinkSessions', () => {
  it('marks only recorded steps: an SMS that was sent is not shown as delivered', async () => {
    jest
      .mocked(linkAssistantApi.leadSessions)
      .mockResolvedValue([
        session({ link_issued: '2026-10-22T07:59:00.000Z', sms_sent: '2026-10-22T08:00:00.000Z' }),
      ] as never);
    jest.mocked(linkAssistantApi.session).mockResolvedValue({
      ...session({}),
      campaignName: 'Solar survey',
      answers: [{ fieldKey: 'bill', label: 'Monthly bill', value: null, unknown: true, confirmed: false }],
      reviewRequired: true,
    } as never);
    await renderWithProviders(<LeadLinkSessions leadId="l1" />);

    expect(await screen.findByTestId('link-step-sent')).toBeTruthy();
    expect(screen.getByTestId('link-step-sent').props.accessibilityLabel).not.toMatch(/not yet/);
    expect(screen.getByTestId('link-step-delivered').props.accessibilityLabel).toBe('Delivered: not yet');
    expect(screen.getByTestId('link-step-opened').props.accessibilityLabel).toBe('Opened: not yet');
    // Review is a badge; an unknown answer reads "Not known".
    expect(await screen.findByText('Needs review')).toBeTruthy();
    expect(screen.getByText('Not known')).toBeTruthy();
  });

  it('shows a loading placeholder, then an error with a working retry', async () => {
    let fail = true;
    jest.mocked(linkAssistantApi.leadSessions).mockImplementation(async () => {
      if (fail) throw new Error('offline');
      return [] as never;
    });
    await renderWithProviders(<LeadLinkSessions leadId="l1" />);
    expect(screen.getByLabelText('SMS chat assistant')).toBeTruthy(); // skeleton while loading

    // Generous waits: the full suite runs many workers and the default 1 s is tight.
    expect(await screen.findByText("Couldn't load the chat status.", {}, { timeout: 5000 })).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByText('Try again'));
    await waitFor(() => expect(screen.queryByText("Couldn't load the chat status.")).toBeNull(), { timeout: 5000 });
    expect(linkAssistantApi.leadSessions).toHaveBeenCalledTimes(2);
  });
  it('shows nothing (no error) when the server does not have the chat assistant yet (404)', async () => {
    jest
      .mocked(linkAssistantApi.leadSessions)
      .mockRejectedValue(new ApiError({ kind: 'http', status: 404, message: 'Not found' } as never));
    await renderWithProviders(<LeadLinkSessions leadId="l1" />);
    await waitFor(() => expect(screen.queryByLabelText('SMS chat assistant')).toBeNull());
    expect(screen.queryByText("Couldn't load the chat status.")).toBeNull();
  });
});
