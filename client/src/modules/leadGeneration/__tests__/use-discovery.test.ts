import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { BASE } from './mocks/handlers';
import { ok } from './mocks/data';

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
  useDiscoverySession,
  useDiscoverySessions,
  useCreateDiscovery,
  useImport,
  useFlattenedResults,
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
