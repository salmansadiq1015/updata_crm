import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { useTaskWorkspaceMutations } from '../hooks/use-task-workspace';

// Silence toast notifications in tests
vi.mock('react-hot-toast', () => ({
  default: { error: vi.fn(), success: vi.fn() },
  error: vi.fn(),
  success: vi.fn(),
}));

// Bypass the auth interceptor which calls require('@/stores/auth-store') —
// that CJS dynamic require cannot be resolved in Vitest's ESM environment.
// We also add the envelope-unwrapping response interceptor that the real client has.
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta || {}, pagination: body.pagination || null } as unknown as AxiosResponse;
    }
    return response;
  });
  return { default: instance, normalizeApiError: (err: unknown) => err };
});

const BASE = 'http://localhost:9097/api/v1';

const DEFAULT_ACTIVE_PARAMS = {
  sortBy: 'sortOrder' as const,
  sortOrder: 'asc' as const,
  limit: 50,
};

const SOURCE_TASK = {
  id: '1',
  title: 'My Task',
  status: 'IN_PROGRESS',
  priority: 'HIGH',
  description: null,
  listId: null,
  assigneeId: null,
  createdBy: null,
  updatedBy: null,
  parentTaskId: null,
  projectId: null,
  orderId: null,
  startDate: null,
  dueDate: null,
  sortOrder: 0,
  depth: 0,
  subtaskCount: 0,
  noteCount: 0,
  attachmentCount: 0,
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  completedAt: null,
  completedBy: null,
  cancelledAt: null,
  locked: false,
  lockedBy: null,
  inPool: false,
  poolHelperId: null,
};

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
}

describe('duplicateTask', () => {
  it('fetches the source task and creates a copy with OPEN status and same priority', async () => {
    let capturedCreateBody: Record<string, unknown> | null = null;

    // Override GET /tasks/1 to return SOURCE_TASK
    server.use(
      http.get(`${BASE}/tasks/1`, () => {
        return HttpResponse.json({ success: true, data: SOURCE_TASK });
      }),

      http.post(`${BASE}/tasks`, async ({ request }) => {
        capturedCreateBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          data: {
            ...SOURCE_TASK,
            id: 'copy-1',
            title: capturedCreateBody.title,
            status: capturedCreateBody.status,
            priority: capturedCreateBody.priority,
          },
        });
      })
    );

    const { result } = renderHook(
      () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
      { wrapper: makeWrapper() }
    );

    result.current.duplicateTask.mutate('1');

    await waitFor(() => expect(result.current.duplicateTask.isSuccess).toBe(true), {
      timeout: 5000,
    });

    expect(capturedCreateBody).not.toBeNull();
    expect((capturedCreateBody as unknown as Record<string, unknown>).title).toBe('Copy of My Task');
    expect((capturedCreateBody as unknown as Record<string, unknown>).status).toBe('OPEN');
    expect((capturedCreateBody as unknown as Record<string, unknown>).priority).toBe('HIGH');
  });

  it('uses cached task data when available (no extra GET request)', async () => {
    let getCallCount = 0;
    let capturedCreateBody: Record<string, unknown> | null = null;

    server.use(
      http.get(`${BASE}/tasks/1`, () => {
        getCallCount++;
        return HttpResponse.json({ success: true, data: SOURCE_TASK });
      }),
      http.post(`${BASE}/tasks`, async ({ request }) => {
        capturedCreateBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          success: true,
          data: {
            ...SOURCE_TASK,
            id: 'copy-2',
            title: capturedCreateBody.title,
            status: capturedCreateBody.status,
          },
        });
      })
    );

    // Pre-seed the cache
    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    qc.setQueryData(['tasks', 'workspace', 'detail', '1'], SOURCE_TASK);

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(
      () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
      { wrapper }
    );

    result.current.duplicateTask.mutate('1');

    await waitFor(() => expect(result.current.duplicateTask.isSuccess).toBe(true), {
      timeout: 5000,
    });

    // When cached, duplicateTask reads from cache without an extra GET
    expect(getCallCount).toBe(0);
    expect((capturedCreateBody as unknown as Record<string, unknown>).title).toBe('Copy of My Task');
  });
});
