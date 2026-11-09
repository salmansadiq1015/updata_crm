'use client';

import { lazy, Suspense, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { FullPageSpinner } from '@/shared/components/loading-spinner';
import { SyncStatusBar } from '@/modules/mobile/components/sync-status-bar';
import { BottomNav } from '@/modules/mobile/components/bottom-nav';
import { FloatingTimerWidget } from '@/modules/mobile/components/timer-widget';
import { InstallPrompt } from '@/modules/mobile/components/install-prompt';
import { setupSyncListeners } from '@/modules/mobile/lib/sync-engine';
import { requestPersistentStorage } from '@/modules/mobile/db/cleanup';
import { cacheTokensForOffline } from '@/modules/mobile/lib/auth-offline';
import { getSocket, disconnectSocket } from '@/modules/mobile/lib/websocket-client';

const AiAssistantButton = lazy(() =>
  import('@/modules/ai/components/ai-assistant-button').then((m) => ({ default: m.AiAssistantButton }))
);
const AiAssistantPanel = lazy(() =>
  import('@/modules/ai/components/panel/ai-assistant-panel').then((m) => ({ default: m.AiAssistantPanel }))
);
const LiveVoiceHost = lazy(() =>
  import('@/modules/ai/voice-live/live-voice-host').then((m) => ({ default: m.LiveVoiceHost }))
);

export default function MobileLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, accessToken } = useAuthStore();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectPath = pathname || '/m/tasks';
      router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  useEffect(() => {
    if (!isAuthenticated) return;

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
  if (!isAuthenticated) return <FullPageSpinner />;

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-background">
      <SyncStatusBar />

      <main className="flex-1 overflow-auto pb-20 scrollbar-thin">
        {children}
      </main>

      <FloatingTimerWidget />
      <Suspense fallback={null}>
        <AiAssistantButton className="bottom-24 right-4" />
        <AiAssistantPanel />
        <LiveVoiceHost />
      </Suspense>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
