import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { BASE } from './mocks/handlers';
import { makeSessionDTO, ok, okPage } from './mocks/data';

vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: BASE });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta || {}, pagination: body.pagination || null } as unknown as AxiosResponse;
    }
    return response;
  });
  return { default: instance, normalizeApiError: (err: unknown) => err };
});

// Silence toasts.
vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  showLoading: vi.fn(),
  dismissToast: vi.fn(),
  showPromise: vi.fn(),
}));

import {
  useBusinessTypes,
  useDiscoveryResults,
  useDiscoveryMarkers,
  useDiscoverySession,
  useDiscoverySessions,
  useCreateDiscovery,
  useLoadMoreDiscovery,
  useImport,
  useFlattenedResults,
  shouldRetryDiscoveryQuery,
} from '../hooks/use-discovery';

const D = `${BASE}/business-discovery`;

beforeAll(() => server.listen({ onUnhandledRequest: 'bypass' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

describe('use-discovery hooks', () => {
  it('does not automatically retry rate-limit or permanent discovery failures', () => {
    expect(shouldRetryDiscoveryQuery(0, { statusCode: 429 })).toBe(false);
    expect(shouldRetryDiscoveryQuery(0, { response: { status: 429 } })).toBe(false);
    expect(shouldRetryDiscoveryQuery(0, { statusCode: 403 })).toBe(false);
    expect(shouldRetryDiscoveryQuery(0, { isCanceled: true })).toBe(false);
    expect(shouldRetryDiscoveryQuery(0, new Error('temporary'))).toBe(true);
    expect(shouldRetryDiscoveryQuery(1, new Error('temporary'))).toBe(false);
  });

  it('useBusinessTypes loads the catalog', async () => {
    const { result } = renderHook(() => useBusinessTypes(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
  });

  it('useDiscoverySessions returns an infinite cursor page', async () => {
    const { result } = renderHook(() => useDiscoverySessions({ limit: 50 }), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0].data).toHaveLength(2);
    expect(result.current.data?.pages[0].pagination).toHaveProperty('hasNext');
  });

  it('useDiscoverySession loads a session detail', async () => {
    const { result } = renderHook(() => useDiscoverySession('sess-42'), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.id).toBe('sess-42');
    expect(result.current.data?.status).toBe('RUNNING');
  });

  it('useDiscoveryResults returns results and flattens them', async () => {
    const { result } = renderHook(
      () => {
        const query = useDiscoveryResults('sess-1');
        const flat = useFlattenedResults(query.data);
        return { query, flat };
      },
      { wrapper: makeWrapper() },
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.flat).toHaveLength(2);
    expect(result.current.flat[0].crmStatus).toBe('NEW');
  });

  it('does not fetch another result page until pagination requests it', async () => {
    let requests = 0;
    server.use(
      http.get(`${D}/sessions/:id/results`, ({ request }) => {
        requests += 1;
        const cursor = new URL(request.url).searchParams.get('cursor');
        return HttpResponse.json(okPage(
          [],
          cursor
            ? { hasNext: false, nextCursor: null, limit: 300 }
            : { hasNext: true, nextCursor: 'results-cursor-2', limit: 300 },
        ));
      }),
    );

    const { result, rerender } = renderHook(() => useDiscoveryResults('sess-1'), {
      wrapper: makeWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const initialRequests = requests;

    rerender();
    expect(requests).toBe(initialRequests);

    await act(async () => {
      await result.current.fetchNextPage({ cancelRefetch: false });
    });
    expect(requests).toBeGreaterThan(initialRequests);
  });

  it('loads one marker cursor and waits for an explicit next-page request', async () => {
    const requestedCursors: Array<string | null> = [];
    server.use(
      http.get(`${D}/sessions/:id/markers`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        requestedCursors.push(cursor);
        if (!cursor) {
          return HttpResponse.json(okPage(
            [{ id: 'marker-1', lat: 47.37, lng: 8.54, status: 'NEW' }],
            { hasNext: true, nextCursor: 'cursor-2', limit: 300 },
          ));
        }
        return HttpResponse.json({ success: false, error: { message: 'Too many requests' } }, { status: 429 });
      }),
    );

    const { result, rerender } = renderHook(
      () => useDiscoveryMarkers('sess-1', { enabled: true }),
      { wrapper: makeWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(requestedCursors.filter((cursor) => cursor === null).length).toBeGreaterThan(0);
    expect(requestedCursors.filter((cursor) => cursor === 'cursor-2')).toHaveLength(0);

    const requestsAfterFirstPage = requestedCursors.length;
    rerender();
    expect(requestedCursors).toHaveLength(requestsAfterFirstPage);

    await act(async () => {
      await result.current.fetchNextPage({ cancelRefetch: false });
    });
    expect(requestedCursors.length).toBeGreaterThan(requestsAfterFirstPage);
    expect(requestedCursors.slice(requestsAfterFirstPage).every((cursor) => cursor === 'cursor-2')).toBe(true);
  });

  it('useCreateDiscovery returns a sessionId on success', async () => {
    const { result } = renderHook(() => useCreateDiscovery(), { wrapper: makeWrapper() });
    result.current.mutate({
      location: { name: 'Zürich' },
      area: { type: 'radius', radiusMeters: 1000 },
      businessTypes: ['restaurant'],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ sessionId: 'sess-new' });
  });

  it('useLoadMoreDiscovery queues another batch for the same session', async () => {
    let requests = 0;
    server.use(
      http.post(`${D}/sessions/:id/load-more`, ({ params }) => {
        requests += 1;
        return HttpResponse.json(ok(makeSessionDTO({
          id: params.id,
          status: 'QUEUED',
          config: { initialResultLimit: 600 },
          coverage: { state: 'RUNNING', reasonCodes: ['PROVIDER_CATALOG_NOT_GUARANTEED'] },
        })), { status: 202 });
      }),
    );

    const { result } = renderHook(() => useLoadMoreDiscovery(), { wrapper: makeWrapper() });
    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      response = await result.current.mutateAsync('sess-1');
    });

    expect(requests).toBeGreaterThan(0);
    expect(response?.id).toBe('sess-1');
    expect(response?.config.initialResultLimit).toBe(600);
  });

  it('useImport resolves a sync summary', async () => {
    const { result } = renderHook(() => useImport('sess-1'), { wrapper: makeWrapper() });
    result.current.mutate({ mode: 'new', selection: { kind: 'ALL_NEW' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.kind).toBe('sync');
  });

  it('useImport surfaces an async job id', async () => {
    server.use(
      http.post(`${D}/sessions/:id/import`, () =>
        HttpResponse.json(ok({ jobId: 'job-xyz' }), { status: 202 }),
      ),
    );
    const { result } = renderHook(() => useImport('sess-1'), { wrapper: makeWrapper() });
    result.current.mutate({ mode: 'new', selection: { kind: 'ALL_NEW' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({ kind: 'async', jobId: 'job-xyz', summary: null });
  });
});
