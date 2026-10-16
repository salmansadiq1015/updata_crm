import { useFocusEffect } from '@react-navigation/native';
import {
  ClipboardPen,
  ListOrdered,
  Pause,
  Phone,
  Play,
  SkipForward,
  Sparkles,
  Square,
  Users,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Appear } from '@/components/motion/Appear';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppEmptyState } from '@/components/ui/AppEmptyState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { GradientSurface } from '@/components/ui/GradientSurface';
import { IconContainer } from '@/components/ui/IconContainer';
import { useOperationsStore } from '@/features/communication/store/operationsStore';
import type { RootScreenProps } from '@/navigation/navigationTypes';

import { skipReasonLabel } from '../components/labels';
import { QueueSummaryView } from '../components/QueueSummaryView';
import {
  endQueue,
  markCallRequested,
  markIneligible,
  nextStep,
  pendingItems,
  progress as queueProgress,
  setPaused,
  skipItem,
  type CallQueue,
  type QueueItem,
  type QueueStep,
} from '../domain/queue';
import { syncCallQueue } from '../hooks/useCallQueueRuntime';
import { useQueueEligibility } from '../hooks/useCallQueue';
import { useCallQueueStore } from '../store/callQueueStore';

const UP_NEXT_SHOWN = 5;

/**
 * SIM call queue: the user calls the chosen leads one after another from their own SIM.
 * Nothing here dials. "Call" opens the call screen, which waits for the user's own
 * "Start call"; the next lead becomes current only after the previous outcome is saved
 * (or the lead is skipped).
 */
export function CallQueueScreen({ navigation }: RootScreenProps<'CallQueue'>) {
  const { t } = useTranslation();
  const loaded = useCallQueueStore((state) => state.loaded);
  const queue = useCallQueueStore((state) => state.queue);
  const operations = useOperationsStore((state) => state.operations);

  useFocusEffect(
    useCallback(() => {
      syncCallQueue();
    }, []),
  );

  const step = nextStep(queue, operations);

  const close = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main', { screen: 'Leads' });
  };

  let content;
  if (!loaded) {
    content = <AppSkeleton className="h-40 w-full rounded-3xl" />;
  } else if (!queue || step.kind === 'empty') {
    content = (
      <AppEmptyState
        icon={ListOrdered}
        title={t('callQueue.empty.title')}
        description={t('callQueue.empty.body')}
        action={
          <AppButton
            title={t('callQueue.empty.action')}
            leftIcon={Users}
            onPress={() => navigation.replace('CallAgentLeadPicker', { purpose: 'queue' })}
          />
        }
      />
    );
  } else if (step.kind === 'finished') {
    content = (
      <QueueSummaryView
        queue={queue}
        onDone={() => {
          useCallQueueStore.getState().clear();
          close();
        }}
      />
    );
  } else {
    content = <ActiveQueue queue={queue} step={step} navigation={navigation} />;
  }

  return (
    <Screen edges={[]} contentClassName="gap-4 pt-3 pb-10">
      {content}
    </Screen>
  );
}

function ActiveQueue({
  queue,
  step,
  navigation,
}: {
  queue: CallQueue;
  step: Exclude<QueueStep, { kind: 'empty' | 'finished' }>;
  navigation: RootScreenProps<'CallQueue'>['navigation'];
}) {
  const { t } = useTranslation();
  const change = useCallQueueStore((state) => state.change);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const item: QueueItem | null = step.item;
  const openCall = step.kind === 'record_outcome';
  const eligibility = useQueueEligibility(item?.leadId ?? null, Boolean(item) && !openCall);
  const p = queueProgress(queue);
  const upNext = pendingItems(queue);

  // A lead that cannot be called (no number, do-not-call, invalid) is skipped with the
  // CRM's reason. Only for the current item without an open call.
  const verdict = eligibility.data;
  const leadId = item?.leadId;
  useEffect(() => {
    if (!leadId || openCall || !verdict || verdict.eligible) return;
    const target = useCallQueueStore.getState().queue?.items.find((entry) => entry.leadId === leadId);
    if (target?.state !== 'current' || target.operationId) return;
    change((current) => markIneligible(current, leadId, verdict.reasons));
  }, [leadId, openCall, verdict, change]);
  // Leads skipped by the CRM's check stay visible with their reason.
  const autoSkipped = queue.items.filter(
    (entry) => entry.state === 'skipped' && entry.skipReason !== 'user' && entry.skipReason !== 'ended',
  );

  const call = () => {
    if (!item || step.kind !== 'call' || !verdict?.eligible) return;
    change((current) => markCallRequested(current, item.leadId, Date.now()));
    navigation.navigate('CallSession', {
      leadId: item.leadId,
      queueId: queue.id,
      destinationField: verdict.field ?? undefined,
    });
  };

  const recordOutcome = () => {
    if (step.kind !== 'record_outcome') return;
    navigation.navigate('CallSession', {
      leadId: step.item.leadId,
      operationId: step.operationId,
      queueId: queue.id,
    });
  };

  const checking = !openCall && (eligibility.isPending || eligibility.isFetching);
  const status = openCall
    ? t('callQueue.current.openCall')
    : step.kind === 'paused'
      ? t('callQueue.current.paused')
      : eligibility.isError
        ? t('callQueue.current.checkFailed')
        : verdict?.eligible
          ? t('callQueue.current.number', { number: verdict.destinationMasked ?? '' })
          : t('callQueue.current.checking');

  return (
    <>
      <Appear>
        <GradientSurface className="gap-3 rounded-3xl p-5">
          <View className="flex-row items-center gap-3">
            <IconContainer icon={ListOrdered} tone="inverse" size="md" />
            <View className="flex-1">
              <AppText variant="overline" className="text-white/70">
                {t('callQueue.title')}
              </AppText>
              <AppText variant="h2" className="text-white" accessibilityLiveRegion="polite">
                {t('callQueue.header.position', { position: Math.max(1, p.position), total: p.total })}
              </AppText>
            </View>
            {queue.paused ? (
              <View className="rounded-full border border-white/25 bg-white/15 px-2.5 py-1">
                <AppText variant="caption" className="text-white">
                  {t('callQueue.header.paused')}
                </AppText>
              </View>
            ) : null}
          </View>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('callQueue.header.progressA11y', { finished: p.finished, total: p.total })}
            accessibilityValue={{ min: 0, max: p.total, now: p.finished }}
            className="h-2 overflow-hidden rounded-full bg-white/20"
          >
            <View
              className="h-2 rounded-full bg-white"
              style={{ width: `${p.total > 0 ? Math.round((p.finished / p.total) * 100) : 0}%` }}
            />
          </View>
          <AppText variant="caption" className="text-white/80">
            {t('callQueue.header.counts', {
              done: p.done,
              skipped: p.skipped + p.failed,
              remaining: p.remaining,
            })}
          </AppText>
        </GradientSurface>
      </Appear>

      {autoSkipped.length > 0 ? (
        <AppAlert
          tone="warning"
          message={autoSkipped
            .map((entry) =>
              t('callQueue.autoSkipped', {
                name: entry.leadName,
                reason: skipReasonLabel(t, entry.skipReason),
              }),
            )
            .join('\n')}
        />
      ) : null}

      {item ? (
        <Appear index={1}>
          <AppCard className="gap-3">
            <View className="flex-row items-center gap-3">
              <IconContainer icon={openCall ? ClipboardPen : Phone} tone="primary" size="lg" round />
              <View className="flex-1 gap-0.5">
                <AppText variant="overline" tone="muted">
                  {t('callQueue.current.title')}
                </AppText>
                <AppText variant="h3" numberOfLines={2}>
                  {item.leadName}
                </AppText>
                <AppText variant="caption" tone={eligibility.isError ? 'warning' : 'muted'}>
                  {status}
                </AppText>
              </View>
              {openCall ? <AppBadge size="sm" variant="warning" label={t('callQueue.state.open')} /> : null}
            </View>

            {openCall ? (
              <AppButton
                title={t('callQueue.actions.recordOutcome')}
                leftIcon={ClipboardPen}
                size="lg"
                onPress={recordOutcome}
                fullWidth
              />
            ) : step.kind === 'paused' ? (
              <AppButton
                title={t('callQueue.actions.resume')}
                leftIcon={Play}
                size="lg"
                onPress={() => change((current) => setPaused(current, false))}
                fullWidth
              />
            ) : eligibility.isError ? (
              <AppButton
                title={t('common.retry')}
                variant="outline"
                onPress={() => void eligibility.refetch()}
                fullWidth
              />
            ) : (
              <AppButton
                title={t('callQueue.actions.call')}
                leftIcon={Phone}
                size="lg"
                loading={checking}
                disabled={!verdict?.eligible || checking}
                onPress={call}
                fullWidth
              />
            )}

            <View className="flex-row gap-2">
              <View className="flex-1">
                <AppButton
                  title={t('callQueue.actions.skip')}
                  leftIcon={SkipForward}
                  variant="outline"
                  disabled={openCall}
                  onPress={() => {
                    change((current) => skipItem(current, item.leadId, 'user'));
                  }}
                  fullWidth
                />
              </View>
              {step.kind !== 'paused' ? (
                <View className="flex-1">
                  <AppButton
                    title={t('callQueue.actions.pause')}
                    leftIcon={Pause}
                    variant="outline"
                    onPress={() => change((current) => setPaused(current, true))}
                    fullWidth
                  />
                </View>
              ) : null}
            </View>
          </AppCard>
        </Appear>
      ) : null}

      <View className="flex-row items-start gap-2 px-1">
        <IconContainer icon={Sparkles} tone="primary" size="sm" />
        <AppText variant="caption" tone="muted" className="flex-1">
          {t('callQueue.hint')}
        </AppText>
      </View>

      <Appear index={2}>
        <View className="gap-2">
          <SectionHeader title={t('callQueue.upNext.title')} />
          {upNext.length === 0 ? (
            <AppText variant="caption" tone="muted">
              {t('callQueue.upNext.empty')}
            </AppText>
          ) : (
            <AppCard variant="outline" className="gap-0 px-3 py-1">
              {upNext.slice(0, UP_NEXT_SHOWN).map((entry, index) => (
                <View
                  key={entry.leadId}
                  className={`min-h-11 flex-row items-center gap-3 py-2 ${index > 0 ? 'border-t border-border' : ''}`}
                >
                  <View className="h-6 w-6 items-center justify-center rounded-full bg-muted">
                    <AppText variant="caption" tone="muted" className="tabular-nums">
                      {queue.items.indexOf(entry) + 1}
                    </AppText>
                  </View>
                  <AppText variant="label" className="flex-1" numberOfLines={1}>
                    {entry.leadName}
                  </AppText>
                </View>
              ))}
              {upNext.length > UP_NEXT_SHOWN ? (
                <AppText variant="caption" tone="muted" className="border-t border-border py-2.5">
                  {t('callQueue.upNext.more', { count: upNext.length - UP_NEXT_SHOWN })}
                </AppText>
              ) : null}
            </AppCard>
          )}
        </View>
      </Appear>

      <AppButton
        title={t('callQueue.actions.end')}
        leftIcon={Square}
        variant="ghost"
        onPress={() => setConfirmEnd(true)}
        fullWidth
      />

      <ConfirmDialog
        visible={confirmEnd}
        title={t('callQueue.end.title')}
        description={t('callQueue.end.body')}
        confirmLabel={t('callQueue.end.confirm')}
        destructive
        onCancel={() => setConfirmEnd(false)}
        onConfirm={() => {
          setConfirmEnd(false);
          change((current) => endQueue(current, Date.now()));
        }}
      />
    </>
  );
}
