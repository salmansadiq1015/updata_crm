import { db, getSyncMeta, setSyncMeta } from '../db/mobile-db';
import { useAuthStore } from '@/stores/auth-store';

const TOKEN_KEY = 'cached_access_token';
const REFRESH_KEY = 'cached_refresh_token';
const LAST_ACTIVITY_KEY = 'last_activity_at';
const AUTO_LOGOUT_MS = 24 * 60 * 60 * 1000;

export async function cacheTokensForOffline(accessToken) {
  if (!accessToken) return;
  await setSyncMeta(TOKEN_KEY, accessToken);
  await setSyncMeta(LAST_ACTIVITY_KEY, new Date().toISOString());
}

export async function getCachedAccessToken() {
  return getSyncMeta(TOKEN_KEY);
}

export async function clearCachedTokens() {
  await db.syncMeta.bulkDelete([TOKEN_KEY, REFRESH_KEY, LAST_ACTIVITY_KEY]);
}

export async function updateLastActivity() {
  await setSyncMeta(LAST_ACTIVITY_KEY, new Date().toISOString());
}

export async function isSessionExpired() {
  const lastActivity = await getSyncMeta(LAST_ACTIVITY_KEY);
  if (!lastActivity) return true;

  const elapsed = Date.now() - new Date(lastActivity).getTime();
  return elapsed > AUTO_LOGOUT_MS;
}

export function decodeTokenExpiry(token) {
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function isTokenExpired(token) {
  const expiry = decodeTokenExpiry(token);
  if (!expiry) return true;
  return Date.now() >= expiry;
}

export async function restoreAuthFromCache() {
  const expired = await isSessionExpired();
  if (expired) {
    await clearCachedTokens();
    return false;
  }

  const cachedToken = await getCachedAccessToken();
  if (!cachedToken) return false;

  const store = useAuthStore.getState();
  if (!store.accessToken && cachedToken) {
    store.setTokens(cachedToken);
    return true;
  }
  return false;
}
