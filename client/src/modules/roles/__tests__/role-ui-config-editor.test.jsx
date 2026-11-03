import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoleUiConfigEditor } from '../components/role-ui-config-editor';
import { roleService } from '../services/role-service';
import { applySidebarConfig } from '@/shared/hooks/use-ui-config';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/i18n/language-context', () => ({ useLanguage: () => ({ t: (key) => key }) }));
vi.mock('../services/role-service', () => ({ roleService: { updateRole: vi.fn().mockResolvedValue({}) } }));
vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));

describe('role navigation settings', () => {
  it('includes missing business, admin and submenu pages and retains saved order and visibility', async () => {
    const role = { _id: 'role-1', permissions: [], uiConfig: { desktop: {
      sidebarOrder: ['/ai-calling', '/dashboard'], hiddenModules: ['/leads'],
    } } };
    render(<QueryClientProvider client={new QueryClient()}><RoleUiConfigEditor role={role} /></QueryClientProvider>);
    for (const label of ['sidebar.aiCalling', 'sidebar.leads', 'sidebar.roles', 'sidebar.settings', 'sidebar.aiAgents', 'catalog.connections.title']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('button', { name: 'common.save' }));
    await waitFor(() => expect(roleService.updateRole).toHaveBeenCalled());
    const desktop = roleService.updateRole.mock.calls.at(-1)[1].uiConfig.desktop;
    expect(desktop.sidebarOrder.slice(0, 2)).toEqual(['/ai-calling', '/dashboard']);
    expect(desktop.sidebarOrder).toEqual(expect.arrayContaining(['/leads', '/settings/roles', '/admin/settings', '/admin/ai/agents', '/catalog/connections']));
    expect(new Set(desktop.sidebarOrder).size).toBe(desktop.sidebarOrder.length);
    expect(desktop.hiddenModules).toEqual(['/leads']);
  });

  it('applies submenu visibility and order without mutating the shared navigation', () => {
    const items = [{ key: 'catalog', children: [{ href: '/catalog' }, { href: '/catalog/prices' }, { href: '/catalog/connections' }] }];
    const result = applySidebarConfig(items, { sidebarOrder: ['/catalog/connections', '/catalog'], hiddenModules: ['/catalog/prices'] });
    expect(result[0].children.map((item) => item.href)).toEqual(['/catalog/connections', '/catalog']);
    expect(items[0].children).toHaveLength(3);
    expect(applySidebarConfig(items, { hiddenModules: ['catalog'] })).toEqual([]);
    expect(applySidebarConfig(items, { hiddenModules: items[0].children.map((item) => item.href) })).toEqual([]);
  });
});
