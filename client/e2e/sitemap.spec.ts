import { expect, test } from '@playwright/test';

const origin = 'https://updata-crm.vercel.app';
const paths = ['/', '/calling-engine', '/workflow-automation', '/about', '/contact', '/support', '/security', '/privacy', '/terms'];

test('XML sitemap matches indexable public pages and their canonical URLs', async ({ page, request }) => {
  await page.goto('/');
  const response = await request.get('/sitemap.xml', { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('xml');
  const xml = await response.text();
  expect(Buffer.byteLength(xml)).toBeLessThan(50 * 1024 * 1024);
  const parsed = await page.evaluate(xml => {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    return { errors: doc.querySelectorAll('parsererror').length, namespace: doc.documentElement.namespaceURI, urls: [...doc.getElementsByTagName('loc')].map(node => node.textContent), lastmod: doc.getElementsByTagName('lastmod').length, priority: doc.getElementsByTagName('priority').length, changefreq: doc.getElementsByTagName('changefreq').length };
  }, xml);
  expect(parsed.errors).toBe(0);
  expect(parsed.namespace).toBe('http://www.sitemaps.org/schemas/sitemap/0.9');
  expect(parsed.urls).toEqual(paths.map(path => path === '/' ? origin : `${origin}${path}`));
  expect(parsed.lastmod + parsed.priority + parsed.changefreq).toBe(0);
  for (const path of paths) {
    const documentResponse = await request.get(path, { maxRedirects: 0, headers: { 'user-agent': 'Googlebot' } });
    expect(documentResponse.status(), path).toBe(200);
    expect(documentResponse.headers()['x-robots-tag'] || '').not.toContain('noindex');
    const metadata = await page.evaluate(html => {
      const document = new DOMParser().parseFromString(html, 'text/html');
      return { canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'), robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') };
    }, await documentResponse.text());
    expect(metadata.canonical, path).toBe(path === '/' ? origin : `${origin}${path}`);
    expect(metadata.robots || '').not.toContain('noindex');
  }
  const robots = await request.get('/robots.txt', { maxRedirects: 0 });
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${origin}/sitemap.xml`);
});

test('auth and workspace URLs remain excluded from indexing without opening private routes', async ({ request }) => {
  const login = await request.get('/login', { maxRedirects: 0 });
  expect(login.status()).toBe(200);
  expect(login.headers()['x-robots-tag']).toContain('noindex');
  for (const path of ['/dashboard', '/security-admin']) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain('/login?redirect=');
    expect(response.headers()['x-robots-tag']).toContain('noindex');
  }
});
