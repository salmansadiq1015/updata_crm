import { NextResponse } from 'next/server';

const publicPaths = ['/login', '/reset-password', '/forgot-password', '/activate'];

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Landing page is always public
  if (pathname === '/') {
    return NextResponse.next();
  }

  // Skip public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    // If user has refresh token and is on login, redirect to dashboard
    const refreshToken = request.cookies.get('mb_refresh_token');
    if (refreshToken && pathname === '/login') {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  }

  // Protected paths — check for refresh token cookie
  const refreshToken = request.cookies.get('mb_refresh_token');
  if (!refreshToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
