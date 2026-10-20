import { Bot, CalendarClock, Clock3, ListChecks, PhoneCall, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
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
import { useAiCall } from '../hooks/useAiAgent';

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

      {call.reviewRequired ? (
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
