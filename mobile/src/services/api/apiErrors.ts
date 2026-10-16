// One error type for every failed request, whatever failed: transport, timeout,
// cancellation or an HTTP error envelope. Screens never inspect axios errors.
import { isAxiosError, isCancel } from 'axios';

import type { ApiFieldError, ErrorEnvelope } from './apiTypes';

export type ApiErrorKind = 'network' | 'timeout' | 'canceled' | 'http' | 'invalid_response';

type ApiErrorInit = {
  kind: ApiErrorKind;
  message: string;
  status?: number;
  code?: string;
  details?: ApiFieldError[];
  requestId?: string;
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  /** Server error code, e.g. `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `VALIDATION_ERROR`. */
  readonly code: string | null;
  readonly details: ApiFieldError[];
  readonly requestId: string | null;

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.details = init.details ?? [];
    this.requestId = init.requestId ?? null;
  }

  /** Transient failures that a GET may safely retry. */
  get isRetryable(): boolean {
    if (this.kind === 'network' || this.kind === 'timeout') return true;
    return this.status === 429 || (this.status !== null && this.status >= 500 && this.status !== 501);
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

function isErrorEnvelope(body: unknown): body is ErrorEnvelope {
  if (typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && 'code' in error;
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;

  if (isCancel(error)) return new ApiError({ kind: 'canceled', message: 'Request canceled' });

  if (isAxiosError(error)) {
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return new ApiError({ kind: 'timeout', message: 'Request timed out' });
    }
    if (!error.response) {
      return new ApiError({ kind: 'network', message: error.message || 'Network error' });
    }

    const { status, data, headers } = error.response;
    const requestId = typeof headers?.['x-request-id'] === 'string' ? headers['x-request-id'] : undefined;
    if (isErrorEnvelope(data)) {
      return new ApiError({
        kind: 'http',
        status,
        code: data.error.code,
        message: data.error.message,
        details: Array.isArray(data.error.details) ? data.error.details : [],
        requestId: data.meta?.requestId ?? requestId,
      });
    }
    return new ApiError({ kind: 'http', status, message: `HTTP ${status}`, requestId });
  }

  return new ApiError({
    kind: 'invalid_response',
    message: error instanceof Error ? error.message : 'Unexpected error',
  });
}

/** Server-side validation details keyed by field, for `setError` in forms. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.details.map((detail) => [detail.field, detail.message]));
}
