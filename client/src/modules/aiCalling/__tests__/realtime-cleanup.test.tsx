// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const handlers = new Set<(s: unknown) => void>();
vi.mock('@/lib/socket/client', () => ({
  onSocketConnect: (fn: (s: unknown) => void) => { handlers.add(fn); fn(fakeSocket); return () => handlers.delete(fn); },
}));

const listeners = new Map<string, Set<unknown>>();
const fakeSocket = {
  on: (event: string, fn: unknown) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
  off: (event: string, fn: unknown) => { listeners.get(event)?.delete(fn); },
};

const { useAiCallingRealtime } = await import('../hooks/use-ai-calling-realtime');

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

describe('useAiCallingRealtime', () => {
  it('removes its socket listeners on unmount (no leak per drawer open)', () => {
    for (let i = 0; i < 5; i += 1) {
      const { unmount } = renderHook(() => useAiCallingRealtime('c1'), { wrapper });
      expect(listeners.get('ai-calling:call')?.size).toBe(1);
      unmount();
    }
    for (const event of ['ai-calling:summary', 'ai-calling:call', 'ai-calling:answer']) {
      expect(listeners.get(event)?.size ?? 0).toBe(0);
    }
    expect(handlers.size).toBe(0);
  });
});
