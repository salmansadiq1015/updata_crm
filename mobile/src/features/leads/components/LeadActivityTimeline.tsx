import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { formatDate } from '@/utils/date';
import { listLeadTimeline } from '../api/leadTimelineApi';

/** The same governed, cursor-paginated timeline used by the website. */
export function LeadActivityTimeline({ leadId }: { leadId: string }) {
  const { t, i18n } = useTranslation();
  const history = useInfiniteQuery({
    queryKey: ['lead-timeline', leadId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) => listLeadTimeline(leadId, pageParam, signal),
    getNextPageParam: (page) =>
      page.pagination?.hasNext ? (page.pagination.nextCursor ?? undefined) : undefined,
    refetchInterval: 30_000,
  });
  const entries = history.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <View className="gap-3">
      <AppText variant="h3">{t('leads.activity.title', { defaultValue: 'Activity timeline' })}</AppText>
      {history.isPending ? (
        <AppSkeleton className="h-20 rounded-2xl" />
      ) : history.isError ? (
        <AppErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <>
          {!entries.length && (
            <AppText tone="muted">
              {t('leads.activity.empty', { defaultValue: 'No activity recorded yet.' })}
            </AppText>
          )}
          {entries.map((entry) => (
            <AppCard key={entry.id} className="gap-1.5">
              <AppText variant="label">
                {entry.title === 'call.evaluated'
                  ? t('leads.activity.callEvaluated', { defaultValue: 'Call qualification evaluated' })
                  : entry.title}
              </AppText>
              <AppText variant="caption" tone="muted">
                {[formatDate(entry.at, i18n.language), entry.actor?.name, entry.status?.replace(/_/g, ' ')]
                  .filter(Boolean)
                  .join(' · ')}
              </AppText>
              {(entry.summary || entry.body) && <AppText selectable>{entry.body || entry.summary}</AppText>}
            </AppCard>
          ))}
          {history.hasNextPage && (
            <AppButton
              variant="outline"
              title={t('leads.activity.more', { defaultValue: 'Load more activity' })}
              disabled={history.isFetchingNextPage}
              onPress={() => void history.fetchNextPage()}
            />
          )}
        </>
      )}
    </View>
  );
}
