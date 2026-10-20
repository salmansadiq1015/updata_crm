import { Pause, Phone, Play, RotateCcw, XCircle } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppModal } from '@/components/ui/AppModal';
import { AppText } from '@/components/ui/AppText';
import { Loading, Stat } from '@/features/aiAgent/components/ReviewPanels';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatDateTime, formatRelative } from '@/utils/date';

import { CallbackFields } from '../components/CallbackFields';
import { campaignActions, campaignProgress, ymdInZone, zonedWallTimeToIso } from '../domain/campaignDomain';
import {
  useCallbackActions,
  useCallCampaign,
  useCampaignAction,
  useCampaignEvents,
  useCampaignTasks,
  useRetryTasks,
} from '../hooks/useCallCampaigns';
import { flushCampaignOutbox } from '../hooks/useCampaignOutboxRuntime';
import { selectCampaignItems, useCampaignOutbox } from '../store/campaignOutbox';
import type { CallTask, TaskState } from '../types';

export const TASK_VARIANT: Record<TaskState, BadgeVariant> = {
  pending: 'muted',
  in_progress: 'primary',
  scheduled: 'info',
  needs_review: 'warning',
  completed: 'success',
  skipped: 'outline',
  ineligible: 'outline',
  cancelled: 'muted',
};
const FILTERS: (TaskState | undefined)[] = [
  undefined,
  'pending',
  'scheduled',
  'needs_review',
  'completed',
  'ineligible',
];

export function CallCampaignDetailScreen({ navigation, route }: RootScreenProps<'CallCampaignDetail'>) {
  const { t, i18n } = useTranslation();
  const { campaignId } = route.params;
  const campaign = useCallCampaign(campaignId, true);
  const [filter, setFilter] = useState<TaskState | undefined>(undefined);
  const tasks = useCampaignTasks(campaignId, filter);
  const callbacks = useCampaignTasks(campaignId, 'scheduled');
  const events = useCampaignEvents(campaignId);
  const action = useCampaignAction();
  const retry = useRetryTasks();
  const callbackActions = useCallbackActions();
  const pendingItems = useCampaignOutbox(useShallow(selectCampaignItems(campaignId)));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [rescheduling, setRescheduling] = useState<CallTask | null>(null);
  const [cb, setCb] = useState<{
    date: string | null;
    time: string | null;
    timezone: string | null;
    reason: string;
  }>({
    date: null,
    time: '10:00',
    timezone: null,
    reason: '',
  });
  const [cbError, setCbError] = useState<string | null>(null);

  const run = useSingleFlight(async (next: 'start' | 'resume' | 'pause' | 'cancel') => {
    await action.mutateAsync({ id: campaignId, action: next });
    setConfirmCancel(false);
    if (next === 'start' || next === 'resume') navigation.navigate('CallCampaignRun', { campaignId });
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
  const p = campaignProgress(s);
  const actions = campaignActions(c.status);
  const tz = c.settings.timezone;

  const saveReschedule = async () => {
    if (!rescheduling) return;
    const zone = cb.timezone ?? tz;
    const at = cb.date && cb.time ? zonedWallTimeToIso(cb.date, cb.time, zone) : null;
    if (!at) return setCbError(t('callCampaign.errors.callback_time'));
    if (Date.parse(at) < Date.now()) return setCbError(t('callCampaign.errors.callback_past'));
    await callbackActions.reschedule.mutateAsync({
      taskId: rescheduling.id,
      at,
      timezone: zone,
      reason: cb.reason,
    });
    setRescheduling(null);
  };

  return (
    <Screen
      mode="scroll"
      edges={['bottom']}
      refreshing={campaign.isRefetching}
      onRefresh={() => {
        void campaign.refetch();
        void tasks.refetch();
        void events.refetch();
      }}
      contentClassName="gap-4 px-4 pb-10 pt-3"
    >
      <AppCard className="gap-3">
        <View className="flex-row items-center gap-2">
          <AppText variant="h3" className="flex-1">
            {c.name}
          </AppText>
          <AppBadge
            label={t(`callCampaign.status.${c.status}`)}
            variant={c.status === 'running' ? 'primary' : c.status === 'completed' ? 'success' : 'muted'}
            dot={c.status === 'running'}
          />
        </View>
        {c.description ? <AppText tone="muted">{c.description}</AppText> : null}
        <View
          className="h-2 overflow-hidden rounded-full bg-muted"
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: s.total, now: p.closed }}
        >
          <View className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(p.ratio * 100)}%` }} />
        </View>
        <AppText variant="caption" tone="muted">
          {t('callCampaign.list.progress', { closed: p.closed, total: s.total, remaining: p.remaining })}
        </AppText>
        <View className="flex-row flex-wrap gap-2">
          <Stat label={t('callCampaign.summary.answered')} value={s.answered} />
          <Stat label={t('callCampaign.summary.noAnswer')} value={s.noAnswer + s.busy} />
          <Stat label={t('callCampaign.summary.rejected')} value={s.rejected} />
          <Stat label={t('callCampaign.summary.callbacks')} value={s.callbacks} />
          <Stat label={t('callCampaign.summary.needsReview')} value={s.needsReview} />
          <Stat label={t('callCampaign.summary.ineligible')} value={s.ineligible} />
        </View>
      </AppCard>

      {s.syncFailed ? (
        <AppAlert tone="destructive" message={t('callCampaign.detail.syncFailed', { count: s.syncFailed })} />
      ) : null}
      {s.needsReview ? (
        <AppAlert tone="warning" message={t('callCampaign.detail.needsReview', { count: s.needsReview })} />
      ) : null}

      <View className="flex-row flex-wrap gap-2">
        {c.status === 'running' ? (
          <AppButton
            title={t('callCampaign.detail.openCaller')}
            leftIcon={Phone}
            onPress={() => navigation.navigate('CallCampaignRun', { campaignId })}
          />
        ) : null}
        {actions.includes('start') ? (
          <AppButton
            title={t('callCampaign.detail.start')}
            leftIcon={Play}
            loading={action.isPending}
            onPress={() => void run('start')}
          />
        ) : null}
        {actions.includes('resume') ? (
          <AppButton
            title={t('callCampaign.detail.resume')}
            leftIcon={Play}
            loading={action.isPending}
            onPress={() => void run('resume')}
          />
        ) : null}
        {actions.includes('pause') ? (
          <AppButton
            title={t('callCampaign.detail.pause')}
            leftIcon={Pause}
            variant="outline"
            disabled={action.isPending}
            onPress={() => void run('pause')}
          />
        ) : null}
        {actions.includes('retry') && s.completed + s.skipped > s.answered + s.rejected + s.wrongNumber ? (
          <AppButton
            title={t('callCampaign.detail.retry')}
            leftIcon={RotateCcw}
            variant="soft"
            loading={retry.isPending}
            onPress={() => void retry.mutateAsync({ id: campaignId })}
          />
        ) : null}
        {actions.includes('cancel') ? (
          <AppButton
            title={t('callCampaign.detail.cancel')}
            leftIcon={XCircle}
            variant="ghost"
            onPress={() => setConfirmCancel(true)}
          />
        ) : null}
      </View>

      {pendingItems.length ? (
        <AppCard className="gap-2">
          <AppText variant="label">{t('callCampaign.detail.unsyncedTitle')}</AppText>
          {pendingItems.map((item) => (
            <View key={item.id} className="gap-1">
              <AppText variant="caption">
                {t(`callCampaign.detail.item.${item.kind}`)} ·{' '}
                {t(`callCampaign.detail.itemStatus.${item.status}`)}
                {item.error ? ` · ${item.error}` : ''}
              </AppText>
              {item.status !== 'pending' ? (
                <View className="flex-row gap-2">
                  <AppButton
                    size="sm"
                    variant="outline"
                    title={t('common.retry')}
                    onPress={() => {
                      useCampaignOutbox.getState().retryItem(item.id);
                      void flushCampaignOutbox();
                    }}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </AppCard>
      ) : null}

      {(callbacks.data?.data.length ?? 0) > 0 ? (
        <AppCard className="gap-2">
          <AppText variant="label">{t('callCampaign.detail.callbacksTitle')}</AppText>
          {callbacks.data!.data.map((task) => (
            <View key={task.id} className="gap-1 border-b border-border pb-2">
              <AppText>{task.lead?.name ?? '—'}</AppText>
              <AppText variant="caption" tone={task.overdue ? 'destructive' : 'muted'}>
                {task.callback?.at
                  ? new Intl.DateTimeFormat(i18n.language, {
                      timeZone: task.callback.timezone ?? undefined,
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }).format(new Date(task.callback.at))
                  : ''}{' '}
                ({task.callback?.timezone}){task.callback?.reason ? ` · ${task.callback.reason}` : ''}
              </AppText>
              <View className="flex-row gap-2">
                <AppButton
                  size="sm"
                  variant="outline"
                  title={t('callCampaign.detail.reschedule')}
                  onPress={() => {
                    const zone = task.callback?.timezone ?? tz;
                    setCb({
                      date: task.callback?.at ? ymdInZone(new Date(task.callback.at), zone) : null,
                      time: '10:00',
                      timezone: zone,
                      reason: task.callback?.reason ?? '',
                    });
                    setCbError(null);
                    setRescheduling(task);
                  }}
                />
                <AppButton
                  size="sm"
                  variant="ghost"
                  title={t('callCampaign.detail.cancelCallback')}
                  onPress={() => void callbackActions.cancel.mutateAsync(task.id)}
                />
              </View>
            </View>
          ))}
        </AppCard>
      ) : null}

      <AppText variant="h3">{t('callCampaign.detail.tasks')}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {FILTERS.map((f) => (
          <AppChip
            key={f ?? 'all'}
            label={f ? t(`callCampaign.taskState.${f}`) : t('callCampaign.list.all')}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>
      {tasks.isPending ? <Loading label={t('common.loading')} /> : null}
      {tasks.isError ? (
        <AppErrorState error={tasks.error} size="inline" onRetry={() => void tasks.refetch()} />
      ) : null}
      {tasks.data?.data.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          onRetrySync={() => void callbackActions.retrySync.mutateAsync(task.id)}
        />
      ))}

      <AppText variant="h3">{t('callCampaign.detail.history')}</AppText>
      {events.data?.slice(0, 25).map((e) => (
        <AppText key={e.id} variant="caption" tone="muted">
          {formatDateTime(e.at, i18n.language)} ·{' '}
          {t(`callCampaign.events.${e.type}` as never, { defaultValue: e.type })}
          {e.leadName ? ` · ${e.leadName}` : ''}
        </AppText>
      ))}

      <AppModal
        visible={confirmCancel}
        title={t('callCampaign.detail.cancelTitle')}
        description={t('callCampaign.detail.cancelBody')}
        onClose={() => setConfirmCancel(false)}
        footer={
          <View className="gap-2">
            <AppButton
              title={t('callCampaign.detail.cancel')}
              variant="destructive"
              loading={action.isPending}
              onPress={() => void run('cancel')}
            />
            <AppButton title={t('common.back')} variant="ghost" onPress={() => setConfirmCancel(false)} />
          </View>
        }
      />
      <AppModal
        visible={rescheduling !== null}
        title={t('callCampaign.detail.reschedule')}
        onClose={() => setRescheduling(null)}
        footer={
          <View className="gap-2">
            <AppButton
              title={t('common.save')}
              loading={callbackActions.reschedule.isPending}
              onPress={() => void saveReschedule()}
            />
            <AppButton title={t('common.back')} variant="ghost" onPress={() => setRescheduling(null)} />
          </View>
        }
      >
        <CallbackFields value={cb} onChange={setCb} campaignTimezone={tz} error={cbError} />
      </AppModal>
    </Screen>
  );
}

function TaskRow({ task, onRetrySync }: { task: CallTask; onRetrySync: () => void }) {
  const { t, i18n } = useTranslation();
  const answered = task.answers.filter((a) => a.status === 'answered').length;
  const syncFailed = task.attempts.some((a) => a.sync?.status === 'failed');
  return (
    <AppCard className="gap-1">
      <View className="flex-row items-center gap-2">
        <AppText variant="title" className="flex-1" numberOfLines={1}>
          {task.lead?.name ?? '—'}
        </AppText>
        <AppBadge
          size="sm"
          label={t(`callCampaign.taskState.${task.state}`)}
          variant={TASK_VARIANT[task.state]}
        />
      </View>
      <AppText variant="caption" tone="muted">
        {[
          task.outcome ? t(`callCampaign.outcomes.${task.outcome}`) : null,
          answered ? t('callCampaign.task.answers', { count: answered }) : null,
          task.attemptCount ? t('callCampaign.task.attempts', { count: task.attemptCount }) : null,
          task.eligibility && !task.eligibility.eligible ? task.eligibility.reasons.join(', ') : null,
          task.notBefore && task.state === 'pending'
            ? t('callCampaign.task.retryAt', {
                when: formatRelative(new Date(task.notBefore), i18n.language) ?? '',
              })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
      {syncFailed ? (
        <View className="flex-row items-center gap-2">
          <AppText variant="caption" tone="destructive" className="flex-1">
            {t('callCampaign.task.syncFailed')}
          </AppText>
          <AppButton size="sm" variant="outline" title={t('common.retry')} onPress={onRetrySync} />
        </View>
      ) : null}
    </AppCard>
  );
}
