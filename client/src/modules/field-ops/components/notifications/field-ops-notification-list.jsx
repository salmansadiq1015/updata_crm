'use client';

import { useFieldOpsNotifications } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { useNotificationMutations } from '@/modules/mobile/hooks/use-notification-queries';
import { FieldOpsNotificationItem } from './field-ops-notification-item';
import { PageHeader } from '@/shared/components/page-header';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';

export function FieldOpsNotificationList() {
  const { t } = useLanguage();
  const { data: notifications = [], isLoading } = useFieldOpsNotifications();
  const { markRead, markAllRead } = useNotificationMutations();

  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4">
      <div className="px-6 pt-6">
        <PageHeader
          title={t('fieldOps.notifications.title', 'Notifications')}
          count={unread > 0 ? unread : undefined}
        >
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
              {t('fieldOps.notifications.markAllRead', 'Mark all as read')}
            </Button>
          )}
        </PageHeader>
      </div>
      <div className="border rounded-xl overflow-hidden mx-6">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1,2,3,4].map((i) => (
              <div key={i} className="flex gap-3">
                <div className="h-8 w-8 rounded-full bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-48 bg-muted animate-pulse rounded" />
                  <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">{t('fieldOps.notifications.empty', 'No notifications.')}</div>
        ) : (
          notifications.map((n) => (
            <FieldOpsNotificationItem
              key={n._id || n.id}
              notification={n}
              onMarkRead={(id) => markRead.mutate(id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
