'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatDateTime, formatDateRelative } from '@/lib/formatters';
import { Activity, AlertCircle, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getActivityEventMeta, getActivityEventLabel } from '@/modules/crm/constants/activity-events';

const TONE_CLASSES = {
  emerald: 'bg-emerald-500/10 text-emerald-500 ring-emerald-500/20',
  blue: 'bg-blue-500/10 text-blue-500 ring-blue-500/20',
  amber: 'bg-amber-500/10 text-amber-500 ring-amber-500/20',
  muted: 'bg-muted text-muted-foreground ring-border',
  violet: 'bg-brand-500/10 text-brand-500 ring-brand-500/20',
  sky: 'bg-sky-500/10 text-sky-500 ring-sky-500/20',
  red: 'bg-red-500/10 text-red-500 ring-red-500/20',
  orange: 'bg-orange-500/10 text-orange-500 ring-orange-500/20',
};

export function CustomerActivityPanel({ customerId }) {
  const { t } = useLanguage();

  const query = useInfiniteQuery({
    queryKey: queryKeys.crm.customers.activity(customerId, {}),
    queryFn: ({ pageParam = null }) => customerService.getActivity(customerId, { cursor: pageParam || '', limit: 25 }),
    initialPageParam: null,
    getNextPageParam: (last) => (last?.pagination?.hasNext ? last?.pagination?.nextCursor : null),
    enabled: !!customerId,
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          {t('common.activity', 'Aktivität')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <EmptyState
            icon={AlertCircle}
            title={t('common.errorTitle', 'Could not load activity')}
            description={query.error?.message}
            action={<Button variant="outline" size="sm" onClick={() => query.refetch()}>{t('common.retry', 'Retry')}</Button>}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title={t('crm.noActivity', 'No activity yet')}
            description={t('crm.noActivityDesc', 'Events will appear here as this customer is edited.')}
          />
        ) : (
          <>
            <ol className="relative border-l border-border ml-4 space-y-5 py-2">
              {items.map((e) => {
                const meta = getActivityEventMeta(e.eventType);
                const MetaIcon = meta.icon;
                const label = getActivityEventLabel(t, e.eventType);
                return (
                  <li key={e._id} className="ml-6">
                    <span className={cn(
                      'absolute -left-3.5 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background',
                      TONE_CLASSES[meta.tone] || TONE_CLASSES.violet,
                    )}>
                      <MetaIcon className="h-3.5 w-3.5" />
                    </span>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{label}</p>
                        {e.details && Object.keys(e.details).length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {describeDetails(e.details, t)}
                          </p>
                        )}
                        {e.userName && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            {t('common.by', 'von')} {e.userName}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-medium">{formatDateRelative(e.timestamp)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatDateTime(e.timestamp)}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>

            {query.hasNextPage && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage
                    ? t('common.loading', 'Loading...')
                    : t('common.loadMore', 'Load more')}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function describeDetails(details, t) {
  const fields = [];
  if (Array.isArray(details.changedFields) && details.changedFields.length > 0) {
    fields.push(`${t('crm.changedFields', 'Changed')}: ${details.changedFields.join(', ')}`);
  }
  if (details.meetingTitle) fields.push(details.meetingTitle);
  if (details.name) fields.push(details.name);
  if (details.reason) fields.push(details.reason);
  if (details.sourceId && details.targetId) {
    fields.push(t('crm.mergedInto', 'merged into target'));
  }
  // QOP document details
  if (details.quotationNumber) fields.push(details.quotationNumber);
  if (details.orderNumber) fields.push(details.orderNumber);
  if (details.invoiceNumber) fields.push(details.invoiceNumber);
  if (details.title && !details.name) fields.push(details.title);
  if (details.amount != null && details.currency) {
    fields.push(`${details.currency} ${Number(details.amount).toLocaleString('de-CH', { minimumFractionDigits: 2 })}`);
  }
  if (details.status) fields.push(details.status);
  return fields.join(' · ');
}
