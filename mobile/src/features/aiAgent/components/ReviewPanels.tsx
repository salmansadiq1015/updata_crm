import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { tKey } from '@/features/communication/i18n';
import { useTheme } from '@/theme/ThemeProvider';

import { reasonCounts, type SegmentEstimate } from '../domain/agentDomain';
import type { CallPreview, SmsRecipient } from '../types';

export function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="min-w-[30%] flex-1 gap-0.5 rounded-xl bg-muted/70 px-3 py-2.5">
      <AppText variant="h3" style={{ fontVariant: ['tabular-nums'] }}>
        {String(value)}
      </AppText>
      <AppText variant="caption" tone="muted" numberOfLines={2}>
        {label}
      </AppText>
    </View>
  );
}

export function Loading({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      className="flex-row items-center gap-3 py-4"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <ActivityIndicator color={colors.primary} />
      <AppText tone="muted">{label}</AppText>
    </View>
  );
}

/** Excluded-lead reasons exactly as the server recorded them. */
export function ReasonList({
  rows,
}: {
  rows: readonly { eligibility: { eligible: boolean; reasons: string[] } }[];
}) {
  const { t } = useTranslation();
  const counts = reasonCounts(rows);
  if (counts.length === 0) return null;
  return (
    <View className="gap-1">
      <AppText variant="label">{t('aiAgent.review.reasonsTitle')}</AppText>
      {counts.map(([reason, count]) => (
        <AppText key={reason} tone="muted">
          {`${tKey(t, `aiAgent.reason.${reason}`, { defaultValue: reason })} · ${count}`}
        </AppText>
      ))}
    </View>
  );
}

type CallReviewProps = {
  preview: {
    data?: CallPreview;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    refetch: () => unknown;
    isRefetching: boolean;
  };
  recipients: readonly { eligibility: { eligible: boolean; reasons: string[] } }[];
};

/** Server preview of the draft (POST /ai-calling/campaigns/:id/preview). */
export function CallReviewPanel({ preview, recipients }: CallReviewProps) {
  const { t } = useTranslation();
  if (preview.isPending) return <Loading label={t('aiAgent.review.creating')} />;
  if (preview.isError) {
    return (
      <AppErrorState
        error={preview.error}
        retrying={preview.isRefetching}
        onRetry={() => void preview.refetch()}
      />
    );
  }
  const data = preview.data!;
  const excluded = Math.max(0, data.totalSelected - data.eligible);
  return (
    <AppCard className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        <Stat label={t('aiAgent.review.selected')} value={data.totalSelected} />
        <Stat label={t('aiAgent.review.eligible')} value={data.eligible} />
        <Stat label={t('aiAgent.review.ineligible')} value={excluded} />
      </View>
      <ReasonList rows={recipients} />
      {data.eligible > 0 ? (
        <AppText tone="muted">
          {t('aiAgent.review.estimatedDuration', { minutes: data.estimatedDurationMinutes })}
        </AppText>
      ) : (
        <AppAlert tone="warning" message={t('aiAgent.review.nothingEligible')} />
      )}
      <AppText variant="caption" tone="muted">
        {t('aiAgent.review.costNote')}
      </AppText>
    </AppCard>
  );
}

type SmsReviewProps = {
  summary: { total: number; eligible: number };
  recipients: readonly SmsRecipient[];
  segments: SegmentEstimate;
};

/** Server-rendered per-lead text and eligibility from the draft snapshot. */
export function SmsReviewPanel({ summary, recipients, segments }: SmsReviewProps) {
  const { t } = useTranslation();
  const samples = recipients.filter((recipient) => recipient.eligibility.eligible).slice(0, 3);
  const excluded = Math.max(0, summary.total - summary.eligible);
  return (
    <>
      <AppCard className="gap-3">
        <View className="flex-row flex-wrap gap-2">
          <Stat label={t('aiAgent.review.selected')} value={summary.total} />
          <Stat label={t('aiAgent.review.eligible')} value={summary.eligible} />
          <Stat label={t('aiAgent.review.ineligible')} value={excluded} />
        </View>
        <ReasonList rows={recipients} />
        {summary.eligible > 0 ? (
          <AppText>
            {segments.exact
              ? t('aiAgent.review.estimatedSegments', { count: segments.segments })
              : t('aiAgent.review.estimatedSegmentsPartial', {
                  count: segments.segments,
                  sampled: segments.sampled,
                })}
          </AppText>
        ) : (
          <AppAlert tone="warning" message={t('aiAgent.review.nothingEligible')} />
        )}
      </AppCard>
      <AppCard className="gap-3">
        <AppText variant="title">{t('aiAgent.review.previewTitle')}</AppText>
        {samples.length === 0 ? <AppText tone="muted">{t('aiAgent.review.previewEmpty')}</AppText> : null}
        {samples.map((recipient) => (
          <View key={recipient.id} className="gap-1 rounded-lg bg-muted p-3">
            <AppText variant="caption" tone="muted">
              {t('aiAgent.review.previewFor', {
                name: recipient.lead.name ?? t('aiAgent.detail.unknownLead'),
              })}
            </AppText>
            <AppText selectable>{recipient.rendered.bodyText ?? ''}</AppText>
          </View>
        ))}
      </AppCard>
    </>
  );
}
