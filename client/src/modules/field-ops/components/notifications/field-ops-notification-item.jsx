'use client';

import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Bell, MessageSquare, ClipboardList, AlertTriangle, Clock, FileCheck } from 'lucide-react';

const TYPE_ICON = {
  NEW_ASSIGNMENT: ClipboardList,
  ORDER_CHANGED: ClipboardList,
  ORDER_CANCELLED: AlertTriangle,
  CHAT_MESSAGE: MessageSquare,
  DAILY_REMINDER: Clock,
  ESCALATION: AlertTriangle,
  // Centralized pipeline types
  report_submitted: FileCheck,
  order_status_changed: ClipboardList,
  new_assignment: ClipboardList,
  assignment_updated: ClipboardList,
  assignment_cancelled: AlertTriangle,
  chat_message: MessageSquare,
};

export function FieldOpsNotificationItem({ notification, onMarkRead }) {
  const router = useRouter();

  // Support both legacy (is_read, notification_type) and new (isRead, category) field names
  const isRead = notification.isRead ?? notification.is_read ?? false;
  const type = notification.notification_type || notification.notificationType || notification.category || '';
  const deepLink = notification.deepLink || notification.deep_link;
  const timestamp = notification.sentAt || notification.received_at || notification.receivedAt || notification.createdAt;

  const Icon = TYPE_ICON[type] || Bell;

  const handleClick = () => {
    if (!isRead) onMarkRead(notification._id || notification.id);
    if (deepLink) router.push(deepLink);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 border-b last:border-0',
        !isRead && 'bg-primary/4',
      )}
    >
      <div className={cn(
        'mt-0.5 h-8 w-8 rounded-full flex items-center justify-center shrink-0',
        !isRead ? 'bg-primary/10' : 'bg-muted',
      )}>
        <Icon className={cn('h-4 w-4', !isRead ? 'text-primary' : 'text-muted-foreground')} />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm leading-snug', !isRead ? 'font-semibold' : 'font-normal')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
        {timestamp && (
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {new Date(timestamp).toLocaleString()}
          </p>
        )}
      </div>
      {!isRead && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />}
    </button>
  );
}
