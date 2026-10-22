import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { queryKeys } from '@/constants/queryKeys';
import { cn } from '@/utils/cn';
import { formatDate } from '@/utils/date';

import { linkAssistantApi } from '../api';
import { funnelStage, type FunnelStage } from '../domain';

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
  const latest = sessions.data?.[0] ?? null;
  const detail = useQuery({
    queryKey: queryKeys.linkAssistant.session(latest?.id ?? 'none'),
    queryFn: ({ signal }) => linkAssistantApi.session(latest!.id, signal),
    enabled: Boolean(latest),
  });
  if (!latest) return null;
  const stage = funnelStage(latest);

  return (
    <View className="gap-1.5">
      <SectionHeader
        title={t('linkAssistant.title')}
        size="group"
        right={
          <AppBadge label={t(`linkAssistant.stage.${stage}`)} variant={STAGE_VARIANT[stage]} size="sm" />
        }
      />
      <AppCard variant="outline" className="gap-2 py-2.5">
        <AppText variant="caption" tone="muted">
          {[
            detail.data?.campaignName,
            latest.lastActivityAt ? formatDate(latest.lastActivityAt, i18n.language) : null,
            detail.data?.reviewRequired ? t('linkAssistant.review') : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </AppText>
        {(detail.data?.answers ?? [])
          .filter((answer) => (answer.value !== null && answer.value !== undefined) || answer.unknown)
          .map((answer, index) => (
            <View key={answer.fieldKey} className={cn('gap-0.5 pt-2', index > 0 && 'border-t border-border')}>
              <AppText variant="caption" tone="muted">
                {answer.label}
                {answer.confirmed ? ` · ${t('linkAssistant.confirmed')}` : ''}
              </AppText>
              <AppText className="font-geist-medium">
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
    </View>
  );
}
