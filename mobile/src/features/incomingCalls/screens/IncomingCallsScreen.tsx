import { useQueryClient } from '@tanstack/react-query';
import { PhoneIncoming, PhoneOff } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppButton } from '@/components/ui/AppButton';
import { AppChip } from '@/components/ui/AppChip';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { queryKeys } from '@/constants/queryKeys';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import { ActiveCallCard } from '../components/ActiveCallCard';
import { AiAnsweringCard } from '../components/AiAnsweringCard';
import { CallRow } from '../components/CallRow';
import { DevicesSection } from '../components/DevicesSection';
import { StatsRow } from '../components/StatsRow';
import {
  useInboundCallList,
  useInboundRealtime,
  useInboundStats,
  useLiveInboundCalls,
} from '../hooks/useIncomingCalls';
import { CALL_FILTERS, type CallFilter } from '../types';

/**
 * Incoming Calls dashboard: the AI-answering switch, calls ringing or in progress, today's
 * counts, the phones' readiness and recent calls. Same records as the website's workspace.
 */
export function IncomingCallsScreen({ navigation }: RootScreenProps<'IncomingCalls'>) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const connected = useInboundRealtime();
  const live = useLiveInboundCalls(connected);
  const stats = useInboundStats(connected);
  const [filter, setFilter] = useState<CallFilter>('all');
  const list = useInboundCallList(filter, connected);
  const rows = useMemo(() => list.data?.pages.flatMap((page) => page.items) ?? [], [list.data]);
  const activeCalls = live.data ?? [];

  const { refreshing, onRefresh } = usePullRefresh(
    (list.isRefetching && !list.isFetchingNextPage) || live.isRefetching || stats.isRefetching,
    () => client.invalidateQueries({ queryKey: queryKeys.incomingCalls.all }),
  );

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh} contentClassName="gap-5 pt-1 pb-10">
      <AiAnsweringCard />

      <View className="gap-3">
        <SectionHeader title={t('incomingCalls.live.title')} />
        {live.isError && !live.data ? (
          <AppAlert tone="warning" message={t('incomingCalls.live.loadFailed')} />
        ) : live.isPending ? (
          <AppSkeleton className="h-32 rounded-2xl" />
        ) : activeCalls.length === 0 ? (
          <AppEmptyState
            icon={PhoneIncoming}
            size="inline"
            title={t('incomingCalls.live.none')}
            description={t('incomingCalls.live.noneHint')}
          />
        ) : (
          activeCalls.map((call) => (
            <ActiveCallCard
              key={call.id}
              call={call}
              compact
              onOpen={() => navigation.navigate('IncomingCallLive', { id: call.id })}
            />
          ))
        )}
      </View>

      <View className="gap-3">
        <SectionHeader title={t('incomingCalls.stats.title')} />
        {stats.isError && !stats.data ? (
          <AppAlert tone="warning" message={t('incomingCalls.stats.loadFailed')} />
        ) : (
          <StatsRow stats={stats.data} loading={stats.isPending} />
        )}
      </View>

      <DevicesSection />

      <View className="gap-3">
        <SectionHeader title={t('incomingCalls.recent.title')} />
        <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup">
          {CALL_FILTERS.map((key) => (
            <AppChip
              key={key}
              label={t(`incomingCalls.filter.${key}`)}
              selected={filter === key}
              onPress={() => setFilter(key)}
            />
          ))}
        </View>
        {list.isPending ? (
          <AppSkeleton className="h-40 rounded-2xl" />
        ) : list.isError && rows.length === 0 ? (
          <AppErrorState
            error={list.error}
            size="inline"
            retrying={list.isRefetching}
            onRetry={() => void list.refetch()}
          />
        ) : rows.length === 0 ? (
          <AppEmptyState
            icon={PhoneOff}
            size="inline"
            title={
              filter === 'all'
                ? t('incomingCalls.recent.emptyTitle')
                : t('incomingCalls.recent.filteredEmpty')
            }
            description={filter === 'all' ? t('incomingCalls.recent.emptyBody') : undefined}
          />
        ) : (
          <View className="gap-2">
            {rows.map((call) => (
              <CallRow
                key={call.id}
                call={call}
                onPress={() => navigation.navigate('IncomingCallDetail', { id: call.id })}
              />
            ))}
            {list.hasNextPage ? (
              <AppButton
                title={t('incomingCalls.recent.loadMore')}
                variant="outline"
                loading={list.isFetchingNextPage}
                onPress={() => void list.fetchNextPage()}
              />
            ) : null}
          </View>
        )}
      </View>
    </Screen>
  );
}
