import axios from 'axios';
import { generateId } from '@/lib/utils/ids';
import { API_URL } from './config';
import { ENDPOINTS } from './endpoints';
import {
  isRefreshSessionNetworkError,
  refreshSession,
} from '@/modules/auth/services/session-refresh-service';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

const AUTH_RECOVERY_EXCLUDED_PATHS = [
  ENDPOINTS.AUTH.LOGIN,
  ENDPOINTS.AUTH.REFRESH,
  ENDPOINTS.AUTH.ACTIVATE,
  ENDPOINTS.AUTH.RESET_REQUEST,
  ENDPOINTS.AUTH.RESET_CONFIRM,
];

function shouldAttemptAuthRecovery(config) {
  const url = config?.url || '';
  return !AUTH_RECOVERY_EXCLUDED_PATHS.some((path) => url.includes(path));
}

// Request interceptor: inject auth token.
apiClient.interceptors.request.use(
  (config) => {
    // Import dynamically to avoid circular deps.
    const { useAuthStore } = require('@/stores/auth-store');
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    config.headers['X-Request-Id'] = generateId();
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor: unwrap envelope and recover expired access tokens.
apiClient.interceptors.response.use(
  (response) => {
    const body = response.data;
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

    if (
      originalRequest &&
      error.response?.status === 401 &&
      !originalRequest._retry &&
      shouldAttemptAuthRecovery(originalRequest)
    ) {
      originalRequest._retry = true;

      try {
        const { accessToken } = await refreshSession();
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        if (isRefreshSessionNetworkError(refreshError)) {
          return Promise.reject(normalizeApiError(error));
        }

        if (typeof window !== 'undefined') {
          window.location.href = '/login';
        }
        return Promise.reject(normalizeApiError(refreshError));
      }
    }

    return Promise.reject(normalizeApiError(error));
  },
);

/**
 * Normalize any axios / fetch / thrown error into a consistent shape:
 *   { statusCode, code, message, details, requestId, isNetworkError, isTimeout, isOffline }
 *
 * The message is always a human-readable string safe to display in a toast.
 * When the backend returns validation details (array of { field, message }),
 * the first field error is appended to the message so the user can act on it
 * without opening DevTools.
 */
export function normalizeApiError(error) {
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

  const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const isTimeout = error?.code === 'ECONNABORTED' || /timeout/i.test(error?.message || '');
  const isCanceled = axios.isCancel?.(error) || error?.code === 'ERR_CANCELED';
  const isNetworkError = !response && !isCanceled && (error?.code === 'ERR_NETWORK' || /network/i.test(error?.message || '') || isOffline || isTimeout);

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
      const firstDetail = details[0];
      const detailMsg = firstDetail?.message || firstDetail?.msg;
      const detailField = firstDetail?.field || firstDetail?.path;
      message = detailMsg && detailField
        ? `${backendMsg} - ${detailField}: ${detailMsg}`
        : detailMsg
        ? `${backendMsg} - ${detailMsg}`
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
