import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import type { AxiosResponse } from 'axios';
import { server } from './mocks/server';
import { useFolderMutations } from '../hooks/use-folder-mutations';

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

const NOW = new Date().toISOString();

function makeFolder(id: string, name: string) {
  return {
    id,
    name,
    color: null,
    icon: null,
    sortOrder: 0,
    ownerId: null,
    lists: [],
    createdAt: NOW,
    updatedAt: NOW,
  };
}

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

describe('useFolderMutations', () => {
  describe('createFolder', () => {
    it('calls POST /task-folders with name payload', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.post(`${BASE}/task-folders`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            success: true,
            data: makeFolder('folder-new', capturedBody.name as string),
          });
        })
      );

      const { result } = renderHook(() => useFolderMutations(), {
        wrapper: makeWrapper(),
      });

      result.current.createFolder.mutate({ name: 'New Folder' });

      await waitFor(() => expect(result.current.createFolder.isSuccess).toBe(true));

      expect(capturedBody).not.toBeNull();
      expect(capturedBody?.name).toBe('New Folder');
    });

    it('can create a folder with optional color and icon', async () => {
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.post(`${BASE}/task-folders`, async ({ request }) => {
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            success: true,
            data: {
              ...makeFolder('folder-colored', capturedBody.name as string),
              color: capturedBody.color,
              icon: capturedBody.icon,
            },
          });
        })
      );

      const { result } = renderHook(() => useFolderMutations(), {
        wrapper: makeWrapper(),
      });

      result.current.createFolder.mutate({ name: 'Colored Folder', color: '#ff0000', icon: 'star' });

      await waitFor(() => expect(result.current.createFolder.isSuccess).toBe(true));

      expect(capturedBody?.color).toBe('#ff0000');
      expect(capturedBody?.icon).toBe('star');
    });
  });

  describe('deleteFolder', () => {
    it('calls DELETE /task-folders/:id', async () => {
      let deletedId: string | null = null;

      server.use(
        http.delete(`${BASE}/task-folders/:id`, ({ params }) => {
          deletedId = params.id as string;
          return HttpResponse.json({ success: true, data: { deleted: true } });
        })
      );

      const { result } = renderHook(() => useFolderMutations(), {
        wrapper: makeWrapper(),
      });

      result.current.deleteFolder.mutate('1');

      await waitFor(() => expect(result.current.deleteFolder.isSuccess).toBe(true));

      expect(deletedId).toBe('1');
    });
  });

  describe('updateFolder', () => {
    it('calls PUT /task-folders/:id with the patch payload', async () => {
      let updatedId: string | null = null;
      let capturedBody: Record<string, unknown> | null = null;

      server.use(
        http.put(`${BASE}/task-folders/:id`, async ({ params, request }) => {
          updatedId = params.id as string;
          capturedBody = (await request.json()) as Record<string, unknown>;
          return HttpResponse.json({
            success: true,
            data: makeFolder(updatedId!, capturedBody.name as string),
          });
        })
      );

      const { result } = renderHook(() => useFolderMutations(), {
        wrapper: makeWrapper(),
      });

      result.current.updateFolder.mutate({ id: '1', patch: { name: 'Renamed' } });

      await waitFor(() => expect(result.current.updateFolder.isSuccess).toBe(true));

      expect(updatedId).toBe('1');
      expect(capturedBody?.name).toBe('Renamed');
    });
  });
});
