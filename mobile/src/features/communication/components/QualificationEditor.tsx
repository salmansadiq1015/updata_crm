import { ChevronDown, ChevronUp, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import type { OutcomeDraft } from '../domain/operations';
import type { QualificationField, StoredQualification } from '../types';
import { tKey } from '../i18n';
import { ANSWER_STATUSES } from '../types';

export type DraftAnswers = OutcomeDraft['answers'];

/** Field label: translated by key when the app knows it, else the CRM's label. */
export function useFieldLabel() {
  const { t, i18n } = useTranslation();
  return (field: { fieldKey: string; label: string }) => {
    const key = `communication.fields.${field.fieldKey}`;
    return i18n.exists(key) ? tKey(t, key) : field.label;
  };
}

/**
 * Mode A: the questions to ask on the call, with the CRM's current answer, and an input
 * per question. "Unknown" is the default and never overwrites a stored answer.
 */
export function QualificationEditor({
  schema,
  stored,
  answers,
  onChange,
}: {
  schema: QualificationField[];
  stored: StoredQualification[];
  answers: DraftAnswers;
  onChange: (fieldKey: string, answer: DraftAnswers[string]) => void;
}) {
  const { t } = useTranslation();
  const label = useFieldLabel();
  const storedByKey = new Map(stored.map((entry) => [entry.fieldKey, entry]));
  // Questions are collapsed rows (label · current answer) and open one at a time on tap,
  // so twelve questions fit on one screen instead of six.
  const [open, setOpen] = useState<string | null>(null);

  return (
    <View>
      {schema.map((field) => {
        const answer = answers[field.fieldKey] ?? {
          value: '',
          status: 'unknown',
          source: 'user',
          evidence: null,
        };
        const current = storedByKey.get(field.fieldKey);
        const set = (change: Partial<typeof answer>) => {
          const next = { ...answer, ...change };
          // Typing a value makes it an answer; clearing it returns to unknown.
          if ('value' in change) {
            next.status = next.value.trim()
              ? 'answered'
              : answer.status === 'answered'
                ? 'unknown'
                : answer.status;
            next.source = 'user';
            next.evidence = null;
          }
          onChange(field.fieldKey, next);
        };
        const expanded = open === field.fieldKey;
        const summary = answer.value.trim()
          ? field.type === 'single_choice'
            ? tKey(t, `communication.options.${answer.value}`, {
                defaultValue: answer.value.replace(/_/g, ' '),
              })
            : answer.value.trim()
          : tKey(t, `communication.answerStatus.${answer.status}`);
        return (
          <View key={field.fieldKey} className="border-b border-border">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${label(field)}: ${summary}`}
              onPress={() => setOpen(expanded ? null : field.fieldKey)}
              className="min-h-12 flex-row items-center gap-2 py-2 active:opacity-70"
            >
              <AppText variant="label" className="flex-1" numberOfLines={1}>
                {label(field)}
              </AppText>
              {answer.source === 'ai_proposed_user_confirmed' ? (
                <AppBadge
                  label={t('communication.qualification.aiConfirmed')}
                  icon={Sparkles}
                  variant="info"
                />
              ) : null}
              <AppText
                variant="caption"
                tone={answer.status === 'answered' ? 'primary' : 'muted'}
                className="max-w-[45%] text-right"
                numberOfLines={1}
              >
                {summary}
              </AppText>
              <Icon icon={expanded ? ChevronUp : ChevronDown} size="sm" color="mutedForeground" />
            </Pressable>
            {expanded ? (
              <View className="gap-2 pb-3">
                {current && current.status !== 'unknown' ? (
                  <AppText variant="caption" tone="muted">
                    {t('communication.qualification.current', {
                      value:
                        current.status === 'answered'
                          ? String(current.value ?? '')
                          : tKey(t, `communication.answerStatus.${current.status}`),
                    })}
                  </AppText>
                ) : null}
                {field.type === 'single_choice' && field.options.length > 0 ? (
                  <View className="flex-row flex-wrap gap-2">
                    {field.options.map((option) => (
                      <AppChip
                        key={option}
                        label={tKey(t, `communication.options.${option}`, {
                          defaultValue: option.replace(/_/g, ' '),
                        })}
                        selected={answer.value === option}
                        onPress={() => set({ value: answer.value === option ? '' : option })}
                      />
                    ))}
                  </View>
                ) : (
                  <AppInput
                    value={answer.value}
                    onChangeText={(value) => set({ value })}
                    placeholder={t('communication.qualification.placeholder')}
                    multiline={field.type === 'long_text'}
                    keyboardType={
                      field.type === 'currency' || field.type === 'integer' ? 'numeric' : 'default'
                    }
                    accessibilityLabel={label(field)}
                  />
                )}
                {answer.evidence ? (
                  <AppText variant="caption" tone="muted" selectable>
                    {t('communication.qualification.evidence', { quote: answer.evidence })}
                  </AppText>
                ) : null}
                <View
                  className="flex-row flex-wrap gap-2"
                  accessibilityLabel={t('communication.qualification.statusA11y')}
                >
                  {ANSWER_STATUSES.filter((status) => status !== 'answered').map((status) => (
                    <AppChip
                      key={status}
                      label={tKey(t, `communication.answerStatus.${status}`)}
                      selected={answer.status === status && !answer.value.trim()}
                      onPress={() =>
                        onChange(field.fieldKey, { value: '', status, source: 'user', evidence: null })
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
