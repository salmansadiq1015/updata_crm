// Incoming Calls screens with the HTTP client mocked: the dashboard (switch, live call, stats,
// devices, recent calls), the 409 path of the master switch, and the confirmation step every
// live-call control goes through.
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { toast } from 'sonner-native';
import type { z } from 'zod';

import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { api } from '@/services/api/apiClient';
import type { CursorPagination } from '@/services/api/apiTypes';
import { renderWithProviders } from '@/test/renderWithProviders';

import {
  CALL_ID,
  serverDevice,
  serverLive,
  serverRow,
  serverSettings,
  serverStats,
} from '../__fixtures__/serverPayloads';
import { CallControls } from '../components/CallControls';
import { IncomingCallsScreen } from '../screens/IncomingCallsScreen';

jest.mock('@/services/api/apiClient', () => ({
  api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() },
}));
// No socket under test: screens fall back to polling.
jest.mock('../realtime/inboundSocket', () => ({
  subscribeInboundEvents: () => () => undefined,
  isInboundSocketConnected: () => false,
  subscribeInboundSocketStatus: () => () => undefined,
}));
// The RN AppState mock returns no subscription; the screens only need "foreground".
jest.mock('@/hooks/useAppState', () => ({ useAppState: () => 'active' }));
// jest-expo/android has no AndroidSwitchNativeComponent: a host stand-in keeps the role,
// label, checked state and onValueChange of the real Switch.
jest.mock('react-native/Libraries/Components/Switch/Switch', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  return {
    __esModule: true,
    default: (props: {
      value?: boolean;
      disabled?: boolean;
      accessibilityLabel?: string;
      onValueChange?: (v: boolean) => void;
    }) =>
      createElement('RCTSwitch', {
        accessibilityRole: 'switch',
        accessibilityLabel: props.accessibilityLabel,
        accessibilityState: { checked: props.value, disabled: props.disabled },
        onValueChange: props.onValueChange,
      }),
  };
});

const parse = (schema: unknown, data: unknown) => (schema as z.ZodType).parse(data);

function routeGets(over: { settings?: () => unknown; live?: unknown[] } = {}) {
  jest.mocked(api.get).mockImplementation(async (url: string, schema?: unknown) => {
    switch (url) {
      case '/inbound-calls/settings':
        return { data: parse(schema, over.settings ? over.settings() : serverSettings()) };
      case '/inbound-calls/live':
        return { data: parse(schema, over.live ?? [serverLive()]) };
      case '/inbound-calls/stats':
        return { data: parse(schema, serverStats()) };
      case '/inbound-calls/devices':
        return { data: parse(schema, [serverDevice()]) };
      case '/inbound-calls':
        return {
          data: parse(schema, [
            serverRow({
              id: '6721a0f4c2b1d3e4f5a6c000',
              caller: { name: 'Jonas Keller', number: '+41780000000', presentation: 'available' },
            }),
          ]),
          // /inbound-calls pages by number; the envelope type only models cursor pagination.
          pagination: { page: 1, limit: 25, total: 1, pages: 1 } as unknown as CursorPagination,
        };
      default:
        throw new Error(`unexpected GET ${url}`);
    }
  });
}

beforeEach(() => jest.resetAllMocks());

describe('IncomingCallsScreen', () => {
  const navigation = { navigate: jest.fn() };
  const render = () =>
    renderWithProviders(
      <IncomingCallsScreen
        {...({
          navigation,
          route: { key: 'k', name: 'IncomingCalls' },
        } as unknown as RootScreenProps<'IncomingCalls'>)}
      />,
    );

  it('shows the switch, the live call, today’s numbers, devices and recent calls', async () => {
    routeGets();
    await render();
    expect(await screen.findByRole('switch', { name: 'AI answers incoming calls' })).toBeTruthy();
    expect(screen.getByText('AI answering is off. Calls ring on your phone as usual.')).toBeTruthy();
    // Live call: caller, lead badge, AI status wording.
    expect(await screen.findAllByText('Amina Benali')).not.toHaveLength(0);
    expect(screen.getByText('AI connected · listening')).toBeTruthy();
    expect(screen.getAllByText('New lead').length).toBeGreaterThan(0);
    // Stats row.
    expect(screen.getByLabelText('AI-handled: 5')).toBeTruthy();
    expect(screen.getByLabelText('Missed: 1')).toBeTruthy();
    // Device readiness with its reason.
    expect(await screen.findByText('Not ready for AI answering')).toBeTruthy();
    expect(screen.getByText('• AI answering is off')).toBeTruthy();
    // Recent calls.
    expect(await screen.findByText('Jonas Keller')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Jonas Keller/ }));
    expect(navigation.navigate).toHaveBeenCalledWith('IncomingCallDetail', {
      id: '6721a0f4c2b1d3e4f5a6c000',
    });
  });

  it('turning AI answering on sends the version it read', async () => {
    routeGets({ live: [] });
    jest.mocked(api.patch).mockImplementation(async (_url: string, _body: unknown, schema?: unknown) => ({
      data: parse(schema, serverSettings({ enabled: true, version: 4 })),
    }));
    await render();
    const toggle = await screen.findByRole('switch', { name: 'AI answers incoming calls' });
    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() =>
      expect(jest.mocked(api.patch).mock.calls[0]?.slice(0, 2)).toEqual([
        '/inbound-calls/settings',
        { enabled: true, version: 3 },
      ]),
    );
    expect(
      await screen.findByText(
        'Your AI agent answers calls that ring on your paired phone, following your rules.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('No call right now')).toBeTruthy();
  });

  it('a 409 (changed on the website) reloads the setting instead of overwriting it', async () => {
    let version = 3;
    routeGets({ live: [], settings: () => serverSettings({ enabled: version === 5, version }) });
    jest.mocked(api.patch).mockImplementation(async () => {
      version = 5; // someone else saved meanwhile
      throw new ApiError({ kind: 'http', status: 409, code: 'CONFLICT', message: 'changed elsewhere' });
    });
    await render();
    const toggle = await screen.findByRole('switch', { name: 'AI answers incoming calls' });
    await fireEvent(toggle, 'valueChange', true);
    await waitFor(() => expect(toast.warning).toHaveBeenCalled());
    // Refetched: the switch now shows the server's state.
    await waitFor(() =>
      expect(jest.mocked(api.get).mock.calls.filter(([u]) => u === '/inbound-calls/settings').length).toBe(2),
    );
    expect(
      await screen.findByText(
        'Your AI agent answers calls that ring on your paired phone, following your rules.',
      ),
    ).toBeTruthy();
  });

  it('filter chips query the server', async () => {
    routeGets({ live: [] });
    await render();
    await screen.findByText('Jonas Keller');
    await fireEvent.press(screen.getByRole('button', { name: 'Missed' }));
    await waitFor(() =>
      expect(
        jest
          .mocked(api.get)
          .mock.calls.some(
            ([url, , options]) =>
              url === '/inbound-calls' &&
              (options as { params?: { status?: string } })?.params?.status === 'MISSED',
          ),
      ).toBe(true),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Mine' }));
    await waitFor(() =>
      expect(
        jest
          .mocked(api.get)
          .mock.calls.some(
            ([url, , options]) =>
              url === '/inbound-calls' &&
              (options as { params?: { assignedTo?: string } })?.params?.assignedTo === 'me',
          ),
      ).toBe(true),
    );
  });

  it('marks a call that rang while the phone was in another call', async () => {
    routeGets({
      live: [
        serverLive({
          status: 'RINGING',
          aiStatus: 'not_applicable',
          handling: 'human',
          aiBlockedBy: 'call_waiting',
        }),
      ],
    });
    await render();
    expect(await screen.findByText('Rang while the phone was in another call')).toBeTruthy();
    // The generic "AI not used: …" line is not shown for call waiting.
    expect(screen.queryByText(/AI not used: call waiting/)).toBeNull();
  });

  it('shows a handoff banner when the caller asked for a person', async () => {
    routeGets({
      live: [
        serverLive({
          humanRequested: true,
          handoff: {
            status: 'waiting',
            reason: 'Wants to talk to the owner',
            requestedAt: '2026-11-04T09:13:00.000Z',
          },
        }),
      ],
    });
    await render();
    expect(await screen.findByText('The caller asked for a person')).toBeTruthy();
    expect(screen.getByText('Reason: Wants to talk to the owner')).toBeTruthy();
  });
});

describe('CallControls', () => {
  const okPost = () =>
    jest.mocked(api.post).mockImplementation(async (_url: string, _body: unknown, schema?: unknown) => ({
      data: parse(schema, { ok: true }),
    }));

  it('ringing: "Let AI answer" only runs after confirmation', async () => {
    okPost();
    await renderWithProviders(<CallControls call={{ id: CALL_ID, status: 'RINGING', handling: null }} />);
    expect(screen.queryByRole('button', { name: 'Hang up' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Let AI answer' }));
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText('Let the AI answer this call?')).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Let AI answer' });
    await fireEvent.press(confirm[confirm.length - 1]!);
    await waitFor(() =>
      expect(jest.mocked(api.post).mock.calls[0]?.[0]).toBe(`/inbound-calls/${CALL_ID}/control/answer`),
    );
  });

  it('take over explains the handset and can be cancelled', async () => {
    okPost();
    await renderWithProviders(<CallControls call={{ id: CALL_ID, status: 'AI_ACTIVE', handling: 'ai' }} />);
    expect(screen.queryByRole('button', { name: 'Let AI answer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Take over' }));
    expect(screen.getByText(/call audio moves to your phone’s handset/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.post).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: 'Hang up' }));
    const dialog = screen.getByText('Hang up this call?');
    expect(dialog).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Hang up' });
    await fireEvent.press(confirm[confirm.length - 1]!);
    await waitFor(() =>
      expect(jest.mocked(api.post).mock.calls[0]?.[0]).toBe(`/inbound-calls/${CALL_ID}/control/hangup`),
    );
  });

  it('a command the phone has not acknowledged yet is shown, not offered again', async () => {
    await renderWithProviders(
      <CallControls
        call={{ id: CALL_ID, status: 'AI_ACTIVE', handling: 'ai', pendingCommand: 'takeover' }}
      />,
    );
    expect(screen.getByText('Waiting for the phone: Take over')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Take over' })).toBeNull();
    expect(within(screen.getByRole('button', { name: 'Hang up' })).getByText('Hang up')).toBeTruthy();
  });
});
