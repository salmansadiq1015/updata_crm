// One mapping from any error to user-facing copy, so the same server error reads
// the same everywhere. Raw server messages, stack traces and request ids are
// never shown to users.
import { onlineManager } from '@tanstack/react-query';
import type { ParseKeys } from 'i18next';

import { ApiError, toApiError } from '@/services/api/apiErrors';

export type ErrorKind = 'offline' | 'forbidden' | 'not_found' | 'session' | 'generic';

const CODE_MESSAGES: Record<string, ParseKeys> = {
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  ACCOUNT_LOCKED: 'errors.accountLocked',
  ACCOUNT_DEACTIVATED: 'errors.accountDeactivated',
  RATE_LIMIT_EXCEEDED: 'errors.rateLimited',
  VALIDATION_ERROR: 'errors.validation',
  INVALID_TOKEN: 'errors.invalidToken',
  TOKEN_EXPIRED: 'errors.invalidToken',
  SESSION_EXPIRED: 'errors.sessionExpired',
};

export function errorMessageKey(error: unknown): ParseKeys {
  const apiError = toApiError(error);
  if (apiError.kind === 'network') return onlineManager.isOnline() ? 'errors.network' : 'errors.offline';
  if (apiError.kind === 'timeout') return 'errors.timeout';
  if (apiError.code && CODE_MESSAGES[apiError.code]) return CODE_MESSAGES[apiError.code]!;
  switch (apiError.status) {
    case 400:
    case 422:
      return 'errors.validation';
    case 401:
      return 'errors.sessionExpired';
    case 403:
      return 'errors.forbidden';
    case 404:
      return 'errors.notFound';
    case 429:
      return 'errors.rateLimited';
    default:
      return apiError.status && apiError.status >= 500 ? 'errors.server' : 'errors.unknown';
  }
}

/** Coarse category for choosing an icon/state, independent of copy. */
export function errorKind(error: unknown): ErrorKind {
  const apiError = error instanceof ApiError ? error : toApiError(error);
  if (apiError.kind === 'network' && !onlineManager.isOnline()) return 'offline';
  if (apiError.status === 403) return 'forbidden';
  if (apiError.status === 404) return 'not_found';
  if (apiError.status === 401) return 'session';
  return 'generic';
}
