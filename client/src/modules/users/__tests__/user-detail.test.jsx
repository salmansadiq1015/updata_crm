import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UserDetailPage from '@/app/(platform)/settings/users/[id]/page';

const state = vi.hoisted(() => ({
  canAdmin: true,
  remove: vi.fn(async () => ({ deletedCount: 1 })),
  activate: vi.fn(async () => ({})),
  resend: vi.fn(async () => ({})),
  reset: vi.fn(async () => ({})),
  push: vi.fn(),
}));
const t = (key, fallback) => fallback || key;
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t, locale: 'en' }) }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'user-1' }), useRouter: () => ({ push: state.push }) }));
vi.mock('@/stores/breadcrumb-store', () => ({ useBreadcrumbLabel: vi.fn() }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => state.canAdmin }) }));
vi.mock('@/modules/users/components/user-form', () => ({ UserForm: () => null }));
vi.mock('@/modules/users/components/user-projects-panel', () => ({ UserProjectsPanel: () => null }));
vi.mock('@/modules/users/components/admin-sessions-panel', () => ({ AdminSessionsPanel: () => null }));
vi.mock('@/modules/roles/services/role-service', () => ({ roleService: { getRoles: async () => ({ data: [] }) } }));
vi.mock('@/modules/auth/services/auth-service', () => ({ authService: { requestPasswordReset: state.reset, logout: vi.fn() } }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/shared/components/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }) => open ? <button onClick={onConfirm}>Confirm action</button> : null,
}));
vi.mock('@/modules/users/services/user-service', () => ({ userService: {
  getUserById: async () => ({
    _id: 'user-1', firstName: 'New', lastName: 'Admin', email: 'new@example.ch', status: 'pending_activation',
    role: { name: 'Admin' }, invitationPending: true, initials: 'NA', birthDate: '1990-01-02',
    preferences: { preferredDepartmentId: 'department-1' },
  }),
  getAssignmentTargets: async () => [{ _id: 'department-1', name: 'Operations', code: 'OPS' }],
  deleteUser: state.remove, activateUser: state.activate, resendInvitation: state.resend,
} }));

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <UserDetailPage />
  </QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); state.canAdmin = true; });

describe('user detail administration', () => {
  it('shows saved identity and assignment fields and allows pending-account activation', async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByText('NA', { selector: 'p' })).toBeInTheDocument();
    expect(await screen.findByText('Operations (OPS)')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'users.activate' });
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    await user.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(state.activate).toHaveBeenCalledWith('user-1'));
  });

  it('allows deleting from the user detail view and returns to the directory', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm action' }));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith('user-1'));
    await waitFor(() => expect(state.push).toHaveBeenCalledWith('/settings/users'));
  });

  it('can resend a pending invitation', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Resend invitation' }));
    await waitFor(() => expect(state.resend).toHaveBeenCalledWith('user-1'));
  });

  it('does not expose admin controls to readers', async () => {
    state.canAdmin = false;
    renderPage();
    await screen.findByText('New Admin', { selector: 'h1' });
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
