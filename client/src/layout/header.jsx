'use client';

import { Menu, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useLanguage } from '@/lib/i18n/language-context';
import { Breadcrumbs } from './breadcrumbs';
import { CommandSearch } from './command-search';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';

export function Header() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const { locale, toggleLanguage } = useLanguage();

  return (
    <header className="flex items-center justify-between h-12 border-b border-border/40 bg-card/80 backdrop-blur-md px-4 sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="md:hidden h-8 w-8"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-1.5">
        <CommandSearch />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground h-8"
        >
          <Globe className="h-3.5 w-3.5" />
          {locale === 'de' ? 'EN' : 'DE'}
        </Button>
        <NotificationBell />
        <ThemeToggle />
      </div>
    </header>
  );
}
