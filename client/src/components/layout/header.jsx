'use client';

import { Menu, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSidebarStore } from '@/stores/sidebar-store';
import { useLanguage } from '@/lib/i18n/language-context';
import { Breadcrumbs } from './breadcrumbs';
import { CommandSearch } from './command-search';
import { ThemeToggle } from './theme-toggle';
import { NotificationBell } from './notification-bell';
import { UserMenu } from './user-menu';

export function Header() {
  const toggleCollapsed = useSidebarStore((s) => s.toggleCollapsed);
  const { locale, toggleLanguage } = useLanguage();

  return (
    <header className="flex items-center justify-between h-14 border-b bg-card px-4">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleCollapsed}
          className="md:hidden"
        >
          <Menu className="h-4 w-4" />
        </Button>
        <Breadcrumbs />
      </div>
      <div className="flex items-center gap-2">
        <CommandSearch />
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <Globe className="h-3.5 w-3.5" />
          {locale === 'de' ? 'EN' : 'DE'}
        </Button>
        <NotificationBell />
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
