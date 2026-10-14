import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import { server } from './mocks/server';

// The axios client's request interceptor calls require('@/stores/auth-store')
// via a CJS require which cannot resolve the @ alias in Vitest jsdom.
// Provide a minimal stub so requests reach MSW handlers.
vi.mock('@/stores/auth-store', () => ({
  useAuthStore: {
    getState: () => ({ accessToken: null, user: null, setTokens: vi.fn(), setAuth: vi.fn(), clearAuth: vi.fn() }),
  },
}));

// jsdom's localStorage is broken in this environment (setItem is not a
// function), which crashed every test that sets the locale before rendering.
// Install a minimal in-memory Storage stub when that happens.
if (typeof window !== 'undefined' && typeof window.localStorage?.setItem !== 'function') {
  const store = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: (key: string, value: string) => { store.set(key, String(value)); },
      removeItem: (key: string) => { store.delete(key); },
      clear: () => { store.clear(); },
      key: (index: number) => [...store.keys()][index] ?? null,
      get length() { return store.size; },
    },
  });
}

// crypto.randomUUID polyfill for older jsdom environments
if (typeof globalThis.crypto?.randomUUID === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => `${Math.random().toString(36).slice(2)}-test` },
    writable: true,
  });
}

beforeAll(() => server.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
