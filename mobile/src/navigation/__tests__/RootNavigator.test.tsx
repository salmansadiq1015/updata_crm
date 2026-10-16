import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import { useSessionStore } from '@/features/auth/store/sessionStore';
import { dashboardApi } from '@/features/dashboard/api/dashboardApi';
import { leadsApi } from '@/features/leads/api/leadsApi';
import { notificationsApi } from '@/features/notifications/api/notificationsApi';
import { renderWithProviders } from '@/test/renderWithProviders';

import { RootNavigator } from '../RootNavigator';

jest.mock('@/features/dashboard/api/dashboardApi');
jest.mock('@/features/leads/api/leadsApi');
jest.mock('@/features/notifications/api/notificationsApi');
jest.mock('@/features/auth/services/session', () => ({
  signIn: jest.fn(),
  signOut: jest.fn(),
  restoreSession: jest.fn(),
}));

const user = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: null,
  fullName: 'Ana',
  phone: null,
  language: null,
  avatarUrl: null,
  roleName: null,
  status: 'active',
};

const lead = {
  id: '64b7f0c2a1b2c3d4e5f60718',
  leadNumber: 'L-0001',
  name: 'Acme AG',
  type: 'business' as const,
  status: 'new' as const,
  source: 'manual' as const,
  address: { text: 'Bahnhofstrasse 1, 8001 Zürich', city: 'Zürich' },
  phone: '+41 44 123 45 67',
  mobile: null,
  email: 'info@acme.ch',
  website: 'acme.ch',
  mapsUrl: null,
  assignedTo: null,
  notes: null,
  tags: [],
  lastContactedAt: null,
  lastContactChannel: null,
  createdAt: '2026-10-12T10:00:00Z',
};

beforeEach(() => {
  jest
    .mocked(dashboardApi.stats)
    .mockResolvedValue({ customers: 12, projects: 3, openQuotes: 4, todayTasks: 2 });
  jest.mocked(leadsApi.list).mockResolvedValue({
    items: [lead],
    pagination: { hasNext: false, nextCursor: null, limit: 25, total: 1 },
  });
  jest.mocked(leadsApi.get).mockResolvedValue(lead);
  jest.mocked(notificationsApi.unreadCount).mockResolvedValue(0);
  jest
    .mocked(notificationsApi.feed)
    .mockResolvedValue({ items: [], pagination: { hasNext: false, nextCursor: null, limit: 30 } });
});

describe('RootNavigator', () => {
  it('shows the restoring state instead of a blank screen while the session is verified', async () => {
    useSessionStore.setState({ status: 'restoring', user: null });
    await renderWithProviders(<RootNavigator />);
    expect(screen.getByText('Restoring your session…')).toBeTruthy();
  });

  it('only exposes the sign-in flow when signed out', async () => {
    useSessionStore.setState({ status: 'unauthenticated', user: null, endReason: null });
    await renderWithProviders(<RootNavigator />);
    expect(await screen.findByText('Welcome back')).toBeTruthy();
    expect(screen.queryByText('Dashboard')).toBeNull();
    expect(dashboardApi.stats).not.toHaveBeenCalled();
  });

  it('offers retry when the session could not be verified offline', async () => {
    useSessionStore.setState({ status: 'restore_failed', user: null });
    await renderWithProviders(<RootNavigator />);
    expect(await screen.findByText('Could not restore your session')).toBeTruthy();
  });

  it('shows the dashboard once authenticated and opens a lead', async () => {
    useSessionStore.setState({ status: 'authenticated', user });
    await renderWithProviders(<RootNavigator />);
    expect(await screen.findByText('Hello, Ana')).toBeTruthy();
    expect(await screen.findByText('12')).toBeTruthy();

    await fireEvent.press(await screen.findByRole('button', { name: 'Acme AG, New, Zürich' }));
    expect(await screen.findByText('Bahnhofstrasse 1, 8001 Zürich')).toBeTruthy();
    expect(leadsApi.get).toHaveBeenCalledWith(lead.id, expect.anything());
  });

  it('returns to sign-in when the session ends (logout or expiry)', async () => {
    useSessionStore.setState({ status: 'authenticated', user });
    await renderWithProviders(<RootNavigator />);
    expect(await screen.findByText('Hello, Ana')).toBeTruthy();

    await act(async () => useSessionStore.getState().setUnauthenticated('expired'));

    await waitFor(() =>
      expect(screen.getByText('Your session has expired. Please sign in again.')).toBeTruthy(),
    );
    expect(screen.queryByText('Hello, Ana')).toBeNull();
  });
});
