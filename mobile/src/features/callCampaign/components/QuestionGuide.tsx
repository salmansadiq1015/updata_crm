import * as Speech from 'expo-speech';
import { CheckCircle2, Volume2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { tKey } from '@/features/communication/i18n';

import { visibleQuestions } from '../domain/campaignDomain';
import type { AttemptDraft } from '../store/campaignOutbox';
import type { CampaignQuestion } from '../types';

type Answer = AttemptDraft['answers'][string];
type Props = {
  questions: readonly CampaignQuestion[];
  answers: AttemptDraft['answers'];
  onAnswer: (fieldKey: string, answer: Answer) => void;
  readAloud: boolean;
};

const NUMERIC = new Set(['integer', 'decimal', 'currency', 'rating']);

/**
 * The campaign's questions in order, with skip rules applied to the answers so far. The
 * caller asks them on the phone and taps/types the answers; "read aloud" uses the phone's
 * own text-to-speech (it is heard on the phone, not injected into the call).
 */
export function QuestionGuide({ questions, answers, onAnswer, readAloud }: Props) {
  const { t, i18n } = useTranslation();
  const shown = visibleQuestions(questions, answers);
  // The first question without an answer is the one to ask next.
  const next = shown.find((q) => !['answered', 'unknown'].includes(answers[q.fieldKey]?.status ?? ''));
  useEffect(() => () => void Speech.stop(), []);
  return (
    <View className="gap-3">
      {readAloud ? (
        <AppText variant="caption" tone="muted">
          {t('callCampaign.guide.readAloudNote')}
        </AppText>
      ) : null}
      {shown.map((q, index) => (
        <QuestionRow
          key={q.fieldKey}
          index={index + 1}
          isNext={q.fieldKey === next?.fieldKey}
          question={q}
          answer={answers[q.fieldKey]}
          onAnswer={(a) => onAnswer(q.fieldKey, a)}
          onSpeak={
            readAloud
              ? () => {
                  void Speech.stop();
                  Speech.speak(q.text, { language: i18n.language });
                }
              : undefined
          }
          unknownLabel={t('callCampaign.guide.unknown')}
        />
      ))}
    </View>
  );
}

function QuestionRow({
  index,
  isNext,
  question: q,
  answer,
  onAnswer,
  onSpeak,
  unknownLabel,
}: {
  index: number;
  isNext: boolean;
  question: CampaignQuestion;
  answer: Answer | undefined;
  onAnswer: (a: Answer) => void;
  onSpeak?: () => void;
  unknownLabel: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState(
    typeof answer?.value === 'string' || typeof answer?.value === 'number' ? String(answer.value) : '',
  );
  const done = answer?.status === 'answered' || answer?.status === 'unknown';
  const choices = q.type === 'boolean' ? ['yes', 'no'] : q.options;
  const multi = q.type === 'multiple_choice';
  const selectedList = Array.isArray(answer?.value) ? (answer.value as string[]) : [];
  const commitText = () => {
    onAnswer(text.trim() ? { status: 'answered', value: text.trim() } : { status: 'unknown' });
  };
  return (
    <AppCard className={isNext ? 'gap-2 border-2 border-primary' : 'gap-2'}>
      <View className="flex-row items-start gap-2">
        <AppText variant="caption" tone="muted">
          {index}.
        </AppText>
        <View className="flex-1 gap-1">
          {isNext ? (
            <AppText variant="caption" tone="primary">
              {t('callCampaign.guide.askNext')}
            </AppText>
          ) : null}
          <AppText variant="title">
            {q.label}
            {q.required ? ' *' : ''}
          </AppText>
          <AppText>{q.text}</AppText>
          {q.description ? (
            <AppText variant="caption" tone="muted">
              {q.description}
            </AppText>
          ) : null}
        </View>
        {done ? <Icon icon={CheckCircle2} color="success" size="sm" /> : null}
        {onSpeak ? (
          <AppIconButton
            icon={Volume2}
            accessibilityLabel={t('callCampaign.guide.readAloud')}
            onPress={onSpeak}
          />
        ) : null}
      </View>
      {choices.length && ['boolean', 'single_choice', 'enum', 'multiple_choice'].includes(q.type) ? (
        <View className="flex-row flex-wrap gap-2">
          {choices.map((option) => {
            const selected = multi
              ? selectedList.includes(option)
              : answer?.status === 'answered' && String(answer.value) === option;
            return (
              <AppChip
                key={option}
                label={
                  q.type === 'boolean'
                    ? t(option === 'yes' ? 'callCampaign.guide.yes' : 'callCampaign.guide.no')
                    : tKey(t, `communication.options.${option}`, { defaultValue: option.replace(/_/g, ' ') })
                }
                selected={selected}
                onPress={() => {
                  if (multi) {
                    const next = selected
                      ? selectedList.filter((v) => v !== option)
                      : [...selectedList, option];
                    onAnswer(
                      next.length ? { status: 'answered', value: next } : { status: 'skipped', value: null },
                    );
                  } else {
                    onAnswer({ status: 'answered', value: option });
                  }
                }}
              />
            );
          })}
          <AppChip
            label={unknownLabel}
            selected={answer?.status === 'unknown'}
            onPress={() => onAnswer({ status: 'unknown', value: null })}
          />
        </View>
      ) : (
        <View className="gap-2">
          <AppInput
            value={text}
            onChangeText={setText}
            onBlur={commitText}
            onSubmitEditing={commitText}
            multiline={q.type === 'long_text'}
            keyboardType={NUMERIC.has(q.type) ? 'numeric' : q.type === 'email' ? 'email-address' : 'default'}
            placeholder={
              q.type === 'date'
                ? 'YYYY-MM-DD'
                : q.type === 'time'
                  ? 'HH:MM'
                  : t('callCampaign.guide.placeholder')
            }
            accessibilityLabel={q.label}
          />
          <View className="flex-row flex-wrap gap-2">
            <AppChip
              label={unknownLabel}
              selected={answer?.status === 'unknown'}
              onPress={() => {
                setText('');
                onAnswer({ status: 'unknown', value: null });
              }}
            />
          </View>
        </View>
      )}
    </AppCard>
  );
}
