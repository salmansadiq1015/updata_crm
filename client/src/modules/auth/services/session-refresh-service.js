import axios from 'axios';
import Cookies from 'js-cookie';
import { API_URL } from '@/lib/api/config';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth-store';

const REFRESH_COOKIE = 'mb_refresh_token';
const COOKIE_OPTIONS = Object.freeze({ path: '/', sameSite: 'strict' });

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
  return !error?.response && (error?.code === 'ERR_NETWORK' || isOffline);
}

function clearSessionState() {
  useAuthStore.getState().clearAuth();
  clearStoredRefreshToken();
}

async function fetchCurrentUser(accessToken) {
  const response = await axios.get(`${API_URL}${ENDPOINTS.AUTH.ME}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
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
    const response = await axios.post(`${API_URL}${ENDPOINTS.AUTH.REFRESH}`, { refreshToken });
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
