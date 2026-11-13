import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { PERMISSION_IMPLICATIONS, satisfiesPermission } from '../permission-implications.mjs';

const auth = vi.hoisted(() => ({ user: null }));
vi.mock('@/shared/hooks/use-auth', () => ({ useAuth: () => ({ user: auth.user }) }));
const { usePermissions } = await import('@/shared/hooks/use-permissions');

describe('client permission implications (mirror of the server map)', () => {
  it('grants a permission held directly or implied one hop by a held permission', () => {
    expect(satisfiesPermission(['ai-calling:read'], 'inbound-calls:read')).toBe(true);
    expect(satisfiesPermission(['inbound-calls:read'], 'inbound-calls:read')).toBe(true);
    expect(satisfiesPermission(['inbound-calls:read'], 'ai-calling:read')).toBe(false);
    expect(satisfiesPermission([], 'inbound-calls:read')).toBe(false);
    expect(PERMISSION_IMPLICATIONS['ai-calling:write']).toEqual(['inbound-calls:read', 'inbound-calls:write']);
  });

  it('usePermissions().hasPermission applies implications for every permission shape', () => {
    auth.user = { role: { name: 'Sales' }, permissions: [{ module: 'ai-calling', action: 'read' }, { key: 'crm:read' }] };
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('inbound-calls:read')).toBe(true);
    expect(result.current.hasPermission('inbound-calls:write')).toBe(false);
    expect(result.current.hasPermission('crm:read')).toBe(true);
  });

  it('a user holding only inbound-calls:read sees Incoming Calls but not AI Calling', () => {
    auth.user = { role: { name: 'Reception' }, permissions: ['inbound-calls:read'] };
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasPermission('inbound-calls:read')).toBe(true);
    expect(result.current.hasPermission('ai-calling:read')).toBe(false);
  });
});


describe('user administration access', () => {
  it.each([undefined, [], ['507f1f77bcf86cd799439011']])('Admin has all permissions with explicit permissions %j', (permissions) => {
    auth.user = { role: { name: 'Admin' }, permissions };
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasAllPermissions(['users:read', 'users:write', 'users:admin', 'roles:admin', 'audit:read'])).toBe(true);
    expect(result.current.isAdmin).toBe(true);
  });
  it.each([undefined, [], ['507f1f77bcf86cd799439011'], [null]])('does not grant non-admins access for unloaded/unusable permissions %j', (permissions) => {
    auth.user = { role: { name: 'Technician' }, permissions };
    const { result } = renderHook(() => usePermissions());
    expect(result.current.hasAnyPermission(['users:write', 'users:admin', 'roles:admin'])).toBe(false);
  });
});
