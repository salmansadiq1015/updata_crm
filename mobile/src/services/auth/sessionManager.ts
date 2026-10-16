// Token refresh. The server rotates the refresh token on every use and revokes
// the whole session when an old one is replayed, so two concurrent refreshes
// would sign the user out: every caller shares one in-flight promise.
import axios from 'axios';
import { z } from 'zod';

import { getEnv } from '@/config/env';
import { ApiError, toApiError } from '@/services/api/apiErrors';
import { ENDPOINTS } from '@/services/api/endpoints';
import { logger } from '@/services/logging/logger';

import { tokenManager, type TokenPair } from './tokenManager';

const REFRESH_TIMEOUT_MS = 10_000;

const tokenPairSchema = z.object({
  data: z.object({ accessToken: z.string().min(1), refreshToken: z.string().min(1) }),
});

type SessionEndHandler = () => void;
let onSessionEnded: SessionEndHandler = () => undefined;

/** Registered by the auth feature: what to do when the server rejects the session. */
export function setSessionEndedHandler(handler: SessionEndHandler) {
  onSessionEnded = handler;
}

/** Bare client: no interceptors, so a failing refresh can never trigger another refresh. */
async function postRefresh(refreshToken: string): Promise<TokenPair> {
  try {
    const response = await axios.post(
      `${getEnv().apiUrl}${ENDPOINTS.auth.refresh}`,
      { refreshToken },
      { timeout: REFRESH_TIMEOUT_MS, headers: { 'Content-Type': 'application/json' } },
    );
    const parsed = tokenPairSchema.safeParse(response.data);
    if (!parsed.success) {
      throw new ApiError({ kind: 'invalid_response', message: 'Malformed refresh response' });
    }
    return parsed.data.data;
  } catch (error) {
    throw toApiError(error);
  }
}

async function performRefresh(): Promise<string> {
  const refreshToken = await tokenManager.getRefreshToken();
  if (!refreshToken) {
    throw new ApiError({ kind: 'http', status: 401, code: 'NO_TOKEN', message: 'No refresh token' });
  }

  try {
    const tokens = await postRefresh(refreshToken);
    await tokenManager.setTokens(tokens);
    logger.debug('auth.refresh.succeeded');
    return tokens.accessToken;
  } catch (error) {
    const apiError = toApiError(error);
    // Transport failures keep the stored session: the user may simply be offline.
    if (apiError.kind === 'http' && (apiError.status === 401 || apiError.status === 403)) {
      logger.info('auth.refresh.rejected', { code: apiError.code });
      await tokenManager.clear();
    }
    throw apiError;
  }
}

let inFlight: Promise<string> | null = null;

/** Rotate the token pair, sharing one request between concurrent callers. */
export function refreshAccessToken(): Promise<string> {
  inFlight ??= performRefresh().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Called by the API client when a refresh is definitively rejected mid-session. */
export function endSessionFromServer() {
  onSessionEnded();
}
