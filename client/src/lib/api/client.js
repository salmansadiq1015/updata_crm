import axios from 'axios';
import { generateId } from '@/lib/utils/ids';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9097/api/v1';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Token refresh state (prevent concurrent refreshes)
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
};

// Request interceptor — inject auth token
apiClient.interceptors.request.use(
  (config) => {
    // Import dynamically to avoid circular deps
    const { useAuthStore } = require('@/stores/auth-store');
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Request-Id'] = generateId();
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — unwrap envelope + handle 401 refresh
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;
    // Unwrap the { success, data, meta, pagination } envelope
    if (body && typeof body === 'object' && 'success' in body) {
      return {
        data: body.data,
        meta: body.meta || {},
        pagination: body.pagination || null,
        _raw: body,
      };
    }
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 — try token refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const Cookies = (await import('js-cookie')).default;
        const refreshToken = Cookies.get('mb_refresh_token');
        if (!refreshToken) throw new Error('No refresh token');

        const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = res.data.data || res.data;

        const { useAuthStore } = await import('@/stores/auth-store');
        useAuthStore.getState().setTokens(accessToken);
        if (newRefreshToken) {
          Cookies.set('mb_refresh_token', newRefreshToken, { path: '/', sameSite: 'strict' });
        }

        // Fetch user profile if not already loaded
        if (!useAuthStore.getState().user) {
          try {
            const userRes = await axios.get(`${API_URL}/users/me`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            const userData = userRes.data?.data || userRes.data;
            useAuthStore.getState().setAuth(userData, accessToken);
          } catch {
            // User fetch failed — continue with tokens only
          }
        }

        processQueue(null, accessToken);
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        const isOfflineNow = typeof navigator !== 'undefined' && !navigator.onLine;
        const isNetworkRefreshError = !refreshError?.response && (refreshError?.code === 'ERR_NETWORK' || isOfflineNow);

        if (isNetworkRefreshError) {
          // Offline: don't clear auth or redirect — queue for retry on reconnect
          return Promise.reject(normalizeApiError(error));
        }

        const { useAuthStore } = await import('@/stores/auth-store');
        useAuthStore.getState().clearAuth();
        const Cookies = (await import('js-cookie')).default;
        Cookies.remove('mb_refresh_token');
        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(normalizeApiError(error));
  }
);

/**
 * Normalize any axios / fetch / thrown error into a consistent shape:
 *   { statusCode, code, message, details, requestId, isNetworkError, isTimeout, isOffline }
 *
 * The `message` is always a human-readable string safe to display in a toast.
 * When the backend returns validation details (array of { field, message }),
 * the first field error is appended to the message so the user can act on it
 * without opening DevTools.
 */
export function normalizeApiError(error) {
  // Already normalized by a previous pass (e.g. re-thrown)
  if (error && typeof error === 'object' && 'statusCode' in error && 'message' in error && !('response' in error)) {
    return error;
  }

  const response = error?.response;
  const data = response?.data;
  const envelopeError = data?.error;
  const details = Array.isArray(envelopeError?.details)
    ? envelopeError.details
    : Array.isArray(data?.details)
    ? data.details
    : [];

  // Detect network-level failures (no response received)
  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');
  const isCanceled = axios.isCancel?.(error) || error?.code === 'ERR_CANCELED';
  const isNetworkError = !response && !isCanceled && (error?.code === 'ERR_NETWORK' || /network/i.test(error?.message || '') || isOffline || isTimeout);

  // Derive the user-facing message
  let message;
  if (isCanceled) {
    message = 'Anfrage abgebrochen';
  } else if (isOffline) {
    message = 'Keine Internetverbindung. Bitte pruefen Sie Ihre Verbindung.';
  } else if (isTimeout) {
    message = 'Zeitueberschreitung beim Server. Bitte erneut versuchen.';
  } else if (isNetworkError) {
    message = 'Server nicht erreichbar. Bitte erneut versuchen.';
  } else {
    const backendMsg =
      envelopeError?.message ||
      data?.message ||
      (typeof data === 'string' ? data : null);

    if (backendMsg) {
      // If validation details exist, surface the first one (often more actionable)
      const firstDetail = details[0];
      const detailMsg = firstDetail?.message || firstDetail?.msg;
      const detailField = firstDetail?.field || firstDetail?.path;
      message = detailMsg && detailField
        ? `${backendMsg} — ${detailField}: ${detailMsg}`
        : detailMsg
        ? `${backendMsg} — ${detailMsg}`
        : backendMsg;
    } else if (response?.status === 401) {
      message = 'Nicht autorisiert. Bitte erneut anmelden.';
    } else if (response?.status === 403) {
      message = 'Keine Berechtigung fuer diese Aktion.';
    } else if (response?.status === 404) {
      message = 'Die angeforderte Ressource wurde nicht gefunden.';
    } else if (response?.status === 409) {
      message = 'Konflikt: Die Aktion kollidiert mit dem aktuellen Zustand.';
    } else if (response?.status === 422) {
      message = 'Validierungsfehler. Bitte Eingaben pruefen.';
    } else if (response?.status === 429) {
      message = 'Zu viele Anfragen. Bitte einen Moment warten.';
    } else if (response?.status >= 500) {
      message = 'Serverfehler. Bitte spaeter erneut versuchen.';
    } else {
      message = error?.message || 'Ein unbekannter Fehler ist aufgetreten.';
    }
  }

  return {
    statusCode: response?.status || (isNetworkError ? 0 : 500),
    code:
      envelopeError?.code ||
      (isTimeout ? 'TIMEOUT' : isOffline ? 'OFFLINE' : isNetworkError ? 'NETWORK_ERROR' : isCanceled ? 'CANCELED' : 'UNKNOWN'),
    message,
    details,
    data: envelopeError?.data ?? null,
    requestId: data?.meta?.requestId || response?.headers?.['x-request-id'] || null,
    isNetworkError,
    isTimeout,
    isOffline,
    isCanceled,
  };
}

export default apiClient;
