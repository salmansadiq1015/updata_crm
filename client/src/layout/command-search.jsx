'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useTheme } from 'next-themes';
import {
  Search, LayoutDashboard, Users, Shield, ScrollText,
  User, Plus, Sun, Moon, ArrowRight, Video,
} from 'lucide-react';
import { userService } from '@/modules/users/services/user-service';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [userResults, setUserResults] = useState({ query: '', items: [] });
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { t } = useLanguage();
  const debounceRef = useRef(null);
  const navItems = [
    { label: t('sidebar.dashboard', 'Dashboard'), href: '/dashboard', icon: LayoutDashboard },
    { label: t('sidebar.employmentManagement', 'Mitarbeiterverwaltung'), href: '/settings/users', icon: Users },
    { label: t('sidebar.roles', 'Rollen'), href: '/settings/roles', icon: Shield },
    { label: t('deploy.tabs.meetings', 'Meetings'), href: '/scheduling/meetings', icon: Video },
    { label: t('sidebar.audit', 'Audit Log'), href: '/settings/audit', icon: ScrollText },
    { label: t('dashboard.myProfile', 'Mein Profil'), href: '/profile', icon: User },
  ];

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const trimmedQuery = query.trim();
  const users = userResults.query === trimmedQuery ? userResults.items : [];

  useEffect(() => {
    if (!trimmedQuery) return undefined;
    let cancelled = false;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await userService.getUsers({ search: trimmedQuery, limit: 5 });
        if (!cancelled) setUserResults({ query: trimmedQuery, items: res?.data || [] });
      } catch {
        if (!cancelled) setUserResults({ query: trimmedQuery, items: [] });
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(debounceRef.current);
    };
  }, [trimmedQuery]);

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery('');
      setUserResults({ query: '', items: [] });
      if (debounceRef.current) clearTimeout(debounceRef.current);
    }
  };

  const navigate = (href) => {
    handleOpenChange(false);
    router.push(href);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="hidden md:flex items-center gap-2 rounded-xl border border-border/50 bg-muted/30 px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted/60 hover:border-border transition-all duration-200 min-w-[200px] backdrop-blur-sm"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{t('common.search', 'Suchen...')}</span>
        <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border/60 bg-background/80 px-1.5 text-[0.65rem] font-mono text-muted-foreground">
          Ctrl+K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="p-0 gap-0 max-w-lg overflow-hidden rounded-2xl shadow-theme-lg" hideClose>
          <DialogTitle className="sr-only">{t('common.searchTitle', 'Suche')}</DialogTitle>
          <Command className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
            <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={t('command.placeholder', 'Suchen oder Aktion ausführen...')}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <Command.List className="max-h-[300px] overflow-y-auto py-2 scrollbar-thin">
              <Command.Empty className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('command.noResults', 'Keine Ergebnisse für "{query}"', { query })}
              </Command.Empty>

              <Command.Group heading={t('command.pages', 'Seiten')}>
                {navItems.map((item) => (
                  <Command.Item
                    key={item.href}
                    value={item.label}
                    onSelect={() => navigate(item.href)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="flex-1 font-medium">{item.label}</span>
                    <ArrowRight className="h-3 w-3 opacity-0 data-[selected=true]:opacity-100" />
                  </Command.Item>
                ))}
              </Command.Group>

              {users.length > 0 && (
                <Command.Group heading={t('sidebar.users', 'Benutzer')}>
                  {users.map((u) => (
                    <Command.Item
                      key={u._id}
                      value={`${u.firstName} ${u.lastName} ${u.email}`}
                      onSelect={() => navigate(`/settings/users/${u._id}`)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                    >
                      <User className="h-4 w-4 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{u.firstName} {u.lastName}</span>
                        <span className="text-xs text-muted-foreground ml-2">{u.email}</span>
                      </div>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group heading={t('common.actions', 'Aktionen')}>
                <Command.Item
                  value={`${t('common.toggleTheme', 'Design wechseln')} Theme toggle`}
                  onSelect={() => { setTheme(theme === 'dark' ? 'light' : 'dark'); setOpen(false); }}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                >
                  {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  <span className="flex-1 font-medium">{t('common.toggleTheme', 'Design wechseln')}</span>
                </Command.Item>
                <Command.Item
                  value={t('users.newUserCommand', 'Neuer Benutzer erstellen')}
                  onSelect={() => navigate('/settings/users?action=create')}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors data-[selected=true]:bg-primary/8 data-[selected=true]:text-foreground text-muted-foreground hover:text-foreground"
                >
                  <Plus className="h-4 w-4" />
                  <span className="flex-1 font-medium">{t('users.newUser', 'Neuer Benutzer')}</span>
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
