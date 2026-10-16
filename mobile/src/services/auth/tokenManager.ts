// Session material. The access token (15 min) stays in memory only, exactly like
// the web client; the rotating refresh token is persisted in secure storage.
import { secureStorage } from '@/services/storage/secureStorage';

let accessToken: string | null = null;

export type TokenPair = { accessToken: string; refreshToken: string };

export const tokenManager = {
  getAccessToken(): string | null {
    return accessToken;
  },
  getRefreshToken(): Promise<string | null> {
    return secureStorage.getRefreshToken();
  },
  async setTokens(tokens: TokenPair): Promise<void> {
    // Persist first: if the write fails, the old in-memory token keeps working
    // instead of leaving a session that cannot survive a restart.
    await secureStorage.setRefreshToken(tokens.refreshToken);
    accessToken = tokens.accessToken;
  },
  async clear(): Promise<void> {
    accessToken = null;
    await secureStorage.clear();
  },
};
