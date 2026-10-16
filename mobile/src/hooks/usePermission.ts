import { useCallback, useEffect, useState } from 'react';
import type { Permission } from 'react-native';

import { useAppState } from '@/hooks/useAppState';
import {
  checkPermission,
  ensurePermission,
  openAppSettings,
  type PermissionRationale,
  type PermissionStatus,
} from '@/services/permissions/permissionsService';

/**
 * Status of one permission, re-checked whenever the app returns to the
 * foreground (the user may have changed it in system settings).
 */
export function usePermission(permission: Permission, rationale?: PermissionRationale) {
  const [status, setStatus] = useState<PermissionStatus | null>(null);
  const appState = useAppState();

  useEffect(() => {
    if (appState !== 'active') return;
    let cancelled = false;
    void checkPermission(permission).then((next) => {
      // `check` cannot tell "never asked" from "blocked": keep a known `blocked`.
      if (!cancelled) setStatus((current) => (current === 'blocked' && next === 'denied' ? current : next));
    });
    return () => {
      cancelled = true;
    };
  }, [permission, appState]);

  const request = useCallback(async () => {
    const next = await ensurePermission(permission, rationale);
    setStatus(next);
    return next;
  }, [permission, rationale]);

  return { status, request, openSettings: openAppSettings };
}
