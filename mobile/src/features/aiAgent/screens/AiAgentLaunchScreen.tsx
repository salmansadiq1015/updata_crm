import { ChevronLeft, ChevronRight, MessageSquare, PhoneCall, Smartphone } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { getEnv } from '@/config/env';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppInput } from '@/components/ui/AppInput';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { AppTimeField } from '@/components/ui/AppTimeField';
import { analyzeSms } from '@/features/communication/domain/smsEncoding';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatDate } from '@/utils/date';
import { showSuccessToast } from '@/utils/toast';
import { scheduleExtras } from '@/features/callAgent/domain/agentSettings';
import { useAgentDefaults } from '@/features/callAgent/hooks/useCallAgent';

import { LanguageList } from '../components/LanguagePicker';
import { QuestionListEditor } from '../components/QuestionListEditor';
import { ReadinessNotice } from '../components/ReadinessNotice';
import { CallReviewPanel, Loading, SmsReviewPanel } from '../components/ReviewPanels';
import { StartConfirmSheet } from '../components/StartConfirmSheet';
import { StepIndicator } from '../components/StepIndicator';
import { TestConversation } from '../components/TestConversation';
import {
  callReadiness,
  canStart,
  defaultQuestions,
  defaultStatusRules,
  deviceTimezone,
  estimateSegments,
  isValidTime,
  isValidTimezone,
  questionErrors,
  smsReadiness,
  toQuestionnaire,
  type DefaultQuestionTexts,
} from '../domain/agentDomain';
import {
  useAgentLanguages,
  useAgentSmsTemplates,
  useCallPreview,
  useCallRecipients,
  useMessagingHealth,
  useSaveCallDraft,
  useSaveSmsDraft,
  useSmsCampaign,
  useSmsRecipients,
  useStartCampaign,
  useTelephonyHealth,
} from '../hooks/useAiAgent';
import { MESSAGE_PURPOSES, type AgentChannel, type AgentQuestion, type MessagePurpose } from '../types';

/** Voices the OpenAI Realtime agent offers (same list as the web wizard). */
export const AGENT_VOICES = ['alloy', 'echo', 'shimmer', 'ash', 'ballad', 'coral', 'sage', 'verse'] as const;

type Step = 'channel' | 'language' | 'configure' | 'review';
const stepsFor = (channel: AgentChannel | null): Step[] =>
  channel === 'sms' ? ['channel', 'configure', 'review'] : ['channel', 'language', 'configure', 'review'];

export function AiAgentLaunchScreen({ route, navigation }: RootScreenProps<'AiAgentLaunch'>) {
  const { t, i18n } = useTranslation();
  const leadIds = useMemo(() => [...new Set(route.params?.leadIds ?? [])], [route.params?.leadIds]);

  const [channel, setChannel] = useState<AgentChannel | null>(route.params?.initialChannel ?? null);
  const [step, setStep] = useState<Step>('channel');
  const steps = stepsFor(channel);
  const stepIndex = Math.max(0, steps.indexOf(step));

  // Readiness: live, never cached, shown before the user chooses.
  const telephony = useTelephonyHealth();
  const messaging = useMessagingHealth();
  const callReady = callReadiness(telephony);
  const smsReady = smsReadiness(messaging);
  const readiness = channel === 'sms' ? smsReady : callReady;

  // Language (calls only).
  const languages = useAgentLanguages();
  const [language, setLanguage] = useState<string | null>(null);
  const languageList = languages.data?.languages ?? [];
  const uiLanguage = languageList.some((item) => item.code === i18n.language) ? i18n.language : null;
  // Saved agent defaults (Call Agent settings) prefill every field; edits made here win.
  const saved = useAgentDefaults().data ?? null;
  const chosenLanguage =
    language ?? saved?.agentConfig?.language ?? uiLanguage ?? languages.data?.defaultLanguage ?? 'en';

  // Call configuration.
  const defaultTexts = useMemo<DefaultQuestionTexts>(
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
  const [agentNameEdit, setAgentName] = useState<string | null>(null);
  const [organizationEdit, setOrganization] = useState<string | null>(null);
  const [objectiveEdit, setObjective] = useState<string | null>(null);
  const [voiceEdit, setVoice] = useState<string | null>(null);
  const [questionsEdit, setQuestions] = useState<AgentQuestion[] | null>(null);
  const [windowStartEdit, setWindowStart] = useState<string | null>(null);
  const [windowEndEdit, setWindowEnd] = useState<string | null>(null);
  const [timezoneEdit, setTimezone] = useState<string | null>(null);
  const standardQuestions = useMemo(() => defaultQuestions(defaultTexts), [defaultTexts]);
  const agentName = agentNameEdit ?? saved?.agentConfig?.agentName ?? 'Alex';
  const organization = organizationEdit ?? saved?.agentConfig?.organizationName ?? '';
  const objective = objectiveEdit ?? saved?.agentConfig?.objective ?? '';
  const voice = voiceEdit ?? saved?.agentConfig?.voice ?? 'alloy';
  const questions = questionsEdit ?? saved?.questions ?? standardQuestions;
  const windowStart = windowStartEdit ?? saved?.schedule?.callWindow?.start ?? '09:00';
  const windowEnd = windowEndEdit ?? saved?.schedule?.callWindow?.end ?? '18:00';
  const timezone = timezoneEdit ?? saved?.schedule?.timezone ?? deviceTimezone();
  const disclosure = saved?.agentConfig?.disclosure || t('aiAgent.call.disclosure');
  const [showErrors, setShowErrors] = useState(false);

  // SMS configuration.
  const templates = useAgentSmsTemplates(channel === 'sms');
  // `undefined` = not chosen here yet (null is the explicit "write my own text").
  const [templateIdEdit, setTemplateId] = useState<string | null | undefined>(undefined);
  const [bodyEdit, setBody] = useState<string | null>(null);
  const [purposeEdit, setPurpose] = useState<MessagePurpose | null>(null);
  // A saved default template is used only while it still exists (not archived).
  const savedTemplate = templates.data?.find((item) => item.id === saved?.sms?.templateId) ?? null;
  const templateId = templateIdEdit !== undefined ? templateIdEdit : (savedTemplate?.id ?? null);
  const body = bodyEdit ?? savedTemplate?.bodyText ?? '';
  const purpose = purposeEdit ?? savedTemplate?.purpose ?? saved?.sms?.purpose ?? 'promotional';
  const sms = analyzeSms(body);

  // Drafts + review.
  const saveCall = useSaveCallDraft();
  const saveSms = useSaveSmsDraft();
  const [callDraftId, setCallDraftId] = useState<string | null>(null);
  const [smsDraftId, setSmsDraftId] = useState<string | null>(null);
  const preview = useCallPreview(channel === 'call' && step === 'review' ? callDraftId : null);
  const callRecipients = useCallRecipients(
    callDraftId ?? '',
    'draft',
    channel === 'call' && step === 'review',
  );
  const smsCampaign = useSmsCampaign(smsDraftId ?? '', channel === 'sms' && step === 'review');
  const smsRecipients = useSmsRecipients(smsDraftId ?? '', 'draft', channel === 'sms' && step === 'review');
  const start = useStartCampaign();
  const [confirming, setConfirming] = useState(false);

  const invalidQuestions = questionErrors(questions);
  const callConfigValid =
    invalidQuestions.length === 0 &&
    isValidTime(windowStart) &&
    isValidTime(windowEnd) &&
    isValidTimezone(timezone);
  const smsConfigValid = body.trim().length > 0;
  const today = formatDate(new Date(), i18n.language) ?? '';

  const goBack = () => {
    if (stepIndex === 0) navigation.goBack();
    else setStep(steps[stepIndex - 1]!);
  };

  const toReview = useSingleFlight(async () => {
    setShowErrors(true);
    if (channel === 'call') {
      if (!callConfigValid) return;
      const campaign = await saveCall.mutateAsync({
        draftId: callDraftId,
        input: {
          name: t('aiAgent.call.defaultName', { date: today }),
          questionnaire: toQuestionnaire(questions),
          statusRules: defaultStatusRules(questions),
          agentConfig: {
            agentName: agentName.trim() || 'Assistant',
            organizationName: organization.trim(),
            objective: objective.trim(),
            language: chosenLanguage,
            voice,
            disclosure,
          },
          schedule: {
            timezone,
            callWindow: { start: windowStart, end: windowEnd },
            ...scheduleExtras(saved),
          },
          selection: { mode: 'explicit', leadIds },
        },
      });
      setCallDraftId(campaign.id);
    } else {
      if (!smsConfigValid) return;
      const campaign = await saveSms.mutateAsync({
        staleDraftId: smsDraftId,
        input: {
          name: t('aiAgent.sms.defaultName', { date: today }),
          channel: 'sms',
          purpose,
          templateId,
          content: { bodyText: body },
          selection: { mode: 'explicit', leadIds },
          timezone: isValidTimezone(timezone) ? timezone : 'UTC',
        },
      });
      setSmsDraftId(campaign.id);
    }
    setStep('review');
  });

  // Review numbers (server-reported only).
  const eligible =
    channel === 'call' ? (preview.data?.eligible ?? 0) : (smsCampaign.data?.summary.eligible ?? 0);
  const total =
    channel === 'call' ? (preview.data?.totalSelected ?? 0) : (smsCampaign.data?.summary.total ?? 0);
  const segments = estimateSegments(smsRecipients.data?.items ?? [], eligible);
  const draftId = channel === 'call' ? callDraftId : smsDraftId;
  const startAllowed = channel !== null && canStart(channel, readiness, eligible);

  const confirmStart = useSingleFlight(async () => {
    if (!channel || !draftId) return;
    const campaign = await start.mutateAsync({ kind: channel, id: draftId });
    setConfirming(false);
    showSuccessToast(t('aiAgent.confirm.started'));
    navigation.replace('AiAgentCampaignDetail', { kind: channel, campaignId: campaign.id });
  });

  const header = (
    <View className="gap-3">
      <StepIndicator steps={steps.map((s) => t(`aiAgent.steps.${s}`))} current={stepIndex} />
      <AppText variant="label">{t('aiAgent.leadsCount', { count: leadIds.length })}</AppText>
    </View>
  );

  if (leadIds.length === 0) {
    return (
      <Screen edges={[]} contentClassName="gap-4 pt-3">
        <AppAlert tone="warning" message={t('aiAgent.leadsExplain')} />
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']} mode="keyboard" contentClassName="gap-4 pt-3">
      {header}

      {step === 'channel' ? (
        <View className="gap-3">
          <AppText variant="h3">{t('aiAgent.channel.title')}</AppText>
          <ChannelCard
            icon={PhoneCall}
            title={t('aiAgent.channel.call')}
            body={t('aiAgent.channel.callBody')}
            note={t('aiAgent.channel.callCloud')}
            selected={channel === 'call'}
            onPress={() => setChannel('call')}
          >
            <ReadinessNotice channel="call" readiness={callReady} />
            {callReady.state !== 'ready' && callReady.state !== 'checking' ? (
              <AppText variant="caption" tone="muted">
                {t('aiAgent.readiness.testStillWorks')}
              </AppText>
            ) : null}
          </ChannelCard>
          <ChannelCard
            icon={MessageSquare}
            title={t('aiAgent.channel.sms')}
            body={t('aiAgent.channel.smsBody')}
            note={t('aiAgent.channel.smsReal')}
            selected={channel === 'sms'}
            onPress={() => setChannel('sms')}
          >
            <ReadinessNotice channel="sms" readiness={smsReady} />
          </ChannelCard>
          {getEnv().distribution === 'private' ? (
            // Company build: the AI converses by SMS from THIS phone's SIM (own flow).
            <ChannelCard
              icon={Smartphone}
              title={t('smsAgent.channelTitle')}
              body={t('smsAgent.channelBody')}
              note={t('smsAgent.channelNote')}
              selected={false}
              onPress={() => navigation.replace('SimSmsLaunch', { leadIds })}
            />
          ) : null}
          <AppText variant="caption" tone="muted">
            {t('aiAgent.leadsExplain')}
          </AppText>
        </View>
      ) : null}

      {step === 'language' ? (
        <View className="gap-3">
          <AppText variant="h3">{t('aiAgent.language.title')}</AppText>
          {languages.isPending ? (
            <Loading label={t('common.loading')} />
          ) : languages.isError ? (
            <AppErrorState
              error={languages.error}
              retrying={languages.isRefetching}
              onRetry={() => void languages.refetch()}
            />
          ) : (
            <>
              {chosenLanguage === 'auto' ? (
                <AppAlert
                  tone="info"
                  message={t('aiAgent.language.autoHint', {
                    language:
                      languageList.find((item) => item.code === languages.data?.defaultLanguage)?.name ??
                      languages.data?.defaultLanguage ??
                      'English',
                  })}
                />
              ) : null}
              <LanguageList languages={languageList} value={chosenLanguage} onSelect={setLanguage} />
            </>
          )}
        </View>
      ) : null}

      {step === 'configure' && channel === 'call' ? (
        <View className="gap-4">
          <AppCard className="gap-3">
            <AppText variant="title">{t('aiAgent.call.agentSection')}</AppText>
            <AppInput
              label={t('aiAgent.call.agentName')}
              value={agentName}
              maxLength={120}
              onChangeText={setAgentName}
            />
            <AppInput
              label={t('aiAgent.call.organization')}
              helperText={t('aiAgent.call.organizationHelp')}
              value={organization}
              maxLength={200}
              onChangeText={setOrganization}
            />
            <AppInput
              label={t('aiAgent.call.objective')}
              placeholder={t('aiAgent.call.objectivePlaceholder')}
              value={objective}
              maxLength={1000}
              multiline
              onChangeText={setObjective}
            />
            <AppText variant="label">{t('aiAgent.call.voice')}</AppText>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {AGENT_VOICES.map((item) => (
                <AppChip key={item} label={item} selected={voice === item} onPress={() => setVoice(item)} />
              ))}
            </ScrollView>
          </AppCard>

          <View className="gap-2">
            <AppText variant="title">{t('aiAgent.call.questionsSection')}</AppText>
            <AppText tone="muted">{t('aiAgent.call.questionsHelp')}</AppText>
            <QuestionListEditor
              questions={questions}
              onChange={setQuestions}
              invalid={showErrors ? invalidQuestions : []}
            />
            <AppText variant="caption" tone="muted">
              {t('aiAgent.call.rulesNote')}
            </AppText>
          </View>

          <AppCard className="gap-3">
            <AppText variant="title">{t('aiAgent.call.scheduleSection')}</AppText>
            <View className="flex-row gap-3">
              <AppTimeField
                label={t('aiAgent.call.windowStart')}
                accessibilityLabel={t('aiAgent.call.windowStart')}
                value={windowStart}
                onChange={setWindowStart}
              />
              <AppTimeField
                label={t('aiAgent.call.windowEnd')}
                accessibilityLabel={t('aiAgent.call.windowEnd')}
                value={windowEnd}
                onChange={setWindowEnd}
              />
            </View>
            <AppInput
              label={t('aiAgent.call.timezone')}
              value={timezone}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={80}
              onChangeText={setTimezone}
              error={showErrors && !isValidTimezone(timezone) ? t('aiAgent.call.invalidTimezone') : undefined}
            />
          </AppCard>
        </View>
      ) : null}

      {step === 'configure' && channel === 'sms' ? (
        <View className="gap-4">
          <AppAlert tone="info" message={t('aiAgent.language.smsNote')} />
          <AppCard className="gap-3">
            <AppText variant="title">{t('aiAgent.sms.templateSection')}</AppText>
            {templates.isError ? (
              <AppAlert tone="warning" message={t('aiAgent.sms.templatesFailed')} />
            ) : null}
            {templates.isPending ? <Loading label={t('common.loading')} /> : null}
            <View className="flex-row flex-wrap gap-2">
              <AppChip
                label={t('aiAgent.sms.noTemplate')}
                selected={templateId === null}
                onPress={() => setTemplateId(null)}
              />
              {(templates.data ?? []).map((template) => (
                <AppChip
                  key={template.id}
                  label={template.name}
                  selected={templateId === template.id}
                  onPress={() => {
                    setTemplateId(template.id);
                    setBody(template.bodyText);
                    setPurpose(template.purpose);
                  }}
                />
              ))}
            </View>
            <AppInput
              label={t('aiAgent.sms.body')}
              placeholder={t('aiAgent.sms.bodyPlaceholder', { example: '{{firstName}}' })}
              value={body}
              multiline
              maxLength={10000}
              onChangeText={setBody}
              helperText={t('aiAgent.sms.variablesHint', {
                example1: '{{firstName}}',
                example2: '{{businessName}}',
              })}
              error={showErrors && !smsConfigValid ? t('aiAgent.sms.bodyRequired') : undefined}
            />
            {body ? (
              <AppText variant="caption" tone="muted">
                {t('aiAgent.sms.segments', {
                  count: sms.segments,
                  characters: sms.characters,
                  encoding: sms.encoding,
                })}
              </AppText>
            ) : null}
          </AppCard>
          <View className="gap-2">
            <AppText variant="title">{t('aiAgent.sms.purpose')}</AppText>
            <AppRadioGroup
              accessibilityLabel={t('aiAgent.sms.purpose')}
              value={purpose}
              onChange={setPurpose}
              options={MESSAGE_PURPOSES.map((value) => ({
                value,
                label: t(`aiAgent.sms.purposes.${value}`),
              }))}
            />
            <AppText variant="caption" tone="muted">
              {t('aiAgent.sms.purposeHint')}
            </AppText>
          </View>
        </View>
      ) : null}

      {step === 'review' && channel ? (
        <View className="gap-4">
          <AppText variant="h3">{t('aiAgent.review.title')}</AppText>
          <AppAlert tone="info" message={t('aiAgent.review.draftNote')} />
          <ReadinessNotice channel={channel} readiness={readiness} />
          {channel === 'call' ? (
            <>
              <CallReviewPanel preview={preview} recipients={callRecipients.data?.items ?? []} />
              {callDraftId ? <TestConversation campaignId={callDraftId} /> : null}
            </>
          ) : smsCampaign.isPending || smsRecipients.isPending ? (
            <Loading label={t('aiAgent.review.creating')} />
          ) : smsCampaign.isError ? (
            <AppErrorState error={smsCampaign.error} onRetry={() => void smsCampaign.refetch()} />
          ) : (
            <SmsReviewPanel
              summary={{ total, eligible }}
              recipients={smsRecipients.data?.items ?? []}
              segments={segments}
            />
          )}
        </View>
      ) : null}

      <View className="flex-row gap-3 pt-2">
        <AppButton
          title={step === 'review' ? t('aiAgent.review.edit') : t('aiAgent.back')}
          leftIcon={ChevronLeft}
          variant="outline"
          onPress={goBack}
          className="flex-1"
        />
        {step === 'review' ? (
          <AppButton
            title={channel === 'call' ? t('aiAgent.review.startCall') : t('aiAgent.review.startSms')}
            variant="primary"
            disabled={!startAllowed}
            onPress={() => setConfirming(true)}
            className="flex-1"
          />
        ) : (
          <AppButton
            title={t('aiAgent.next')}
            rightIcon={ChevronRight}
            disabled={channel === null || (step === 'language' && !languages.data)}
            loading={saveCall.isPending || saveSms.isPending}
            onPress={() => {
              if (step === 'configure') toReview();
              else setStep(steps[stepIndex + 1]!);
            }}
            className="flex-1"
          />
        )}
      </View>

      {channel ? (
        <StartConfirmSheet
          key={String(confirming)}
          visible={confirming}
          channel={channel}
          eligible={eligible}
          excluded={Math.max(0, total - eligible)}
          segments={channel === 'sms' ? segments : null}
          starting={start.isPending}
          onConfirm={confirmStart}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </Screen>
  );
}

type ChannelCardProps = {
  icon: typeof PhoneCall;
  title: string;
  body: string;
  note: string;
  selected: boolean;
  onPress: () => void;
  children?: ReactNode;
};

function ChannelCard({ icon, title, body, note, selected, onPress, children }: ChannelCardProps) {
  return (
    <AppCard className={selected ? 'gap-3 border-primary' : 'gap-3'}>
      <AppButton
        title={title}
        leftIcon={icon}
        variant={selected ? 'primary' : 'outline'}
        onPress={onPress}
        fullWidth
      />
      <AppText>{body}</AppText>
      <AppText variant="caption" tone="muted">
        {note}
      </AppText>
      {children}
    </AppCard>
  );
}
