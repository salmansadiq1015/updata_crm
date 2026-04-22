'use client';

import { useEffect } from 'react';
import { ThemeProvider } from './theme-provider';
import { QueryProvider } from './query-provider';
import { SocketProvider } from './socket-provider';
import { ToastProvider } from './toast-provider';
import { LanguageProvider } from '@/lib/i18n/language-context';
import { useAuthStore } from '@/stores/auth-store';
import { authService } from '@/modules/auth/services/auth-service';
import Cookies from 'js-cookie';

function AuthInitializer({ children }) {
  const { isLoading, setLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    const initAuth = async () => {
      const refreshToken = Cookies.get('mb_refresh_token');
      if (!refreshToken) {
        setLoading(false);
        return;
      }
      try {
        await authService.refreshToken();
      } catch {
        // Token invalid — stay unauthenticated
      } finally {
        setLoading(false);
      }
    };
    initAuth();
  }, [setLoading]);

  return children;
}

export function AppProviders({ children }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <QueryProvider>
          <AuthInitializer>
            <SocketProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </SocketProvider>
          </AuthInitializer>
        </QueryProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
