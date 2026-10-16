import { Clock, Save } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppInput } from '@/components/ui/AppInput';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { LanguagePicker } from '@/features/aiAgent/components/LanguagePicker';
import { QuestionListEditor } from '@/features/aiAgent/components/QuestionListEditor';
import { Loading } from '@/features/aiAgent/components/ReviewPanels';
import { deviceTimezone } from '@/features/aiAgent/domain/agentDomain';
import { useAgentLanguages, useAgentSmsTemplates } from '@/features/aiAgent/hooks/useAiAgent';
import { MESSAGE_PURPOSES } from '@/features/aiAgent/types';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { INTL_LOCALES, isLocale } from '@/i18n/locales';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { showSuccessToast } from '@/utils/toast';

import {
  formFromDefaults,
  settingsErrors,
  toDefaultsPayload,
  type AgentSettingsForm,
  type SettingsErrorKey,
} from '../domain/agentSettings';
import { useAgentDefaults, useSaveAgentDefaults, useSettingsFallbacks } from '../hooks/useCallAgent';
import { AGENT_VOICES, SCHEDULE_LIMITS, WEEK_DAYS, type ScheduleLimitKey } from '../types';

/** Agent settings saved as the user's defaults (preferences.aiAgentDefaults). */
export function CallAgentSettingsScreen({ navigation }: RootScreenProps<'CallAgentSettings'>) {
  const { t } = useTranslation();
  const defaults = useAgentDefaults();
  const fallbacks = useSettingsFallbacks();

  if (defaults.isPending) {
    return (
      <Screen edges={['bottom']} contentClassName="pt-4">
        <Loading label={t('common.loading')} />
      </Screen>
    );
  }
  if (defaults.isError) {
    return (
      <Screen edges={['bottom']} contentClassName="pt-4">
        <AppErrorState
          error={defaults.error}
          retrying={defaults.isRefetching}
          onRetry={() => void defaults.refetch()}
        />
      </Screen>
    );
  }
  // Mounted once with the loaded values: a background refetch never overwrites edits.
  return (
    <SettingsForm
      initial={formFromDefaults(defaults.data, fallbacks)}
      onSaved={() => (navigation.canGoBack() ? navigation.goBack() : undefined)}
    />
  );
}

function weekdayNames(language: string) {
  const locale = isLocale(language) ? INTL_LOCALES[language] : language;
  const format = (day: number, weekday: 'short' | 'long') => {
    // 2023-01-01 was a Sunday (day 0).
    const date = new Date(Date.UTC(2023, 0, 1 + day));
    try {
      return new Intl.DateTimeFormat(locale, { weekday, timeZone: 'UTC' }).format(date);
    } catch {
      return String(day);
    }
  };
  return new Map(WEEK_DAYS.map((day) => [day, { short: format(day, 'short'), long: format(day, 'long') }]));
}

const LIMIT_LABELS: Record<ScheduleLimitKey, 'maxAttempts' | 'retryDelay' | 'maxCallsPerDay'> = {
  maxAttemptsPerLead: 'maxAttempts',
  retryDelayMinutes: 'retryDelay',
  maxCallsPerDay: 'maxCallsPerDay',
};

export function SettingsForm({ initial, onSaved }: { initial: AgentSettingsForm; onSaved: () => void }) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const update = (patch: Partial<AgentSettingsForm>) => setForm((current) => ({ ...current, ...patch }));

  const languages = useAgentLanguages();
  const templates = useAgentSmsTemplates();
  const save = useSaveAgentDefaults();
  const days = useMemo(() => weekdayNames(i18n.language), [i18n.language]);
  const deviceZone = useMemo(() => deviceTimezone(), []);

  const errors = settingsErrors(form);
  const invalid = (key: SettingsErrorKey) => showErrors && errors.fields.includes(key);

  const submit = useSingleFlight(async () => {
    setShowErrors(true);
    if (settingsErrors(form).fields.length > 0) return;
    await save.mutateAsync(toDefaultsPayload(form));
    showSuccessToast(t('callAgent.settings.saved'));
    onSaved();
  });

  const toggleDay = (day: number) =>
    update({
      daysOfWeek: form.daysOfWeek.includes(day)
        ? form.daysOfWeek.filter((value) => value !== day)
        : [...form.daysOfWeek, day],
    });

  return (
    <Screen edges={['bottom']} mode="keyboard" contentClassName="gap-4 pt-4">
      <AppText tone="muted">{t('callAgent.settings.intro')}</AppText>

      <Section title={t('callAgent.settings.identity')}>
        <AppInput
          label={t('aiAgent.call.agentName')}
          value={form.agentName}
          maxLength={120}
          onChangeText={(agentName) => update({ agentName })}
          error={invalid('agentName') ? t('callAgent.settings.agentNameRequired') : undefined}
        />
        <AppInput
          label={t('aiAgent.call.organization')}
          helperText={t('aiAgent.call.organizationHelp')}
          value={form.organizationName}
          maxLength={200}
          onChangeText={(organizationName) => update({ organizationName })}
        />
        <AppInput
          label={t('aiAgent.call.objective')}
          placeholder={t('aiAgent.call.objectivePlaceholder')}
          value={form.objective}
          maxLength={1000}
          multiline
          onChangeText={(objective) => update({ objective })}
        />
      </Section>

      <Section title={t('callAgent.settings.languageSection')}>
        {languages.isError ? (
          <AppErrorState
            error={languages.error}
            retrying={languages.isRefetching}
            onRetry={() => void languages.refetch()}
          />
        ) : (
          <LanguagePicker
            languages={languages.data?.languages ?? []}
            value={form.language}
            loading={languages.isPending}
            onSelect={(language) => update({ language })}
          />
        )}
      </Section>

      <Section title={t('callAgent.settings.voiceSection')} hint={t('callAgent.settings.voiceHint')}>
        <View className="flex-row flex-wrap gap-2" accessibilityLabel={t('callAgent.settings.voiceSection')}>
          {AGENT_VOICES.map((voice) => (
            <AppChip
              key={voice}
              label={voice.charAt(0).toUpperCase() + voice.slice(1)}
              selected={form.voice === voice}
              onPress={() => update({ voice })}
            />
          ))}
        </View>
      </Section>

      <Section title={t('callAgent.settings.disclosureSection')}>
        <AppInput
          label={t('callAgent.settings.disclosure')}
          helperText={t('callAgent.settings.disclosureHelp', { placeholder: '{company}' })}
          value={form.disclosure}
          maxLength={2000}
          multiline
          onChangeText={(disclosure) => update({ disclosure })}
          error={invalid('disclosure') ? t('callAgent.settings.disclosureRequired') : undefined}
        />
      </Section>

      <View className="gap-2">
        <AppText variant="title">{t('callAgent.settings.questionsSection')}</AppText>
        <AppText tone="muted">{t('aiAgent.call.questionsHelp')}</AppText>
        <QuestionListEditor
          questions={form.questions}
          onChange={(questions) => update({ questions })}
          invalid={showErrors ? errors.questions : []}
        />
        {invalid('questions') ? (
          <AppText variant="caption" tone="destructive">
            {t('callAgent.settings.questionsRequired')}
          </AppText>
        ) : null}
      </View>

      <Section title={t('aiAgent.call.scheduleSection')}>
        <View className="flex-row gap-3">
          <AppInput
            containerClassName="flex-1"
            label={t('aiAgent.call.windowStart')}
            value={form.windowStart}
            maxLength={5}
            keyboardType="numbers-and-punctuation"
            onChangeText={(windowStart) => update({ windowStart })}
            error={invalid('windowStart') ? t('aiAgent.call.invalidTime') : undefined}
          />
          <AppInput
            containerClassName="flex-1"
            label={t('aiAgent.call.windowEnd')}
            value={form.windowEnd}
            maxLength={5}
            keyboardType="numbers-and-punctuation"
            onChangeText={(windowEnd) => update({ windowEnd })}
            error={invalid('windowEnd') ? t('aiAgent.call.invalidTime') : undefined}
          />
        </View>
        <AppText variant="label">{t('callAgent.settings.days')}</AppText>
        <View className="flex-row flex-wrap gap-2">
          {WEEK_DAYS.map((day) => (
            <AppChip
              key={day}
              label={days.get(day)?.short ?? String(day)}
              selected={form.daysOfWeek.includes(day)}
              onPress={() => toggleDay(day)}
            />
          ))}
        </View>
        {invalid('daysOfWeek') ? (
          <AppText variant="caption" tone="destructive">
            {t('callAgent.settings.daysRequired')}
          </AppText>
        ) : null}
        <AppInput
          label={t('aiAgent.call.timezone')}
          value={form.timezone}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={80}
          onChangeText={(timezone) => update({ timezone })}
          error={invalid('timezone') ? t('aiAgent.call.invalidTimezone') : undefined}
        />
        {form.timezone.trim() !== deviceZone ? (
          <AppButton
            title={t('callAgent.settings.useDeviceZone', { zone: deviceZone })}
            leftIcon={Clock}
            variant="soft"
            size="sm"
            onPress={() => update({ timezone: deviceZone })}
          />
        ) : null}
      </Section>

      <Section title={t('callAgent.settings.retrySection')}>
        {(Object.keys(SCHEDULE_LIMITS) as ScheduleLimitKey[]).map((key) => (
          <AppInput
            key={key}
            label={t(`callAgent.settings.${LIMIT_LABELS[key]}`)}
            value={form[key]}
            maxLength={5}
            keyboardType="number-pad"
            onChangeText={(value) => update({ [key]: value.replace(/[^0-9]/g, '') })}
            helperText={t('callAgent.settings.limits', SCHEDULE_LIMITS[key])}
            error={invalid(key) ? t('callAgent.settings.limits', SCHEDULE_LIMITS[key]) : undefined}
          />
        ))}
      </Section>

      <Section title={t('callAgent.settings.smsSection')}>
        <AppText variant="label">{t('aiAgent.sms.purpose')}</AppText>
        <AppRadioGroup
          accessibilityLabel={t('aiAgent.sms.purpose')}
          value={form.smsPurpose}
          onChange={(smsPurpose) => update({ smsPurpose })}
          options={MESSAGE_PURPOSES.map((value) => ({ value, label: t(`aiAgent.sms.purposes.${value}`) }))}
        />
        <AppText variant="label">{t('callAgent.settings.smsTemplate')}</AppText>
        {templates.isError ? (
          <AppAlert tone="warning" message={t('callAgent.settings.templatesFailed')} />
        ) : templates.isPending ? (
          <Loading label={t('common.loading')} />
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <AppChip
            label={t('callAgent.settings.noTemplate')}
            selected={form.smsTemplateId === null}
            onPress={() => update({ smsTemplateId: null })}
          />
          {(templates.data ?? []).map((template) => (
            <AppChip
              key={template.id}
              label={template.name}
              selected={form.smsTemplateId === template.id}
              onPress={() => update({ smsTemplateId: template.id, smsPurpose: template.purpose })}
            />
          ))}
        </View>
      </Section>

      {showErrors && errors.fields.length > 0 ? (
        <AppAlert tone="destructive" message={t('callAgent.settings.fixErrors')} />
      ) : null}
      <AppButton
        title={t('callAgent.settings.save')}
        leftIcon={Save}
        size="lg"
        fullWidth
        loading={save.isPending}
        onPress={submit}
      />
    </Screen>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <AppCard className="gap-3">
      <View className="gap-0.5">
        <AppText variant="title">{title}</AppText>
        {hint ? (
          <AppText variant="caption" tone="muted">
            {hint}
          </AppText>
        ) : null}
      </View>
      {children}
    </AppCard>
  );
}
