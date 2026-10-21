import { MessageSquare, Pause, Play, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { usePullRefresh } from '@/components/layout/usePullRefresh';
import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard, AppPressableCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppModal } from '@/components/ui/AppModal';
import { AppText } from '@/components/ui/AppText';
import { getEnv } from '@/config/env';
import { Loading, ReasonList, Stat } from '@/features/aiAgent/components/ReviewPanels';
import { tKey } from '@/features/communication/i18n';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatRelative } from '@/utils/date';

import { SmsReadinessCard } from '../components/SmsReadinessCard';
import { simCampaignActions, smsAgentReadiness } from '../domain/smsAgentDomain';
import {
  useAgentLoopStatus,
  useSimCampaign,
  useSimCampaignAction,
  useSimConversations,
  useSmsReadiness,
} from '../hooks/useSmsAgent';
import type { SimConversation } from '../types';

export const STATE_VARIANT: Record<string, BadgeVariant> = {
  queued: 'muted',
  awaiting_send: 'info',
  awaiting_reply: 'primary',
  completed: 'success',
  stopped: 'warning',
  expired: 'muted',
  needs_attention: 'warning',
  failed: 'destructive',
  ineligible: 'outline',
  cancelled: 'muted',
};

const Gap = () => <View className="h-2" />;

export function SimSmsCampaignDetailScreen({ navigation, route }: RootScreenProps<'SimSmsCampaignDetail'>) {
  const { t, i18n } = useTranslation();
  const { campaignId } = route.params;
  const campaign = useSimCampaign(campaignId);
  const live = campaign.data?.status === 'running';
  const conversations = useSimConversations(campaignId, live);
  const action = useSimCampaignAction();
  const loop = useAgentLoopStatus();
  const readinessQuery = useSmsReadiness();
  const readiness = smsAgentReadiness(
    getEnv().distribution,
    readinessQuery.data,
    readinessQuery.data?.batteryUnrestricted ?? false,
  );
  const [confirm, setConfirm] = useState<'start' | 'cancel' | null>(null);
  const pull = usePullRefresh(campaign.isRefetching || conversations.isRefetching, () => {
    void campaign.refetch();
    void conversations.refetch();
  });

  const run = useSingleFlight(async (next: 'start' | 'pause' | 'cancel') => {
    await action.mutateAsync({ id: campaignId, action: next });
    setConfirm(null);
  });

  if (campaign.isPending) return <Loading label={t('common.loading')} />;
  if (campaign.isError) {
    return (
      <AppErrorState
        error={campaign.error}
        retrying={campaign.isRefetching}
        onRetry={() => void campaign.refetch()}
      />
    );
  }
  const c = campaign.data;
  const s = c.summary;
  const actions = simCampaignActions(c.status);
  const rows = conversations.data ?? [];

  const header = (
    <View className="gap-3 pb-3">
      <AppCard className="gap-3">
        <View className="flex-row items-center gap-2">
          <AppText variant="h3" className="flex-1">
            {c.name}
          </AppText>
          <AppBadge
            label={tKey(t, `smsAgent.status.${c.status}`, { defaultValue: c.status })}
            variant={live ? 'primary' : 'muted'}
            dot={live}
          />
        </View>
        {c.status === 'draft' ? (
          <View className="gap-2">
            <AppText variant="label">{t('smsAgent.review.title')}</AppText>
            <AppText>
              {s.eligible > 0
                ? t('smsAgent.review.eligible', { eligible: s.eligible, total: s.total })
                : t('smsAgent.review.none')}
            </AppText>
            <ReasonList
              rows={rows.filter((r) => r.eligibility).map((r) => ({ eligibility: r.eligibility! }))}
            />
            <AppText variant="caption" tone="muted">
              {t('smsAgent.review.costs', { seconds: c?.settings?.minSecondsBetweenSends ?? 20 })}
            </AppText>
          </View>
        ) : (
          <View className="flex-row flex-wrap gap-2">
            <Stat label={t('smsAgent.summary.total')} value={s.eligible} />
            <Stat label={t('smsAgent.summary.awaitingReply')} value={s.awaitingReply} />
            <Stat label={t('smsAgent.summary.completed')} value={s.completed} />
            <Stat label={t('smsAgent.summary.qualified')} value={s.qualified} />
            <Stat label={t('smsAgent.summary.review')} value={s.review} />
            <Stat label={t('smsAgent.summary.stopped')} value={s.stopped} />
            <Stat label={t('smsAgent.summary.expired')} value={s.expired} />
            <Stat label={t('smsAgent.summary.needsAttention')} value={s.needsAttention} />
            <Stat label={t('smsAgent.summary.messagesSent')} value={s.messagesSent} />
            <Stat label={t('smsAgent.summary.repliesReceived')} value={s.repliesReceived} />
          </View>
        )}
      </AppCard>

      {s.lastSendError ? (
        <AppAlert
          tone="destructive"
          title={t('smsAgent.sendError.title')}
          message={[
            s.lastSendError.code === 'RESULT_ERROR_RADIO_OFF' ||
            s.lastSendError.code === 'RESULT_ERROR_NO_SERVICE'
              ? t('smsAgent.sendError.offline')
              : s.lastSendError.code === 'RESULT_ERROR_GENERIC_FAILURE' ||
                  s.lastSendError.code === 'RESULT_NETWORK_REJECT'
                ? t('smsAgent.sendError.carrier', { code: s.lastSendError.code })
                : t('smsAgent.sendError.other', { code: s.lastSendError.code }),
            s.lastSendError.nextRetryAt && live
              ? t('smsAgent.sendError.nextRetry', {
                  when: formatRelative(new Date(s.lastSendError.nextRetryAt), i18n.language) ?? '',
                })
              : null,
          ]
            .filter(Boolean)
            .join(' ')}
        />
      ) : null}
      {live ? (
        <AppAlert
          tone={!readiness.canStart ? 'destructive' : loop.lastResult?.error ? 'warning' : 'info'}
          message={[
            !readiness.canStart
              ? t('smsAgent.agent.cannotSend')
              : loop.running
                ? t('smsAgent.agent.running')
                : t('smsAgent.agent.idle'),
            loop.lastCycleAt
              ? t('smsAgent.agent.lastSync', {
                  when: formatRelative(new Date(loop.lastCycleAt), i18n.language) ?? '',
                })
              : null,
            loop.lastResult?.error ? t('smsAgent.agent.error', { message: loop.lastResult.error }) : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />
      ) : null}
      {c.status === 'draft' || c.status === 'paused' ? <SmsReadinessCard /> : null}

      <View className="flex-row flex-wrap gap-2">
        {actions.includes('start') ? (
          <AppButton
            title={c.status === 'paused' ? t('smsAgent.resume') : t('smsAgent.start')}
            leftIcon={Play}
            disabled={!readiness.canStart || s.eligible === 0 || action.isPending}
            onPress={() => setConfirm('start')}
          />
        ) : null}
        {actions.includes('pause') ? (
          <AppButton
            title={t('smsAgent.pause')}
            leftIcon={Pause}
            variant="outline"
            loading={action.isPending && action.variables?.action === 'pause'}
            disabled={action.isPending}
            onPress={() => void run('pause')}
          />
        ) : null}
        {actions.includes('cancel') ? (
          <AppButton
            title={t('smsAgent.cancel')}
            leftIcon={XCircle}
            variant="ghost"
            disabled={action.isPending}
            onPress={() => setConfirm('cancel')}
          />
        ) : null}
      </View>
      <AppText variant="h3">{t('smsAgent.conversations')}</AppText>
    </View>
  );

  return (
    <Screen mode="static" edges={['bottom']}>
      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Gap}
        contentContainerClassName="grow px-4 pb-6 pt-3"
        onRefresh={pull.onRefresh}
        refreshing={pull.refreshing}
        ListEmptyComponent={
          conversations.isPending ? (
            <Loading label={t('common.loading')} />
          ) : conversations.isError ? (
            <AppErrorState
              error={conversations.error}
              size="inline"
              onRetry={() => void conversations.refetch()}
            />
          ) : (
            <AppText tone="muted">{t('smsAgent.noConversations')}</AppText>
          )
        }
        renderItem={({ item }) => (
          <ConversationRow
            row={item}
            onPress={() => navigation.navigate('SimSmsConversation', { conversationId: item.id })}
          />
        )}
      />

      <AppModal
        visible={confirm !== null}
        title={confirm === 'cancel' ? t('smsAgent.cancelTitle') : t('smsAgent.startTitle')}
        description={
          confirm === 'cancel' ? t('smsAgent.cancelBody') : t('smsAgent.startBody', { count: s.eligible })
        }
        onClose={() => setConfirm(null)}
        footer={
          <View className="gap-2">
            <AppButton
              title={confirm === 'cancel' ? t('smsAgent.cancel') : t('smsAgent.start')}
              variant={confirm === 'cancel' ? 'destructive' : 'primary'}
              loading={action.isPending}
              disabled={action.isPending}
              onPress={() => confirm && void run(confirm)}
            />
            <AppButton title={t('common.back')} variant="ghost" onPress={() => setConfirm(null)} />
          </View>
        }
      />
    </Screen>
  );
}

function ConversationRow({ row, onPress }: { row: SimConversation; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const last = row.lastInboundAt ?? row.lastOutboundAt;
  return (
    <AppPressableCard
      onPress={onPress}
      className="gap-1"
      accessibilityLabel={`${row.lead.name ?? row.destinationMasked ?? ''} ${t(`smsAgent.state.${row.state}` as never)}`}
    >
      <View className="flex-row items-center gap-2">
        <MessageSquare size={16} />
        <AppText variant="title" className="flex-1" numberOfLines={1}>
          {row.lead.name ?? row.destinationMasked ?? '—'}
        </AppText>
        <AppBadge
          size="sm"
          label={tKey(t, `smsAgent.state.${row.state}`, { defaultValue: row.state })}
          variant={STATE_VARIANT[row.state] ?? 'muted'}
        />
      </View>
      <AppText variant="caption" tone="muted">
        {[
          row.destinationMasked,
          row.qualification && row.qualification !== 'none' ? row.qualification : null,
          last ? formatRelative(new Date(last), i18n.language) : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
    </AppPressableCard>
  );
}
