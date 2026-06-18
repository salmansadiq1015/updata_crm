'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCheck,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useNotifications, useNotificationMutations } from '@/modules/mobile/hooks/use-notification-queries';
import { NOTIFICATION_TYPE } from '@/modules/mobile/constants/mobile-constants';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { normalizeNotificationItem } from '@/modules/notifications/utils/notification-feed-utils';
import {
  getNotificationCategoryColor,
  getNotificationCategoryLabel,
  renderNotificationCategoryIcon,
} from '@/modules/notifications/constants/notification-ui-config';
import toast from 'react-hot-toast';

function getNotificationLink(notification) {
  if (notification.deepLink) return notification.deepLink;

  const orderId = notification.order_id || notification.reference_id;
  const projectId = notification.project_id;
  const type = notification.notification_type || notification.type;

  switch (type) {
    case NOTIFICATION_TYPE.NEW_ASSIGNMENT:
    case NOTIFICATION_TYPE.ORDER_CHANGED:
    case NOTIFICATION_TYPE.ORDER_CANCELLED:
      return orderId ? `/orders/${orderId}` : '/orders';
    case NOTIFICATION_TYPE.CHAT_MESSAGE:
      return projectId ? `/chat/${projectId}` : null;
    case NOTIFICATION_TYPE.DAILY_REMINDER:
      return '/orders';
    default:
      return null;
  }
}

const TYPE_CONFIG = {
  [NOTIFICATION_TYPE.NEW_ASSIGNMENT]: {
    labelKey: 'notifications.type.new_assignment',
    category: 'SCHEDULING',
  },
  [NOTIFICATION_TYPE.ORDER_CHANGED]: {
    labelKey: 'notifications.type.order_status_changed',
    category: 'ORDER',
  },
  [NOTIFICATION_TYPE.ORDER_CANCELLED]: {
    labelKey: 'notifications.type.assignment_cancelled',
    category: 'SCHEDULING',
  },
  [NOTIFICATION_TYPE.CHAT_MESSAGE]: {
    labelKey: 'notifications.type.chat_message',
    category: 'CHAT',
  },
  [NOTIFICATION_TYPE.DAILY_REMINDER]: {
    labelKey: 'notifications.type.task_reminder',
    category: 'TASK',
  },
  [NOTIFICATION_TYPE.ESCALATION]: {
    labelKey: 'notifications.type.maintenance_escalated',
    category: 'MAINTENANCE',
  },
};

function normalizeMobileNotification(notification) {
  const normalized = normalizeNotificationItem(notification);
  const notificationType = notification.notificationType || notification.notification_type || notification.type || null;
  const typeConfig = TYPE_CONFIG[notificationType];

  return {
    ...notification,
    ...normalized,
    notificationType,
    category: notification.category || typeConfig?.category || normalized.category,
    is_read: normalized.isRead,
    received_at: notification.received_at || notification.created_at || normalized.sentAt,
  };
}

export default function NotificationsPage() {
  const { t } = useLanguage();
  const [filter, setFilter] = useState('all');

  const { data, isLoading, isError, refetch } = useNotifications();
  const { markRead, markAllRead: markAllReadMutation } = useNotificationMutations();

  const notifications = useMemo(
    () => {
      const rawNotifications = Array.isArray(data) ? data : data?.items || data?.notifications || [];
      return rawNotifications.map(normalizeMobileNotification);
    },
    [data],
  );
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const filtered =
    filter === 'unread'
      ? notifications.filter((n) => !n.is_read)
      : notifications;

  const markAllRead = async () => {
    await markAllReadMutation.mutateAsync();
    toast.success(t('notifications.toast.allRead', 'All marked as read'));
  };

  const handleSnooze = (notificationId) => {
    markRead.mutate(notificationId);
    toast.success(t('mobile.notifications.snoozed', 'Reminder in 1 hour'));
  };

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader
        title={t('mobile.notifications.title', 'Benachrichtigungen')}
        right={
          unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-8">
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              {t('mobile.notifications.readAll', 'Read all')}
            </Button>
          )
        }
      />

      {/* Filter tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setFilter('all')}
          className={cn(
            'flex-1 py-3 text-sm font-medium text-center transition-colors',
            filter === 'all'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground'
          )}
        >
          {t('mobile.notifications.all', 'All')} ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={cn(
            'flex-1 py-3 text-sm font-medium text-center transition-colors',
            filter === 'unread'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground'
          )}
        >
          {t('mobile.notifications.unread', 'Unread')}
          {unreadCount > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Notification list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <NotificationSkeleton />
        ) : isError ? (
          <div className="px-4 py-8">
            <EmptyState
              variant="error"
              title={t('notifications.error.title', 'Notifications could not be loaded')}
              description={t('notifications.error.description', 'Please try again.')}
              action={
                <button
                  onClick={() => refetch()}
                  className="mt-3 text-sm text-primary underline underline-offset-2"
                >
                  {t('notifications.error.retry', 'Retry')}
                </button>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8">
            <EmptyState
              variant="empty"
              title={t('mobile.notifications.empty', 'Keine Benachrichtigungen')}
              description={
                filter === 'unread'
                  ? t('mobile.notifications.emptyUnread', 'All notifications read.')
                  : t('mobile.notifications.emptyAll', 'You have no notifications yet.')
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkRead={() => markRead.mutate(notification.id)}
                onSnooze={handleSnooze}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationItem({ notification, onMarkRead, onSnooze }) {
  const router = useRouter();
  const { t } = useLanguage();
  const type = notification.notificationType || notification.notification_type || notification.type;
  const config = TYPE_CONFIG[type] || null;
  const category = notification.category || config?.category || 'SYSTEM';
  const isRead = notification.is_read;
  const receivedAt = notification.received_at || notification.created_at;
  const [renderedAt] = useState(() => Date.now());

  const timeAgo = (date) => {
    const diff = renderedAt - new Date(date).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return t('notifications.time.now', 'Just now');
    if (min < 60) return `${min}m`;
    const hrs = Math.floor(min / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  };

  return (
    <button
      onClick={() => {
        if (!isRead) onMarkRead();
        const link = getNotificationLink(notification);
        if (link) router.push(link);
      }}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors',
        !isRead && 'bg-primary/5',
        'active:bg-muted/50'
      )}
    >
      <div className={cn('flex items-center justify-center h-9 w-9 rounded-full shrink-0', getNotificationCategoryColor(category))}>
        {renderNotificationCategoryIcon(category)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('text-xs font-medium', getNotificationCategoryColor(category).split(' ')[0])}>
            {config ? t(config.labelKey, type) : getNotificationCategoryLabel(category, t)}
          </span>
          {receivedAt && (
            <span className="text-[10px] text-muted-foreground">{timeAgo(receivedAt)}</span>
          )}
        </div>
        <p className={cn('text-sm', !isRead ? 'font-medium' : 'text-muted-foreground')}>
          {notification.title || notification.message}
        </p>
        {notification.body && notification.body !== notification.title && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{notification.body}</p>
        )}
      </div>
      {!isRead && (
        <div className="h-2.5 w-2.5 rounded-full bg-primary shrink-0 mt-1.5" />
      )}
      {type === NOTIFICATION_TYPE.DAILY_REMINDER && !isRead && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSnooze?.(notification.id);
          }}
          className="text-[10px] text-muted-foreground bg-muted px-2 py-1 rounded-md shrink-0"
        >
          {t('mobile.notifications.snoozeOneHour', 'Snooze 1h')}
        </button>
      )}
    </button>
  );
}

function NotificationSkeleton() {
  return (
    <div className="divide-y divide-border">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3.5">
          <div className="h-9 w-9 rounded-full bg-muted animate-pulse shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 bg-muted rounded animate-pulse" />
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
