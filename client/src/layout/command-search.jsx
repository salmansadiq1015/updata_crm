'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { useTheme } from 'next-themes';
import { Search, User, Plus, Sun, Moon, ArrowUpRight, CornerDownLeft, ArrowUp, ArrowDown, X, Loader2, Contact, Sparkles } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useLanguage } from '@/lib/i18n/language-context';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useUiConfig, applySidebarConfig } from '@/shared/hooks/use-ui-config';
import { useSidebarVisibility, filterSidebarMenus } from '@/modules/settings/hooks/use-sidebar-visibility';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { navSectionDefs } from './navigation';
import { getSearchPages, rankSearchItems } from './command-search-utils';

const rowClass = 'group mx-2 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground outline-none transition-colors data-[selected=true]:bg-primary/10 data-[selected=true]:text-foreground';
const iconClass = 'flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-muted-foreground group-data-[selected=true]:border-primary/20 group-data-[selected=true]:bg-primary/10 group-data-[selected=true]:text-primary';

function useRecordSearch(kind, query, enabled) {
  return useQuery({
    queryKey: ['command-search', kind, query],
    queryFn: async ({ signal }) => {
      const response = await apiClient.get(kind === 'users' ? ENDPOINTS.USERS.LIST : ENDPOINTS.LEADS.LIST, {
        params: { [kind === 'users' ? 'search' : 'q']: query, limit: 5 }, signal,
      });
      const items = Array.isArray(response.data) ? response.data : [];
      return items.filter(item => item._id || item.id);
    },
    enabled: enabled && query.length >= 2,
    staleTime: 30_000,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [shortcut, setShortcut] = useState('Ctrl K');

  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K');
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !event.isComposing && !event.repeat) {
        event.preventDefault();
        setOpen(value => !value);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);
  const { t } = useLanguage();

  return <>
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)} aria-label={t('common.searchTitle')} aria-haspopup="dialog" aria-expanded={open}
      className="flex size-9 items-center justify-center gap-2 rounded-xl border border-transparent text-sm text-muted-foreground transition-colors hover:bg-muted md:h-10 md:w-auto md:min-w-[220px] md:justify-start md:border-border/70 md:bg-background/70 md:px-3">
      <Search className="size-4" />
      <span className="hidden flex-1 text-start md:inline">{t('common.search')}</span>
      <kbd className="hidden h-5 items-center rounded border border-border/70 bg-muted/60 px-1.5 font-mono text-[10px] md:inline-flex">{shortcut}</kbd>
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent hideClose dismissableOnOutsideClick className="gap-0 overflow-hidden rounded-2xl border-border/70 bg-card p-0 shadow-[0_32px_100px_-20px_rgba(0,0,0,0.6)] sm:max-w-[640px]"
        onCloseAutoFocus={event => { event.preventDefault(); triggerRef.current?.focus(); }}>
        {open && <SearchContent onClose={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  </>;
}

// Mount a fresh session on every open: query, selection and pending requests reset together.
function SearchContent({ onClose }) {
  const [query, setQuery] = useState('');
  const [selection, setSelection] = useState('');
  const inputRef = useRef(null);
  const { t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const { hasPermission } = usePermissions();
  const router = useRouter();
  const uiConfig = useUiConfig();
  const { data: visibility } = useSidebarVisibility();
  const searchSections = navSectionDefs.map(section => ({ ...section, items: applySidebarConfig(filterSidebarMenus(section.items, visibility?.hiddenMenus), uiConfig) }));
  const term = query.trim().replace(/\s+/g, ' ');
  const debounced = useDebounce(term, 250);
  const canSearchUsers = hasPermission('users:read');
  const canSearchLeads = hasPermission('lead:read');
  const userSearch = useRecordSearch('users', debounced, canSearchUsers && term === debounced);
  const leadSearch = useRecordSearch('leads', debounced, canSearchLeads && term === debounced);
  const users = canSearchUsers && term.length >= 2 && term === debounced ? userSearch.data || [] : [];
  const leads = canSearchLeads && term.length >= 2 && term === debounced ? leadSearch.data || [] : [];
  const loading = term.length >= 2 && ((term !== debounced && (canSearchUsers || canSearchLeads)) || userSearch.isFetching || leadSearch.isFetching);
  const failures = term === debounced && term.length >= 2 && ((canSearchUsers && userSearch.isError) || (canSearchLeads && leadSearch.isError));
  const navigate = href => { onClose(); router.push(href); };
  const pages = rankSearchItems([
    ...getSearchPages(searchSections, hasPermission, t),
    { href: '/profile', label: t('dashboard.myProfile'), icon: User, keywords: ['profile', 'account'], section: t('command.pages') },
  ], term);
  const visiblePages = term ? pages : pages.slice(0, 6);
  const actions = rankSearchItems([
    { id: 'theme', label: t('common.toggleTheme'), icon: resolvedTheme === 'dark' ? Sun : Moon, keywords: ['theme', 'appearance', 'dark', 'light'], run: () => { setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'); onClose(); } },
    ...(hasPermission('users:write') ? [{ id: 'create-user', label: t('users.newUser'), icon: Plus, keywords: ['create user', 'add employee', t('users.newUserCommand')], run: () => navigate('/settings/users?action=create') }] : []),
  ], term);
  const count = visiblePages.length + users.length + leads.length + actions.length;
  const item = (id, label, subtitle, Icon, run) => <Command.Item key={id} value={id} onSelect={run} className={rowClass}>
    <span className={iconClass}><Icon className="size-4" /></span>
    <span className="min-w-0 flex-1"><span className="block truncate font-medium text-foreground/90">{label}</span>{subtitle && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{subtitle}</span>}</span>
    <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
  </Command.Item>;

  return <>
    <div className="flex items-center justify-between px-5 pb-3 pt-4">
      <div className="flex items-center gap-2"><Sparkles className="size-3.5 text-primary" /><DialogTitle className="text-xs font-semibold tracking-wide">{t('command.workspaceSearch', 'Workspace search')}</DialogTitle></div>
      <DialogClose aria-label={t('common.close')} className="flex size-8 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><X className="size-4" /></DialogClose>
    </div>
    <DialogDescription className="sr-only">{t('command.searchDescription', 'Find pages, leads and people, or run an action.')}</DialogDescription>
    <Command shouldFilter={false} loop value={selection} onValueChange={setSelection} label={t('common.searchTitle')} className="flex min-h-0 flex-col [&_[cmdk-group-heading]]:px-5 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-4 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground">
      <div className="mx-4 mb-3 flex items-center gap-3 rounded-xl border border-primary/25 bg-background/80 px-3.5 ring-4 ring-primary/[0.03] focus-within:border-primary/50">
        {loading ? <Loader2 aria-hidden="true" className="size-5 shrink-0 animate-spin text-primary" /> : <Search aria-hidden="true" className="size-5 shrink-0 text-primary" />}
        <Command.Input ref={inputRef} autoFocus value={query} maxLength={100} onValueChange={value => { setQuery(value); setSelection(''); }} aria-label={t('common.searchTitle')} placeholder={t('command.placeholder')} className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70" />
        {query && <button type="button" onClick={() => { setQuery(''); setSelection(''); inputRef.current?.focus(); }} aria-label={t('command.clearSearch', 'Clear search')} className="rounded-md p-1 text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"><X className="size-3.5" /></button>}
      </div>
      <Command.List aria-busy={loading} className="max-h-[min(420px,55dvh)] min-h-24 overflow-y-auto overscroll-contain border-t border-border/60 pb-3 scrollbar-thin">
        {visiblePages.length > 0 && <Command.Group heading={t('command.pages')}>{visiblePages.map(page => item(page.href, page.label, page.section, page.icon, () => navigate(page.href)))}</Command.Group>}
        {leads.length > 0 && <Command.Group heading={t('sidebar.leads')}>{leads.map(lead => item(`lead:${lead._id || lead.id}`, lead.name || lead.email || lead.leadNumber, [lead.email, lead.phone].filter(Boolean).join(' · '), Contact, () => navigate(`/leads?detail=${encodeURIComponent(lead._id || lead.id)}`)))}</Command.Group>}
        {users.length > 0 && <Command.Group heading={t('sidebar.users')}>{users.map(user => item(`user:${user._id || user.id}`, [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email, user.email, User, () => navigate(`/settings/users/${encodeURIComponent(user._id || user.id)}`)))}</Command.Group>}
        {actions.length > 0 && <Command.Group heading={t('common.actions')}>{actions.map(action => item(action.id, action.label, null, action.icon, action.run))}</Command.Group>}
        {!count && !loading && !failures && <div className="flex flex-col items-center px-6 py-10 text-center"><span className="mb-3 rounded-2xl border border-border/60 bg-muted/40 p-3"><Search className="size-5 text-muted-foreground" /></span><p className="text-sm font-medium">{t('command.noResults', 'No results for "{query}"', { query: term })}</p><p className="mt-1.5 text-xs text-muted-foreground">{t('command.searchHint', 'Try a page name, person, email or phone number.')}</p></div>}
        {loading && <p role="status" className="px-5 py-4 text-xs text-muted-foreground">{t('command.searching', 'Searching records…')}</p>}
        {failures && <div role="status" className="mx-4 mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2.5 text-xs"><p>{t('command.searchError', 'Some records could not be loaded. Please try again.')}</p><button type="button" className="mt-2 font-medium text-primary underline underline-offset-4" onClick={() => { if (userSearch.isError && canSearchUsers) userSearch.refetch(); if (leadSearch.isError && canSearchLeads) leadSearch.refetch(); }}>{t('common.retry', 'Try again')}</button></div>}
      </Command.List>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 bg-muted/30 px-5 py-3 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-3"><span className="hidden items-center gap-1.5 sm:flex"><ArrowUp className="size-3" /><ArrowDown className="size-3" />{t('command.navigate', 'Navigate')}</span><span className="flex items-center gap-1.5"><CornerDownLeft className="size-3" />{t('command.openResult', 'Open')}</span></div>
        <span className="flex items-center gap-1.5"><kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">Esc</kbd>{t('common.close')}</span>
      </div>
    </Command>
  </>;
}
