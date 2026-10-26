import { Bot, CalendarClock, Clock3, HelpCircle, ListChecks, PhoneCall, UserRound } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppListGroup, AppListItem } from '@/components/ui/AppListItem';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { formatElapsed } from '@/features/communication/domain/callEvidence';
import { isLeadId } from '@/features/leads/hooks/useLeads';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatDateTime } from '@/utils/date';

import { RecipientStateBadge } from '../components/StatusBadges';
import { useAiCall, useReconcileCall } from '../hooks/useAiAgent';
import { needsReconcile, RECONCILE_RESOLUTIONS, type CallRecord, type ReconcileResolution } from '../types';

export function AiCallDetailScreen({ route, navigation }: RootScreenProps<'AiCallDetail'>) {
  const { t, i18n } = useTranslation();
  const query = useAiCall(route.params.callId);

  if (query.isPending) {
    return (
      <Screen edges={['bottom']} contentClassName="gap-3 pt-3">
        <AppSkeleton className="h-32 w-full rounded-3xl" />
        <AppSkeleton className="h-44 w-full rounded-2xl" />
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <Screen edges={['bottom']} contentClassName="pt-3">
        <AppErrorState
          error={query.error}
          retrying={query.isRefetching}
          onRetry={() => void query.refetch()}
        />
      </Screen>
    );
  }

  const call = query.data;
  const outcome = call.disposition
    ? t(`aiAgent.callHistory.disposition.${call.disposition as 'failed'}`, { defaultValue: call.disposition })
    : t('common.notSet');
  const qualification = call.qualification
    ? t(`aiAgent.qualification.${call.qualification as 'none'}`, { defaultValue: call.qualification })
    : t('common.notSet');

  return (
    <Screen
      edges={['bottom']}
      refreshing={query.isRefetching}
      onRefresh={() => void query.refetch()}
      contentClassName="gap-4 pt-3"
    >
      <AppCard className="gap-3">
        <View className="flex-row items-start gap-3">
          <View className="flex-1 gap-1">
            <AppText variant="overline" tone="primary">
              {t('aiAgent.callHistory.persistedResult')}
            </AppText>
            <AppText variant="h2" numberOfLines={2}>
              {call.campaign.name ?? t('aiAgent.callHistory.unknownCampaign')}
            </AppText>
          </View>
          <RecipientStateBadge kind="call" state={call.state} />
        </View>
        {isLeadId(call.lead.id) ? (
          <AppButton
            title={call.lead.name ?? call.lead.leadNumber ?? t('aiAgent.detail.unknownLead')}
            leftIcon={UserRound}
            variant="soft"
            onPress={() => navigation.navigate('LeadDetail', { leadId: call.lead.id })}
          />
        ) : null}
      </AppCard>

      {needsReconcile(call) ? (
        <ReconcileCard call={call} />
      ) : call.reviewRequired ? (
        <AppAlert tone="warning" message={t('aiAgent.callHistory.reviewRequired')} />
      ) : null}
      {call.failureCode || call.failureMessage ? (
        <AppAlert
          tone="destructive"
          title={call.failureCode ?? t('aiAgent.callHistory.failure')}
          message={call.failureMessage ?? t('aiAgent.callHistory.failure')}
        />
      ) : null}

      <AppListGroup title={t('aiAgent.callHistory.result')}>
        <AppListItem
          icon={PhoneCall}
          layout="inline"
          label={t('aiAgent.callHistory.outcome')}
          value={outcome}
        />
        <AppListItem
          icon={ListChecks}
          layout="inline"
          label={t('aiAgent.callHistory.qualification')}
          value={qualification}
        />
        <AppListItem
          icon={Clock3}
          layout="inline"
          label={t('aiAgent.callHistory.duration')}
          value={formatElapsed(call.durationSeconds * 1000)}
        />
        <AppListItem
          icon={CalendarClock}
          layout="inline"
          label={t('aiAgent.callHistory.started')}
          value={formatDateTime(call.initiatedAt ?? call.createdAt, i18n.language) ?? t('common.notSet')}
        />
      </AppListGroup>

      <View className="gap-1.5">
        <AppText variant="overline" tone="muted" accessibilityRole="header" className="px-1">
          {t('aiAgent.callHistory.answers')}
        </AppText>
        {call.answers.length === 0 ? (
          <AppCard variant="outline">
            <AppText tone="muted">{t('aiAgent.callHistory.noAnswers')}</AppText>
          </AppCard>
        ) : (
          call.answers.map((answer) => (
            <AppCard key={answer.questionFieldKey} variant="outline" className="gap-1.5 py-3">
              <AppText variant="label">{answer.label ?? answer.questionFieldKey}</AppText>
              <AppText selectable>{displayValue(answer.normalizedValue ?? answer.rawAnswer)}</AppText>
              <AppText variant="caption" tone="muted">
                {t('aiAgent.callHistory.aiAnswer', {
                  validation: answer.validation ?? t('common.notSet'),
                })}
              </AppText>
            </AppCard>
          ))
        )}
      </View>

      {call.recordingRef || call.transcriptRef ? (
        <AppAlert tone="info" message={t('aiAgent.callHistory.mediaUnavailable')} />
      ) : null}
      <AppCard variant="outline" className="flex-row items-start gap-3 py-3">
        <Icon icon={Bot} size="md" color="primary" />
        <AppText variant="caption" tone="muted" className="flex-1">
          {t('aiAgent.callHistory.aiDisclaimer')}
        </AppText>
      </AppCard>
    </Screen>
  );
}

const RESOLUTION_TEXT = {
  reached: { label: 'aiAgent.reconcile.reached', hint: 'aiAgent.reconcile.reachedHint' },
  not_reached: { label: 'aiAgent.reconcile.notReached', hint: 'aiAgent.reconcile.notReachedHint' },
  retry: { label: 'aiAgent.reconcile.retry', hint: 'aiAgent.reconcile.retryHint' },
} as const satisfies Record<ReconcileResolution, { label: string; hint: string }>;

/**
 * A call whose outcome is unknown (the phone or the gateway lost track of it). It is never
 * redialed on its own: the owner checks the phone's call log and records what happened.
 */
function ReconcileCard({ call }: { call: CallRecord }) {
  const { t } = useTranslation();
  const reconcile = useReconcileCall(call.id);
  const [choice, setChoice] = useState<ReconcileResolution | null>(null);
  return (
    <AppCard className="gap-3">
      <View className="flex-row items-center gap-2">
        <Icon icon={HelpCircle} size="md" color="warning" />
        <AppText variant="h3" accessibilityRole="header">
          {t('aiAgent.reconcile.title')}
        </AppText>
      </View>
      <AppText tone="muted">{t('aiAgent.reconcile.body')}</AppText>
      {RECONCILE_RESOLUTIONS.map((resolution) => (
        <View key={resolution} className="gap-1">
          <AppButton
            title={t(RESOLUTION_TEXT[resolution].label)}
            variant={resolution === 'reached' ? 'primary' : 'outline'}
            disabled={reconcile.isPending}
            onPress={() => setChoice(resolution)}
            fullWidth
          />
          <AppText variant="caption" tone="muted">
            {t(RESOLUTION_TEXT[resolution].hint)}
          </AppText>
        </View>
      ))}
      <ConfirmDialog
        visible={choice !== null}
        title={t('aiAgent.reconcile.confirmTitle')}
        description={choice ? `${t(RESOLUTION_TEXT[choice].label)}. ${t('aiAgent.reconcile.confirmBody')}` : ''}
        confirmLabel={t('aiAgent.reconcile.confirm')}
        loading={reconcile.isPending}
        onCancel={() => setChoice(null)}
        onConfirm={() => {
          if (!choice) return;
          reconcile.mutate(choice, { onSettled: () => setChoice(null) });
        }}
      />
    </AppCard>
  );
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return '—';
  }
}
