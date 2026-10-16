// The one place runtime permissions are requested. Features ask for a permission
// at the moment they need it (never at startup), with a rationale, and must
// handle every outcome. A permission must also be declared in app.config.ts —
// add both together, with the feature that needs it.
import { Linking, PermissionsAndroid, Platform, type Permission } from 'react-native';

import { logger } from '@/services/logging/logger';

export type PermissionStatus = 'granted' | 'denied' | 'blocked' | 'unavailable';

export type PermissionRationale = {
  title: string;
  message: string;
  buttonPositive: string;
  buttonNegative?: string;
};

export async function checkPermission(permission: Permission): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    return (await PermissionsAndroid.check(permission)) ? 'granted' : 'denied';
  } catch (error) {
    logger.warn('permissions.check_failed', { permission, error });
    return 'unavailable';
  }
}

/**
 * Request one permission. `blocked` means Android will not show the dialog again
 * ("Don't ask again", or denied twice): only the system settings can grant it.
 */
export async function requestPermission(
  permission: Permission,
  rationale?: PermissionRationale,
): Promise<PermissionStatus> {
  if (Platform.OS !== 'android') return 'unavailable';
  try {
    const result = await PermissionsAndroid.request(permission, rationale);
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch (error) {
    logger.warn('permissions.request_failed', { permission, error });
    return 'unavailable';
  }
}

/** Already granted → no dialog; otherwise request. */
export async function ensurePermission(
  permission: Permission,
  rationale?: PermissionRationale,
): Promise<PermissionStatus> {
  const current = await checkPermission(permission);
  if (current === 'granted' || current === 'unavailable') return current;
  return requestPermission(permission, rationale);
}

/** The app's page in system settings — the only recovery from `blocked`. */
export function openAppSettings(): Promise<void> {
  return Linking.openSettings();
}
