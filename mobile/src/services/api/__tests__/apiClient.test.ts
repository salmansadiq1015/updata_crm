import { AxiosHeaders, CanceledError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { z } from 'zod';

import { createApi, createApiClient, type ApiClientDeps } from '../apiClient';
import { ApiError } from '../apiErrors';

type Reply = { status: number; data?: unknown } | Error;

/** Axios adapter that records every request and answers from a queue. */
function fakeServer(replies: Reply[]) {
  const requests: InternalAxiosRequestConfig[] = [];
  const adapter: AxiosAdapter = async (config) => {
    requests.push(config);
    const reply = replies.shift();
    if (!reply) throw new Error('no reply queued');
    if (reply instanceof Error) throw reply;
    const response = {
      data: reply.data,
      status: reply.status,
      statusText: '',
      headers: {},
      config,
      request: {},
    };
    if (reply.status >= 400) {
      const { AxiosError } = jest.requireActual<typeof import('axios')>('axios');
      throw new AxiosError(`HTTP ${reply.status}`, 'ERR_BAD_RESPONSE', config, {}, response);
    }
    return response;
  };
  return { adapter, requests };
}

function setup(replies: Reply[], overrides: Partial<ApiClientDeps> = {}) {
  const server = fakeServer(replies);
  let token: string | null = 'access-1';
  const deps: ApiClientDeps = {
    getBaseUrl: () => 'http://api.test/api/v1',
    getAccessToken: () => token,
    refreshAccessToken: jest.fn(async () => {
      token = 'access-2';
      return token;
    }),
    onSessionEnded: jest.fn(),
    createRequestId: () => 'req-id',
    ...overrides,
  };
  const client = createApiClient(deps);
  client.defaults.adapter = server.adapter;
  return { client, api: createApi(client), deps, requests: server.requests };
}

const ok = (data: unknown, pagination?: unknown) => ({
  status: 200,
  data: { success: true, data, pagination },
});
const fail = (status: number, code: string, details?: unknown) => ({
  status,
  data: { success: false, error: { statusCode: status, code, message: 'server text', details } },
});
const header = (config: InternalAxiosRequestConfig, name: string) =>
  AxiosHeaders.from(config.headers).get(name);

describe('api client', () => {
  it('injects the bearer token, request id and base URL', async () => {
    const { api, requests } = setup([ok({ id: 1 })]);
    await api.get('/users/me');
    expect(requests[0]!.baseURL).toBe('http://api.test/api/v1');
    expect(header(requests[0]!, 'Authorization')).toBe('Bearer access-1');
    expect(header(requests[0]!, 'X-Request-Id')).toBe('req-id');
  });

  it('omits the token for skipAuth requests and when signed out', async () => {
    const { api, requests } = setup([ok(null), ok(null)], { getAccessToken: () => null });
    await api.post('/auth/login', {}, undefined, { skipAuth: true });
    await api.get('/x');
    expect(header(requests[0]!, 'Authorization')).toBeUndefined();
    expect(header(requests[1]!, 'Authorization')).toBeUndefined();
  });

  it('unwraps the success envelope and validates it with the schema', async () => {
    const { api } = setup([
      ok({ count: 3 }, { hasNext: false, nextCursor: null, limit: 25 }),
      ok({ count: 'x' }),
    ]);
    const schema = z.object({ count: z.number() });
    await expect(api.get('/a', schema)).resolves.toEqual({
      data: { count: 3 },
      pagination: { hasNext: false, nextCursor: null, limit: 25 },
    });
    await expect(api.get('/b', schema)).rejects.toMatchObject({ kind: 'invalid_response' });
  });

  it('turns error envelopes into structured ApiErrors', async () => {
    const { api } = setup([fail(422, 'VALIDATION_ERROR', [{ field: 'email', message: 'bad' }])]);
    const error = await api.post('/x', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ kind: 'http', status: 422, code: 'VALIDATION_ERROR' });
    expect((error as ApiError).details).toEqual([{ field: 'email', message: 'bad' }]);
  });

  it('refreshes once on 401 and replays the request with the new token', async () => {
    const { api, deps, requests } = setup([fail(401, 'TOKEN_EXPIRED'), ok('done')]);
    await expect(api.get('/leads')).resolves.toMatchObject({ data: 'done' });
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
    expect(header(requests[1]!, 'Authorization')).toBe('Bearer access-2');
  });

  it('does not loop: a second 401 after the replay is final', async () => {
    const { api, deps } = setup([fail(401, 'TOKEN_EXPIRED'), fail(401, 'TOKEN_EXPIRED')]);
    await expect(api.get('/leads')).rejects.toMatchObject({ status: 401 });
    expect(deps.refreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('ends the session when the refresh is rejected by the server', async () => {
    const refreshAccessToken = jest.fn(async () => {
      throw new ApiError({ kind: 'http', status: 401, code: 'INVALID_TOKEN', message: 'x' });
    });
    const { api, deps } = setup([fail(401, 'TOKEN_EXPIRED')], { refreshAccessToken });
    await expect(api.get('/leads')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(deps.onSessionEnded).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the refresh fails for network reasons', async () => {
    const refreshAccessToken = jest.fn(async () => {
      throw new ApiError({ kind: 'network', message: 'offline' });
    });
    const { api, deps } = setup([fail(401, 'TOKEN_EXPIRED')], { refreshAccessToken });
    await expect(api.get('/leads')).rejects.toMatchObject({ kind: 'network' });
    expect(deps.onSessionEnded).not.toHaveBeenCalled();
  });

  it('never refreshes for auth endpoints (wrong password is not an expired session)', async () => {
    const { api, deps } = setup([fail(401, 'INVALID_CREDENTIALS')]);
    await expect(api.post('/auth/login', {}, undefined, { skipAuth: true })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(deps.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('reports cancellation, timeouts and transport failures distinctly', async () => {
    const { AxiosError } = jest.requireActual<typeof import('axios')>('axios');
    const { api } = setup([
      new CanceledError(),
      new AxiosError('timeout', 'ECONNABORTED'),
      new AxiosError('Network Error', 'ERR_NETWORK'),
    ]);
    await expect(api.get('/a')).rejects.toMatchObject({ kind: 'canceled' });
    await expect(api.get('/b')).rejects.toMatchObject({ kind: 'timeout' });
    await expect(api.get('/c')).rejects.toMatchObject({ kind: 'network' });
  });

  it('passes the abort signal through so obsolete requests are cancelled', async () => {
    const { api, requests } = setup([ok(null)]);
    const controller = new AbortController();
    await api.get('/a', undefined, { signal: controller.signal });
    expect(requests[0]!.signal).toBe(controller.signal);
  });

  it('drops empty query parameters', async () => {
    const { api, requests } = setup([ok([])]);
    await api.get('/crm/leads', undefined, { params: { q: '', status: undefined, limit: 25 } });
    expect(requests[0]!.params).toEqual({ limit: 25 });
  });
});

describe('ApiError.isRetryable', () => {
  it.each([
    [{ kind: 'network' as const }, true],
    [{ kind: 'timeout' as const }, true],
    [{ kind: 'http' as const, status: 503 }, true],
    [{ kind: 'http' as const, status: 429 }, true],
    [{ kind: 'http' as const, status: 400 }, false],
    [{ kind: 'http' as const, status: 404 }, false],
    [{ kind: 'canceled' as const }, false],
  ])('%j → %s', (init, expected) => {
    expect(new ApiError({ message: 'x', ...init }).isRetryable).toBe(expected);
  });
});
