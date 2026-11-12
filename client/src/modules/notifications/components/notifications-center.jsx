'use client';

import { useDeferredValue, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle, ArrowDown, Bell, BellDot, CheckCheck, ExternalLink, Filter, Inbox, RefreshCw, Search, Settings, ShieldAlert, Trash2,
} from 'lucide-react';
import { useInfiniteNotificationFeed, useNotificationMutations } from '../hooks/use-notification-feed';
import { NotificationSettingsDialog } from './notification-settings-dialog';
import { HeroStat } from '@/shared/components/hero-art';
import { HeroPill, PageHero, heroButton } from '@/shared/components/page-hero';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { EMPTY_NOTIFICATION_SUMMARY } from '../utils/notification-feed-utils';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_PRIORITY_STYLES,
  getNotificationCategoryColor,
  getNotificationCategoryLabel,
  getNotificationPriorityLabel,
  renderNotificationCategoryIcon,
} from '../constants/notification-ui-config';

const EMPTY_NOTIFICATIONS = Object.freeze([]);

function timeAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.time.now', 'Just now');
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayLabel(dateStr, t) {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return t('notifications.day.today', 'Today');
  if (date.toDateString() === yesterday.toDateString()) return t('notifications.day.yesterday', 'Yesterday');
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function groupByDay(notifications) {
  const groups = new Map();
  for (const notification of notifications) {
    const key = new Date(notification.sentAt).toDateString();
    if (!groups.has(key)) groups.set(key, { date: notification.sentAt, items: [] });
    groups.get(key).items.push(notification);
  }
  return [...groups.values()];
}

function ActionQueue({ actions, t, onMarkRead }) {
  const router = useRouter();
  if (!actions.length) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-orange-500" />
        <p className="text-sm font-semibold">{t('notifications.actionQueue.title', 'Most important pending actions')}</p>
      </div>
      <div className="divide-y">
        {actions.map((action) => {
          return (
            <button
              key={action.id || action._id}
              type="button"
              onClick={() => {
                if (!action.isRead) onMarkRead(action.id || action._id);
                if (action.deepLink) router.push(action.deepLink);
              }}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', getNotificationCategoryColor(action.category))}>
                {renderNotificationCategoryIcon(action.category)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{action.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{action.body}</span>
              </span>
              {action.deepLink && <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function NotificationRow({ notification, t, onMarkRead, onDismiss }) {
  const router = useRouter();
  const priorityBadge = NOTIFICATION_PRIORITY_STYLES[notification.priority];

  const handleClick = () => {
    if (!notification.isRead) onMarkRead(notification.id || notification._id);
    if (notification.deepLink) router.push(notification.deepLink);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 transition-colors hover:bg-muted/40',
        !notification.isRead && 'bg-primary/[0.025]',
      )}
    >
      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', getNotificationCategoryColor(notification.category))}>
        {renderNotificationCategoryIcon(notification.category)}
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('truncate text-sm leading-snug', !notification.isRead ? 'font-semibold' : 'font-medium text-foreground/80')}>
            {notification.title}
          </p>
          {priorityBadge && (
            <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', priorityBadge)}>
              {getNotificationPriorityLabel(notification.priority, t)}
            </span>
          )}
        </div>
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{notification.body}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{getNotificationCategoryLabel(notification.category, t)}</span>
          {notification.deepLink && <span className="truncate text-primary">{notification.deepLink}</span>}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <span className="whitespace-nowrap text-[11px] text-muted-foreground">{timeAgo(notification.sentAt, t)}</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onDismiss(notification.id || notification._id);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
        {!notification.isRead && <span className="h-2 w-2 rounded-full bg-primary" />}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="divide-y">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 px-5 py-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ t, filtered }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        {filtered ? <Inbox className="h-7 w-7 text-primary" /> : <Bell className="h-7 w-7 text-primary" />}
      </div>
      <div className="space-y-1 text-center">
        <p className="text-sm font-medium">
          {filtered ? t('notifications.empty.filteredTitle', 'No matches') : t('notifications.empty.title', 'No notifications')}
        </p>
        <p className="text-xs text-muted-foreground">
          {filtered ? t('notifications.empty.filteredDescription', 'Adjust filters and try again.') : t('notifications.empty.description', "You're all caught up.")}
        </p>
      </div>
    </div>
  );
}

function ErrorState({ t, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <div>
        <p className="text-sm font-medium">{t('notifications.error.title', 'Notifications could not be loaded')}</p>
        <p className="text-xs text-muted-foreground">{t('notifications.error.description', 'Please try again.')}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-2 h-3.5 w-3.5" />
        {t('notifications.error.retry', 'Retry')}
      </Button>
    </div>
  );
}

export function NotificationsCenter() {
  const { t } = useLanguage();

  const [category, setCategory] = useState('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);

  const filters = useMemo(() => {
    const next = { limit: 50 };
    if (category !== 'ALL') next.category = category;
    if (showUnreadOnly) next.isRead = false;
    if (deferredSearch.trim()) next.search = deferredSearch.trim();
    return next;
  }, [category, deferredSearch, showUnreadOnly]);

  const {
    data: feed,
    isError,
    isFetching,
    isLoading,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteNotificationFeed(filters);
  const { markRead, markAllRead, dismiss } = useNotificationMutations();

  const notifications = feed?.items ?? EMPTY_NOTIFICATIONS;
  const summary = feed?.summary || EMPTY_NOTIFICATION_SUMMARY;
  const groups = useMemo(() => groupByDay(notifications), [notifications]);
  const filtered = Boolean(deferredSearch.trim() || showUnreadOnly || category !== 'ALL');

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <PageHero
        id="notifications-title"
        art="/hero/notifications"
        icon={Bell}
        eyebrow={t('notifications.title', 'Notifications')}
        title={t('notificationsHero.title', 'What needs you, the moment it matters.')}
        subtitle={t('notifications.description', 'Critical tasks, updates, and events')}
        status={<HeroPill tone={summary.critical ? 'warn' : summary.unread ? 'ok' : 'off'}>{summary.unread ? t('notificationsHero.unread', '{count} unread', { count: summary.unread }) : t('notificationsHero.caughtUp', 'All caught up')}</HeroPill>}
        actions={<>
          <NotificationSettingsDialog>
            <button type="button" className={cn(heroButton.ghost, 'w-11 justify-center px-0')} aria-label={t('notifications.settings', 'Notification settings')}><Settings aria-hidden="true" /></button>
          </NotificationSettingsDialog>
          <button type="button" className={cn(heroButton.ghost, 'w-11 justify-center px-0')} aria-label={t('common.refresh', 'Refresh')} onClick={() => refetch()} disabled={isFetching}><RefreshCw aria-hidden="true" className={cn(isFetching && 'animate-spin')} /></button>
          <button type="button" className={heroButton.primary} onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending || !summary.unread}><CheckCheck aria-hidden="true" />{t('notifications.markAllRead', 'Mark all read')}</button>
        </>}
        stats={<>
          <button type="button" onClick={() => setShowUnreadOnly(true)} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/50">
            <HeroStat icon={BellDot} label={t('notifications.summary.unread', 'Unread')} value={summary.unread} hint={t('notificationsHero.unreadHint', 'Show only unread')} loading={isLoading} />
          </button>
          <HeroStat icon={AlertTriangle} tone={summary.highPriority ? 'text-amber-300' : 'text-sky-200'} label={t('notifications.summary.highPriority', 'High priority')} value={summary.highPriority} hint={t('notificationsHero.highHint', 'Needs attention soon')} loading={isLoading} />
          <HeroStat icon={ShieldAlert} tone={summary.critical ? 'text-rose-300' : 'text-emerald-300'} label={t('notifications.summary.critical', 'Critical')} value={summary.critical} hint={t('notificationsHero.criticalHint', 'Act now')} loading={isLoading} />
          <HeroStat icon={Inbox} tone="text-cyan-300" label={t('notifications.summary.total', 'Total')} value={summary.total} hint={t('notifications.summary.active', 'active')} loading={isLoading} />
        </>}
      />
      <ActionQueue actions={summary.pendingActions || []} t={t} onMarkRead={(id) => markRead.mutate(id)} />

      <div className="flex flex-col gap-3">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('notifications.search.placeholder', 'Search notifications...')}
            aria-label={t('notifications.search.placeholder', 'Search notifications...')}
            className="h-11 rounded-xl ps-10 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-1">
          {NOTIFICATION_CATEGORIES.map((cat) => {
            const categoryCount = cat === 'ALL' ? summary.total : summary.byCategory?.[cat]?.total || 0;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                aria-pressed={category === cat}
                className={cn(
                  'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  category === cat
                    ? 'border-transparent bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-[0_8px_20px_-10px_rgba(14,165,233,0.8)]'
                    : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {getNotificationCategoryLabel(cat, t)}
                {categoryCount > 0 && <span className="ml-1 opacity-70">{categoryCount}</span>}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowUnreadOnly((value) => !value)}
          className={cn(
            'flex w-fit items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
            showUnreadOnly ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted/60',
          )}
        >
          <Filter className="h-3.5 w-3.5" />
          {t('notifications.filter.unreadOnly', 'Unread only')}
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <LoadingSkeleton />
        ) : isError ? (
          <ErrorState t={t} onRetry={() => refetch()} />
        ) : notifications.length === 0 ? (
          <EmptyState t={t} filtered={filtered} />
        ) : (
          <div>
            {groups.map((group) => (
              <div key={new Date(group.date).toISOString()}>
                <div className="flex items-center gap-3 border-b bg-muted/30 px-5 py-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {dayLabel(group.date, t)}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-muted-foreground">
                    {group.items.filter((item) => !item.isRead).length} {t('notifications.group.unread', 'unread')}
                  </span>
                </div>
                <div className="divide-y">
                  {group.items.map((notification) => (
                    <NotificationRow
                      key={notification.id || notification._id}
                      notification={notification}
                      t={t}
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

      {notifications.length > 0 && (
        <div className="flex items-center justify-center pb-2">
          {hasNextPage ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
              className="gap-2"
            >
              {isFetchingNextPage ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowDown className="h-3.5 w-3.5" />}
              {t('notifications.loadMore', 'Load more')}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t('notifications.countLabel', '{count} notifications', { count: notifications.length })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
