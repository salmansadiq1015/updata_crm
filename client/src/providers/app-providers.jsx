'use client';

// Side-effect import: hardens Node.prototype.removeChild/insertBefore against
// NotFoundError crashes from external DOM mutation (auto-translation, extensions).
// Must run before React's first client commit, so it lives at the top of this
// top-level client boundary.
import '@/lib/dom/install-dom-guards';

import { useEffect, useRef } from 'react';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { ThemeProvider } from './theme-provider';
import { QueryProvider } from './query-provider';
import { SocketProvider } from './socket-provider';
import { ToastProvider } from './toast-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { useAuthStore } from '@/stores/auth-store';
import { authService } from '@/modules/auth/services/auth-service';
import { initSentry } from '@/lib/sentry';
import { getStoredRefreshToken } from '@/modules/auth/services/session-refresh-service';

let developmentWorkerCleanupStarted = false;

function cleanupDevelopmentServiceWorkers() {
  if (
    developmentWorkerCleanupStarted ||
    process.env.NODE_ENV !== 'development' ||
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return;
  }

  developmentWorkerCleanupStarted = true;

  // A production Serwist worker can remain registered on localhost and serve
  // stale chunks during dev (e.g. ChunkLoadError on lazily-built vendor chunks
  // like prosemirror-view), which leaves route shells blank before React boots.
  // `unregister()` alone does NOT release a tab the worker is already
  // controlling, so a tab booted under the stale worker keeps getting its
  // precached, now-missing chunk URLs. If we detect an active controller, force
  // a single reload to escape the worker's scope and fetch fresh chunks. The
  // sessionStorage flag guards against a reload loop.
  const RELOAD_FLAG = 'dev-sw-cleanup-reloaded';
  const hadController = Boolean(navigator.serviceWorker.controller);

  const clearCaches = () => {
    if (!('caches' in window)) return Promise.resolve();
    return window.caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.includes('serwist') || key.includes('workbox') || key.startsWith('mobile-'))
            .map((key) => window.caches.delete(key))
        )
      )
      .catch(() => {});
  };

  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .then(() => clearCaches())
    .then(() => {
      if (hadController && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, '1');
        window.location.reload();
      }
    })
    .catch(() => {});
}

function AuthInitializer({ children }) {
  const { setLoading } = useAuthStore();
  const initStarted = useRef(false);

  useEffect(() => {
    if (initStarted.current) return;
    initStarted.current = true;

    const initAuth = async () => {
      const refreshToken = getStoredRefreshToken();
      if (!refreshToken) {
        setLoading(false);
        return;
      }
      try {
        await authService.refreshToken();
      } catch {
        // Token invalid; stay unauthenticated.
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, [setLoading]);

  return children;
}

export function AppProviders({ children, initialLocale }) {
  const sentryInitialized = useRef(false);
  useEffect(() => {
    cleanupDevelopmentServiceWorkers();

    if (!sentryInitialized.current) {
      sentryInitialized.current = true;
      initSentry();
    }
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider initialLocale={initialLocale}>
        <QueryProvider>
          <AuthInitializer>
            <SocketProvider>
              <ToastProvider>
                <TooltipProvider>
                  {/* App-wide URL query-state adapter so `useDrawer`'s `?detail=`
                      works on every route, not only ones with a per-route adapter.
                      nuqs wraps its own `useSearchParams` (NavigationSpy) in Suspense,
                      so this does not opt pages into dynamic rendering, and the
                      per-route NuqsAdapters remain harmless when nested under this. */}
                  <NuqsAdapter>{children}</NuqsAdapter>
                </TooltipProvider>
              </ToastProvider>
            </SocketProvider>
          </AuthInitializer>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
