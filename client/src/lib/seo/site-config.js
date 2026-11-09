// Explicit public document inventory shared by discovery and the auth proxy.
// Private workspace routes, query strings, and section anchors never belong here.
export const PUBLIC_PAGE_PATHS = Object.freeze([
  '/',
  '/calling-engine',
  '/about',
  '/contact',
  '/support',
  '/security',
  '/privacy',
  '/terms',
]);

export function getSiteOrigin() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL || 'https://updata-crm.vercel.app';
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTPS origin without a path, credentials, query, or fragment');
  }
  return url.origin;
}

export function getCanonicalUrl(path = '/') {
  if (!PUBLIC_PAGE_PATHS.includes(path)) throw new Error(`Unknown public document: ${path}`);
  // Next.js emits the root canonical without a trailing slash. Match it in XML.
  return path === '/' ? getSiteOrigin() : new URL(path, `${getSiteOrigin()}/`).href;
}
