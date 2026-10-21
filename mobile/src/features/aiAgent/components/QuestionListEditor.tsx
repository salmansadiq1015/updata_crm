import { Plus, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';

import type { AgentQuestion, AgentQuestionType } from '../types';

type Props = {
  questions: AgentQuestion[];
  onChange: (questions: AgentQuestion[]) => void;
  invalid: readonly number[];
  campaign?: boolean;
};

let counter = 0;
const newFieldKey = () => `custom_${Date.now().toString(36)}_${counter++}`;

/** Shared question editor; SIM campaigns also allow types, options, ordering and conditions. */
export function QuestionListEditor({ questions, onChange, invalid, campaign = false }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string | null>(null);
  const update = (index: number, patch: Partial<AgentQuestion>) =>
    onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));
  const move = (index: number, direction: number) => {
    const next = [...questions];
    [next[index], next[index + direction]] = [next[index + direction]!, next[index]!];
    onChange(next);
  };

  return (
    <View className="gap-3">
      {questions.map((question, index) => (
        <AppCard key={question.fieldKey} className="gap-3">
          <View className="flex-row items-center gap-2">
            <AppText variant="label" tone="muted" className="flex-1">
              {index + 1}.
            </AppText>
            <AppChip
              label={question.required ? t('aiAgent.call.required') : t('aiAgent.call.optional')}
              selected={question.required}
              onPress={() => update(index, { required: !question.required })}
            />
            <AppIconButton
              icon={Trash2}
              accessibilityLabel={`${t('aiAgent.call.remove')} ${index + 1}`}
              disabled={questions.length <= 1}
              onPress={() =>
                onChange(
                  questions
                    .filter((_, i) => i !== index)
                    .map((q) =>
                      q.condition?.all.some((clause) => clause.field === question.fieldKey)
                        ? { ...q, condition: null }
                        : q,
                    ),
                )
              }
            />
          </View>
          {campaign ? (
            <AppChip
              label={t('callCampaign.editor.configure')}
              selected={expanded === question.fieldKey}
              onPress={() => setExpanded(expanded === question.fieldKey ? null : question.fieldKey)}
            />
          ) : null}
          {campaign && expanded === question.fieldKey ? (
            <View className="gap-2">
              <View className="flex-row flex-wrap gap-2">
                <AppButton
                  title={t('callCampaign.editor.up')}
                  size="sm"
                  variant="ghost"
                  disabled={index === 0}
                  onPress={() => move(index, -1)}
                />
                <AppButton
                  title={t('callCampaign.editor.down')}
                  size="sm"
                  variant="ghost"
                  disabled={index === questions.length - 1}
                  onPress={() => move(index, 1)}
                />
              </View>
              <AppText variant="label">{t('callCampaign.editor.type')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                {(
                  [
                    'short_text',
                    'long_text',
                    'boolean',
                    'single_choice',
                    'multiple_choice',
                    'integer',
                    'decimal',
                    'currency',
                    'date',
                    'time',
                    'email',
                    'phone',
                  ] as AgentQuestionType[]
                ).map((type) => (
                  <AppChip
                    key={type}
                    label={t(`callCampaign.editor.types.${type}`)}
                    selected={question.type === type}
                    onPress={() => update(index, { type })}
                  />
                ))}
              </View>
            </View>
          ) : null}
          <AppInput
            label={t('aiAgent.call.questionLabel')}
            value={question.label}
            maxLength={200}
            onChangeText={(label) => update(index, { label })}
            error={
              invalid.includes(index) && !question.label.trim() ? t('aiAgent.call.incomplete') : undefined
            }
          />
          <AppInput
            label={t('aiAgent.call.questionText')}
            value={question.text}
            maxLength={1000}
            multiline
            onChangeText={(text) => update(index, { text })}
            error={
              invalid.includes(index) && !question.text.trim() ? t('aiAgent.call.incomplete') : undefined
            }
          />
          {campaign &&
          expanded === question.fieldKey &&
          ['single_choice', 'multiple_choice'].includes(question.type) ? (
            <AppInput
              label={t('callCampaign.editor.options')}
              value={question.options.join(', ')}
              maxLength={2000}
              onChangeText={(text) => update(index, { options: text.split(',').map((o) => o.trim()) })}
              error={invalid.includes(index) ? t('aiAgent.call.incomplete') : undefined}
            />
          ) : question.options.length > 0 ? (
            <AppText variant="caption" tone="muted">
              {t('aiAgent.call.options', { options: question.options.join(', ') })}
            </AppText>
          ) : null}
          {campaign && expanded === question.fieldKey ? (
            <View className="gap-2">
              <AppText variant="label">{t('callCampaign.editor.showWhen')}</AppText>
              <View className="flex-row flex-wrap gap-2">
                <AppChip
                  label={t('callCampaign.editor.always')}
                  selected={!question.condition}
                  onPress={() => update(index, { condition: null })}
                />
                {questions
                  .filter((q) => q.fieldKey !== question.fieldKey)
                  .map((other) => (
                    <AppChip
                      key={other.fieldKey}
                      label={other.label}
                      selected={question.condition?.all[0]?.field === other.fieldKey}
                      onPress={() =>
                        update(index, {
                          condition: {
                            all: [
                              {
                                field: other.fieldKey,
                                equals: other.type === 'boolean' ? true : (other.options[0] ?? ''),
                              },
                            ],
                          },
                        })
                      }
                    />
                  ))}
              </View>
              {question.condition &&
              questions.find((q) => q.fieldKey === question.condition?.all[0]?.field)?.type === 'boolean' ? (
                <View className="flex-row gap-2">
                  {[true, false].map((value) => (
                    <AppChip
                      key={String(value)}
                      label={t(value ? 'callCampaign.guide.yes' : 'callCampaign.guide.no')}
                      selected={question.condition?.all[0]?.equals === value}
                      onPress={() =>
                        update(index, {
                          condition: { all: [{ field: question.condition!.all[0]!.field, equals: value }] },
                        })
                      }
                    />
                  ))}
                </View>
              ) : question.condition ? (
                <AppInput
                  label={t('callCampaign.editor.equals')}
                  value={String(question.condition.all[0]?.equals ?? '')}
                  onChangeText={(text) => {
                    const clause = question.condition!.all[0]!;
                    const other = questions.find((q) => q.fieldKey === clause.field);
                    const equals =
                      other?.type === 'boolean'
                        ? text === 'true'
                        : ['integer', 'decimal', 'currency'].includes(other?.type ?? '') &&
                            text.trim() &&
                            Number.isFinite(Number(text))
                          ? Number(text)
                          : text;
                    update(index, { condition: { all: [{ field: clause.field, equals }] } });
                  }}
                />
              ) : null}
            </View>
          ) : null}
        </AppCard>
      ))}
      <AppButton
        title={t('aiAgent.call.add')}
        leftIcon={Plus}
        variant="outline"
        disabled={questions.length >= (campaign ? 30 : 40)}
        onPress={() =>
          onChange([
            ...questions,
            {
              fieldKey: newFieldKey(),
              label: t('aiAgent.defaults.newQuestion'),
              text: '',
              type: 'short_text',
              required: false,
              options: [],
            },
          ])
        }
      />
    </View>
  );
}
