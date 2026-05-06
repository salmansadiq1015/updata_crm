import '@testing-library/jest-dom';
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
