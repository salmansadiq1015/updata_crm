import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { queryKeys } from '@/constants/queryKeys';
import { ApiError } from '@/services/api/apiErrors';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';

import { linkAssistantApi } from '../api';
import { funnelStage, funnelTimeline, type FunnelStage } from '../domain';

const STAGE_VARIANT: Record<FunnelStage, 'primary' | 'success' | 'warning' | 'muted'> = {
  issued: 'muted',
  sent: 'muted',
  delivered: 'muted',
  opened: 'primary',
  started: 'primary',
  completed: 'success',
  opted_out: 'warning',
  closed: 'muted',
};

const display = (value: unknown, yes: string, no: string) =>
  typeof value === 'boolean'
    ? value
      ? yes
      : no
    : Array.isArray(value)
      ? value.join(', ')
      : String(value ?? '');

/** Lead detail: the SMS link assistant conversations for this lead (status and answers). */
export function LeadLinkSessions({ leadId }: { leadId: string }) {
  const { t, i18n } = useTranslation();
  const sessions = useQuery({
    queryKey: queryKeys.linkAssistant.leadSessions(leadId),
    queryFn: ({ signal }) => linkAssistantApi.leadSessions(leadId, signal),
  });
  const contact = useQuery({
    queryKey: queryKeys.linkAssistant.contactStatus(leadId),
    queryFn: ({ signal }) => linkAssistantApi.contactStatus(leadId, signal),
  });
  const qc = useQueryClient();
  const [confirmStop, setConfirmStop] = useState(false);
  const reportStop = useMutation({
    mutationFn: () => linkAssistantApi.reportStop(leadId),
    onSettled: () => {
      setConfirmStop(false);
      void qc.invalidateQueries({ queryKey: queryKeys.linkAssistant.all });
      void qc.invalidateQueries({ queryKey: queryKeys.leads.detail(leadId) });
    },
  });
  const latest = sessions.data?.[0] ?? null;
  const optedOut = contact.data?.optedOut ?? false;
  const detail = useQuery({
    queryKey: queryKeys.linkAssistant.session(latest?.id ?? 'none'),
    queryFn: ({ signal }) => linkAssistantApi.session(latest!.id, signal),
    enabled: Boolean(latest),
  });
  if (sessions.isPending) {
    return (
      <View
        className="gap-1.5"
        accessibilityLabel={t('linkAssistant.title')}
        accessibilityState={{ busy: true }}
      >
        <AppSkeleton className="h-5 w-40" />
        <AppSkeleton className="h-20 w-full rounded-2xl" />
      </View>
    );
  }
  // A server without the SMS link assistant (not deployed yet) answers 404: nothing to show.
  if (sessions.error instanceof ApiError && sessions.error.status === 404) return null;
  if (sessions.isError) {
    return (
      <View className="gap-1.5">
        <SectionHeader title={t('linkAssistant.title')} size="group" />
        <AppAlert tone="destructive" message={t('linkAssistant.loadError')} />
        <AppButton
          title={t('common.retry')}
          variant="outline"
          size="sm"
          loading={sessions.isFetching}
          onPress={() => void sessions.refetch()}
        />
      </View>
    );
  }
  if (!latest && !optedOut) return null;
  const stage = latest ? funnelStage(latest) : 'opted_out';
  const timeline = latest ? funnelTimeline(latest) : [];

  return (
    <View className="gap-1.5">
      <SectionHeader
        title={t('linkAssistant.title')}
        size="group"
        right={
          <AppBadge label={t(`linkAssistant.stage.${stage}`)} variant={STAGE_VARIANT[stage]} size="sm" />
        }
      />
      {optedOut ? (
        <AppAlert
          tone="warning"
          message={t('linkAssistant.optedOut', {
            source: t(`linkAssistant.optOutSource.${contact.data?.lastOptOut?.source ?? 'other'}` as never),
            date: contact.data?.lastOptOut
              ? (formatDate(contact.data.lastOptOut.at, i18n.language) ?? '')
              : '',
          })}
        />
      ) : (
        <AppButton
          title={t('linkAssistant.reportStop')}
          variant="outline"
          size="sm"
          onPress={() => setConfirmStop(true)}
        />
      )}
      <ConfirmDialog
        visible={confirmStop}
        title={t('linkAssistant.reportStopTitle')}
        description={t('linkAssistant.reportStopBody')}
        confirmLabel={t('linkAssistant.reportStopConfirm')}
        destructive
        loading={reportStop.isPending}
        onConfirm={() => reportStop.mutate()}
        onCancel={() => setConfirmStop(false)}
      />
      {latest ? (
        <AppCard variant="outline" className="gap-2 py-2.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppText variant="caption" tone="muted" className="min-w-0 flex-1">
              {[
                detail.data?.campaignName,
                latest.lastActivityAt ? formatDate(latest.lastActivityAt, i18n.language) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
            {detail.data?.reviewRequired ? (
              <AppBadge label={t('linkAssistant.review')} variant="warning" size="sm" />
            ) : null}
          </View>
          {/* Only steps the CRM recorded are marked; "delivered" needs a carrier report. */}
          <View accessibilityLabel={t('linkAssistant.timelineLabel')} className="gap-1">
            {timeline.map((step) => {
              const when = step.reached
                ? step.at
                  ? (formatDate(step.at, i18n.language) ?? '')
                  : ''
                : t('linkAssistant.notYet');
              const label = t(`linkAssistant.stage.${step.key}`);
              return (
                <View
                  key={step.key}
                  accessible
                  accessibilityLabel={when ? `${label}: ${when}` : label}
                  testID={`link-step-${step.key}`}
                  className="min-h-6 flex-row items-center gap-2"
                >
                  <View
                    className={cn(
                      'h-2.5 w-2.5 rounded-full',
                      step.reached
                        ? step.key === 'opted_out'
                          ? 'bg-warning'
                          : step.key === 'closed'
                            ? 'bg-muted-foreground'
                            : 'bg-primary'
                        : 'border border-muted-foreground',
                    )}
                  />
                  <AppText variant="caption" tone={step.reached ? 'default' : 'muted'} className="flex-1">
                    {label}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {when}
                  </AppText>
                </View>
              );
            })}
          </View>
          {(detail.data?.answers ?? [])
            .filter((answer) => (answer.value !== null && answer.value !== undefined) || answer.unknown)
            .map((answer, index) => (
              <View
                key={answer.fieldKey}
                className={cn('gap-0.5 pt-2', index > 0 && 'border-t border-border')}
              >
                <AppText variant="caption" tone="muted">
                  {answer.label}
                  {answer.confirmed ? ` · ${t('linkAssistant.confirmed')}` : ''}
                </AppText>
                <AppText
                  tone={answer.unknown ? 'muted' : 'default'}
                  className={answer.unknown ? 'italic' : 'font-geist-medium'}
                >
                  {answer.unknown
                    ? t('linkAssistant.unknown')
                    : display(answer.value, t('linkAssistant.yes'), t('linkAssistant.no'))}
                </AppText>
              </View>
            ))}
          {detail.data &&
          !detail.data.answers.some((a) => (a.value !== null && a.value !== undefined) || a.unknown) ? (
            <AppText tone="muted">{t('linkAssistant.noAnswers')}</AppText>
          ) : null}
        </AppCard>
      ) : null}
    </View>
  );
}
