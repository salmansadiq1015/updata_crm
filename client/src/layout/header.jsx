'use client';

import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar-store';
import { Breadcrumbs } from './breadcrumbs';
import { CommandSearch } from './command-search';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import { LanguageToggle } from './language-toggle';

export function Header() {
  const setMobileOpen = useSidebarStore((s) => s.setMobileOpen);

  return (
    <header className="flex items-center justify-between h-14 border-b border-border bg-card/80 backdrop-blur-md px-4 sticky top-0 z-30 shrink-0">
      {/* Left: hamburger + breadcrumbs */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
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
      </div>
    </header>
  );
}
