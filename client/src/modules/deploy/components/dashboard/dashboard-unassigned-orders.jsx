'use client';

import Link from 'next/link';
import { format } from 'date-fns';
import { Clock, Inbox } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { DeployEmptyState } from '../shared/deploy-empty-state';

export function DashboardUnassignedOrders({ data, isLoading }) {
  const { t } = useLanguage();
  const orders = Array.isArray(data) ? data : data?.data || [];

  return (
    <div className="rounded-xl border bg-card p-4">
      <h3 className="text-sm font-semibold mb-3">
        {t('deploy.dashboard.unassignedOrders', 'Unassigned orders')}
      </h3>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-md" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <DeployEmptyState
          icon={Inbox}
          title={t('deploy.dashboard.noUnassigned', 'No unassigned orders')}
          description={t('deploy.dashboard.noUnassignedDesc', 'All current work has an assigned employee.')}
          compact
          className="py-6"
        />
      ) : (
        <div className="space-y-2 max-h-[260px] overflow-y-auto">
          {orders.map((order) => (
            <Link
              key={order._id}
              href={`/scheduling/calendar?assignmentId=${order._id}`}
              className="block rounded-md border px-3 py-2 text-xs hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium truncate">
                  {order.title || order.assignmentNumber}
                </span>
                <span className="text-muted-foreground shrink-0">
                  {order.priority || 'NORMAL'}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>
                  {order.startDatetime
                    ? format(new Date(order.startDatetime), 'dd.MM.yyyy HH:mm')
                    : t('deploy.dashboard.noDate', 'No date')}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
