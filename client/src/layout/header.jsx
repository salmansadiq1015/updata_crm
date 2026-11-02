'use client';

import { lazy, Suspense } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar-store';
import { Breadcrumbs } from './breadcrumbs';
import { CommandSearch } from './command-search';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import { LanguageToggle } from './language-toggle';
import { useLanguage } from '@/lib/i18n/language-context';

const AiAssistantButton = lazy(() =>
  import('@/modules/ai/components/ai-assistant-button').then((m) => ({ default: m.AiAssistantButton }))
);

/**
 * @param {object} props
 * @param {boolean} [props.showAiAssistant] - false on the assistant's own page,
 *   where the shortcut would only reopen what is already on screen.
 */
export function Header({ showAiAssistant = true }) {
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const { t } = useLanguage();

  return (
    <header data-slot="app-header" className="flex items-center justify-between h-14 border-b border-border bg-card/95 backdrop-blur-md ps-3 sm:ps-6 sticky top-0 z-30 shrink-0">
      {/* Left: hamburger + breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label={t('experience.navigation.open')}
          className="md:hidden h-8 w-8 shrink-0 text-foreground"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <div className="min-w-0 truncate">
          <Breadcrumbs />
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1 shrink-0">
        <CommandSearch />
        <LanguageToggle />
        <NotificationBell />
        <ThemeToggle />
        {showAiAssistant && (
          <Suspense
            fallback={
              <div className="ml-2 h-14 w-14 shrink-0 bg-gradient-to-br from-brand-500 via-brand-500 to-cyan-500" />
            }
          >
            <AiAssistantButton variant="header" className="ml-2" />
          </Suspense>
        )}
      </div>
    </header>
  );
}
