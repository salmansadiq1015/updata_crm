import { beforeEach, describe, expect, it, vi } from 'vitest';

const postMock = vi.hoisted(() => vi.fn());
const getMock = vi.hoisted(() => vi.fn());
const getStateMock = vi.hoisted(() => vi.fn());
const cookieStore = vi.hoisted(() => new Map<string, string>());

vi.mock('axios', () => ({
  default: {
    post: postMock,
    get: getMock,
  },
}));

vi.mock('js-cookie', () => ({
  default: {
    get: vi.fn((key: string) => cookieStore.get(key)),
    set: vi.fn((key: string, value: string) => {
      cookieStore.set(key, value);
    }),
    remove: vi.fn((key: string) => {
      cookieStore.delete(key);
    }),
  },
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: getStateMock,
  },
}));

interface AuthEnvelope {
  data: {
    success: boolean;
    data: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      tokenType: string;
    };
  };
}

async function loadService() {
  vi.resetModules();
  return import('../session-refresh-service');
}

describe('session-refresh-service', () => {
  beforeEach(() => {
    postMock.mockReset();
    getMock.mockReset();
    getStateMock.mockReset();
    cookieStore.clear();
  });

  it('coalesces concurrent refresh calls into one token rotation request', async () => {
    const setTokens = vi.fn();
    const setAuth = vi.fn();
    const clearAuth = vi.fn();
    getStateMock.mockReturnValue({ user: null, setTokens, setAuth, clearAuth });
    cookieStore.set('mb_refresh_token', 'refresh-old');

    let resolveRefresh: ((value: AuthEnvelope) => void) | undefined;
    postMock.mockReturnValue(
      new Promise<AuthEnvelope>((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    getMock.mockResolvedValue({
      data: {
        success: true,
        data: { id: 'user-1', email: 'user@test.ch' },
      },
    });

    const { refreshSession } = await loadService();
    const first = refreshSession();
    const second = refreshSession();

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      'http://localhost:9097/api/v1/auth/refresh',
      { refreshToken: 'refresh-old' },
      { timeout: 10000 },
    );

    resolveRefresh?.({
      data: {
        success: true,
        data: {
          accessToken: 'access-new',
          refreshToken: 'refresh-new',
          expiresIn: 900,
          tokenType: 'Bearer',
        },
      },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ accessToken: 'access-new' }),
      expect.objectContaining({ accessToken: 'access-new' }),
    ]);

    expect(cookieStore.get('mb_refresh_token')).toBe('refresh-new');
    expect(setTokens).toHaveBeenCalledTimes(1);
    expect(setTokens).toHaveBeenCalledWith('access-new');
    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(setAuth).toHaveBeenCalledWith(
      { id: 'user-1', email: 'user@test.ch' },
      'access-new',
    );
    expect(clearAuth).not.toHaveBeenCalled();
  });
});
