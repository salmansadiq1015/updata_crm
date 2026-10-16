import { Bot, MessageSquare, PhoneCall } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatRelative } from '@/utils/date';

import { Loading } from '../components/ReviewPanels';
import { CampaignStatusBadge } from '../components/StatusBadges';
import { useAgentCampaigns } from '../hooks/useAiAgent';
import type { AgentCampaignRow } from '../types';

/** Counters straight from the server summary: never inferred on the device. */
export function rowCounts(row: AgentCampaignRow): { done: number; total: number } {
  if (row.kind === 'call') {
    const summary = row.campaign.summary;
    return { done: summary.completed ?? 0, total: summary.eligible ?? 0 };
  }
  const progress = row.campaign.monitoring.progress;
  return { done: progress?.processed ?? 0, total: progress?.eligible ?? row.campaign.summary.eligible ?? 0 };
}

const Gap = () => <View className="h-2" />;

export function AiAgentCampaignsScreen({ navigation }: RootScreenProps<'AiAgentCampaigns'>) {
  const { t, i18n } = useTranslation();
  const query = useAgentCampaigns();
  // Spinner only for a user pull; background polling never flashes the refresh disc.
  const pull = usePullRefresh(query.isRefetching, () => void query.refetch());

  return (
    <Screen mode="static" edges={['bottom']}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(row) => `${row.kind}-${row.campaign.id}`}
        ItemSeparatorComponent={Gap}
        contentContainerClassName="grow px-4 pb-6 pt-3"
        onRefresh={pull.onRefresh}
        refreshing={pull.refreshing}
        ListEmptyComponent={
          query.isPending ? (
            <Loading label={t('common.loading')} />
          ) : query.isError ? (
            <AppErrorState
              error={query.error}
              retrying={query.isRefetching}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <AppEmptyState
              icon={Bot}
              title={t('aiAgent.campaigns.emptyTitle')}
              description={t('aiAgent.campaigns.emptyBody')}
            />
          )
        }
        renderItem={({ item }) => {
          const counts = rowCounts(item);
          const kindLabel =
            item.kind === 'call' ? t('aiAgent.campaigns.kindCall') : t('aiAgent.campaigns.kindSms');
          const created = formatRelative(item.campaign.createdAt, i18n.language);
          return (
            <AppPressableCard
              accessibilityLabel={`${kindLabel}, ${item.campaign.name}`}
              onPress={() =>
                navigation.navigate('AiAgentCampaignDetail', {
                  kind: item.kind,
                  campaignId: item.campaign.id,
                })
              }
              className="gap-1.5 px-3.5 py-3"
            >
              <View className="flex-row items-center gap-2">
                <Icon
                  icon={item.kind === 'call' ? PhoneCall : MessageSquare}
                  size="sm"
                  color="mutedForeground"
                />
                <AppText variant="caption" tone="muted" className="flex-1">
                  {kindLabel}
                </AppText>
                {item.kind === 'call' && item.campaign.isTest ? (
                  <AppBadge label={t('aiAgent.campaigns.test')} variant="outline" />
                ) : null}
                <CampaignStatusBadge status={item.campaign.status} />
              </View>
              <AppText variant="title" numberOfLines={2}>
                {item.campaign.name}
              </AppText>
              <View className="flex-row flex-wrap gap-x-3">
                <AppText variant="caption" tone="muted">
                  {t('aiAgent.campaigns.counts', counts)}
                </AppText>
                {created ? (
                  <AppText variant="caption" tone="muted">
                    {t('aiAgent.campaigns.created', { when: created })}
                  </AppText>
                ) : null}
              </View>
            </AppPressableCard>
          );
        }}
      />
    </Screen>
  );
}
