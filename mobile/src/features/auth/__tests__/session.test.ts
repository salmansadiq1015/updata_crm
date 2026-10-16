import { queryClient } from '@/app/queryClient';
import { ApiError } from '@/services/api/apiErrors';
import { refreshAccessToken } from '@/services/auth/sessionManager';
import { tokenManager } from '@/services/auth/tokenManager';

import { authApi } from '../api/authApi';
import { expireSession, restoreSession, signIn, signOut } from '../services/session';
import { useSessionStore } from '../store/sessionStore';

jest.mock('../api/authApi');
jest.mock('@/services/auth/sessionManager', () => ({
  ...jest.requireActual('@/services/auth/sessionManager'),
  refreshAccessToken: jest.fn(),
}));

const mockedAuthApi = jest.mocked(authApi);
const mockedRefresh = jest.mocked(refreshAccessToken);

const user = {
  id: 'u1',
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: null,
  fullName: 'Ana',
  phone: null,
  language: null,
  avatarUrl: null,
  roleName: 'Sales',
  status: 'active',
};
const http = (status: number, code = 'X') => new ApiError({ kind: 'http', status, code, message: 'x' });

beforeEach(async () => {
  jest.clearAllMocks();
  await tokenManager.clear();
  queryClient.clear();
  useSessionStore.setState({ status: 'restoring', user: null, endReason: null });
});

describe('signIn', () => {
  it('stores tokens, clears any previous account cache and authenticates', async () => {
    queryClient.setQueryData(['leads', 'list', {}], ['previous account data']);
    mockedAuthApi.login.mockResolvedValue({ accessToken: 'a', refreshToken: 'r', user });

    await expect(signIn({ email: 'ana@example.com', password: 'pw' })).resolves.toEqual(user);

    expect(tokenManager.getAccessToken()).toBe('a');
    await expect(tokenManager.getRefreshToken()).resolves.toBe('r');
    expect(queryClient.getQueryData(['leads', 'list', {}])).toBeUndefined();
    expect(useSessionStore.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('leaves the user signed out and stores nothing when credentials are rejected', async () => {
    useSessionStore.setState({ status: 'unauthenticated' });
    mockedAuthApi.login.mockRejectedValue(http(401, 'INVALID_CREDENTIALS'));

    await expect(signIn({ email: 'ana@example.com', password: 'bad' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    await expect(tokenManager.getRefreshToken()).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe('unauthenticated');
  });
});

describe('restoreSession', () => {
  it('goes straight to sign-in when nothing is stored', async () => {
    await restoreSession();
    expect(useSessionStore.getState()).toMatchObject({ status: 'unauthenticated', endReason: null });
    expect(mockedRefresh).not.toHaveBeenCalled();
  });

  it('verifies a stored session with the server before trusting it', async () => {
    await tokenManager.setTokens({ accessToken: 'old', refreshToken: 'r' });
    mockedRefresh.mockResolvedValue('fresh');
    mockedAuthApi.me.mockResolvedValue(user);

    await restoreSession();

    expect(mockedRefresh).toHaveBeenCalledTimes(1);
    expect(mockedAuthApi.me).toHaveBeenCalledTimes(1);
    expect(useSessionStore.getState()).toMatchObject({ status: 'authenticated', user });
  });

  it('signs out with an "expired" notice when the stored session was revoked', async () => {
    await tokenManager.setTokens({ accessToken: 'old', refreshToken: 'r' });
    mockedRefresh.mockRejectedValue(http(401, 'INVALID_TOKEN'));

    await restoreSession();

    expect(useSessionStore.getState()).toMatchObject({ status: 'unauthenticated', endReason: 'expired' });
    await expect(tokenManager.getRefreshToken()).resolves.toBeNull();
  });

  it('keeps the stored session and offers a retry when the server is unreachable', async () => {
    await tokenManager.setTokens({ accessToken: 'old', refreshToken: 'r' });
    mockedRefresh.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' }));

    await restoreSession();

    expect(useSessionStore.getState().status).toBe('restore_failed');
    await expect(tokenManager.getRefreshToken()).resolves.toBe('r');
  });
});

describe('ending a session', () => {
  beforeEach(async () => {
    await tokenManager.setTokens({ accessToken: 'a', refreshToken: 'r' });
    useSessionStore.setState({ status: 'authenticated', user });
    queryClient.setQueryData(['leads', 'detail', 'x'], { private: true });
  });

  it('signOut revokes the server session, clears tokens and private cache', async () => {
    mockedAuthApi.logout.mockResolvedValue();
    await signOut();
    expect(mockedAuthApi.logout).toHaveBeenCalledTimes(1);
    expect(tokenManager.getAccessToken()).toBeNull();
    await expect(tokenManager.getRefreshToken()).resolves.toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(useSessionStore.getState()).toMatchObject({ status: 'unauthenticated', endReason: 'signed_out' });
  });

  it('signOut still ends the local session when the server cannot be reached', async () => {
    mockedAuthApi.logout.mockRejectedValue(new ApiError({ kind: 'network', message: 'offline' }));
    await signOut();
    await expect(tokenManager.getRefreshToken()).resolves.toBeNull();
    expect(useSessionStore.getState().status).toBe('unauthenticated');
  });

  it('expireSession (refresh rejected mid-use) clears everything with an "expired" notice', async () => {
    expireSession();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useSessionStore.getState()).toMatchObject({ status: 'unauthenticated', endReason: 'expired' });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});
