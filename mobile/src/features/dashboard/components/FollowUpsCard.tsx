import { CalendarCheck } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { ApiError } from '@/services/api/apiErrors';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { FollowUpRow } from '@/features/followUps/components/FollowUpRow';
import { useFollowUps } from '@/features/followUps/hooks/useFollowUps';
import type { FollowUp } from '@/features/followUps/types';
import { groupFollowUps } from '@/features/followUps/utils/grouping';

const TOP = 3;

type Props = {
  onViewAll: () => void;
  onOpen: (item: FollowUp) => void;
  onCall: (item: FollowUp) => void;
};

/** Dashboard summary of my follow-ups: overdue + today counts and the next three. */
export function FollowUpsCard({ onViewAll, onOpen, onCall }: Props) {
  const { t } = useTranslation();
  const query = useFollowUps('mine');
  const groups = useMemo(() => groupFollowUps(query.data ?? []), [query.data]);
  const top = [...groups.overdue, ...groups.today, ...groups.upcoming].slice(0, TOP);
  const overdueIds = new Set(groups.overdue.map((item) => item.contactLogId));

  // A CRM server older than this app has no follow-ups route: the request falls through to
  // GET /crm/leads/:id and fails as 400/404. That means "not available here", not an error.
  if (query.error instanceof ApiError && (query.error.status === 400 || query.error.status === 404)) {
    return null;
  }

  return (
    <View className="gap-2">
      <SectionHeader
        title={t('followUps.title')}
        right={<AppButton title={t('dashboard.viewAll')} variant="link" size="sm" onPress={onViewAll} />}
      />
      {query.isPending ? (
        <View className="gap-2">
          <AppSkeleton className="h-6 w-1/2" />
          <AppSkeleton className="h-20 w-full rounded-2xl" />
        </View>
      ) : query.isError && !query.data ? (
        <AppErrorState
          error={query.error}
          retrying={query.isRefetching}
          onRetry={() => void query.refetch()}
          size="inline"
        />
      ) : top.length === 0 ? (
        <AppEmptyState icon={CalendarCheck} title={t('followUps.emptyTitle')} size="inline" />
      ) : (
        <View className="gap-2">
          <View className="flex-row flex-wrap gap-2">
            <AppBadge
              label={t('followUps.overdueCount', { count: groups.overdue.length })}
              variant={groups.overdue.length > 0 ? 'destructive' : 'outline'}
              size="sm"
            />
            <AppBadge
              label={t('followUps.todayCount', { count: groups.today.length })}
              variant={groups.today.length > 0 ? 'primary' : 'outline'}
              size="sm"
            />
          </View>
          {top.map((item) => (
            <FollowUpRow
              key={item.contactLogId}
              item={item}
              overdue={overdueIds.has(item.contactLogId)}
              onOpen={onOpen}
              onCall={onCall}
            />
          ))}
        </View>
      )}
    </View>
  );
}
