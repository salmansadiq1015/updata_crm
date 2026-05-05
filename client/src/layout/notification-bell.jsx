'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotificationStore } from '@/stores/notification-store';
import { notificationService } from '@/modules/mobile/services/notification-service';
import { queryKeys } from '@/lib/query/keys';

export function NotificationBell() {
  const { notifications: realtimeNotifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();

  // Load first page from API so the bell works after a page refresh.
  // Uses a separate key from the infinite query to avoid cache shape collision.
  const { data } = useQuery({
    queryKey: ['mobile', 'notifications', 'bell'],
    queryFn: () => notificationService.getNotifications({ limit: 20 }),
    staleTime: 60_000,
  });
  const apiNotifications = data?.items ?? [];

  // Merge: real-time Zustand entries take priority (deduplicate by id)
  const notifications = useMemo(() => {
    const seen = new Set(realtimeNotifications.map((n) => String(n.id)));
    const merged = [...realtimeNotifications];
    for (const n of apiNotifications) {
      const id = String(n._id || n.id);
      if (!seen.has(id)) {
        seen.add(id);
        merged.push({ id, title: n.title, body: n.body, category: n.category, deepLink: n.deepLink, sentAt: n.sentAt, isRead: n.isRead });
      }
    }
    return merged.slice(0, 20);
  }, [realtimeNotifications, apiNotifications]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h4 className="text-sm font-semibold">Benachrichtigungen</h4>
          {unreadCount > 0 && (
            <button onClick={markAllAsRead} className="text-xs text-primary hover:underline">
              Alle gelesen
            </button>
          )}
        </div>
        <ScrollArea className="h-72">
          {notifications.length === 0 ? (
            <div className="flex items-center justify-center h-full py-8">
              <p className="text-sm text-muted-foreground">Keine Benachrichtigungen</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 hover:bg-muted/50 cursor-pointer transition-colors ${!n.isRead ? 'bg-primary/5' : ''}`}
                  onClick={() => markAsRead(n.id)}
                >
                  <div className="flex items-start gap-2">
                    {!n.isRead && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{n.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.body}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {n.sentAt ? new Date(n.sentAt).toLocaleString('de-CH') : ''}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
