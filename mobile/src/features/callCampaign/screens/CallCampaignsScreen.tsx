import { PhoneCall, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSearchInput } from '@/components/ui/AppSearchInput';
import { AppText } from '@/components/ui/AppText';
import { Loading } from '@/features/aiAgent/components/ReviewPanels';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatRelative } from '@/utils/date';

import { campaignProgress } from '../domain/campaignDomain';
import { useCallCampaigns } from '../hooks/useCallCampaigns';
import { useCampaignOutbox } from '../store/campaignOutbox';
import { CAMPAIGN_STATUSES, type CallCampaign } from '../types';

const Gap = () => <View className="h-2" />;

export function CallCampaignsScreen({ navigation }: RootScreenProps<'CallCampaigns'>) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const query = useCallCampaigns(status, search.trim() || undefined);
  const pull = usePullRefresh(query.isRefetching, () => void query.refetch());
  const unsynced = useCampaignOutbox((s) => Object.keys(s.items).length);

  const header = (
    <View className="gap-3 pb-3">
      <AppText tone="muted">{t('callCampaign.intro')}</AppText>
      {unsynced ? (
        <AppAlert tone="warning" message={t('callCampaign.list.unsynced', { count: unsynced })} />
      ) : null}
      <AppButton
        title={t('callCampaign.list.new')}
        leftIcon={Plus}
        onPress={() => navigation.navigate('CallAgentLeadPicker', { purpose: 'campaign' })}
      />
      <AppSearchInput value={search} onChangeText={setSearch} placeholder={t('callCampaign.list.search')} />
      <View className="flex-row flex-wrap gap-2">
        <AppChip label={t('callCampaign.list.all')} selected={!status} onPress={() => setStatus(undefined)} />
        {CAMPAIGN_STATUSES.map((s) => (
          <AppChip
            key={s}
            label={t(`callCampaign.status.${s}`)}
            selected={status === s}
            onPress={() => setStatus(s)}
          />
        ))}
      </View>
    </View>
  );

  return (
    <Screen mode="static" edges={['bottom']}>
      <FlatList
        data={query.data?.data ?? []}
        keyExtractor={(c) => c.id}
        ListHeaderComponent={header}
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
            <AppEmptyState icon={PhoneCall} title={t('callCampaign.list.empty')} />
          )
        }
        renderItem={({ item }) => (
          <CampaignCard
            item={item}
            onPress={() => navigation.navigate('CallCampaignDetail', { campaignId: item.id })}
          />
        )}
      />
    </Screen>
  );
}

function CampaignCard({ item, onPress }: { item: CallCampaign; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const s = item.summary;
  const p = campaignProgress(s);
  const review = s.needsReview + s.syncFailed;
  return (
    <AppPressableCard className="gap-1" accessibilityLabel={item.name} onPress={onPress}>
      <View className="flex-row items-center gap-2">
        <AppText variant="title" className="flex-1" numberOfLines={1}>
          {item.name}
        </AppText>
        <AppBadge
          size="sm"
          label={t(`callCampaign.status.${item.status}`)}
          variant={item.status === 'running' ? 'primary' : item.status === 'completed' ? 'success' : 'muted'}
          dot={item.status === 'running'}
        />
      </View>
      <AppText variant="caption" tone="muted">
        {t('callCampaign.list.progress', { closed: p.closed, total: s.total, remaining: p.remaining })}
      </AppText>
      <View className="flex-row flex-wrap gap-2">
        {review ? (
          <AppBadge size="sm" variant="warning" label={t('callCampaign.list.review', { count: review })} />
        ) : null}
        {s.callbacksDue ? (
          <AppBadge
            size="sm"
            variant="destructive"
            label={t('callCampaign.list.callbacksDue', { count: s.callbacksDue })}
          />
        ) : s.callbacks ? (
          <AppBadge
            size="sm"
            variant="info"
            label={t('callCampaign.list.callbacks', { count: s.callbacks })}
          />
        ) : null}
        {item.lastActivityAt ? (
          <AppText variant="caption" tone="muted">
            {formatRelative(new Date(item.lastActivityAt), i18n.language)}
          </AppText>
        ) : null}
      </View>
    </AppPressableCard>
  );
}
