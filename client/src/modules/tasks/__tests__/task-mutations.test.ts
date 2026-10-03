import { describe, it, expect, vi, beforeEach } from 'vitest';
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
// We also add the envelope-unwrapping response interceptor that the real client has,
// so task-api.ts sees { data, pagination } instead of the raw Axios response object.
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

describe('useTaskWorkspaceMutations', () => {
  describe('createTask', () => {
    it('calls POST /tasks with the provided title', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.post(`${BASE}/tasks`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            success: true,
            data: {
              id: 'new-1',
              title: capturedBody.title,
              status: 'OPEN',
              priority: 'NONE',
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
            },
          });
        })
      );

      const { result } = renderHook(
        () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
        { wrapper: makeWrapper() }
      );

      result.current.createTask.mutate('Test task');

      await waitFor(() => expect(result.current.createTask.isSuccess).toBe(true));

      expect(capturedBody).not.toBeNull();
      expect(capturedBody?.title).toBe('Test task');
    });
  });

  describe('patchTask', () => {
    it('calls the status endpoint for a status-only patch', async () => {
      let statusEndpointCalled = false;

      server.use(
        http.patch(`${BASE}/tasks/1/status`, async () => {
          statusEndpointCalled = true;
          return HttpResponse.json({
            success: true,
            data: {
              id: '1',
              title: 'Task 1',
              status: 'COMPLETED',
              priority: 'NONE',
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
              version: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              completedBy: null,
              cancelledAt: null,
              locked: false,
              lockedBy: null,
              inPool: false,
              poolHelperId: null,
            },
          });
        })
      );

      const { result } = renderHook(
        () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
        { wrapper: makeWrapper() }
      );

      result.current.patchTask.mutate({ id: '1', patch: { status: 'COMPLETED' } });

      await waitFor(() => expect(result.current.patchTask.isSuccess).toBe(true));

      expect(statusEndpointCalled).toBe(true);
    });

    it('sends sortOrder through the status endpoint for board moves', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.patch(`${BASE}/tasks/1/status`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          const status = capturedBody.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'OPEN';
          const sortOrder = typeof capturedBody.sortOrder === 'number' ? capturedBody.sortOrder : 0;
          return HttpResponse.json({
            success: true,
            data: {
              id: '1',
              title: 'Task 1',
              status,
              priority: 'NONE',
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
              sortOrder,
              depth: 0,
              subtaskCount: 0,
              noteCount: 0,
              attachmentCount: 0,
              version: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: null,
              completedBy: null,
              cancelledAt: null,
              locked: false,
              lockedBy: null,
              inPool: false,
              poolHelperId: null,
            },
          });
        })
      );

      const { result } = renderHook(
        () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
        { wrapper: makeWrapper() }
      );

      result.current.patchTask.mutate({
        id: '1',
        patch: { status: 'IN_PROGRESS', sortOrder: -1, expectedVersion: 3 },
      });

      await waitFor(() => expect(result.current.patchTask.isSuccess).toBe(true));

      expect(capturedBody).toMatchObject({
        status: 'IN_PROGRESS',
        sortOrder: -1,
        expectedVersion: 3,
      });
    });

    it('calls PUT /tasks/:id for multi-field patch', async () => {
      let putCalled = false;
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.put(`${BASE}/tasks/1`, async ({ request }) => {
          putCalled = true;
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            success: true,
            data: {
              id: '1',
              title: capturedBody.title ?? 'Updated',
              status: 'OPEN',
              priority: capturedBody.priority ?? 'NONE',
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
              version: 2,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              completedAt: null,
              completedBy: null,
              cancelledAt: null,
              locked: false,
              lockedBy: null,
              inPool: false,
              poolHelperId: null,
            },
          });
        })
      );

      const { result } = renderHook(
        () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
        { wrapper: makeWrapper() }
      );

      result.current.patchTask.mutate({
        id: '1',
        patch: { title: 'Updated title', priority: 'HIGH' },
      });

      await waitFor(() => expect(result.current.patchTask.isSuccess).toBe(true));

      expect(putCalled).toBe(true);
      expect(capturedBody?.title).toBe('Updated title');
      expect(capturedBody?.priority).toBe('HIGH');
    });
  });

  describe('deleteTask', () => {
    it('calls DELETE /tasks/:id', async () => {
      let deleteCalled = false;
      let deletedId: string | null = null;

      server.use(
        http.delete(`${BASE}/tasks/:id`, ({ params }) => {
          deleteCalled = true;
          deletedId = params.id as string;
          return HttpResponse.json({ success: true, data: null });
        })
      );

      const { result } = renderHook(
        () => useTaskWorkspaceMutations(DEFAULT_ACTIVE_PARAMS),
        { wrapper: makeWrapper() }
      );

      result.current.deleteTask.mutate('1');

      await waitFor(() => expect(result.current.deleteTask.isSuccess).toBe(true));

      expect(deleteCalled).toBe(true);
      expect(deletedId).toBe('1');
    });
  });
});
