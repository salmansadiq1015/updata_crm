import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { filterSidebarMenus } from '../hooks/use-sidebar-visibility';
import { navSectionDefs } from '@/layout/navigation';
import { usePermissions } from '@/shared/hooks/use-permissions';

const { auth } = vi.hoisted(() => ({ auth: { user: null } }));
vi.mock('@/shared/hooks/use-auth', () => ({ useAuth: () => auth }));

const items = [
  { key: 'ai', children: [{ href: '/ai' }, { href: '/admin/ai/agents' }] },
  { href: '/leads' },
  { href: '/admin/settings' },
];

describe('company sidebar visibility', () => {
  it('gates every feature page with a permission, including AI and calling', () => {
    const leaves = navSectionDefs.flatMap((section) => section.items.flatMap((item) => item.children || [item]));
    expect(leaves.filter((item) => item.href !== '/dashboard' && !item.permission)).toEqual([]);
    expect(leaves.filter((item) => item.href === '/ai').every((item) => item.permission === 'ai:sessions')).toBe(true);
    expect(leaves.find((item) => item.href === '/ai-calling').permission).toBe('ai-calling:read');
  });
  it('hides groups and nested menus without changing the catalog', () => {
    expect(filterSidebarMenus(items, ['ai'])).toEqual(items.slice(1));
    expect(filterSidebarMenus(items, ['/admin/ai/agents'])[0].children).toEqual([{ href: '/ai' }]);
    expect(items[0].children).toHaveLength(2);
  });
  it('removes empty groups and always retains Settings', () => {
    expect(filterSidebarMenus(items, ['/ai', '/admin/ai/agents', '/admin/settings'])).toEqual(items.slice(1));
  });
  it('shows all menus by default', () => {
    expect(filterSidebarMenus(items)).toEqual(items);
  });
});

describe('admin page permissions', () => {
  it('grants Admin every permission even when its loaded list is incomplete', () => {
    auth.user = { role: { name: 'Admin' }, permissions: ['crm:read'] };
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('ai:agents:manage')).toBe(true);
    expect(result.current.hasAllPermissions(['sessions:read', 'settings:admin'])).toBe(true);
    expect(result.current.isAdmin).toBe(true);
  });
  it('retains permission checks for other roles', () => {
    auth.user = { role: { name: 'Techniker' }, permissions: ['crm:read'] };
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('crm:read')).toBe(true);
    expect(result.current.hasPermission('settings:admin')).toBe(false);
  });
});
