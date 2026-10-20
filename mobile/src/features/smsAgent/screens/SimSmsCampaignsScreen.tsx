import { MessageSquare } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { Loading } from '@/features/aiAgent/components/ReviewPanels';
import { tKey } from '@/features/communication/i18n';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import { useSimCampaigns } from '../hooks/useSmsAgent';

const Gap = () => <View className="h-2" />;

export function SimSmsCampaignsScreen({ navigation }: RootScreenProps<'SimSmsCampaigns'>) {
  const { t } = useTranslation();
  const query = useSimCampaigns();
  const pull = usePullRefresh(query.isRefetching, () => void query.refetch());
  return (
    <Screen mode="static" edges={['bottom']}>
      <FlatList
        data={query.data ?? []}
        keyExtractor={(c) => c.id}
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
            <AppEmptyState icon={MessageSquare} title={t('smsAgent.emptyCampaigns')} />
          )
        }
        renderItem={({ item }) => (
          <AppPressableCard
            className="gap-1"
            accessibilityLabel={item.name}
            onPress={() => navigation.navigate('SimSmsCampaignDetail', { campaignId: item.id })}
          >
            <View className="flex-row items-center gap-2">
              <AppText variant="title" className="flex-1" numberOfLines={1}>
                {item.name}
              </AppText>
              <AppBadge
                size="sm"
                label={tKey(t, `smsAgent.status.${item.status}`, { defaultValue: item.status })}
                variant={item.status === 'running' ? 'primary' : 'muted'}
                dot={item.status === 'running'}
              />
            </View>
            <AppText variant="caption" tone="muted">
              {`${t('smsAgent.summary.completed')}: ${item.summary.completed}/${item.summary.eligible} · ${t('smsAgent.summary.qualified')}: ${item.summary.qualified} · ${t('smsAgent.summary.repliesReceived')}: ${item.summary.repliesReceived}`}
            </AppText>
          </AppPressableCard>
        )}
      />
    </Screen>
  );
}
