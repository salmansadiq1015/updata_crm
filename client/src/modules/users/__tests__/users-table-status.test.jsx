import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  canAdmin: true,
  currentUser: null,
  deleteUser: vi.fn(async () => ({ deletedCount: 1 })),
  bulkDelete: vi.fn(async () => ({ deletedCount: 2 })),
  bulkDeactivate: vi.fn(async () => ({ deactivatedCount: 2 })),
  bulkUpdate: vi.fn(async () => ({ modifiedCount: 2 })),
  logout: vi.fn(async () => ({})),
  replace: vi.fn(),
  users: [],
  reset: vi.fn(),
  setAction: vi.fn(),
  activate: vi.fn(async () => ({})),
  deactivate: vi.fn(async () => ({})),
}));
const t = (key, fallback) => fallback || key;
vi.mock('@/stores/auth-store', () => ({ useAuthStore: { getState: () => ({ user: state.currentUser }) } }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t, locale: 'en' }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: state.replace }) }));
vi.mock('@/modules/auth/services/auth-service', () => ({ authService: { logout: state.logout } }));
vi.mock('nuqs', () => ({ useQueryState: () => [null, state.setAction] }));
vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (p) => p !== 'users:admin' || state.canAdmin }),
}));
vi.mock('@/modules/crm/hooks/use-cursor-list', () => ({
  useCursorList: () => ({ items: state.users, reset: state.reset, pageSize: 25 }),
}));
vi.mock('@/modules/users/services/user-service', () => ({
  userService: {
    activateUser: state.activate,
    deactivateUser: state.deactivate,
    deleteUser: state.deleteUser,
    bulkDelete: state.bulkDelete,
    bulkDeactivate: state.bulkDeactivate,
    bulkUpdate: state.bulkUpdate,
    getAssignmentTargets: async () => [],
  },
}));
vi.mock('@/modules/roles/services/role-service', () => ({ roleService: { getRoles: async () => ({ data: [] }) } }));
vi.mock('@/lib/api/client', () => ({ default: { get: async () => ({ data: {} }) } }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/shared/components/page-hero', () => ({
  PageHero: ({ actions }) => <div>{actions}</div>, heroButton: {},
}));
vi.mock('@/shared/components/data-table/bulk-actions-bar', () => ({
  BulkActionsBar: ({ children }) => <div role="toolbar" aria-label="Bulk user actions">{children}</div>,
}));
vi.mock('@/modules/users/components/user-form', () => ({ UserForm: () => null }));
vi.mock('@/shared/components/confirm-dialog', () => ({
  ConfirmDialog: ({ open, onConfirm }) => open ? <button onClick={onConfirm}>Confirm status</button> : null,
}));
// Render the actual status cell and row actions without the table's pagination/layout machinery.
vi.mock('@/shared/components/data-table/data-table-shell', () => ({
  DataTableShell: ({ columns, data, renderRowActions, rowSelection, onRowSelectionChange, enableRowSelection }) => {
    const StatusCell = columns.find((c) => c.accessorKey === 'status').Cell;
    return data.map((user) => <div key={user._id}>
      {enableRowSelection && <input type="checkbox" aria-label={`Select ${user._id}`} checked={Boolean(rowSelection[user._id])}
        onChange={(event) => onRowSelectionChange({ ...rowSelection, [user._id]: event.target.checked })} />}
      <StatusCell row={{ original: user }} />
      {renderRowActions({ row: { original: user } })}
    </div>);
  },
}));

import { UsersTable } from '../components/users-table';

function renderTable(status, count = 1) {
  state.users = [{ _id: 'user-1', firstName: 'New', lastName: 'Admin', email: 'new@example.ch', status, role: { name: 'Admin' } }];
  if (count > 1) state.users.push({ ...state.users[0], _id: 'user-2', firstName: 'Second' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><UsersTable /></QueryClientProvider>);
}

beforeEach(() => {
  state.canAdmin = true;
  state.currentUser = null;
  vi.clearAllMocks();
});

describe('admin user status controls', () => {
  it.each(['pending_activation', 'deactivated', 'locked'])('lets admins activate %s accounts through the status switch', async (status) => {
    const user = userEvent.setup();
    renderTable(status);
    const toggle = screen.getByRole('switch', { name: 'users.activate New Admin' });
    expect(toggle).toBeEnabled();
    await user.click(toggle);
    expect(state.activate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.activate).toHaveBeenCalledWith('user-1'));
    expect(state.deactivate).not.toHaveBeenCalled();
  });

  it('lets admins activate pending accounts from card actions', async () => {
    const user = userEvent.setup();
    renderTable('pending_activation');
    await user.click(screen.getByRole('button', { name: 'Card view' }));
    await user.click(screen.getByRole('button', { name: 'Actions New Admin' }));
    await user.click(screen.getByRole('menuitem', { name: 'users.activate' }));
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.activate).toHaveBeenCalledWith('user-1'));
  });

  it('lets admins deactivate active accounts', async () => {
    const user = userEvent.setup();
    renderTable('active');
    await user.click(screen.getByRole('switch', { name: 'users.deactivate New Admin' }));
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.deactivate).toHaveBeenCalledWith('user-1'));
  });

  it('disables status changes without users:admin permission', () => {
    state.canAdmin = false;
    renderTable('pending_activation');
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'users.activate' })).not.toBeInTheDocument();
  });
});


describe('user deletion controls', () => {
  it('shows a visible single-user delete action and requires confirmation', async () => {
    const user = userEvent.setup();
    renderTable('active');
    await user.click(screen.getByRole('button', { name: 'Delete New Admin' }));
    expect(state.deleteUser).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.deleteUser).toHaveBeenCalledWith('user-1'));
  });

  it('deletes exactly the selected users in one bulk request', async () => {
    const user = userEvent.setup();
    renderTable('active', 2);
    await user.click(screen.getByRole('checkbox', { name: 'Select user-1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select user-2' }));
    await user.click(screen.getByRole('button', { name: 'Delete', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.bulkDelete).toHaveBeenCalledWith(['user-1', 'user-2']));
    expect(state.bulkDeactivate).not.toHaveBeenCalled();
  });

  it('keeps bulk deactivation separate from deletion', async () => {
    const user = userEvent.setup();
    renderTable('active', 2);
    await user.click(screen.getByRole('checkbox', { name: 'Select user-1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select user-2' }));
    await user.click(within(screen.getByRole('toolbar', { name: 'Bulk user actions' })).getByRole('button', { name: 'users.deactivate', exact: true }));
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.bulkDeactivate).toHaveBeenCalledWith(['user-1', 'user-2']));
    expect(state.bulkDelete).not.toHaveBeenCalled();
  });

  it('supports bulk activation and ignores deselected IDs', async () => {
    const user = userEvent.setup();
    renderTable('pending_activation', 2);
    await user.click(screen.getByRole('checkbox', { name: 'Select user-1' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select user-2' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select user-1' }));
    await user.click(within(screen.getByRole('toolbar', { name: 'Bulk user actions' })).getByRole('button', { name: 'users.activate', exact: true }));
    await waitFor(() => expect(state.bulkUpdate).toHaveBeenCalledWith(['user-2'], { status: 'active' }));
  });

  it('supports delete from the card menu', async () => {
    const user = userEvent.setup();
    renderTable('pending_activation');
    await user.click(screen.getByRole('button', { name: 'Card view' }));
    await user.click(screen.getByRole('button', { name: 'Actions New Admin' }));
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.deleteUser).toHaveBeenCalledWith('user-1'));
  });

  it('does not show deletion or selection to non-admin readers', () => {
    state.canAdmin = false;
    renderTable('active');
    expect(screen.queryByRole('button', { name: 'Delete New Admin' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('keeps the delete dialog open on an API failure so it can be retried', async () => {
    state.deleteUser.mockRejectedValueOnce(new Error('Cannot delete the last active admin'));
    const user = userEvent.setup();
    renderTable('active');
    await user.click(screen.getByRole('button', { name: 'Delete New Admin' }));
    await user.click(screen.getByRole('button', { name: 'Confirm status' }));
    await waitFor(() => expect(state.deleteUser).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('button', { name: 'Confirm status' })).toBeInTheDocument();
  });
});


it('signs out and returns to login when an admin deletes their own account', async () => {
  state.currentUser = { _id: 'user-1' };
  const user = userEvent.setup();
  renderTable('active');
  await user.click(screen.getByRole('button', { name: 'Delete New Admin' }));
  await user.click(screen.getByRole('button', { name: 'Confirm status' }));
  await waitFor(() => expect(state.logout).toHaveBeenCalled());
  expect(state.replace).toHaveBeenCalledWith('/login');
});
