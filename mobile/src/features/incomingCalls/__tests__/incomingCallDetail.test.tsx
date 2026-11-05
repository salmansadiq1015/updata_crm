// Call details: work status (pill, history, change / assign sheets), the lead chooser when no
// lead is linked, and the AI cost line. HTTP client mocked; the server shapes come from the fixtures.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { z } from 'zod';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { api } from '@/services/api/apiClient';
import { renderWithProviders } from '@/test/renderWithProviders';

import { CALL_ID, LEAD_ID, serverDetail } from '../__fixtures__/serverPayloads';
import { IncomingCallDetailScreen } from '../screens/IncomingCallDetailScreen';

jest.mock('@/services/api/apiClient', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
jest.mock('../realtime/inboundSocket', () => ({
  subscribeInboundEvents: () => () => undefined,
  isInboundSocketConnected: () => false,
  subscribeInboundSocketStatus: () => () => undefined,
}));
jest.mock('@/hooks/useAppState', () => ({ useAppState: () => 'active' }));

const ME = '6721a0f4c2b1d3e4f5a6b700';
const TEAMMATE = '6721a0f4c2b1d3e4f5a6b7aa';
const OTHER_LEAD = '6721a0f4c2b1d3e4f5a6b7dd';
const parse = (schema: unknown, data: unknown) => (schema as z.ZodType).parse(data);

function routes(detail: Record<string, unknown>, directory: 'ok' | 'fail' = 'ok') {
  jest.mocked(api.get).mockImplementation(async (url: string, schema?: unknown) => {
    if (url === `/inbound-calls/${CALL_ID}`) return { data: parse(schema, detail) };
    if (url === '/users/directory') {
      if (directory === 'fail') throw new Error('directory down');
      return {
        data: parse(schema, [
          { id: ME, firstName: 'Sara', lastName: 'Owner', email: 'sara@example.com' },
          { id: TEAMMATE, firstName: 'Tom', lastName: 'Agent', email: 'tom@example.com' },
        ]),
      };
    }
    throw new Error(`unexpected GET ${url}`);
  });
  jest.mocked(api.patch).mockImplementation(async (_url: string, _body: unknown, schema?: unknown) => ({
    data: parse(schema, detail),
  }));
  jest.mocked(api.post).mockImplementation(async (url: string, _body: unknown, schema?: unknown) => ({
    data: parse(schema, url.endsWith('/follow-up') ? { followUpId: 'fu1', call: detail } : detail),
  }));
}

const navigation = { navigate: jest.fn() };
const render = () =>
  renderWithProviders(
    <IncomingCallDetailScreen
      {...({
        navigation,
        route: { key: 'k', name: 'IncomingCallDetail', params: { id: CALL_ID } },
      } as unknown as RootScreenProps<'IncomingCallDetail'>)}
    />,
  );
const lastButton = (name: string) => {
  const all = screen.getAllByRole('button', { name });
  return all[all.length - 1]!;
};

beforeEach(() => {
  jest.resetAllMocks();
  useSessionStore.setState({ user: { id: ME } as never });
});

describe('work status', () => {
  it('shows the status pill, who changed it, the history and the AI cost', async () => {
    routes(serverDetail());
    await render();
    expect(await screen.findByText('Work status')).toBeTruthy();
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0);
    expect(screen.getByText('Not assigned')).toBeTruthy();
    expect(screen.getByText(/^Updated by Sara Owner · /)).toBeTruthy();
    // History, newest first: the person's change with note, then the AI agent's initial status.
    expect(screen.getByText('New → In progress')).toBeTruthy();
    expect(screen.getByText('“Calling her back after lunch”')).toBeTruthy();
    expect(screen.getByText('Status set to New')).toBeTruthy();
    expect(screen.getByText('Partly qualified (qualification)')).toBeTruthy();
    expect(screen.getByText(/^AI agent · /)).toBeTruthy();
    expect(screen.getByText('$0.042 · gpt-realtime · 12,400 tokens')).toBeTruthy();
  });

  it('changes the status with a note', async () => {
    routes(serverDetail());
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Change status' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Resolved' }));
    await fireEvent.changeText(screen.getByLabelText('Note (optional)'), 'Sent the quote');
    await fireEvent.press(lastButton('Save'));
    await waitFor(() =>
      expect(jest.mocked(api.patch).mock.calls[0]?.slice(0, 2)).toEqual([
        `/inbound-calls/${CALL_ID}/work`,
        { status: 'resolved', note: 'Sent the quote' },
      ]),
    );
  });

  it('assigns to a teammate from the team directory', async () => {
    routes(serverDetail());
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Assign to' }));
    await fireEvent.press(await screen.findByRole('radio', { name: 'Tom Agent' }));
    await fireEvent.press(lastButton('Save'));
    await waitFor(() => expect(jest.mocked(api.patch).mock.calls[0]?.[1]).toEqual({ assignedTo: TEAMMATE }));
  });

  it('without the directory, the call can still be assigned to me', async () => {
    routes(serverDetail(), 'fail');
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Assign to' }));
    expect(await screen.findByText(/Could not load the team list/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Me' }));
    await fireEvent.press(lastButton('Save'));
    await waitFor(() => expect(jest.mocked(api.patch).mock.calls[0]?.[1]).toEqual({ assignedTo: ME }));
  });
});

describe('lead chooser (no lead linked)', () => {
  const ambiguous = () =>
    serverDetail({
      lead: null,
      leadDetail: null,
      callerType: 'ambiguous',
      match: {
        status: 'ambiguous',
        candidates: [
          { id: LEAD_ID, name: 'Amina Benali', number: 'L-0042' },
          { id: OTHER_LEAD, name: 'Benali Bakery', number: 'L-0077' },
        ],
      },
    });

  it('"Do it" asks which lead first, then executes with it', async () => {
    routes(ambiguous());
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Do it' }));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText('Which lead is this caller?')).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Benali Bakery' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() =>
      expect(jest.mocked(api.post).mock.calls[0]?.slice(0, 2)).toEqual([
        `/inbound-calls/${CALL_ID}/recommendations/ARRANGE_CALLBACK`,
        { decision: 'execute', leadId: OTHER_LEAD },
      ]),
    );
  });

  it('"Schedule follow-up" can create a new lead for the caller', async () => {
    routes(ambiguous());
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Schedule follow-up' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Create a new lead for this caller' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Schedule' }));
    await waitFor(() =>
      expect(jest.mocked(api.post).mock.calls[0]?.[0]).toBe(`/inbound-calls/${CALL_ID}/follow-up`),
    );
    expect(jest.mocked(api.post).mock.calls[0]?.[1]).toMatchObject({ createLead: true });
  });

  it('a withheld number cannot create a lead', async () => {
    routes(
      serverDetail({
        lead: null,
        leadDetail: null,
        callerType: 'private',
        caller: { name: null, number: null, presentation: 'private' },
        match: { status: 'unknown', candidates: [] },
      }),
    );
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Do it' }));
    expect(screen.getByRole('radio', { name: 'Create a new lead for this caller' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('with a linked lead, actions run directly', async () => {
    routes(serverDetail());
    await render();
    await fireEvent.press(await screen.findByRole('button', { name: 'Do it' }));
    await waitFor(() => expect(jest.mocked(api.post).mock.calls[0]?.[1]).toEqual({ decision: 'execute' }));
    expect(screen.queryByText('Which lead is this caller?')).toBeNull();
  });
});

describe('questions before goodbye', () => {
  const withClosing = () => {
    const base = serverDetail();
    return {
      ...base,
      fields: [
        ...base.fields,
        {
          id: '6721a0f4c2b1d3e4f5a6b8ff',
          key: 'custom_party_size',
          label: 'Party size',
          value: '6',
          explicit: true,
          confidence: null,
          verification: 'unverified',
          evidence: null,
          superseded: false,
          appliedToLead: false,
          source: 'ai_agent',
          at: '2026-11-04T09:14:30.000Z',
        },
      ],
      qa: {
        ...base.qa,
        closingQuestions: [
          {
            key: 'custom_party_size',
            label: 'Party size',
            question: 'How many people will come?',
            type: 'number',
            required: true,
            status: 'answered',
            value: 6,
            explicit: true,
          },
          {
            key: 'email',
            label: 'Email',
            question: 'May I have your email?',
            type: 'text',
            required: false,
            status: 'declined',
            value: null,
            explicit: null,
          },
          { key: 'budget', label: null, question: null, type: null, required: false, status: 'weird' },
        ],
      },
    };
  };

  it('lists each closing question with its outcome and value, and labels custom fields', async () => {
    routes(withClosing());
    await render();
    expect(await screen.findByText('Questions before goodbye')).toBeTruthy();
    expect(screen.getByText('“How many people will come?”')).toBeTruthy();
    expect(screen.getByText('Answered')).toBeTruthy();
    expect(screen.getByText('Required')).toBeTruthy();
    expect(screen.getByText('Declined')).toBeTruthy();
    // Unknown status is tolerated as "not asked"; a standard key without label uses the app's label.
    expect(screen.getByText('Not asked')).toBeTruthy();
    expect(screen.getAllByText('Budget').length).toBeGreaterThan(0);
    // Custom key: the server's label in the closing card and in extracted information.
    expect(screen.getAllByText('Party size').length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText('custom party size')).toBeNull();
  });

  it('no closing questions configured: no card', async () => {
    routes(serverDetail());
    await render();
    expect(await screen.findByText('Work status')).toBeTruthy();
    expect(screen.queryByText('Questions before goodbye')).toBeNull();
  });
});
