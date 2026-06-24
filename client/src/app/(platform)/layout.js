'use client';

import { useEffect, lazy, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar, MobileSidebar } from '@/layout/sidebar';
import { Header } from '@/layout/header';
import { RightDrawer } from '@/layout/right-drawer';
import { FullPageSpinner } from '@/shared/components/loading-spinner';
import { useKeyboardShortcuts } from '@/shared/hooks/use-keyboard-shortcuts';
import { cn } from '@/lib/utils';

const AiAssistantButton = lazy(() =>
  import('@/modules/ai/components/ai-assistant-button').then((m) => ({ default: m.AiAssistantButton }))
);
const AiAssistantPanel = lazy(() =>
  import('@/modules/ai/components/panel/ai-assistant-panel').then((m) => ({ default: m.AiAssistantPanel }))
);

export default function PlatformLayout({ children }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const pathname = usePathname();
  const isChatPage = pathname?.includes('/chat');
  const isAiPage   = pathname === '/ai' || pathname?.startsWith('/ai/');

  useKeyboardShortcuts();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const redirectPath = pathname || '/dashboard';
      router.replace(`/login?redirect=${encodeURIComponent(redirectPath)}`);
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  if (isLoading) return <FullPageSpinner />;
  if (!isAuthenticated) return <FullPageSpinner />;

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* Desktop sidebar — hidden on AI chat page */}
      {!isAiPage && (
        <div className="hidden md:block shrink-0">
          <Sidebar />
        </div>
      )}

      {/* Mobile sidebar — hidden on AI chat page */}
      {!isAiPage && <MobileSidebar />}

      {/* Main content area */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden min-w-0',
        'transition-all duration-300'
      )}>
        {/* Header — hidden on AI chat page */}
        {!isAiPage && <Header />}

        <main className={cn(
          'flex-1',
          isAiPage
            ? 'overflow-hidden p-0'
            : isChatPage
            ? 'overflow-hidden p-0 flex flex-col bg-muted/30'
            : 'overflow-auto p-4 sm:p-6 scrollbar-thin bg-muted/30'
        )}>
          {children}
        </main>
      </div>

      {/* Right drawer */}
      {!isAiPage && <RightDrawer />}

      {/* AI Assistant floating button — hidden when already on AI page */}
      {!isAiPage && (
        <Suspense fallback={null}>
          <AiAssistantButton />
          <AiAssistantPanel />
        </Suspense>
      )}
    </div>
  );
}
