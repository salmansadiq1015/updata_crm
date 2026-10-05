'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

export function loginHref(target) {
  return `/login?redirect=${encodeURIComponent(target)}`;
}

export function AuthAwareLink({ href, onClick, children, ...props }) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const resolvedHref = isAuthenticated || isLoading ? href : loginHref(href);

  return (
    <Link
      href={resolvedHref}
      aria-busy={isLoading || undefined}
      onClick={(event) => {
        if (isLoading) event.preventDefault();
        onClick?.(event);
      }}
      {...props}
    >
      {children}
    </Link>
  );
}

export function useLandingAuthGate(target = '/dashboard') {
  const router = useRouter();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  const requireAuth = useCallback((authenticatedAction) => {
    if (isLoading) return false;
    if (!isAuthenticated) {
      router.push(loginHref(target));
      return false;
    }
    authenticatedAction?.();
    return true;
  }, [isAuthenticated, isLoading, router, target]);

  return { isAuthenticated, isLoading, requireAuth };
}
