import { useAuth } from './use-auth';

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
    if (p.module && p.action) return true;
    if (p.key) return true;
    return false;
  });

  // If no usable permissions found but user is authenticated,
  // grant all access — the backend enforces real permissions on every API call.
  const noPermissionsLoaded = usablePermissions.length === 0 && !!user;

  const hasPermission = (perm) => {
    if (adminRole || noPermissionsLoaded) return true;
    return usablePermissions.some((p) => {
      if (typeof p === 'string') return p === perm;
      if (p.key) return p.key === perm;
      if (p.module && p.action) return `${p.module}:${p.action}` === perm;
      return false;
    });
  };

  const hasAnyPermission = (perms) => perms.some((p) => hasPermission(p));
  const hasAllPermissions = (perms) => perms.every((p) => hasPermission(p));
  const isAdmin = adminRole || (noPermissionsLoaded
    ? (user?.role?.name === 'Admin' || user?.role === 'Admin')
    : (hasPermission('users:admin') && hasPermission('roles:admin')));

  return { permissions: usablePermissions, hasPermission, hasAnyPermission, hasAllPermissions, isAdmin };
}
