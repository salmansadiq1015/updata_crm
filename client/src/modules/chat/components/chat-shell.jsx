'use client';

import { cloneElement, useState } from 'react';
import { PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useLanguage } from '@/lib/i18n/language-context';

export function ChatShell({ sidebar, children }) {
  const { t } = useLanguage();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const renderedSidebar = cloneElement(sidebar, { onNavigate: () => setMobileSidebarOpen(false) });

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-background">
      <div className="hidden w-[360px] shrink-0 flex-col border-r border-border/60 bg-card/90 md:flex">
        {renderedSidebar}
      </div>

      <Button
        variant="secondary"
        size="icon"
        className="absolute left-3 top-3 z-30 h-9 w-9 rounded-2xl shadow-sm md:hidden"
        onClick={() => setMobileSidebarOpen(true)}
        aria-label={t('chat.openConversations', 'Open conversations')}
      >
        <PanelLeft className="h-4 w-4" />
      </Button>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[88vw] max-w-sm gap-0 p-0">
          <SheetTitle className="sr-only">{t('chat.conversations', 'Conversations')}</SheetTitle>
          {cloneElement(sidebar, { key: 'mobile-sidebar', onNavigate: () => setMobileSidebarOpen(false) })}
        </SheetContent>
      </Sheet>

      <div className="min-w-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}
