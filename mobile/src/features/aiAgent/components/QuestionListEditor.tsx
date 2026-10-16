import { Plus, Trash2 } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';

import type { AgentQuestion } from '../types';

type Props = {
  questions: AgentQuestion[];
  onChange: (questions: AgentQuestion[]) => void;
  invalid: readonly number[];
};

let counter = 0;
const newFieldKey = () => `custom_${Date.now().toString(36)}_${counter++}`;

/** Edit the agent's questions. Choice answers come from the CRM qualification fields and are shown, not edited. */
export function QuestionListEditor({ questions, onChange, invalid }: Props) {
  const { t } = useTranslation();
  const update = (index: number, patch: Partial<AgentQuestion>) =>
    onChange(questions.map((question, i) => (i === index ? { ...question, ...patch } : question)));

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
              onPress={() => onChange(questions.filter((_, i) => i !== index))}
            />
          </View>
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
          {question.options.length > 0 ? (
            <AppText variant="caption" tone="muted">
              {t('aiAgent.call.options', { options: question.options.join(', ') })}
            </AppText>
          ) : null}
        </AppCard>
      ))}
      <AppButton
        title={t('aiAgent.call.add')}
        leftIcon={Plus}
        variant="outline"
        disabled={questions.length >= 40}
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
