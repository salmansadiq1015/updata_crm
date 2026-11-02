'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationFeed, useUnreadCount, useNotificationMutations } from '@/modules/notifications/hooks/use-notification-feed';
import { NotificationItem } from '@/modules/notifications/components/notification-item';
import { useLanguage } from '@/lib/i18n/language-context';

export function NotificationBell() {
  const { t } = useLanguage();
  const { data: feed } = useNotificationFeed({ limit: 20 });
  const notifications = useMemo(() => feed?.items || [], [feed]);
  const unreadCount = useUnreadCount();
  const { markRead, markAllRead } = useNotificationMutations();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button aria-label={t('notifications.bell.title')} variant="ghost" size="icon" className="relative h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -end-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">{t('notifications.bell.title', 'Notifications')}</h4>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="text-xs text-primary hover:underline disabled:opacity-50"
            >
              {t('notifications.bell.markAllRead', 'Mark all read')}
            </button>
          )}
        </div>
        <ScrollArea className="h-72">
          {notifications.length === 0 ? (
            <div className="flex items-center justify-center h-full py-8">
              <p className="text-sm text-muted-foreground">{t('notifications.bell.empty', 'No notifications')}</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <NotificationItem
                  key={n._id || n.id}
                  notification={n}
                  compact
                  onMarkRead={(id) => markRead.mutate(id)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
        <div className="border-t px-4 py-2.5">
          <Link href="/notifications" className="text-xs text-primary hover:underline">
            {t('notifications.bell.viewAll', 'View all notifications')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
