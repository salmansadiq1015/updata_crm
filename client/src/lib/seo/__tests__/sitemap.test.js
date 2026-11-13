import { afterEach, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sitemap from '@/app/sitemap';
import robots from '@/app/robots';
import { proxy } from '@/proxy';
import { getCanonicalUrl, getSiteOrigin, PUBLIC_PAGE_PATHS } from '../site-config';

afterEach(() => vi.unstubAllEnvs());

test('sitemap entries are canonical public documents, not private routes or invented revision dates', () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', '');
  const entries = sitemap();
  expect(entries).toHaveLength(9);
  expect(entries.map(entry => new URL(entry.url).pathname)).toContain('/workflow-automation');
  expect(new Set(entries.map(entry => entry.url)).size).toBe(entries.length);
  expect(entries.map(entry => new URL(entry.url).pathname)).toEqual(PUBLIC_PAGE_PATHS);
  for (const entry of entries) {
    expect(new URL(entry.url).origin).toBe('https://updata-crm.vercel.app');
    expect(entry).not.toHaveProperty('lastModified');
    expect(entry).not.toHaveProperty('priority');
    expect(entry).not.toHaveProperty('changeFrequency');
    expect(proxy(new NextRequest(entry.url)).headers.get('location')).toBeNull();
    expect(proxy(new NextRequest(entry.url)).headers.get('x-robots-tag')).toBeNull();
  }
});

test('origin changes update sitemap, canonical URLs and robots consistently', () => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.example.test/');
  expect(getSiteOrigin()).toBe('https://www.example.test');
  expect(getCanonicalUrl('/about')).toBe('https://www.example.test/about');
  expect(sitemap().every(entry => new URL(entry.url).origin === 'https://www.example.test')).toBe(true);
  expect(robots().sitemap).toBe('https://www.example.test/sitemap.xml');
});

test.each(['http://example.test', 'https://user:password@example.test', 'https://example.test/path', 'https://example.test/?tracking=1', 'https://example.test/#section'])('rejects invalid canonical origin %s', origin => {
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', origin);
  expect(() => getSiteOrigin()).toThrow();
});

test('canonical helpers reject private paths and query or hash duplicates', () => {
  for (const path of ['/dashboard', '/login', '/about?utm_source=test', '/#pricing']) expect(() => getCanonicalUrl(path)).toThrow();
});

test.each(['/dashboard', '/tasks', '/security-admin'])('private route %s remains protected and is marked noindex', path => {
  const response = proxy(new NextRequest(`https://updata-crm.vercel.app${path}`));
  expect(response.status).toBe(307);
  expect(response.headers.get('location')).toContain('/login?redirect=');
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
});

test('login responses and authenticated workspace responses carry noindex', () => {
  expect(proxy(new NextRequest('https://updata-crm.vercel.app/login')).headers.get('x-robots-tag')).toBe('noindex, nofollow');
  const response = proxy(new NextRequest('https://updata-crm.vercel.app/tasks', { headers: { cookie: 'mb_refresh_token=fixture' } }));
  expect(response.headers.get('location')).toBeNull();
  expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
});
