import { useAuth } from './use-auth';
import { satisfiesPermission } from '@/shared/auth/permission-implications.mjs';

export function usePermissions() {
  const { user } = useAuth();

  const adminRole = user?.role?.name === 'Admin' || user?.role === 'Admin';

  const rawPermissions = user?.permissions || user?.role?.permissions || [];

  // Check if permissions are actually usable (module:action format).
  // The API may return ObjectId strings instead of populated permission objects,
  // in which case we can't match against permission keys.
  const isObjectId = (val) => typeof val === 'string' && /^[0-9a-f]{24}$/i.test(val);

  const usablePermissions = rawPermissions.filter((p) => {
    if (typeof p === 'string') return !isObjectId(p);
    if (!p || typeof p !== 'object') return false;
    if (p.module && p.action) return true;
    if (p.key) return true;
    return false;
  });

  const heldKeys = usablePermissions.map((p) => {
    if (typeof p === 'string') return p;
    if (p.key) return p.key;
    return `${p.module}:${p.action}`;
  });

  // Held directly OR implied by a held coarse permission — the same rule the API applies.
  const hasPermission = (perm) => {
    if (adminRole) return true;
    return satisfiesPermission(heldKeys, perm);
  };

  const hasAnyPermission = (perms) => perms.some((p) => hasPermission(p));
  const hasAllPermissions = (perms) => perms.every((p) => hasPermission(p));
  const isAdmin = adminRole || (hasPermission('users:admin') && hasPermission('roles:admin'));

  return { permissions: usablePermissions, hasPermission, hasAnyPermission, hasAllPermissions, isAdmin };
}
