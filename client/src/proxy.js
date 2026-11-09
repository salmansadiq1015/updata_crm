import { NextResponse } from 'next/server';
import { PUBLIC_PAGE_PATHS } from '@/lib/seo/site-config';

const publicPaths = ['/login', '/reset-password', '/forgot-password', '/activate'];
// Only these document routes are public. Prefix matches must not expose a
// private route such as /security-admin or a future nested management screen.
const publicDocumentPaths = new Set(PUBLIC_PAGE_PATHS);

const EMBED_PARENT_ORIGINS = [
  'https://appnity.ch',
  'https://www.appnity.ch',
];

function parseAllowedAncestors(raw) {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function buildFrameAncestorsCsp(ancestors) {
  if (ancestors.includes('*')) return 'frame-ancestors *';
  return `frame-ancestors 'self' ${ancestors.join(' ')}`;
}

/** Allow iframe embedding on appnity.ch; strip X-Frame-Options so CSP wins. */
function applyEmbedHeaders(response, pathname) {
  if (pathname.startsWith('/widget/')) {
    response.headers.set('Content-Security-Policy', 'frame-ancestors *');
  } else {
    const envAncestors = parseAllowedAncestors(process.env.ALLOWED_FRAME_ANCESTORS || '');
    const ancestors = [...new Set([...EMBED_PARENT_ORIGINS, ...envAncestors])];
    response.headers.set('Content-Security-Policy', buildFrameAncestorsCsp(ancestors));
  }
  response.headers.delete('X-Frame-Options');
  // Let crawlers see noindex on auth/private responses. Blocking these routes
  // in robots.txt would stop them from observing this directive.
  if (!publicDocumentPaths.has(pathname)) response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

function nextWithEmbedHeaders(request) {
  return applyEmbedHeaders(NextResponse.next(), request.nextUrl.pathname);
}

export function proxy(request) {
  const { pathname } = request.nextUrl;

  if (publicDocumentPaths.has(pathname)) {
    return nextWithEmbedHeaders(request);
  }

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    const refreshToken = request.cookies.get('mb_refresh_token');
    if (refreshToken && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return nextWithEmbedHeaders(request);
  }

  const refreshToken = request.cookies.get('mb_refresh_token');
  if (!refreshToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return applyEmbedHeaders(NextResponse.redirect(loginUrl), pathname);
  }

  return nextWithEmbedHeaders(request);
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
