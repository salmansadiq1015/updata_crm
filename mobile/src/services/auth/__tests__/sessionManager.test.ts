import axios, { AxiosHeaders } from 'axios';
import * as SecureStore from 'expo-secure-store';

import { refreshAccessToken } from '../sessionManager';
import { tokenManager } from '../tokenManager';

const { AxiosError } = jest.requireActual<typeof import('axios')>('axios');

function httpError(status: number) {
  return new AxiosError('fail', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { success: false, error: { statusCode: status, code: 'INVALID_TOKEN', message: 'x' } },
  });
}

describe('refreshAccessToken', () => {
  const post = jest.spyOn(axios, 'post');

  beforeEach(async () => {
    post.mockReset();
    (SecureStore as unknown as { __reset: () => void }).__reset();
    await tokenManager.setTokens({ accessToken: 'a0', refreshToken: 'r0' });
  });

  it('shares one request between concurrent callers (rotation race)', async () => {
    let resolve!: (value: unknown) => void;
    post.mockReturnValue(new Promise((r) => (resolve = r)));
    const calls = [refreshAccessToken(), refreshAccessToken(), refreshAccessToken()];
    resolve({ data: { data: { accessToken: 'a1', refreshToken: 'r1' } } });
    await expect(Promise.all(calls)).resolves.toEqual(['a1', 'a1', 'a1']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      'http://api.test/api/v1/auth/refresh',
      { refreshToken: 'r0' },
      expect.anything(),
    );
    expect(tokenManager.getAccessToken()).toBe('a1');
    await expect(tokenManager.getRefreshToken()).resolves.toBe('r1');
  });

  it('clears stored session material when the server rejects the refresh token', async () => {
    post.mockRejectedValue(httpError(401));
    await expect(refreshAccessToken()).rejects.toMatchObject({ status: 401 });
    expect(tokenManager.getAccessToken()).toBeNull();
    await expect(tokenManager.getRefreshToken()).resolves.toBeNull();
  });

  it('keeps the session on a network failure (the user may simply be offline)', async () => {
    post.mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'));
    await expect(refreshAccessToken()).rejects.toMatchObject({ kind: 'network' });
    await expect(tokenManager.getRefreshToken()).resolves.toBe('r0');
  });

  it('rejects malformed refresh responses without storing anything', async () => {
    post.mockResolvedValue({ data: { data: { accessToken: '' } } });
    await expect(refreshAccessToken()).rejects.toMatchObject({ kind: 'invalid_response' });
    await expect(tokenManager.getRefreshToken()).resolves.toBe('r0');
  });

  it('fails fast without a stored refresh token', async () => {
    await tokenManager.clear();
    await expect(refreshAccessToken()).rejects.toMatchObject({ code: 'NO_TOKEN' });
    expect(post).not.toHaveBeenCalled();
  });
});
