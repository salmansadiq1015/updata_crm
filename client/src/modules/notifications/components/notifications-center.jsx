'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useNotificationFeed, useNotificationMutations } from '../hooks/use-notification-feed';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  Bell, CheckCheck, Filter, Search, Trash2, RefreshCw,
  CheckSquare, Package, MessageSquare, Settings,
  DollarSign, Wrench, FileText, Users, FolderKanban, CalendarClock,
} from 'lucide-react';

// ── Category config ───────────────────────────────────────────────────────────

const CATEGORIES = ['ALL', 'TASK', 'ORDER', 'CHAT', 'SYSTEM', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'CRM', 'PROJECT', 'SCHEDULING'];

const CAT_ICON = {
  TASK: CheckSquare, ORDER: Package, CHAT: MessageSquare, SYSTEM: Settings,
  FINANCE: DollarSign, MAINTENANCE: Wrench, DOCUMENT: FileText,
  CRM: Users, PROJECT: FolderKanban, SCHEDULING: CalendarClock,
};

const CAT_COLOR = {
  TASK:        'text-emerald-600 bg-emerald-500/10',
  ORDER:       'text-blue-600    bg-blue-500/10',
  CHAT:        'text-violet-600  bg-violet-500/10',
  SYSTEM:      'text-slate-500   bg-slate-500/10',
  FINANCE:     'text-amber-600   bg-amber-500/10',
  MAINTENANCE: 'text-orange-600  bg-orange-500/10',
  DOCUMENT:    'text-sky-600     bg-sky-500/10',
  CRM:         'text-pink-600    bg-pink-500/10',
  PROJECT:     'text-indigo-600  bg-indigo-500/10',
  SCHEDULING:  'text-teal-600    bg-teal-500/10',
};

const CAT_LABEL = {
  ALL:         { de: 'Alle',          en: 'All' },
  TASK:        { de: 'Aufgaben',      en: 'Tasks' },
  ORDER:       { de: 'Aufträge',      en: 'Orders' },
  CHAT:        { de: 'Nachrichten',   en: 'Chat' },
  SYSTEM:      { de: 'System',        en: 'System' },
  FINANCE:     { de: 'Finanzen',      en: 'Finance' },
  MAINTENANCE: { de: 'Wartung',       en: 'Maintenance' },
  DOCUMENT:    { de: 'Dokumente',     en: 'Documents' },
  CRM:         { de: 'CRM',           en: 'CRM' },
  PROJECT:     { de: 'Projekte',      en: 'Projects' },
  SCHEDULING:  { de: 'Planung',       en: 'Scheduling' },
};

const PRIORITY_BADGE = {
  CRITICAL: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  HIGH:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  NORMAL:   null,
  LOW:      null,
};

// ── Time helpers ──────────────────────────────────────────────────────────────

function timeAgo(dateStr, de) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return de ? 'Gerade eben' : 'Just now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(de ? 'de-CH' : 'en-GB', { month: 'short', day: 'numeric' });
}

function dayLabel(dateStr, de) {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return de ? 'Heute' : 'Today';
  if (d.toDateString() === yesterday.toDateString()) return de ? 'Gestern' : 'Yesterday';
  return d.toLocaleDateString(de ? 'de-CH' : 'en-GB', { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDay(notifications) {
  const groups = {};
  for (const n of notifications) {
    const key = n.sentAt ? new Date(n.sentAt).toDateString() : 'Unknown';
    if (!groups[key]) groups[key] = { date: n.sentAt, items: [] };
    groups[key].items.push(n);
  }
  return Object.values(groups);
}

// ── Notification item ─────────────────────────────────────────────────────────

function NotificationRow({ notification: n, de, onMarkRead, onDismiss }) {
  const router = useRouter();
  const Icon = CAT_ICON[n.category] || Bell;
  const colorCls = CAT_COLOR[n.category] || 'text-slate-500 bg-slate-500/10';
  const priorityBadge = PRIORITY_BADGE[n.priority];

  const handleClick = () => {
    if (!n.isRead) onMarkRead(n._id || n.id);
    if (n.deepLink) router.push(n.deepLink);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group flex items-start gap-3 px-5 py-4 cursor-pointer transition-colors',
        'hover:bg-muted/40',
        !n.isRead && 'bg-primary/[0.025]',
      )}
    >
      {/* Category icon */}
      <div className={cn('h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5', colorCls)}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className={cn('text-sm leading-snug', !n.isRead ? 'font-semibold' : 'font-medium text-foreground/80')}>
                {n.title}
              </p>
              {priorityBadge && (
                <span className={cn('text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full', priorityBadge)}>
                  {n.priority === 'CRITICAL' ? (de ? 'Kritisch' : 'Critical') : (de ? 'Hoch' : 'High')}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
            {n.deepLink && (
              <p className="text-[11px] text-primary mt-1 truncate">{n.deepLink}</p>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0 ml-2">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(n.sentAt, de)}</span>
            <Button
              size="icon" variant="ghost"
              className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              onClick={(e) => { e.stopPropagation(); onDismiss(n._id || n.id); }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Unread dot */}
      {!n.isRead && <span className="mt-2.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ de, filtered }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-primary/10" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-7 w-7 text-primary" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">
          {filtered
            ? (de ? 'Keine Treffer' : 'No matches')
            : (de ? 'Keine Benachrichtigungen' : 'No notifications')}
        </p>
        <p className="text-xs text-muted-foreground">
          {filtered
            ? (de ? 'Versuchen Sie andere Filter.' : 'Try different filters.')
            : (de ? 'Sie sind auf dem neuesten Stand.' : "You're all caught up.")}
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function NotificationsCenter() {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const [category, setCategory] = useState('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');

  const filters = {};
  if (category !== 'ALL') filters.category = category;
  if (showUnreadOnly) filters.isRead = false;

  const { data: rawNotifications = [], isFetching, refetch } = useNotificationFeed(filters);
  const { markRead, markAllRead, dismiss } = useNotificationMutations();

  // Client-side search filter
  const notifications = useMemo(() => {
    if (!search.trim()) return rawNotifications;
    const q = search.toLowerCase();
    return rawNotifications.filter(
      (n) => n.title?.toLowerCase().includes(q) || n.body?.toLowerCase().includes(q),
    );
  }, [rawNotifications, search]);

  const unreadCount = rawNotifications.filter((n) => !n.isRead).length;
  const groups = useMemo(() => groupByDay(notifications), [notifications]);

  return (
    <div className="flex flex-col gap-5 max-w-3xl mx-auto w-full">
      <PageHeader
        icon={Bell}
        title={de ? 'Benachrichtigungen' : 'Notifications'}
        description={de
          ? 'Alle Systemmeldungen und Aktivitäten'
          : 'All system alerts and activity'}
        actions={
          <div className="flex items-center gap-2">
            <Button
              size="icon" variant="ghost" className="h-8 w-8"
              onClick={() => refetch()} disabled={isFetching}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            </Button>
            {unreadCount > 0 && (
              <Button
                size="sm" variant="outline" className="h-8 gap-1.5"
                onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                {de ? 'Alle gelesen' : 'Mark all read'}
                <span className="ml-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                  {unreadCount}
                </span>
              </Button>
            )}
          </div>
        }
      />

      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={de ? 'Benachrichtigungen durchsuchen...' : 'Search notifications...'}
            className="pl-9 h-8 text-sm"
          />
        </div>

        {/* Category tabs */}
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors',
                category === cat
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {de ? CAT_LABEL[cat].de : CAT_LABEL[cat].en}
            </button>
          ))}
        </div>

        {/* Unread toggle */}
        <button
          onClick={() => setShowUnreadOnly((v) => !v)}
          className={cn(
            'self-start flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
            showUnreadOnly ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {de ? 'Nur ungelesen' : 'Unread only'}
        </button>
      </div>

      {/* Notification list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isFetching && notifications.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : notifications.length === 0 ? (
          <EmptyState de={de} filtered={!!search || showUnreadOnly || category !== 'ALL'} />
        ) : (
          <div>
            {groups.map((group, gi) => (
              <div key={gi}>
                {/* Day separator */}
                <div className="flex items-center gap-3 px-5 py-2.5 bg-muted/30 border-b">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {dayLabel(group.date, de)}
                  </span>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground">
                    {group.items.filter((n) => !n.isRead).length > 0 && (
                      <span className="text-primary font-medium">
                        {group.items.filter((n) => !n.isRead).length} {de ? 'ungelesen' : 'unread'}
                      </span>
                    )}
                  </span>
                </div>
                {/* Items */}
                <div className="divide-y">
                  {group.items.map((n) => (
                    <NotificationRow
                      key={n._id || n.id}
                      notification={n}
                      de={de}
                      onMarkRead={(id) => markRead.mutate(id)}
                      onDismiss={(id) => dismiss.mutate(id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      {notifications.length > 0 && (
        <p className="text-center text-xs text-muted-foreground pb-2">
          {notifications.length} {de ? 'Benachrichtigungen' : 'notifications'}
          {unreadCount > 0 && ` · ${unreadCount} ${de ? 'ungelesen' : 'unread'}`}
        </p>
      )}
    </div>
  );
}
