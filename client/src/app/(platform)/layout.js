'use client';

import { useEffect, lazy, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Sidebar, MobileSidebar } from '@/layout/sidebar';
import { Header } from '@/layout/header';
import { RightDrawer } from '@/layout/right-drawer';
import { FullPageSpinner } from '@/shared/components/loading-spinner';
import { useKeyboardShortcuts } from '@/shared/hooks/use-keyboard-shortcuts';
import { useAiStore } from '@/modules/ai/store/ai-store';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

// Incoming AI-call transfer offers (context card + live audio join) wherever the user is in the CRM.
const IncomingTransferHost = lazy(() =>
  import('@/modules/aiCalling/ui/incoming-transfer-host').then((m) => ({ default: m.IncomingTransferHost }))
);

// "A caller wants to speak to a person" (incoming calls answered by the AI) on any page.
const InboundHandoffAlertHost = lazy(() =>
  import('@/modules/inboundCalls/ui/handoff-alert-host').then((m) => ({ default: m.InboundHandoffAlertHost }))
);

const AiAssistantPanel = lazy(() =>
  import('@/modules/ai/components/panel/ai-assistant-panel').then((m) => ({ default: m.AiAssistantPanel }))
);

export default function PlatformLayout({ children }) {
  const router = useRouter();
  const { t } = useLanguage();
  const { isAuthenticated, isLoading } = useAuthStore();
  const pathname = usePathname();
  const isChatPage = pathname?.includes('/chat');
  // The assistant has its own page, but it is a page like any other: the
  // sidebar and the header stay. What it does not get is the floating panel,
  // which would be a second assistant on top of the one being used.
  const isAiPage   = pathname === '/ai' || pathname?.startsWith('/ai/');
  const isAiPanelOpen = useAiStore((s) => s.isPanelOpen);
  // Dock (reserve space) for the non-modal AI panel on wide screens; on smaller
  // screens it floats over the right of the content.
  const isDocked = isAiPanelOpen && !isAiPage;

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
    <div className="updata-workspace flex h-dvh overflow-hidden bg-background">
      <a href="#workspace-content" className="skip-link">{t('experience.skip')}</a>
      <div className="hidden md:block shrink-0">
        <Sidebar />
      </div>

      <MobileSidebar />

      {/* Main content area */}
      <div className={cn(
        'flex flex-1 flex-col overflow-hidden min-w-0',
        'transition-all duration-300',
        isDocked && 'xl:pe-96'
      )}>
        {/* On the assistant's own page the header keeps everything but its
            shortcut to the assistant, which would only reopen where you are. */}
        <Header showAiAssistant={!isAiPage} />

        <main id="workspace-content" tabIndex={-1} className={cn(
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
      <RightDrawer />

      <Suspense fallback={null}>
        <IncomingTransferHost />
        <InboundHandoffAlertHost />
      </Suspense>

      {/* AI Assistant panel — button lives in the header; not on the AI page,
          where the full chat is already the whole screen. */}
      {!isAiPage && (
        <Suspense fallback={null}>
          <AiAssistantPanel />
        </Suspense>
      )}

    </div>
  );
}
