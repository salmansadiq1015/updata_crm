import { CalendarClock, CheckCircle2, ListChecks, PhoneCall, SkipForward } from 'lucide-react-native';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { IconContainer, type IconContainerTone } from '@/components/ui/IconContainer';
import { tKey } from '@/features/communication/i18n';

import { summarize, type CallQueue, type QueueItem } from '../domain/queue';
import { itemResultLabel } from './labels';

/** Colour by meaning: a completed call is not automatically good news. */
const OUTCOME_VARIANT: Record<string, BadgeVariant> = {
  interested: 'success',
  callback_requested: 'info',
  human_follow_up: 'info',
  no_answer: 'warning',
  busy: 'warning',
  voicemail: 'warning',
  unknown: 'muted',
  not_interested: 'muted',
  wrong_number: 'destructive',
  do_not_contact: 'destructive',
};

function itemVariant(item: QueueItem): BadgeVariant {
  if (item.state === 'done' && item.disposition) return OUTCOME_VARIANT[item.disposition] ?? 'muted';
  return BADGE[item.state];
}

const BADGE: Record<QueueItem['state'], BadgeVariant> = {
  done: 'success',
  skipped: 'muted',
  failed: 'destructive',
  pending: 'outline',
  current: 'outline',
};

/** End of a queue: totals per outcome, callbacks, answers collected, every lead's result. */
export function QueueSummaryView({ queue, onDone }: { queue: CallQueue; onDone: () => void }) {
  const { t } = useTranslation();
  const summary = useMemo(() => summarize(queue), [queue]);

  return (
    <>
      <Appear>
        <GradientSurface className="gap-3 rounded-3xl p-5">
          <View className="flex-row items-center gap-3">
            <IconContainer icon={CheckCircle2} tone="inverse" size="lg" round />
            <View className="flex-1">
              <AppText variant="overline" className="text-white/70">
                {t('callQueue.title')}
              </AppText>
              <AppText variant="h2" className="text-white">
                {queue.endedAt && summary.notCalled > 0
                  ? t('callQueue.summary.ended')
                  : t('callQueue.summary.title')}
              </AppText>
              <AppText variant="caption" className="text-white/75">
                {t('callQueue.summary.subtitle', { called: summary.called, total: summary.total })}
              </AppText>
            </View>
          </View>
        </GradientSurface>
      </Appear>

      <Appear index={1}>
        <View className="flex-row flex-wrap gap-2">
          <Stat
            icon={PhoneCall}
            tone="success"
            label={t('callQueue.summary.called')}
            value={summary.called}
          />
          <Stat
            icon={SkipForward}
            tone="muted"
            label={t('callQueue.summary.skipped')}
            value={summary.skipped + summary.failed + summary.notCalled}
          />
          <Stat
            icon={CalendarClock}
            tone="info"
            label={t('callQueue.summary.callbacks')}
            value={summary.callbacks}
          />
          <Stat
            icon={ListChecks}
            tone="primary"
            label={t('callQueue.summary.answers')}
            value={summary.answers}
          />
        </View>
      </Appear>

      <Appear index={2}>
        <AppCard className="gap-2">
          <SectionHeader title={t('callQueue.summary.outcomes')} />
          {summary.byDisposition.length === 0 ? (
            <AppText tone="muted">{t('callQueue.summary.noOutcomes')}</AppText>
          ) : (
            summary.byDisposition.map(({ disposition, count }) => (
              <View key={disposition} className="min-h-9 flex-row items-center gap-2">
                <AppText className="flex-1">
                  {tKey(t, `communication.disposition.${disposition}`, { defaultValue: disposition })}
                </AppText>
                <AppText variant="title" className="tabular-nums">
                  {count}
                </AppText>
              </View>
            ))
          )}
        </AppCard>
      </Appear>

      <Appear index={3}>
        <AppCard className="gap-1">
          <SectionHeader title={t('callQueue.summary.leads')} />
          {queue.items.map((item) => (
            <View
              key={item.leadId}
              accessible
              accessibilityLabel={`${item.leadName}: ${itemResultLabel(t, item)}`}
              className="min-h-11 flex-row items-center gap-2 border-t border-border py-2"
            >
              <AppText variant="label" className="flex-1" numberOfLines={1}>
                {item.leadName}
              </AppText>
              <AppBadge size="sm" variant={itemVariant(item)} label={itemResultLabel(t, item)} />
            </View>
          ))}
        </AppCard>
      </Appear>

      <AppButton title={t('callQueue.summary.done')} size="lg" onPress={onDone} fullWidth />
    </>
  );
}

function Stat({
  icon,
  tone,
  label,
  value,
}: {
  icon: typeof PhoneCall;
  tone: IconContainerTone;
  label: string;
  value: number;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      className="min-w-[46%] flex-1 flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3"
    >
      <IconContainer icon={icon} tone={tone} size="sm" />
      <View className="flex-1">
        <AppText variant="h3" className="tabular-nums">
          {value}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </View>
  );
}
