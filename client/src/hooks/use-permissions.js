import { useAuth } from './use-auth';

export function usePermissions() {
  const { user } = useAuth();

  const rawPermissions = user?.permissions || user?.role?.permissions || [];

  // If permissions are not populated (e.g., role only has name, not populated permissions),
  // grant all access — the backend enforces real permissions on every API call.
  const noPermissionsLoaded = rawPermissions.length === 0 && !!user;

  const hasPermission = (perm) => {
    if (noPermissionsLoaded) return true;
    return rawPermissions.some((p) => {
      if (typeof p === 'string') return p === perm;
      if (p.key) return p.key === perm;
      if (p.module && p.action) return `${p.module}:${p.action}` === perm;
      return false;
    });
  };

  const hasAnyPermission = (perms) => perms.some((p) => hasPermission(p));
  const hasAllPermissions = (perms) => perms.every((p) => hasPermission(p));
  const isAdmin = noPermissionsLoaded
    ? (user?.role?.name === 'Admin' || user?.role === 'Admin')
    : (hasPermission('users:admin') && hasPermission('roles:admin'));

  return { permissions: rawPermissions, hasPermission, hasAnyPermission, hasAllPermissions, isAdmin };
}
