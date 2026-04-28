'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { FullPageSpinner } from '@/shared/components/loading-spinner';
import { SyncStatusBar } from '@/modules/mobile/components/sync-status-bar';
import { BottomNav } from '@/modules/mobile/components/bottom-nav';
import { FloatingTimerWidget } from '@/modules/mobile/components/timer-widget';
import { InstallPrompt } from '@/modules/mobile/components/install-prompt';
import { setupSyncListeners } from '@/modules/mobile/lib/sync-engine';
import { registerServiceWorker } from '@/modules/mobile/lib/sw-registration';
import { requestPersistentStorage } from '@/modules/mobile/db/cleanup';
import { cacheTokensForOffline } from '@/modules/mobile/lib/auth-offline';
import { getSocket, disconnectSocket } from '@/modules/mobile/lib/websocket-client';

export default function MobileLayout({ children }) {
  const router = useRouter();
  const { isAuthenticated, isLoading, accessToken } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerServiceWorker();
    requestPersistentStorage();
    const cleanup = setupSyncListeners();
    return cleanup;
  }, [isAuthenticated]);

  useEffect(() => {
    if (accessToken) {
      cacheTokensForOffline(accessToken);
      getSocket(accessToken);
    }
    return () => {
      disconnectSocket();
    };
  }, [accessToken]);

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return null;

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      <SyncStatusBar />

      <main className="flex-1 overflow-auto pb-20 scrollbar-thin">
        {children}
      </main>

      <FloatingTimerWidget />
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
