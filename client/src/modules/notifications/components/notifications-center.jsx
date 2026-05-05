'use client';

import { useState } from 'react';
import { useNotificationFeed, useNotificationMutations } from '../hooks/use-notification-feed';
import { NotificationItem } from './notification-item';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const CATEGORIES = ['ALL', 'TASK', 'ORDER', 'CHAT', 'SYSTEM', 'FINANCE', 'MAINTENANCE', 'DOCUMENT', 'CRM', 'PROJECT', 'SCHEDULING'];

const CATEGORY_LABELS = {
  ALL: { de: 'Alle', en: 'All' },
  TASK: { de: 'Aufgaben', en: 'Tasks' },
  ORDER: { de: 'Aufträge', en: 'Orders' },
  CHAT: { de: 'Nachrichten', en: 'Chat' },
  SYSTEM: { de: 'System', en: 'System' },
  FINANCE: { de: 'Finanzen', en: 'Finance' },
  MAINTENANCE: { de: 'Wartung', en: 'Maintenance' },
  DOCUMENT: { de: 'Dokumente', en: 'Documents' },
  CRM: { de: 'CRM', en: 'CRM' },
  PROJECT: { de: 'Projekte', en: 'Projects' },
  SCHEDULING: { de: 'Planung', en: 'Scheduling' },
};

function EmptyState({ de }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="relative">
        <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-primary/10" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-7 w-7 text-primary animate-bounce" />
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-sm font-medium">{de ? 'Keine Benachrichtigungen' : 'No notifications'}</p>
        <p className="text-xs text-muted-foreground">
          {de ? 'Sie sind auf dem neuesten Stand.' : "You're all caught up."}
        </p>
      </div>
    </div>
  );
}

export function NotificationsCenter() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [category, setCategory] = useState('ALL');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const filters = {};
  if (category !== 'ALL') filters.category = category;
  if (showUnreadOnly) filters.isRead = false;

  const { data: notifications = [], isFetching } = useNotificationFeed(filters);
  const { markRead, markAllRead, dismiss } = useNotificationMutations();

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full">
      <PageHeader
        icon={Bell}
        title={de ? 'Benachrichtigungen' : 'Notifications'}
        description={de ? 'Alle Systemmeldungen und Aktivitäten' : 'All system alerts and activity'}
        actions={
          unreadCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1.5"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {de ? 'Alle gelesen' : 'Mark all read'}
            </Button>
          ) : null
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Category tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none flex-wrap">
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
              {de ? CATEGORY_LABELS[cat].de : CATEGORY_LABELS[cat].en}
            </button>
          ))}
        </div>

        {/* Unread toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowUnreadOnly((v) => !v)}
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors',
              showUnreadOnly
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted/60',
            )}
          >
            <Filter className="h-3.5 w-3.5" />
            {de ? 'Nur ungelesen' : 'Unread only'}
            {unreadCount > 0 && (
              <span className="ml-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {isFetching && notifications.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">{de ? 'Laden...' : 'Loading...'}</div>
        ) : notifications.length === 0 ? (
          <EmptyState de={de} />
        ) : (
          <div className="divide-y">
            {notifications.map((n) => (
              <NotificationItem
                key={n._id || n.id}
                notification={n}
                onMarkRead={(id) => markRead.mutate(id)}
                onDismiss={(id) => dismiss.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
