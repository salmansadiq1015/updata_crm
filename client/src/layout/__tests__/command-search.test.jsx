import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({ get: vi.fn(), push: vi.fn(), permissions: new Set(['lead:read', 'users:read']), setTheme: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark', setTheme: mocks.setTheme }) }));
vi.mock('@/lib/api/client', () => ({ default: { get: mocks.get } }));
vi.mock('@/shared/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: permission => mocks.permissions.has(permission) }) }));
vi.mock('@/shared/hooks/use-ui-config', () => ({ useUiConfig: () => ({}), applySidebarConfig: items => items }));
vi.mock('@/modules/settings/hooks/use-sidebar-visibility', () => ({ useSidebarVisibility: () => ({ data: {} }), filterSidebarMenus: items => items }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (key, fallback, values) => {
  const copy = { 'common.searchTitle': 'Search', 'common.close': 'Close', 'command.noResults': `No results for ${values?.query}`, 'common.toggleTheme': 'Toggle theme', 'users.newUser': 'New user' };
  return copy[key] || fallback || key;
} }) }));
import { CommandSearch } from '../command-search';

beforeEach(() => {
  mocks.permissions = new Set(['lead:read', 'users:read']);
  mocks.get.mockReset().mockResolvedValue({ data: [] });
  mocks.push.mockReset();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CommandSearch /></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  return screen.getByRole('combobox');
}

describe('command search interactions', () => {
  it('closes with the visible button and resets the query on shortcut reopen', async () => {
    const input = mount();
    fireEvent.change(input, { target: { value: 'old query' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('combobox')).toHaveValue('');
    fireEvent.keyDown(document, { key: 'K', ctrlKey: true });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('clears and refocuses the input and hides unauthorized create actions', () => {
    const input = mount();
    expect(screen.queryByRole('option', { name: /New user/ })).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: 'nothing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(input).toHaveValue('');
    expect(input).toHaveFocus();
  });
  it('uses bounded API queries and shows server matches without filtering them again', async () => {
    mocks.get.mockResolvedValue({ data: [{ _id: 'person-1', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.test' }] });
    const input = mount();
    fireEvent.change(input, { target: { value: '  engine  ' } });
    const user = await screen.findByRole('option', { name: /Ada Lovelace/ });
    expect(mocks.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ params: { search: 'engine', limit: 5 }, signal: expect.any(AbortSignal) }));
    expect(mocks.get).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ params: { q: 'engine', limit: 5 }, signal: expect.any(AbortSignal) }));
    fireEvent.click(user);
    expect(mocks.push).toHaveBeenCalledWith('/settings/users/person-1');
  });
  it('shows an error with retry instead of reporting no results', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    fireEvent.change(mount(), { target: { value: 'engine' } });
    expect(await screen.findByText('Some records could not be loaded. Please try again.')).toBeVisible();
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
    mocks.get.mockResolvedValue({ data: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('Some records could not be loaded. Please try again.')).not.toBeInTheDocument());
    expect(screen.getByText(/No results/)).toBeVisible();
  });
  it('aborts superseded requests and prevents old results from replacing the current query', async () => {
    const pending = [];
    mocks.get.mockImplementation((url, config) => {
      const query = config.params.search || config.params.q;
      if (query === 'old') return new Promise(resolve => pending.push({ resolve, signal: config.signal }));
      return Promise.resolve({ data: [{ _id: 'new-person', firstName: 'Current', lastName: 'Person' }] });
    });
    const input = mount();
    fireEvent.change(input, { target: { value: 'old' } });
    await waitFor(() => expect(pending).toHaveLength(2));
    fireEvent.change(input, { target: { value: 'new' } });
    expect(await screen.findByRole('option', { name: /Current Person/ })).toBeVisible();
    expect(pending.every(request => request.signal.aborted)).toBe(true);
    pending.forEach(request => request.resolve({ data: [{ _id: 'old-person', firstName: 'Outdated', lastName: 'Person' }] }));
    expect(screen.queryByRole('option', { name: /Outdated/ })).not.toBeInTheDocument();
  });
  it('does not query unauthorized records', async () => {
    mocks.permissions = new Set();
    fireEvent.change(mount(), { target: { value: 'engine' } });
    await waitFor(() => expect(screen.getByText(/No results/)).toBeVisible());
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
