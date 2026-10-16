// Session lifecycle: restore on launch, sign in, sign out, and forced expiry.
// Every path that ends a session clears secure storage and the query cache, so
// no private CRM data outlives the session that fetched it.
import { queryClient } from '@/app/queryClient';
import { toApiError } from '@/services/api/apiErrors';
import { refreshAccessToken, setSessionEndedHandler } from '@/services/auth/sessionManager';
import { tokenManager } from '@/services/auth/tokenManager';
import { useCallQueueStore } from '@/features/callQueue/store/callQueueStore';
import { useOperationsStore } from '@/features/communication/store/operationsStore';
import { logger } from '@/services/logging/logger';

import { authApi } from '../api/authApi';
import type { LoginValues } from '../schemas/authSchemas';
import { useSessionStore, type SessionEndReason } from '../store/sessionStore';
import type { User } from '../types';

async function endSession(reason: SessionEndReason) {
  await tokenManager.clear();
  queryClient.clear();
  useSessionStore.getState().setUnauthenticated(reason);
}

/**
 * A stored refresh token proves nothing on its own: rotate it and load the
 * profile before showing private screens. Offline → `restore_failed` (retryable,
 * session kept); rejected by the server → signed out.
 */
export async function restoreSession(): Promise<void> {
  const store = useSessionStore.getState();
  store.setRestoring();

  const storedToken = await tokenManager.getRefreshToken().catch(() => null);
  if (!storedToken) {
    store.setUnauthenticated(null);
    return;
  }

  try {
    await refreshAccessToken();
    const user = await authApi.me();
    useSessionStore.getState().setAuthenticated(user);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.kind === 'http' && (apiError.status === 401 || apiError.status === 403)) {
      await endSession('expired');
      return;
    }
    logger.warn('auth.restore.failed', { kind: apiError.kind, status: apiError.status });
    useSessionStore.getState().setRestoreFailed();
  }
}

export async function signIn(values: LoginValues): Promise<User> {
  const { accessToken, refreshToken, user } = await authApi.login(values);
  // A different account may sign in on this device: never show the previous one's cache.
  queryClient.clear();
  await tokenManager.setTokens({ accessToken, refreshToken });
  useSessionStore.getState().setAuthenticated(user);
  return user;
}

export async function signOut(): Promise<void> {
  // Sign-out is explicit: the user's local outbox (call notes awaiting sync) goes with it.
  // The Settings screen warns first when it still holds unsynced work.
  await useOperationsStore.getState().purge();
  // The SIM call queue (lead names and outcomes) is per user too and goes with it.
  await useCallQueueStore.getState().purge();
  try {
    await authApi.logout();
  } catch (error) {
    // The local session ends regardless; the server session expires on its own.
    logger.info('auth.logout.server_failed', { kind: toApiError(error).kind });
  }
  await endSession('signed_out');
}

/** The server rejected the session mid-use (refresh revoked/expired). */
export function expireSession(): void {
  if (useSessionStore.getState().status !== 'authenticated') return;
  void endSession('expired');
}

setSessionEndedHandler(expireSession);
