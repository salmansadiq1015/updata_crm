'use client';

// Side-effect import: hardens Node.prototype.removeChild/insertBefore against
// NotFoundError crashes from external DOM mutation (auto-translation, extensions).
// Must run before React's first client commit, so it lives at the top of this
// top-level client boundary.
import '@/lib/dom/install-dom-guards';

import { useEffect, useRef } from 'react';
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
  // stale chunks during dev, which leaves route shells blank before React boots.
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
    .catch(() => {});

  if (!('caches' in window)) return;

  window.caches
    .keys()
    .then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.includes('serwist') || key.includes('workbox') || key.startsWith('mobile-'))
          .map((key) => window.caches.delete(key))
      )
    )
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

export function AppProviders({ children }) {
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
      <LanguageProvider>
        <QueryProvider>
          <AuthInitializer>
            <SocketProvider>
              <ToastProvider>
                <TooltipProvider>
                  {children}
                </TooltipProvider>
              </ToastProvider>
            </SocketProvider>
          </AuthInitializer>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
