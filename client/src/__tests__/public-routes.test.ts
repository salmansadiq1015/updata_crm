import { describe, expect, test } from 'vitest';
import { proxy } from '@/proxy';

function request(path: string, signedIn = false) {
  const url = `http://localhost:3000${path}`;
  return { url, nextUrl: new URL(url), cookies: { get: () => signedIn ? { value: 'test-session' } : undefined } };
}

describe('public company routes', () => {
  test.each(['/about', '/contact', '/support', '/privacy', '/terms', '/security', '/calling-engine', '/workflow-automation'])('%s is available without a session and retains embedding headers', path => {
    const response = proxy(request(path));
    expect(response.status).toBe(200);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(response.headers.get('Content-Security-Policy')).toContain('frame-ancestors');
  });

  test.each(['/dashboard', '/leads', '/admin/settings', '/support/admin', '/security-admin', '/ai-calling', '/calling-engine/admin', '/automation', '/workflow-automation/admin'])('%s remains protected', path => {
    const response = proxy(request(path));
    const destination = new URL(response.headers.get('location')!);
    expect(response.status).toBe(307);
    expect(destination.pathname).toBe('/login');
    expect(destination.searchParams.get('redirect')).toBe(path);
  });

  test('signed-in login redirect and public document access retain their distinct behavior', () => {
    expect(new URL(proxy(request('/login', true)).headers.get('location')!).pathname).toBe('/dashboard');
    expect(proxy(request('/privacy', true)).headers.get('x-middleware-next')).toBe('1');
  });
});
