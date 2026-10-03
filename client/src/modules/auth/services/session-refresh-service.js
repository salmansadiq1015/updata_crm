import axios from 'axios';
import Cookies from 'js-cookie';
import { API_URL } from '@/lib/api/config';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth-store';

const REFRESH_COOKIE = 'mb_refresh_token';
const COOKIE_OPTIONS = Object.freeze({ path: '/', sameSite: 'strict' });

// These calls use the bare `axios` (not `apiClient`) on purpose, to avoid the
// 401 → refresh interceptor recursing into itself. The trade-off is that they
// do NOT inherit apiClient's timeout, and bare axios has none — so a backend
// that accepts the connection but never responds would hang this request
// forever. During bootstrap `AuthInitializer` awaits it before clearing
// `isLoading`, so an un-timed hang leaves the whole app stuck on the full-page
// spinner (the redirect-to-login guard is itself gated on `!isLoading`). A
// finite timeout guarantees the promise always settles and the app recovers.
const AUTH_REQUEST_TIMEOUT_MS = 10000;

let refreshSessionPromise = null;

function unwrapEnvelope(response) {
  const body = response?.data;
  if (body && typeof body === 'object' && 'success' in body) {
    return body.data;
  }
  return body;
}

export function getStoredRefreshToken() {
  return Cookies.get(REFRESH_COOKIE);
}

export function storeRefreshToken(refreshToken) {
  Cookies.set(REFRESH_COOKIE, refreshToken, COOKIE_OPTIONS);
}

export function clearStoredRefreshToken() {
  Cookies.remove(REFRESH_COOKIE, { path: COOKIE_OPTIONS.path });
}

export function isRefreshSessionNetworkError(error) {
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  // NOTE: a timeout (ECONNABORTED) is deliberately NOT treated as a "network
  // error" here. Network errors preserve the session (so an offline user keeps
  // their cached session), but that preservation path does not clear local auth
  // state — and the bootstrap redirect to /login only fires reliably once the
  // session is cleared. A hung backend that trips the request timeout must
  // therefore fall through to clearSessionState() so the app recovers to /login
  // instead of sitting on the full-page spinner forever.
  return !error?.response && (error?.code === 'ERR_NETWORK' || isOffline);
}

function clearSessionState() {
  useAuthStore.getState().clearAuth();
  clearStoredRefreshToken();
}

async function fetchCurrentUser(accessToken) {
  const response = await axios.get(`${API_URL}${ENDPOINTS.AUTH.ME}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: AUTH_REQUEST_TIMEOUT_MS,
  });
  return unwrapEnvelope(response);
}

async function requestRefreshSession() {
  const refreshToken = getStoredRefreshToken();
  if (!refreshToken) {
    clearSessionState();
    throw new Error('No refresh token available');
  }

  let authData;
  try {
    const response = await axios.post(
      `${API_URL}${ENDPOINTS.AUTH.REFRESH}`,
      { refreshToken },
      { timeout: AUTH_REQUEST_TIMEOUT_MS },
    );
    authData = unwrapEnvelope(response);
  } catch (error) {
    if (!isRefreshSessionNetworkError(error)) {
      clearSessionState();
    }
    throw error;
  }

  const accessToken = authData?.accessToken;
  if (!accessToken) {
    clearSessionState();
    throw new Error('Refresh response did not include an access token');
  }

  const store = useAuthStore.getState();
  store.setTokens(accessToken);

  if (authData.refreshToken) {
    storeRefreshToken(authData.refreshToken);
  }

  if (store.user) {
    return { ...authData, user: store.user };
  }

  try {
    const user = await fetchCurrentUser(accessToken);
    useAuthStore.getState().setAuth(user, accessToken);
    return { ...authData, user };
  } catch (error) {
    if (error?.response?.status === 401) {
      clearSessionState();
    }
    throw error;
  }
}

export function refreshSession() {
  if (!refreshSessionPromise) {
    refreshSessionPromise = requestRefreshSession().finally(() => {
      refreshSessionPromise = null;
    });
  }
  return refreshSessionPromise;
}
