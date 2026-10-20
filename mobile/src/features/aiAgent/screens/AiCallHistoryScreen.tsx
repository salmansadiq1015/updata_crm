import { Bot, Clock3, PhoneCall } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { formatElapsed } from '@/features/communication/domain/callEvidence';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { useTheme } from '@/theme/ThemeProvider';
import { formatRelative } from '@/utils/date';

import { RecipientStateBadge } from '../components/StatusBadges';
import { useAiCallHistory } from '../hooks/useAiAgent';
import type { CallRecord } from '../types';

const RowGap = () => <View className="h-2" />;

export function AiCallHistoryScreen({ route, navigation }: RootScreenProps<'AiCallHistory'>) {
  const { t, i18n } = useTranslation();
  const { colors } = useTheme();
  const query = useAiCallHistory(route.params.leadId);
  const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total;
  const pull = usePullRefresh(query.isRefetching && !query.isFetchingNextPage, () => void query.refetch());

  const empty = query.isPending ? (
    <View className="gap-2 pt-2">
      {Array.from({ length: 4 }, (_, index) => (
        <AppSkeleton key={index} className="h-24 w-full rounded-2xl" />
      ))}
    </View>
  ) : query.isError ? (
    <AppErrorState error={query.error} retrying={query.isRefetching} onRetry={() => void query.refetch()} />
  ) : (
    <AppEmptyState
      icon={Bot}
      title={t('aiAgent.callHistory.emptyTitle')}
      description={t('aiAgent.callHistory.emptyBody')}
    />
  );

  return (
    <Screen mode="static" edges={['bottom']}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CallHistoryRow
            call={item}
            language={i18n.language}
            onPress={() => navigation.navigate('AiCallDetail', { callId: item.id })}
          />
        )}
        ListHeaderComponent={
          typeof total === 'number' ? (
            <AppText variant="caption" tone="muted" className="pb-3" accessibilityLiveRegion="polite">
              {t('aiAgent.callHistory.total', { count: total })}
            </AppText>
          ) : null
        }
        ListEmptyComponent={empty}
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator className="py-4" color={colors.primary} /> : null
        }
        ItemSeparatorComponent={RowGap}
        contentContainerClassName="grow px-4 pb-8 pt-3"
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage && !query.isError) void query.fetchNextPage();
        }}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={pull.refreshing}
            onRefresh={pull.onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
            progressBackgroundColor={colors.card}
          />
        }
      />
    </Screen>
  );
}

function CallHistoryRow({
  call,
  language,
  onPress,
}: {
  call: CallRecord;
  language: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const when = formatRelative(call.endedAt ?? call.createdAt, language);
  const outcome = call.disposition
    ? t(`aiAgent.callHistory.disposition.${call.disposition as 'failed'}`, { defaultValue: call.disposition })
    : null;

  return (
    <AppPressableCard
      onPress={onPress}
      accessibilityLabel={[call.campaign.name, outcome, when].filter(Boolean).join(', ')}
      className="gap-2 px-3.5 py-3"
    >
      <View className="flex-row items-center gap-2">
        <Icon icon={PhoneCall} size="sm" color="mutedForeground" />
        <AppText variant="title" numberOfLines={1} className="flex-1">
          {call.campaign.name ?? t('aiAgent.callHistory.unknownCampaign')}
        </AppText>
        <RecipientStateBadge kind="call" state={call.state} />
      </View>
      {outcome ? <AppText numberOfLines={1}>{outcome}</AppText> : null}
      <View className="flex-row items-center gap-1.5">
        <Icon icon={Clock3} size="xs" color="mutedForeground" />
        <AppText variant="caption" tone="muted" className="flex-1">
          {[
            when,
            formatElapsed(call.durationSeconds * 1000),
            t('aiAgent.callHistory.attempt', { count: call.attemptNumber }),
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
      </View>
    </AppPressableCard>
  );
}
