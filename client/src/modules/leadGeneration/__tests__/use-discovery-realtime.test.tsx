import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const socketState = vi.hoisted(() => ({
  handlers: new Map<string, (payload: unknown) => void>(),
  socket: {
    connected: true,
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      socketState.handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      socketState.handlers.delete(event);
    }),
    emit: vi.fn(),
  },
}));

vi.mock('@/lib/socket/client', () => ({
  getSocket: () => socketState.socket,
  onSocketConnect: () => () => {},
}));

import { useDiscoveryRealtime } from '../hooks/use-discovery-realtime';

describe('useDiscoveryRealtime request coalescing', () => {
  beforeEach(() => {
    socketState.handlers.clear();
    vi.clearAllMocks();
  });

  it('does not refetch results or markers for every lightweight provider batch', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const reset = vi.spyOn(queryClient, 'resetQueries');
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const hook = renderHook(() => useDiscoveryRealtime('session-1'), { wrapper });
    await waitFor(() => expect(socketState.handlers.has('discovery:result')).toBe(true));

    act(() => {
      for (let index = 0; index < 100; index += 1) {
        socketState.handlers.get('discovery:result')?.({
          sessionId: 'session-1',
          batch: 10,
          discovered: index * 10,
        });
      }
    });

    expect(invalidate).not.toHaveBeenCalled();

    act(() => {
      socketState.handlers.get('discovery:completed')?.({
        sessionId: 'session-1',
        status: 'COMPLETED',
      });
    });

    await waitFor(() => expect(reset).toHaveBeenCalledTimes(2));
    expect(invalidate).not.toHaveBeenCalled();
    hook.unmount();
  });
});
