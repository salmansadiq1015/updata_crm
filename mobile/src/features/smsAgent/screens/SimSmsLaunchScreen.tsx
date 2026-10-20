import { useQuery } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { AppTimeField } from '@/components/ui/AppTimeField';
import { getEnv } from '@/config/env';
import { queryKeys } from '@/constants/queryKeys';
import { QuestionListEditor } from '@/features/aiAgent/components/QuestionListEditor';
import {
  defaultQuestions,
  deviceTimezone,
  isValidTime,
  questionErrors,
  type DefaultQuestionTexts,
} from '@/features/aiAgent/domain/agentDomain';
import type { AgentQuestion } from '@/features/aiAgent/types';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { telephony } from '@/services/telephony/telephonyService';
import { formatDate } from '@/utils/date';

import { SmsReadinessCard } from '../components/SmsReadinessCard';
import { smsAgentReadiness, toSimCampaignInput } from '../domain/smsAgentDomain';
import { useCreateSimCampaign, useSmsReadiness } from '../hooks/useSmsAgent';

/**
 * Configure an AI SMS conversation sent from THIS phone's SIM. Creating it only
 * makes a draft; the detail screen shows who is eligible and requires an explicit
 * start confirmation.
 */
export function SimSmsLaunchScreen({ navigation, route }: RootScreenProps<'SimSmsLaunch'>) {
  const { t, i18n } = useTranslation();
  const leadIds = useMemo(() => [...new Set(route.params?.leadIds ?? [])], [route.params?.leadIds]);
  const readinessQuery = useSmsReadiness();
  const readiness = smsAgentReadiness(
    getEnv().distribution,
    readinessQuery.data,
    readinessQuery.data?.batteryUnrestricted ?? false,
  );
  const sims = useQuery({
    queryKey: queryKeys.communication.sims,
    queryFn: () => telephony.getActiveSims().catch(() => []),
    enabled: readiness.blocked === null,
  });

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
  const [questions, setQuestions] = useState<AgentQuestion[]>(() => defaultQuestions(texts));
  const [organization, setOrganization] = useState('');
  const [agentName, setAgentName] = useState('Mia');
  const [windowStart, setWindowStart] = useState('09:00');
  const [windowEnd, setWindowEnd] = useState('19:00');
  const [reminders, setReminders] = useState(true);
  const [isTest, setIsTest] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const timezone = deviceTimezone();
  const create = useCreateSimCampaign();

  const invalidQuestions = questionErrors(questions);
  const valid =
    organization.trim().length > 0 &&
    invalidQuestions.length === 0 &&
    questions.length > 0 &&
    isValidTime(windowStart) &&
    isValidTime(windowEnd) &&
    leadIds.length > 0;

  // Set once the campaign exists, so a late second tap (before navigation) cannot create another.
  const created = useRef(false);
  const submit = useSingleFlight(async () => {
    setShowErrors(true);
    if (created.current || !valid || readiness.blocked) return;
    const campaign = await create.mutateAsync(
      toSimCampaignInput({
        name: t('smsAgent.form.defaultName', { date: formatDate(new Date(), i18n.language) ?? '' }),
        leadIds,
        questions,
        agentName,
        organization,
        windowStart,
        windowEnd,
        timezone,
        reminders,
        isTest,
        subscriptionId,
      }),
    );
    created.current = true;
    navigation.replace('SimSmsCampaignDetail', { campaignId: campaign.id });
  });

  return (
    <Screen mode="keyboard" edges={['bottom']} contentClassName="gap-4 px-4 pb-8 pt-3">
      <AppText tone="muted">{t('smsAgent.intro')}</AppText>
      <SmsReadinessCard />

      {readiness.blocked === null ? (
        <>
          {(sims.data?.length ?? 0) > 1 ? (
            <View className="gap-2">
              <AppText variant="label">{t('smsAgent.sim.label')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <AppChip
                  label={t('smsAgent.sim.default')}
                  selected={subscriptionId === null}
                  onPress={() => setSubscriptionId(null)}
                />
                {sims.data!.map((sim) => (
                  <AppChip
                    key={sim.subscriptionId}
                    label={sim.displayName || sim.carrierName || `SIM ${sim.slotIndex + 1}`}
                    selected={subscriptionId === sim.subscriptionId}
                    onPress={() => setSubscriptionId(sim.subscriptionId)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <AppCard className="gap-3">
            <AppInput
              label={t('smsAgent.form.organization')}
              helperText={t('smsAgent.form.organizationHelp')}
              value={organization}
              onChangeText={setOrganization}
              error={showErrors && !organization.trim() ? t('smsAgent.form.organization') : undefined}
            />
            <AppInput label={t('smsAgent.form.agentName')} value={agentName} onChangeText={setAgentName} />
            <AppText variant="label">{t('smsAgent.form.window')}</AppText>
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
            <AppText variant="caption" tone="muted">
              {t('smsAgent.form.timezone', { tz: timezone })}
            </AppText>
            <View className="flex-row flex-wrap gap-2">
              <AppChip
                label={t('smsAgent.form.reminders')}
                selected={reminders}
                onPress={() => setReminders((v) => !v)}
              />
              <AppChip
                label={t('smsAgent.form.test')}
                selected={isTest}
                onPress={() => setIsTest((v) => !v)}
              />
            </View>
          </AppCard>

          <AppText variant="h3">{t('smsAgent.form.questions')}</AppText>
          <QuestionListEditor
            questions={questions}
            onChange={setQuestions}
            invalid={showErrors ? invalidQuestions : []}
          />

          <AppButton
            title={t('smsAgent.check')}
            leftIcon={ListChecks}
            loading={create.isPending}
            disabled={create.isPending || !readiness.canStart}
            onPress={() => void submit()}
          />
        </>
      ) : null}
    </Screen>
  );
}
