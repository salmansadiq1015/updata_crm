import { useQuery } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { AppTimeField } from '@/components/ui/AppTimeField';
import { queryKeys } from '@/constants/queryKeys';
import { QuestionListEditor } from '@/features/aiAgent/components/QuestionListEditor';
import {
  defaultQuestions,
  deviceTimezone,
  questionErrors,
  type DefaultQuestionTexts,
} from '@/features/aiAgent/domain/agentDomain';
import type { AgentQuestion } from '@/features/aiAgent/types';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { telephony } from '@/services/telephony/telephonyService';
import { toApiError } from '@/services/api/apiErrors';

import { callWindowOpen } from '../domain/campaignDomain';
import { useCreateCallCampaign } from '../hooks/useCallCampaigns';

const STEPS = ['details', 'questions', 'calling', 'review'] as const;
type Step = (typeof STEPS)[number];
const DAYS = [1, 2, 3, 4, 5, 6, 0];

/** Guided creation: details → questions → calling rules → review → saved on the server. */
export function CallCampaignCreateScreen({ navigation, route }: RootScreenProps<'CallCampaignCreate'>) {
  const { t } = useTranslation();
  const leadIds = useMemo(() => [...new Set(route.params.leadIds)], [route.params.leadIds]);
  const texts = useMemo<DefaultQuestionTexts>(
    () => ({
      decision_authority: {
        label: t('aiAgent.defaults.decision_authority.label'),
        text: t('aiAgent.defaults.decision_authority.text'),
      },
      need: { label: t('aiAgent.defaults.need.label'), text: t('aiAgent.defaults.need.text') },
      interest: { label: t('aiAgent.defaults.interest.label'), text: t('aiAgent.defaults.interest.text') },
      timeline: { label: t('aiAgent.defaults.timeline.label'), text: t('aiAgent.defaults.timeline.text') },
      callback_time: {
        label: t('aiAgent.defaults.callback_time.label'),
        text: t('aiAgent.defaults.callback_time.text'),
      },
    }),
    [t],
  );
  const [step, setStep] = useState<Step>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [questions, setQuestions] = useState<AgentQuestion[]>(() => defaultQuestions(texts));
  const [readAloud, setReadAloud] = useState(true);
  const [windowStart, setWindowStart] = useState('09:00');
  const [windowEnd, setWindowEnd] = useState('19:00');
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [countdown, setCountdown] = useState(10);
  const [autoDial, setAutoDial] = useState(false);
  const [maxAttempts, setMaxAttempts] = useState(2);
  const [retryDelay, setRetryDelay] = useState(60);
  const [simId, setSimId] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  // A ref, not state: a tap handled by an older render must still see the created campaign.
  const created = useRef<string | null>(null);
  const creation = useRef<{ payload: string; key: string } | null>(null);
  const timezone = deviceTimezone();
  const sims = useQuery({
    queryKey: queryKeys.communication.sims,
    queryFn: () => telephony.getActiveSims().catch(() => []),
  });
  const create = useCreateCallCampaign();

  const invalid = questionErrors(questions);
  const stepValid: Record<Step, boolean> = {
    details: name.trim().length > 0 && leadIds.length > 0,
    questions: questions.length > 0 && invalid.length === 0,
    calling: days.length > 0,
    review: true,
  };
  const index = STEPS.indexOf(step);
  // When the review step opens: is it inside the chosen calling hours right now?
  const [reviewNow, setReviewNow] = useState<Date | null>(null);
  const next = () => {
    setShowErrors(true);
    if (!stepValid[step]) return;
    setShowErrors(false);
    setReviewNow(new Date());
    setStep(STEPS[Math.min(STEPS.length - 1, index + 1)]!);
  };

  const submit = useSingleFlight(async () => {
    if (created.current) return; // never create the same campaign twice
    setSubmitError(null);
    try {
      const input = {
        name: name.trim(),
        description: description.trim(),
        leadIds,
        instructions: instructions.trim(),
        questionnaire: {
          questions: questions.map((q, i) => ({
            fieldKey: q.fieldKey,
            label: q.label,
            text: q.text,
            type: q.type,
            required: q.required,
            order: i + 1,
            options: q.options,
            condition: q.condition ?? null,
          })),
        },
        settings: {
          timezone,
          callWindow: { start: windowStart, end: windowEnd },
          daysOfWeek: days,
          countdownSeconds: countdown,
          autoDial,
          maxAttempts,
          retryDelayMinutes: retryDelay,
          readAloud,
        },
        subscriptionId: simId,
      };
      const payload = JSON.stringify(input);
      if (creation.current?.payload !== payload) creation.current = { payload, key: randomUUID() };
      const campaign = await create.mutateAsync({ ...input, creationKey: creation.current.key });
      created.current = campaign.id;
      setCreatedId(campaign.id);
      navigation.replace('CallCampaignDetail', { campaignId: campaign.id });
    } catch (e) {
      setSubmitError(toApiError(e).message);
    }
  });

  return (
    <Screen mode="keyboard" edges={['bottom']} contentClassName="gap-4 px-4 pb-10 pt-3">
      <View className="flex-row flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <AppChip
            key={s}
            label={`${i + 1}. ${t(`callCampaign.create.steps.${s}`)}`}
            selected={s === step}
            onPress={() => (i < index ? setStep(s) : undefined)}
          />
        ))}
      </View>

      {step === 'details' ? (
        <AppCard className="gap-3">
          <AppText tone="muted">{t('callCampaign.create.leads', { count: leadIds.length })}</AppText>
          <AppInput
            label={t('callCampaign.create.name')}
            value={name}
            onChangeText={setName}
            maxLength={160}
            error={showErrors && !name.trim() ? t('callCampaign.create.nameRequired') : undefined}
          />
          <AppInput
            label={t('callCampaign.create.description')}
            value={description}
            onChangeText={setDescription}
            maxLength={1000}
          />
          <AppInput
            label={t('callCampaign.create.instructions')}
            helperText={t('callCampaign.create.instructionsHelp')}
            value={instructions}
            onChangeText={setInstructions}
            multiline
            maxLength={2000}
          />
        </AppCard>
      ) : null}

      {step === 'questions' ? (
        <View className="gap-3">
          <AppText tone="muted">{t('callCampaign.create.questionsHelp')}</AppText>
          <QuestionListEditor
            campaign
            questions={questions}
            onChange={setQuestions}
            invalid={showErrors ? invalid : []}
          />
          <AppChip
            label={t('callCampaign.create.readAloud')}
            selected={readAloud}
            onPress={() => setReadAloud((v) => !v)}
          />
        </View>
      ) : null}

      {step === 'calling' ? (
        <AppCard className="gap-3">
          {(sims.data?.length ?? 0) > 1 ? (
            <View className="gap-2">
              <AppText variant="label">{t('callCampaign.run.sim')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <AppChip
                  label={t('callCampaign.create.askSim')}
                  selected={simId === null}
                  onPress={() => setSimId(null)}
                />
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
          <AppText variant="label">{t('callCampaign.create.window', { tz: timezone })}</AppText>
          <View className="flex-row gap-3">
            <AppTimeField
              value={windowStart}
              onChange={setWindowStart}
              accessibilityLabel={t('aiAgent.call.windowStart')}
            />
            <AppTimeField
              value={windowEnd}
              onChange={setWindowEnd}
              accessibilityLabel={t('aiAgent.call.windowEnd')}
            />
          </View>
          <View className="flex-row flex-wrap gap-2">
            {DAYS.map((d) => (
              <AppChip
                key={d}
                label={t(`callCampaign.days.${d}` as never)}
                selected={days.includes(d)}
                onPress={() =>
                  setDays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]))
                }
              />
            ))}
          </View>
          <AppText variant="label">{t('callCampaign.create.countdown')}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {[5, 10, 20, 30, 60].map((s) => (
              <AppChip
                key={s}
                label={t('callCampaign.create.seconds', { count: s })}
                selected={countdown === s}
                onPress={() => setCountdown(s)}
              />
            ))}
          </View>
          <AppChip
            label={t('callCampaign.create.autoDial')}
            selected={autoDial}
            onPress={() => setAutoDial((v) => !v)}
          />
          <AppText variant="caption" tone="muted">
            {t('callCampaign.create.autoDialHelp')}
          </AppText>
          <AppText variant="label">{t('callCampaign.create.maxAttempts')}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {[1, 2, 3].map((n) => (
              <AppChip
                key={n}
                label={String(n)}
                selected={maxAttempts === n}
                onPress={() => setMaxAttempts(n)}
              />
            ))}
          </View>
          <AppText variant="label">{t('callCampaign.create.retryDelay')}</AppText>
          <View className="flex-row flex-wrap gap-2">
            {[30, 60, 120, 240].map((m) => (
              <AppChip
                key={m}
                label={t('callCampaign.create.minutes', { count: m })}
                selected={retryDelay === m}
                onPress={() => setRetryDelay(m)}
              />
            ))}
          </View>
        </AppCard>
      ) : null}

      {step === 'review' ? (
        <AppCard className="gap-3">
          <AppText variant="h3">{name}</AppText>
          {reviewNow && !callWindowOpen({ start: windowStart, end: windowEnd }, days, timezone, reviewNow) ? (
            <AppAlert
              tone="warning"
              message={t('callCampaign.create.outsideNow', {
                start: windowStart,
                end: windowEnd,
                tz: timezone,
              })}
            />
          ) : null}
          <AppText>{t('callCampaign.create.reviewLeads', { count: leadIds.length })}</AppText>
          <AppText>{t('callCampaign.create.reviewQuestions', { count: questions.length })}</AppText>
          <AppText>
            {t('callCampaign.create.reviewSequence', { seconds: countdown })}
            {autoDial ? ` ${t('callCampaign.create.reviewAutoDial')}` : ''}
          </AppText>
          <AppAlert
            tone="info"
            title={t('callCampaign.create.safeguardsTitle')}
            message={t('callCampaign.create.safeguards')}
          />
          <AppAlert
            tone="info"
            title={t('callCampaign.create.callbacksTitle')}
            message={t('callCampaign.create.callbacks')}
          />
          {submitError ? <AppAlert tone="destructive" message={submitError} /> : null}
          <AppButton
            title={t('callCampaign.create.save')}
            leftIcon={Check}
            loading={create.isPending}
            disabled={create.isPending || createdId !== null}
            onPress={() => void submit()}
          />
        </AppCard>
      ) : null}

      <View className="flex-row gap-2">
        {index > 0 ? (
          <AppButton
            title={t('common.back')}
            leftIcon={ArrowLeft}
            variant="ghost"
            onPress={() => setStep(STEPS[index - 1]!)}
          />
        ) : null}
        {step !== 'review' ? (
          <AppButton title={t('common.continue')} rightIcon={ArrowRight} onPress={next} className="flex-1" />
        ) : null}
      </View>
    </Screen>
  );
}
