'use client';

import { lazy, Suspense, useSyncExternalStore } from 'react';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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

const subscribeToHydration = () => () => {};

/**
 * @param {object} props
 * @param {boolean} [props.showAiAssistant] - false on the assistant's own page,
 *   where the shortcut would only reopen what is already on screen.
 */
export function Header({ showAiAssistant = true }) {
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const hydrated = useSyncExternalStore(subscribeToHydration, () => true, () => false);
  const collapsed = hydrated && isCollapsed;
  const { t } = useLanguage();
  const toggleLabel = t(collapsed ? 'experience.navigation.expand' : 'sidebar.collapse');

  return (
    <header data-slot="app-header" className="flex items-center justify-between gap-3 h-14 border-b border-border bg-card/95 backdrop-blur-md ps-3 sm:ps-4 sticky top-0 z-30 shrink-0">
      {/* Navigation controls + breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label={t('experience.navigation.open')}
          className="workspace-nav-toggle md:hidden h-9 w-9 shrink-0 text-foreground"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <TooltipProvider delayDuration={250}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleCollapsed}
                aria-label={toggleLabel}
                aria-expanded={!collapsed}
                aria-controls="desktop-sidebar"
                className="workspace-nav-toggle hidden md:inline-flex h-9 w-9 shrink-0 text-muted-foreground"
              >
                {collapsed ? <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" /> : <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8}>{toggleLabel}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span aria-hidden="true" className="hidden md:block h-5 w-px shrink-0 bg-border/80" />
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
              <div className="ms-2 me-3 h-10 w-10 rounded-full shrink-0 bg-gradient-to-br from-brand-500 via-brand-500 to-cyan-500" />
            }
          >
            <AiAssistantButton variant="header" className="ms-2" />
          </Suspense>
        )}
      </div>
    </header>
  );
}
