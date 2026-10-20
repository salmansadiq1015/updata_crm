import { useQuery } from '@tanstack/react-query';
import { Pause, Phone, PhoneOff, Play, SkipForward } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppText } from '@/components/ui/AppText';
import { queryKeys } from '@/constants/queryKeys';
import { Loading } from '@/features/aiAgent/components/ReviewPanels';
import { tKey } from '@/features/communication/i18n';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { telephony } from '@/services/telephony/telephonyService';
import { formatDateTime } from '@/utils/date';

import { OutcomePanel } from '../components/OutcomePanel';
import { QuestionGuide } from '../components/QuestionGuide';
import { useCallCampaign } from '../hooks/useCallCampaigns';
import { useCampaignRunner } from '../hooks/useCampaignRunner';
import { emptyDraft, useCampaignOutbox, type AttemptDraft } from '../store/campaignOutbox';

/**
 * Calls a campaign's leads one by one from this phone's SIM. The caller talks; the screen
 * shows the lead, the questions (with optional read-aloud) and then asks for the outcome.
 */
export function CallCampaignRunScreen({ route }: RootScreenProps<'CallCampaignRun'>) {
  const { t, i18n } = useTranslation();
  const { campaignId } = route.params;
  const campaignQuery = useCallCampaign(campaignId, true);
  const campaign = campaignQuery.data;
  const runner = useCampaignRunner(campaign);
  const sims = useQuery({
    queryKey: queryKeys.communication.sims,
    queryFn: () => telephony.getActiveSims().catch(() => []),
  });
  const [pickedSim, setSimId] = useState<number | null>(null);
  const simId = pickedSim ?? campaign?.subscriptionId ?? null;
  const [formError, setFormError] = useState<string | null>(null);

  const attemptId = runner.attemptId;
  const storedDraft = useCampaignOutbox((s) => (attemptId ? s.drafts[attemptId] : undefined));
  const draft: AttemptDraft | null = useMemo(() => {
    if (!attemptId || !runner.task) return null;
    const base = storedDraft ?? emptyDraft(attemptId, runner.task.id, campaignId);
    // Server answers (e.g. saved before a restart) fill gaps; local edits win.
    const serverAnswers = Object.fromEntries(
      runner.task.answers.map((a) => [a.fieldKey, { status: a.status, value: a.value ?? null }]),
    );
    return { ...base, answers: { ...serverAnswers, ...base.answers } };
  }, [attemptId, storedDraft, runner.task, campaignId]);

  const update = (change: Partial<AttemptDraft>) => {
    if (!attemptId || !runner.task) return;
    useCampaignOutbox.getState().saveDraft(attemptId, { taskId: runner.task.id, campaignId, ...change });
  };

  // Answers are saved to the server shortly after each change (and kept on the phone).
  const answersTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const answer = (fieldKey: string, value: AttemptDraft['answers'][string]) => {
    if (!draft) return;
    const next = { ...draft, answers: { ...draft.answers, [fieldKey]: value } };
    update({ answers: next.answers });
    if (answersTimer.current) clearTimeout(answersTimer.current);
    answersTimer.current = setTimeout(() => runner.saveAnswers(next), 1500);
  };
  useEffect(
    () => () => {
      if (answersTimer.current) clearTimeout(answersTimer.current);
    },
    [],
  );

  const submit = useSingleFlight(async () => {
    if (!draft) return;
    setFormError(null);
    const problem = await runner.submit(draft);
    if (problem) setFormError(t(`callCampaign.errors.${problem}` as never));
  });

  if (campaignQuery.isPending) return <Loading label={t('common.loading')} />;
  if (campaignQuery.isError || !campaign) {
    return (
      <AppErrorState
        error={campaignQuery.error}
        retrying={campaignQuery.isRefetching}
        onRetry={() => void campaignQuery.refetch()}
      />
    );
  }

  const task = runner.task;
  const dialled = Boolean(runner.dialedAt);
  const showGuide =
    task && (runner.phase === 'ready' || runner.phase === 'calling' || runner.phase === 'wrap_up');

  return (
    <Screen mode="keyboard" edges={['bottom']} contentClassName="gap-4 px-4 pb-10 pt-3">
      <View className="flex-row items-center gap-2">
        <AppText variant="h3" className="flex-1" numberOfLines={1}>
          {campaign.name}
        </AppText>
        <AppBadge
          label={t(`callCampaign.status.${campaign.status}`)}
          variant={campaign.status === 'running' ? 'primary' : 'muted'}
          dot={campaign.status === 'running'}
        />
      </View>

      {!runner.online ? <AppAlert tone="warning" message={t('callCampaign.run.offline')} /> : null}
      {runner.unresolved ? (
        <AppAlert
          tone="destructive"
          message={t('callCampaign.run.unresolved', { count: runner.unresolved })}
        />
      ) : null}
      {runner.error ? (
        <AppAlert
          tone="destructive"
          message={tKey(t, `callCampaign.errors.${runner.error.code}`, {
            defaultValue: runner.error.message,
          })}
        />
      ) : null}

      {runner.phase === 'loading' ? <Loading label={t('common.loading')} /> : null}

      {runner.phase === 'idle' ? (
        <AppCard className="gap-3">
          <AppText variant="title">{t(`callCampaign.idle.${runner.idleReason ?? 'queue_empty'}`)}</AppText>
          {runner.nextAt ? (
            <AppText tone="muted">
              {t('callCampaign.idle.nextAt', { when: formatDateTime(runner.nextAt, i18n.language) ?? '' })}
            </AppText>
          ) : null}
          <AppButton
            title={t('callCampaign.run.checkAgain')}
            variant="outline"
            loading={runner.busy}
            onPress={() => void runner.claim()}
          />
        </AppCard>
      ) : null}

      {runner.phase === 'error' ? (
        <AppButton title={t('common.retry')} variant="outline" onPress={() => void runner.claim()} />
      ) : null}

      {task && showGuide ? (
        <AppCard className="gap-2">
          <View className="flex-row items-center gap-2">
            <AppText variant="h3" className="flex-1">
              {task.lead?.name ?? '—'}
            </AppText>
            {task.callback?.status === 'pending' ? (
              <AppBadge size="sm" label={t('callCampaign.task.callback')} variant="warning" />
            ) : null}
          </View>
          <AppText tone="muted">
            {[task.lead?.contactName, task.lead?.city, task.destinationMasked].filter(Boolean).join(' · ')}
          </AppText>
          {task.attemptCount ? (
            <AppText variant="caption" tone="muted">
              {t('callCampaign.task.attempts', { count: task.attemptCount })}
            </AppText>
          ) : null}
          {campaign.instructions ? (
            <AppAlert tone="info" title={t('callCampaign.run.script')} message={campaign.instructions} />
          ) : null}
        </AppCard>
      ) : null}

      {task && runner.phase === 'ready' ? (
        <AppCard className="gap-3">
          {(sims.data?.length ?? 0) > 1 ? (
            <View className="gap-2">
              <AppText variant="label">{t('callCampaign.run.sim')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {sims.data!.map((sim) => (
                  <AppChip
                    key={sim.subscriptionId}
                    label={sim.displayName || sim.carrierName || `SIM ${sim.slotIndex + 1}`}
                    selected={simId === sim.subscriptionId}
                    onPress={() => setSimId(sim.subscriptionId)}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <AppButton
            title={t('callCampaign.run.call')}
            leftIcon={Phone}
            loading={runner.busy}
            disabled={runner.busy || ((sims.data?.length ?? 0) > 1 && simId === null)}
            onPress={() => void runner.dial(simId)}
          />
          <AppButton
            title={t('callCampaign.run.skip')}
            leftIcon={SkipForward}
            variant="ghost"
            disabled={runner.busy}
            onPress={() => void runner.skip()}
          />
        </AppCard>
      ) : null}

      {runner.phase === 'calling' ? (
        <AppCard className="gap-3">
          <AppText variant="title">{t('callCampaign.run.inCall')}</AppText>
          <AppText tone="muted">{t('callCampaign.run.inCallHint')}</AppText>
          <AppButton
            title={t('callCampaign.run.callEnded')}
            leftIcon={PhoneOff}
            variant="outline"
            onPress={runner.confirmCallEnded}
          />
        </AppCard>
      ) : null}

      {task && draft && showGuide ? (
        <QuestionGuide
          questions={campaign.questionnaire.questions}
          answers={draft.answers}
          onAnswer={answer}
          readAloud={campaign.settings.readAloud}
        />
      ) : null}

      {task && draft && runner.phase === 'wrap_up' ? (
        <OutcomePanel
          draft={draft}
          onChange={update}
          dialled={dialled}
          evidence={runner.evidence}
          leadId={task.leadId}
          campaignTimezone={campaign.settings.timezone}
          error={formError}
          saving={runner.busy}
          onSubmit={() => void submit()}
        />
      ) : null}

      {runner.phase === 'saved' ? (
        <AppCard className="gap-3">
          <AppText variant="title">
            {runner.resultSynced ? t('callCampaign.run.saved') : t('callCampaign.run.savedLocal')}
          </AppText>
          {runner.countdown !== null ? (
            <AppText variant="h2" accessibilityLiveRegion="polite">
              {t(
                campaign.settings.autoDial ? 'callCampaign.run.countdownDial' : 'callCampaign.run.countdown',
                {
                  seconds: runner.countdown,
                },
              )}
            </AppText>
          ) : runner.blocker ? (
            <AppText tone="muted">{t(`callCampaign.blockers.${runner.blocker}`)}</AppText>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            {runner.userPaused ? (
              <AppButton
                title={t('callCampaign.run.resumeSequence')}
                leftIcon={Play}
                onPress={runner.resumeSequence}
              />
            ) : (
              <AppButton
                title={t('callCampaign.run.pauseSequence')}
                leftIcon={Pause}
                variant="outline"
                onPress={runner.pauseSequence}
              />
            )}
            <AppButton
              title={t('callCampaign.run.nextNow')}
              variant="soft"
              disabled={Boolean(runner.blocker && runner.blocker !== 'user_paused')}
              onPress={runner.nextNow}
            />
          </View>
        </AppCard>
      ) : null}
    </Screen>
  );
}
