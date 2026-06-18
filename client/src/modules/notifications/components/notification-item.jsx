'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  getNotificationCategoryColor,
  renderNotificationCategoryIcon,
} from '../constants/notification-ui-config';

function timeAgo(dateStr, t) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.time.now', 'Just now');
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function NotificationItem({ notification: n, onMarkRead, onDismiss, compact = false }) {
  const router = useRouter();
  const { t } = useLanguage();
  const colorCls = getNotificationCategoryColor(n.category);

  const handleClick = () => {
    if (!n.isRead) onMarkRead?.(n._id || n.id);
    if (n.deepLink) router.push(n.deepLink);
  };

  return (
    <div
      className={cn(
        'group flex items-start gap-3 transition-colors cursor-pointer',
        compact ? 'px-4 py-3 hover:bg-muted/50' : 'px-4 py-4 rounded-xl hover:bg-muted/40',
        !n.isRead && !compact && 'bg-primary/[0.03]',
      )}
      onClick={handleClick}
    >
      {/* Icon */}
      <div className={cn('h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', colorCls)}>
        {renderNotificationCategoryIcon(n.category)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm leading-snug', !n.isRead ? 'font-semibold' : 'font-medium text-muted-foreground')}>
            {n.title}
          </p>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">{timeAgo(n.sentAt, t)}</span>
            {onDismiss && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); onDismiss(n._id || n.id); }}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        <p className={cn('text-xs mt-0.5', compact ? 'line-clamp-1' : 'line-clamp-2', 'text-muted-foreground')}>
          {n.body}
        </p>
      </div>

      {/* Unread dot */}
      {!n.isRead && (
        <span className="mt-2 h-2 w-2 rounded-full bg-primary shrink-0" />
      )}
    </div>
  );
}
