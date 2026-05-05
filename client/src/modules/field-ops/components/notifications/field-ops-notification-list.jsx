'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useFieldOpsNotifications } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useFieldOpsNotificationMutations } from '@/modules/field-ops/hooks/use-field-ops-notification-mutations';
import { useNotificationStore } from '@/stores/notification-store';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import {
  Bell, MessageSquare, ClipboardList, AlertTriangle,
  Clock, FileCheck, CheckCheck, ChevronDown, Loader2,
  Settings, RefreshCw, Filter, Inbox, BellOff,
} from 'lucide-react';

/* ─── i18n ─────────────────────────────────────────────────── */

const t = (de, en, de_) => de_ ? de : en;

/* ─── relative time ─────────────────────────────────────────── */

function relativeTime(date, de) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return de ? 'Gerade eben' : 'Just now';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return de ? `${m} Min.` : `${m}m ago`;
  }
  if (diff < 86400) {
    const h = Math.floor(diff / 3600);
    return de ? `${h} Std.` : `${h}h ago`;
  }
  if (diff < 604800) {
    const days = Math.floor(diff / 86400);
    return de ? `${days} Tag${days > 1 ? 'en' : ''}` : `${days}d ago`;
  }
  return d.toLocaleDateString();
}

/* ─── date group label ──────────────────────────────────────── */

function dayLabel(date, de) {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400_000);
  if (diffDays === 0) return de ? 'Heute' : 'Today';
  if (diffDays === 1) return de ? 'Gestern' : 'Yesterday';
  if (diffDays < 7) return de ? 'Diese Woche' : 'This week';
  if (diffDays < 30) return de ? 'Diesen Monat' : 'This month';
  return de ? 'Älter' : 'Older';
}

/* ─── type meta ─────────────────────────────────────────────── */

const TYPE_META = {
  NEW_ASSIGNMENT:       { Icon: ClipboardList, color: 'bg-blue-500/15 text-blue-400',     ring: 'ring-blue-500/20',   label: 'Assignment' },
  ORDER_CHANGED:        { Icon: ClipboardList, color: 'bg-amber-500/15 text-amber-400',   ring: 'ring-amber-500/20', label: 'Order' },
  ORDER_CANCELLED:      { Icon: AlertTriangle, color: 'bg-red-500/15 text-red-400',       ring: 'ring-red-500/20',   label: 'Order' },
  CHAT_MESSAGE:         { Icon: MessageSquare, color: 'bg-violet-500/15 text-violet-400', ring: 'ring-violet-500/20', label: 'Chat' },
  DAILY_REMINDER:       { Icon: Clock,         color: 'bg-slate-500/15 text-slate-400',   ring: 'ring-slate-500/20', label: 'Reminder' },
  ESCALATION:           { Icon: AlertTriangle, color: 'bg-red-500/15 text-red-400',       ring: 'ring-red-500/20',   label: 'Escalation' },
  report_submitted:     { Icon: FileCheck,     color: 'bg-emerald-500/15 text-emerald-400', ring: 'ring-emerald-500/20', label: 'Report' },
  order_status_changed: { Icon: ClipboardList, color: 'bg-amber-500/15 text-amber-400',   ring: 'ring-amber-500/20', label: 'Order' },
  new_assignment:       { Icon: ClipboardList, color: 'bg-blue-500/15 text-blue-400',     ring: 'ring-blue-500/20',   label: 'Assignment' },
  assignment_updated:   { Icon: ClipboardList, color: 'bg-blue-500/15 text-blue-400',     ring: 'ring-blue-500/20',   label: 'Assignment' },
  assignment_cancelled: { Icon: AlertTriangle, color: 'bg-red-500/15 text-red-400',       ring: 'ring-red-500/20',   label: 'Assignment' },
  chat_message:         { Icon: MessageSquare, color: 'bg-violet-500/15 text-violet-400', ring: 'ring-violet-500/20', label: 'Chat' },
  ORDER:                { Icon: ClipboardList, color: 'bg-amber-500/15 text-amber-400',   ring: 'ring-amber-500/20', label: 'Order' },
  TASK:                 { Icon: FileCheck,     color: 'bg-emerald-500/15 text-emerald-400', ring: 'ring-emerald-500/20', label: 'Task' },
  SYSTEM:               { Icon: Bell,          color: 'bg-slate-500/15 text-slate-400',   ring: 'ring-slate-500/20', label: 'System' },
};

function getTypeMeta(n) {
  const key = n.notification_type || n.notificationType || n.category || '';
  return TYPE_META[key] || { Icon: Bell, color: 'bg-slate-500/15 text-slate-400', ring: 'ring-slate-500/20', label: 'Notification' };
}

/* ─── stat card ─────────────────────────────────────────────── */

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={cn(
      'relative flex flex-col gap-1 rounded-xl border bg-card px-5 py-4 overflow-hidden',
      accent && 'border-primary/20',
    )}>
      {accent && <span className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-primary/0 via-primary to-primary/0" />}
      <span className={cn('text-2xl font-bold tabular-nums', accent ? 'text-primary' : 'text-foreground')}>
        {value ?? '—'}
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {sub && <span className="text-[10px] text-muted-foreground/60">{sub}</span>}
    </div>
  );
}

/* ─── skeleton ──────────────────────────────────────────────── */

function SkeletonItem() {
  return (
    <div className="flex items-start gap-4 px-5 py-4">
      <div className="h-10 w-10 rounded-xl bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-2 py-0.5">
        <div className="flex items-center gap-2">
          <div className="h-3.5 w-52 bg-muted animate-pulse rounded-full" />
          <div className="h-3 w-10 bg-muted animate-pulse rounded-full ml-auto" />
        </div>
        <div className="h-3 w-72 bg-muted animate-pulse rounded-full" />
        <div className="flex gap-2 pt-0.5">
          <div className="h-4 w-16 bg-muted/60 animate-pulse rounded" />
        </div>
      </div>
    </div>
  );
}

/* ─── empty state ───────────────────────────────────────────── */

function EmptyState({ filter, de }) {
  const isUnread = filter === 'unread';
  const Icon = isUnread ? BellOff : Inbox;
  const msg = isUnread
    ? (de ? 'Keine ungelesenen Benachrichtigungen' : 'All caught up!')
    : (de ? 'Noch keine Benachrichtigungen' : 'No notifications yet');
  const sub = isUnread
    ? (de ? 'Alles wurde gelesen.' : 'You have read all your notifications.')
    : (de ? 'Benachrichtigungen erscheinen hier, sobald Aktivität stattfindet.' : 'Notifications will appear here when there\'s activity.');

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-6">
      <div className="relative flex items-center justify-center">
        <span className="absolute h-24 w-24 rounded-full bg-primary/8 animate-ping opacity-20" style={{ animationDuration: '2.5s' }} />
        <span className="absolute h-16 w-16 rounded-full bg-primary/10" />
        <span className="relative h-12 w-12 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center shadow-lg shadow-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </span>
      </div>
      <div className="text-center space-y-1.5 max-w-xs">
        <p className="text-sm font-semibold text-foreground">{msg}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{sub}</p>
      </div>
    </div>
  );
}

/* ─── group divider ─────────────────────────────────────────── */

function GroupDivider({ label }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2 bg-muted/30 border-b border-t first:border-t-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>
    </div>
  );
}

/* ─── notification item ─────────────────────────────────────── */

function NotificationItem({ notification, onMarkRead, de }) {
  const isRead = notification.isRead ?? notification.is_read ?? false;
  const timestamp = notification.sentAt || notification.received_at || notification.receivedAt || notification.createdAt;
  const { Icon, color, ring, label } = getTypeMeta(notification);

  return (
    <div
      className={cn(
        'group relative flex items-start gap-4 px-5 py-4 transition-all duration-150 border-b last:border-0',
        'hover:bg-muted/30',
        !isRead && 'bg-primary/[0.03]',
      )}
    >
      {/* Unread stripe */}
      {!isRead && (
        <span className="absolute left-0 top-4 bottom-4 w-[3px] rounded-r-full bg-primary" />
      )}

      {/* Icon */}
      <div className={cn(
        'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ring-1',
        color, ring,
      )}>
        <Icon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-3">
          <p className={cn(
            'text-sm leading-snug',
            !isRead ? 'font-semibold text-foreground' : 'font-normal text-foreground/75',
          )}>
            {notification.title}
          </p>
          <span className="text-[10px] text-muted-foreground/50 shrink-0 mt-0.5 tabular-nums whitespace-nowrap">
            {relativeTime(timestamp, de)}
          </span>
        </div>
        {notification.body && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mt-0.5">{notification.body}</p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ring-1', color, ring)}>
            {label}
          </span>
          {!isRead && (
            <span className="text-[10px] text-primary/60 font-medium">
              {de ? 'Neu' : 'New'}
            </span>
          )}
        </div>
      </div>

      {/* Mark read */}
      {!isRead && (
        <button
          onClick={() => onMarkRead(notification._id || notification.id)}
          className="opacity-0 group-hover:opacity-100 shrink-0 mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-all duration-150"
          title={de ? 'Als gelesen markieren' : 'Mark as read'}
        >
          <CheckCheck className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ─── filter tab ─────────────────────────────────────────────── */

function FilterTab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
      {active && (
        <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t-full bg-primary" />
      )}
    </button>
  );
}

/* ─── main ───────────────────────────────────────────────────── */

export function FieldOpsNotificationList() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filter, setFilter] = useState('all');
  const sentinelRef = useRef(null);

  const {
    data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage, isError, refetch, isRefetching,
  } = useFieldOpsNotifications();

  const { markRead, markAllRead } = useFieldOpsNotificationMutations();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  // Flatten pages
  const allItems = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page?.items ?? []),
    [data],
  );

  const localUnread = useMemo(
    () => allItems.filter((n) => !(n.isRead ?? n.is_read)).length,
    [allItems],
  );

  const todayCount = useMemo(() => {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return allItems.filter((n) => {
      const ts = n.sentAt || n.receivedAt || n.createdAt;
      return ts && new Date(ts) >= start;
    }).length;
  }, [allItems]);

  // Group by day label
  const grouped = useMemo(() => {
    const list = filter === 'unread'
      ? allItems.filter((n) => !(n.isRead ?? n.is_read))
      : allItems;

    const groups = [];
    let lastLabel = null;
    for (const n of list) {
      const ts = n.sentAt || n.receivedAt || n.createdAt;
      const label = ts ? dayLabel(ts, de) : '';
      if (label !== lastLabel) {
        groups.push({ type: 'divider', label });
        lastLabel = label;
      }
      groups.push({ type: 'item', data: n });
    }
    return groups;
  }, [allItems, filter, de]);

  // IntersectionObserver for auto-load
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) fetchNextPage(); },
      { threshold: 0.1 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const badgeCount = unreadCount || localUnread;
  const hasItems = allItems.length > 0;

  return (
    <div className="space-y-6 pb-8">

      {/* ── Header ── */}
      <div className="px-6 pt-6">
        <PageHeader
          title={de ? 'Benachrichtigungen' : 'Notifications'}
          description={de
            ? 'Echtzeit-Updates zu Aufträgen, Berichten und Aktivitäten'
            : 'Real-time updates on orders, reports, and activity'}
          count={badgeCount > 0 ? badgeCount : undefined}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="gap-1.5 text-muted-foreground"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
            {de ? 'Aktualisieren' : 'Refresh'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending || badgeCount === 0}
            className="gap-1.5"
          >
            {markAllRead.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <CheckCheck className="h-3.5 w-3.5" />}
            {de ? 'Alle gelesen' : 'Mark all read'}
          </Button>
        </PageHeader>
      </div>

      {/* ── Stats row ── */}
      {!isLoading && (
        <div className="px-6 grid grid-cols-3 gap-3">
          <StatCard
            label={de ? 'Gesamt' : 'Total'}
            value={allItems.length}
            sub={de ? 'Benachrichtigungen' : 'notifications'}
          />
          <StatCard
            label={de ? 'Ungelesen' : 'Unread'}
            value={badgeCount}
            sub={de ? 'ausstehend' : 'pending'}
            accent={badgeCount > 0}
          />
          <StatCard
            label={de ? 'Heute' : 'Today'}
            value={todayCount}
            sub={de ? 'neue Aktivitäten' : 'new activity'}
          />
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="px-6">
        <div className="flex border-b border-border/60">
          <FilterTab active={filter === 'all'} onClick={() => setFilter('all')}>
            {de ? 'Alle' : 'All'}
            {hasItems && (
              <span className="ml-0.5 text-[10px] text-muted-foreground tabular-nums">
                ({allItems.length})
              </span>
            )}
          </FilterTab>
          <FilterTab active={filter === 'unread'} onClick={() => setFilter('unread')}>
            {de ? 'Ungelesen' : 'Unread'}
            {localUnread > 0 && (
              <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary text-primary-foreground px-1 text-[9px] font-bold">
                {localUnread}
              </span>
            )}
          </FilterTab>
        </div>
      </div>

      {/* ── List ── */}
      <div className="px-6">
        <div className="border rounded-xl overflow-hidden bg-card shadow-sm">

          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <SkeletonItem key={i} />)

          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
              <div className="h-12 w-12 rounded-2xl bg-destructive/10 ring-1 ring-destructive/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {de ? 'Fehler beim Laden' : 'Failed to load notifications'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {de ? 'Bitte Seite neu laden' : 'Please refresh the page'}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                {de ? 'Erneut versuchen' : 'Try again'}
              </Button>
            </div>

          ) : grouped.length === 0 ? (
            <EmptyState filter={filter} de={de} />

          ) : (
            <>
              {grouped.map((entry, idx) =>
                entry.type === 'divider' ? (
                  <GroupDivider key={`d-${idx}`} label={entry.label} />
                ) : (
                  <NotificationItem
                    key={entry.data._id || entry.data.id}
                    notification={entry.data}
                    onMarkRead={(id) => markRead.mutate(id)}
                    de={de}
                  />
                ),
              )}

              {/* Sentinel */}
              <div ref={sentinelRef} className="h-px" />

              {isFetchingNextPage && (
                <div className="flex items-center justify-center gap-2 py-5 border-t text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {de ? 'Mehr laden…' : 'Loading more…'}
                </div>
              )}

              {hasNextPage && !isFetchingNextPage && (
                <button
                  onClick={() => fetchNextPage()}
                  className="w-full flex items-center justify-center gap-1.5 py-3.5 border-t text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  {de ? 'Mehr anzeigen' : 'Load more'}
                </button>
              )}

              {!hasNextPage && allItems.length > 5 && (
                <div className="text-center py-4 border-t text-[11px] text-muted-foreground/40">
                  {de
                    ? `${allItems.length} Benachrichtigungen insgesamt`
                    : `${allItems.length} notification${allItems.length !== 1 ? 's' : ''} total`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
