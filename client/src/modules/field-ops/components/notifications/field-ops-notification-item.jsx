'use client';

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, ClipboardList, AlertTriangle, Clock } from 'lucide-react';

const TYPE_ICON = {
  NEW_ASSIGNMENT: ClipboardList,
  ORDER_CHANGED: ClipboardList,
  ORDER_CANCELLED: AlertTriangle,
  CHAT_MESSAGE: MessageSquare,
  DAILY_REMINDER: Clock,
  ESCALATION: AlertTriangle,
};

export function FieldOpsNotificationItem({ notification, onMarkRead }) {
  const router = useRouter();
  const Icon = TYPE_ICON[notification.notification_type || notification.notificationType] || Bell;

  const handleClick = () => {
    if (!notification.is_read) onMarkRead(notification._id || notification.id);
    const link = notification.deep_link || notification.deepLink;
    if (link) router.push(link);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b last:border-0',
        !notification.is_read && 'bg-primary/[0.04]',
      )}
    >
      <div className={cn('mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0', !notification.is_read ? 'bg-primary/10' : 'bg-muted')}>
        <Icon className={cn('h-4 w-4', !notification.is_read ? 'text-primary' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !notification.is_read ? 'font-semibold' : 'font-normal')}>{notification.title}</p>
        {notification.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>}
        <p className="text-[11px] text-muted-foreground/60 mt-1">
          {new Date(notification.received_at || notification.receivedAt).toLocaleString()}
        </p>
      </div>
      {!notification.is_read && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
    </button>
  );
}
