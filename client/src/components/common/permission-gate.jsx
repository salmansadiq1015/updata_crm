'use client';

import { usePermissions } from '@/hooks/use-permissions';

export function PermissionGate({
  permission,
  permissions,
  requireAll = false,
  fallback = null,
  children,
}) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermissions();

  let authorized = false;

  if (permission) {
    authorized = hasPermission(permission);
  } else if (permissions && permissions.length > 0) {
    authorized = requireAll
      ? hasAllPermissions(permissions)
      : hasAnyPermission(permissions);
  } else {
    authorized = true;
  }

  return authorized ? children : fallback;
}
