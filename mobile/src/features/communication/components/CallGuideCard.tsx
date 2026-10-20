import * as Speech from 'expo-speech';
import { ArrowRight, CheckCircle2, SkipForward, Volume2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import { nextGuideQuestion } from '../domain/callGuide';
import { tKey } from '../i18n';
import type { QualificationField } from '../types';
import type { DraftAnswers } from './QualificationEditor';
import { useFieldLabel } from './QualificationEditor';

type Props = {
  schema: readonly QualificationField[];
  answers: DraftAnswers;
  onAnswer: (fieldKey: string, answer: DraftAnswers[string]) => void;
};

/**
 * Mode A, during the call: one question at a time, in conversation order, skipping
 * questions earlier answers made irrelevant. Answers land in the same draft as the
 * full editor below, so nothing is entered twice.
 */
export function CallGuideCard({ schema, answers, onAnswer }: Props) {
  const { t, i18n } = useTranslation();
  const label = useFieldLabel();
  // Stop on-device speech when the question changes or the card unmounts.
  useEffect(() => () => void Speech.stop(), []);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [text, setText] = useState('');
  const { question, position, total } = nextGuideQuestion(schema, answers, skipped);
  if (!total) return null;

  const save = (value: string) => {
    if (!question || !value.trim()) return;
    onAnswer(question.fieldKey, { value: value.trim(), status: 'answered', source: 'user', evidence: null });
    setText('');
  };

  return (
    <AppCard className="gap-3 border-primary/30">
      <View className="flex-row items-center gap-2">
        <Icon icon={ArrowRight} color="primary" size="sm" flipRtl />
        <AppText variant="label" className="flex-1">
          {t('communication.callGuide.title')}
        </AppText>
        {question ? (
          <AppText variant="caption" tone="muted">
            {t('communication.callGuide.progress', { position, total })}
          </AppText>
        ) : null}
      </View>
      {!question ? (
        <View className="flex-row items-center gap-2">
          <Icon icon={CheckCircle2} color="success" size="sm" />
          <AppText tone="muted" className="flex-1">
            {t('communication.callGuide.done')}
          </AppText>
        </View>
      ) : (
        <>
          <View className="flex-row items-start gap-2">
            <AppText variant="title" className="flex-1">
              {label(question)}
            </AppText>
            <AppIconButton
              icon={Volume2}
              accessibilityLabel={t('communication.callGuide.readAloud')}
              onPress={() => {
                // Free, on-device text-to-speech (no network): useful on speakerphone.
                void Speech.stop();
                Speech.speak(label(question), { language: i18n.language });
              }}
            />
          </View>
          {question.helpText ? (
            <AppText variant="caption" tone="muted">
              {question.helpText}
            </AppText>
          ) : null}
          {question.type === 'single_choice' && question.options.length ? (
            <View className="flex-row flex-wrap gap-2">
              {question.options.map((option) => (
                <AppChip
                  key={option}
                  label={tKey(t, `communication.options.${option}`, {
                    defaultValue: option.replace(/_/g, ' '),
                  })}
                  selected={false}
                  onPress={() => save(option)}
                />
              ))}
            </View>
          ) : (
            <View className="gap-2">
              <AppInput
                value={text}
                onChangeText={setText}
                placeholder={t('communication.qualification.placeholder')}
                multiline={question.type === 'long_text'}
                keyboardType={
                  question.type === 'currency' || question.type === 'integer' ? 'numeric' : 'default'
                }
                accessibilityLabel={label(question)}
              />
              <AppButton
                size="sm"
                title={t('communication.callGuide.save')}
                disabled={!text.trim()}
                onPress={() => save(text)}
              />
            </View>
          )}
          <View className="flex-row flex-wrap gap-2">
            <AppChip
              label={t('communication.callGuide.unknown')}
              selected={false}
              onPress={() => setSkipped((s) => new Set(s).add(question.fieldKey))}
            />
            <AppButton
              size="sm"
              variant="ghost"
              leftIcon={SkipForward}
              title={t('communication.callGuide.skip')}
              onPress={() => setSkipped((s) => new Set(s).add(question.fieldKey))}
            />
          </View>
        </>
      )}
    </AppCard>
  );
}
