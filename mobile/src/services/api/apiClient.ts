// The only HTTP client in the app. Feature `api/` modules call `api.*`; screens
// never touch axios. Behaviour mirrors the web client (client/src/lib/api/client.js):
// Bearer auth, X-Request-Id, envelope unwrapping, refresh-once-on-401.
import { create, isAxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { randomUUID } from 'expo-crypto';
import type { z } from 'zod';

import { getEnv } from '@/config/env';
import { endSessionFromServer, refreshAccessToken } from '@/services/auth/sessionManager';
import { tokenManager } from '@/services/auth/tokenManager';
import { logger } from '@/services/logging/logger';

import { ApiError, toApiError } from './apiErrors';
import type { CursorPagination, SuccessEnvelope } from './apiTypes';
import { AUTH_ENDPOINTS_WITHOUT_REFRESH } from './endpoints';

export const REQUEST_TIMEOUT_MS = 30_000;

declare module 'axios' {
  interface AxiosRequestConfig {
    /** Do not attach the Bearer token (login, password reset). */
    skipAuth?: boolean;
    /** Internal: this request already went through one refresh-and-replay. */
    _retried?: boolean;
  }
}

export type ApiClientDeps = {
  getBaseUrl: () => string;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string>;
  onSessionEnded: () => void;
  createRequestId: () => string;
};

const isAuthEndpoint = (url = '') => AUTH_ENDPOINTS_WITHOUT_REFRESH.some((path) => url.endsWith(path));

export function createApiClient(deps: ApiClientDeps): AxiosInstance {
  const client = create({
    timeout: REQUEST_TIMEOUT_MS,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });

  client.interceptors.request.use((config) => {
    config.baseURL ??= deps.getBaseUrl();
    config.headers.set('X-Request-Id', deps.createRequestId());
    const token = deps.getAccessToken();
    if (token && !config.skipAuth) config.headers.set('Authorization', `Bearer ${token}`);
    logger.debug('http.request', { method: config.method, url: config.url, params: config.params });
    return config;
  });

  client.interceptors.response.use(
    (response) => response,
    async (rawError: unknown) => {
      const error = toApiError(rawError);
      const config = (isAxiosError(rawError) ? rawError.config : undefined) as
        | InternalAxiosRequestConfig
        | undefined;

      const canRefresh =
        error.isUnauthorized && config && !config._retried && !config.skipAuth && !isAuthEndpoint(config.url);

      if (!canRefresh) {
        if (error.kind !== 'canceled') {
          logger.debug('http.error', { url: config?.url, status: error.status, code: error.code });
        }
        throw error;
      }

      // The server rejected the request at the auth layer, before running it, so
      // replaying once is safe even for POST/PATCH — it cannot double-apply.
      let token: string;
      try {
        token = await deps.refreshAccessToken();
      } catch (refreshError) {
        const refreshFailure = toApiError(refreshError);
        if (refreshFailure.kind === 'http') {
          deps.onSessionEnded();
          throw new ApiError({
            kind: 'http',
            status: 401,
            code: 'SESSION_EXPIRED',
            message: 'Session expired',
          });
        }
        throw refreshFailure;
      }

      config._retried = true;
      config.headers.set('Authorization', `Bearer ${token}`);
      return client.request(config);
    },
  );

  return client;
}

export const apiClient = createApiClient({
  getBaseUrl: () => getEnv().apiUrl,
  getAccessToken: tokenManager.getAccessToken,
  refreshAccessToken,
  onSessionEnded: endSessionFromServer,
  createRequestId: randomUUID,
});

type RequestOptions = {
  params?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  skipAuth?: boolean;
  /** Extra headers, e.g. multipart uploads. */
  headers?: Record<string, string>;
  /** Per-request timeout override in ms (e.g. audio transcription). */
  timeout?: number;
};

/** Strip `undefined` so optional filters never reach the query string. */
function cleanParams(params?: RequestOptions['params']) {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== ''),
  );
}

function parseEnvelope<T>(body: unknown, schema?: z.ZodType<T>): { data: T; pagination?: CursorPagination } {
  const envelope = body as SuccessEnvelope<unknown> | undefined;
  if (!envelope || envelope.success !== true) {
    throw new ApiError({ kind: 'invalid_response', message: 'Response is not an API success envelope' });
  }
  if (!schema) return { data: envelope.data as T, pagination: envelope.pagination };
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) {
    logger.warn('http.invalid_response', { issues: parsed.error.issues.slice(0, 3) });
    throw new ApiError({ kind: 'invalid_response', message: 'Response did not match the expected shape' });
  }
  return { data: parsed.data, pagination: envelope.pagination };
}

async function send<T>(
  run: () => Promise<{ data: unknown }>,
  schema?: z.ZodType<T>,
): Promise<{ data: T; pagination?: CursorPagination }> {
  try {
    const response = await run();
    return parseEnvelope(response.data, schema);
  } catch (error) {
    throw toApiError(error);
  }
}

/** Typed, envelope-aware request helpers. Pass a zod schema to validate the payload. */
export function createApi(client: AxiosInstance) {
  return {
    async get<T>(url: string, schema?: z.ZodType<T>, options: RequestOptions = {}) {
      return send(() => client.get(url, { ...options, params: cleanParams(options.params) }), schema);
    },
    async post<T>(url: string, body?: unknown, schema?: z.ZodType<T>, options: RequestOptions = {}) {
      return send(() => client.post(url, body, options), schema);
    },
    async patch<T>(url: string, body: unknown, schema?: z.ZodType<T>, options: RequestOptions = {}) {
      return send(() => client.patch(url, body, options), schema);
    },
    async put<T>(url: string, body: unknown, schema?: z.ZodType<T>, options: RequestOptions = {}) {
      return send(() => client.put(url, body, options), schema);
    },
    async delete<T>(url: string, schema?: z.ZodType<T>, options: RequestOptions = {}) {
      return send(() => client.delete(url, options), schema);
    },
  };
}

export const api = createApi(apiClient);
