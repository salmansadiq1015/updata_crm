import { Pause, Play, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { tKey } from '@/features/communication/i18n';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { showSuccessToast } from '@/utils/toast';

import { ReadinessNotice } from '../components/ReadinessNotice';
import { Loading, ReasonList, Stat } from '../components/ReviewPanels';
import { StartConfirmSheet } from '../components/StartConfirmSheet';
import { CampaignStatusBadge, RecipientStateBadge } from '../components/StatusBadges';
import { TestConversation } from '../components/TestConversation';
import {
  availableActions,
  callReadiness,
  canStart,
  estimateSegments,
  smsReadiness,
  type CampaignAction,
} from '../domain/agentDomain';
import {
  useCallCampaign,
  useCallRecipients,
  useCampaignAction,
  useMessagingHealth,
  useSmsCampaign,
  useSmsRecipients,
  useStartCampaign,
  useTelephonyHealth,
} from '../hooks/useAiAgent';
import { ACTIVE_CAMPAIGN_STATUSES, type CallCampaign, type SmsCampaign } from '../types';

const CALL_STATS = [
  'total',
  'eligible',
  'queued',
  'inProgress',
  'completed',
  'answered',
  'noAnswer',
  'failed',
  'qualified',
  'needsReview',
  'callbacks',
  'doNotContact',
] as const;
const SMS_STATS = [
  'total',
  'eligible',
  'queued',
  'accepted',
  'sent',
  'delivered',
  'failed',
  'unknown',
  'suppressed',
  'ineligible',
] as const;

export function AiAgentCampaignDetailScreen({ route }: RootScreenProps<'AiAgentCampaignDetail'>) {
  const { kind, campaignId } = route.params;
  const { t } = useTranslation();

  const call = useCallCampaign(campaignId, kind === 'call');
  const sms = useSmsCampaign(campaignId, kind === 'sms');
  const campaignQuery = kind === 'call' ? call : sms;
  const campaign: CallCampaign | SmsCampaign | undefined = campaignQuery.data;
  const status = campaign?.status;

  const callRecipients = useCallRecipients(campaignId, status, kind === 'call');
  const smsRecipients = useSmsRecipients(campaignId, status, kind === 'sms');
  const recipients = kind === 'call' ? callRecipients : smsRecipients;

  const needsReadiness = status === 'draft' || status === 'paused';
  const telephony = useTelephonyHealth(kind === 'call' && needsReadiness);
  const messaging = useMessagingHealth(kind === 'sms' && needsReadiness);
  const readiness = kind === 'call' ? callReadiness(telephony) : smsReadiness(messaging);

  const action = useCampaignAction();
  const start = useStartCampaign();
  const [confirmingStart, setConfirmingStart] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const run = useSingleFlight(async (next: CampaignAction) => {
    await action.mutateAsync({ kind, id: campaignId, action: next });
    setConfirmingCancel(false);
    setConfirmingStart(false);
  });
  const startDraft = useSingleFlight(async () => {
    await start.mutateAsync({ kind, id: campaignId });
    setConfirmingStart(false);
    showSuccessToast(t('aiAgent.confirm.started'));
  });

  if (campaignQuery.isPending) {
    return (
      <Screen edges={['bottom']} contentClassName="pt-4">
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }
  if (campaignQuery.isError || !campaign) {
    return (
      <Screen edges={['bottom']} contentClassName="pt-4">
        <AppErrorState
          error={campaignQuery.error}
          retrying={campaignQuery.isRefetching}
          onRetry={() => void campaignQuery.refetch()}
        />
      </Screen>
    );
  }

  const summary = campaign.summary as Record<string, number | undefined>;
  const eligible = summary.eligible ?? 0;
  const total = summary.total ?? 0;
  const actions = availableActions(campaign.status);
  const active = ACTIVE_CAMPAIGN_STATUSES.includes(campaign.status);
  const smsItems = smsRecipients.data?.items ?? [];
  // Resuming contacts only the leads not handled yet; a draft contacts every eligible lead.
  const paused = campaign.status === 'paused';
  const toContact = paused ? (kind === 'sms' ? (summary.draft ?? 0) : (summary.queued ?? 0)) : eligible;
  const segments = estimateSegments(
    paused ? smsItems.filter((recipient) => recipient.status === 'draft') : smsItems,
    toContact,
  );
  const startable = canStart(kind, readiness, toContact);
  const smsProgress = kind === 'sms' ? (campaign as SmsCampaign).monitoring.progress : null;
  const stats = kind === 'call' ? CALL_STATS : SMS_STATS;

  return (
    <Screen
      edges={['bottom']}
      contentClassName="gap-4 pt-4"
      refreshing={campaignQuery.isRefetching}
      onRefresh={() => {
        void campaignQuery.refetch();
        void recipients.refetch();
      }}
    >
      <AppCard className="gap-3">
        <View className="flex-row items-start gap-2">
          <AppText variant="h3" className="flex-1">
            {campaign.name}
          </AppText>
          <CampaignStatusBadge status={campaign.status} />
        </View>
        {kind === 'call' ? (
          <AppText variant="caption" tone="muted">
            {t('aiAgent.detail.cloudNote')}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="muted">
          {t('aiAgent.detail.serverTruth')}
        </AppText>
        {active ? (
          <AppText variant="caption" tone="muted" accessibilityLiveRegion="polite">
            {t('aiAgent.detail.polling')}
          </AppText>
        ) : null}
      </AppCard>

      <AppCard className="gap-3">
        <AppText variant="title">{t('aiAgent.detail.progress')}</AppText>
        {smsProgress ? (
          <AppText accessibilityLiveRegion="polite">
            {t('aiAgent.detail.percent', { percent: smsProgress.percent })}
          </AppText>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          {stats.map((key) => (
            <Stat key={key} label={t(`aiAgent.detail.stats.${key}`)} value={summary[key] ?? 0} />
          ))}
        </View>
      </AppCard>

      {needsReadiness ? <ReadinessNotice channel={kind} readiness={readiness} /> : null}

      <View className="flex-row flex-wrap gap-2">
        {campaign.status === 'draft' ? (
          <AppButton
            title={t('aiAgent.detail.startDraft')}
            leftIcon={Play}
            disabled={!startable}
            onPress={() => setConfirmingStart(true)}
          />
        ) : null}
        {actions.includes('pause') ? (
          <AppButton
            title={t('aiAgent.detail.pause')}
            leftIcon={Pause}
            variant="outline"
            loading={action.isPending && action.variables?.action === 'pause'}
            onPress={() => run('pause')}
          />
        ) : null}
        {actions.includes('resume') ? (
          <AppButton
            title={t('aiAgent.detail.resume')}
            leftIcon={Play}
            disabled={!startable}
            onPress={() => setConfirmingStart(true)}
          />
        ) : null}
        {actions.includes('cancel') ? (
          <AppButton
            title={t('aiAgent.detail.cancel')}
            leftIcon={XCircle}
            variant="ghost"
            onPress={() => setConfirmingCancel(true)}
          />
        ) : null}
      </View>

      {kind === 'call' ? <TestConversation campaignId={campaignId} /> : null}

      <AppCard className="gap-3">
        <AppText variant="title">{t('aiAgent.detail.recipients')}</AppText>
        {recipients.isPending ? (
          <Loading label={t('common.loading')} />
        ) : recipients.isError ? (
          <AppErrorState error={recipients.error} onRetry={() => void recipients.refetch()} />
        ) : (
          <>
            {recipients.data.total > recipients.data.items.length ? (
              <AppText variant="caption" tone="muted">
                {t('aiAgent.detail.recipientsShown', {
                  shown: recipients.data.items.length,
                  total: recipients.data.total,
                })}
              </AppText>
            ) : null}
            {recipients.data.items.length === 0 ? (
              <AppText tone="muted">{t('aiAgent.detail.noRecipients')}</AppText>
            ) : null}
            <ReasonList rows={recipients.data.items} />
            {kind === 'call'
              ? (callRecipients.data?.items ?? []).map((recipient) => (
                  <View key={recipient.id} className="gap-1 border-t border-border pt-2">
                    <View className="flex-row items-center gap-2">
                      <AppText className="flex-1" numberOfLines={1}>
                        {recipient.lead.name ?? recipient.lead.leadNumber ?? t('aiAgent.detail.unknownLead')}
                      </AppText>
                      <RecipientStateBadge kind="call" state={recipient.state} />
                    </View>
                    {recipient.attemptCount > 0 ? (
                      <AppText variant="caption" tone="muted">
                        {t('aiAgent.detail.attempts', { count: recipient.attemptCount })}
                        {recipient.qualification
                          ? ` · ${tKey(t, `aiAgent.qualification.${recipient.qualification}`, {
                              defaultValue: recipient.qualification,
                            })}`
                          : ''}
                      </AppText>
                    ) : null}
                  </View>
                ))
              : smsItems.map((recipient) => (
                  <View key={recipient.id} className="gap-1 border-t border-border pt-2">
                    <View className="flex-row items-center gap-2">
                      <AppText className="flex-1" numberOfLines={1}>
                        {recipient.lead.name ?? recipient.lead.leadNumber ?? t('aiAgent.detail.unknownLead')}
                      </AppText>
                      <RecipientStateBadge kind="sms" state={recipient.status} />
                    </View>
                    {recipient.error?.message ? (
                      <AppText variant="caption" tone="destructive">
                        {t('aiAgent.detail.lastError', { message: recipient.error.message })}
                      </AppText>
                    ) : null}
                  </View>
                ))}
          </>
        )}
      </AppCard>

      {campaign.status === 'failed' ? (
        <AppAlert tone="destructive" message={t('aiAgent.status.failed')} />
      ) : null}

      <StartConfirmSheet
        key={String(confirmingStart)}
        visible={confirmingStart}
        channel={kind}
        eligible={toContact}
        excluded={paused ? 0 : Math.max(0, total - eligible)}
        segments={kind === 'sms' ? segments : null}
        starting={start.isPending || action.isPending}
        onConfirm={() => (paused ? run('resume') : startDraft())}
        onCancel={() => setConfirmingStart(false)}
      />
      <ConfirmDialog
        visible={confirmingCancel}
        title={t('aiAgent.detail.cancelTitle')}
        description={t('aiAgent.detail.cancelBody')}
        confirmLabel={t('aiAgent.detail.cancel')}
        destructive
        loading={action.isPending}
        onConfirm={() => run('cancel')}
        onCancel={() => setConfirmingCancel(false)}
      />
    </Screen>
  );
}
