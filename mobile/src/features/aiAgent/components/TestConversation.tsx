import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppText } from '@/components/ui/AppText';
import { tKey } from '@/features/communication/i18n';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import { cn } from '@/utils/cn';

import { useSimulate } from '../hooks/useAiAgent';
import type { SimulateResult } from '../types';

type Line = { who: 'agent' | 'you'; text: string };

const ENDED = new Set(['finish', 'end']);

/**
 * Text simulation of the AI call agent against the campaign's questionnaire
 * (POST /ai-calling/campaigns/:id/simulate). Places no call, changes no lead.
 */
export function TestConversation({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation();
  const simulate = useSimulate(campaignId);
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [answer, setAnswer] = useState('');

  const agentLine = (next: SimulateResult): Line | null => {
    const action = next.nextAction;
    if (ENDED.has(action.type)) return { who: 'agent', text: t('aiAgent.test.finished') };
    if (!action.question) return null;
    if (action.type === 'confirm') {
      return {
        who: 'agent',
        text: t('aiAgent.test.confirm', { label: action.question.label ?? action.question.text }),
      };
    }
    return { who: 'agent', text: action.question.text };
  };

  const begin = useSingleFlight(async () => {
    const next = await simulate.mutateAsync({ state: null, userText: null, disclose: true });
    const first = agentLine(next);
    setResult(next);
    setLines([{ who: 'agent', text: t('aiAgent.test.disclosed') }, ...(first ? [first] : [])]);
  });

  const send = useSingleFlight(async () => {
    const text = answer.trim();
    if (!text || !result) return;
    const next = await simulate.mutateAsync({ state: result.state ?? null, userText: text, disclose: false });
    const reply = agentLine(next);
    setResult(next);
    setAnswer('');
    setLines((current) => [...current, { who: 'you', text }, ...(reply ? [reply] : [])]);
  });

  const ended = result ? ENDED.has(result.nextAction.type) : false;
  const outcome = result?.outcomePreview;

  return (
    <AppCard className="gap-3">
      <AppText variant="title">{t('aiAgent.test.title')}</AppText>
      <AppText tone="muted">{t('aiAgent.test.intro')}</AppText>
      {lines.length === 0 ? (
        <AppButton title={t('aiAgent.test.start')} loading={simulate.isPending} onPress={begin} />
      ) : (
        <>
          <View className="gap-2" accessibilityLiveRegion="polite">
            {lines.map((line, index) => (
              <View
                key={index}
                className={cn(
                  'max-w-[90%] rounded-xl px-3 py-2',
                  line.who === 'agent' ? 'self-start bg-muted' : 'self-end bg-primary',
                )}
              >
                <AppText
                  variant="caption"
                  className={line.who === 'you' ? 'text-primary-foreground' : undefined}
                >
                  {line.who === 'agent' ? t('aiAgent.test.agent') : t('aiAgent.test.you')}
                </AppText>
                <AppText className={line.who === 'you' ? 'text-primary-foreground' : undefined}>
                  {line.text}
                </AppText>
              </View>
            ))}
          </View>
          {result ? (
            <AppText variant="caption" tone="muted">
              {t('aiAgent.test.progress', {
                answered: result.progress.answered,
                total: result.progress.total,
              })}
            </AppText>
          ) : null}
          {ended && outcome?.qualification ? (
            <AppAlert
              tone="info"
              message={t(outcome.requiresReview ? 'aiAgent.test.outcomeReview' : 'aiAgent.test.outcome', {
                qualification: tKey(t, `aiAgent.qualification.${outcome.qualification}`, {
                  defaultValue: outcome.qualification,
                }),
              })}
            />
          ) : null}
          {ended ? null : (
            <View className="gap-2">
              <AppInput
                value={answer}
                onChangeText={setAnswer}
                placeholder={t('aiAgent.test.placeholder')}
                accessibilityLabel={t('aiAgent.test.placeholder')}
                maxLength={2000}
                onSubmitEditing={send}
                returnKeyType="send"
              />
              <AppButton
                title={t('aiAgent.test.send')}
                disabled={!answer.trim()}
                loading={simulate.isPending}
                onPress={send}
              />
            </View>
          )}
          <AppButton
            title={t('aiAgent.test.restart')}
            variant="ghost"
            disabled={simulate.isPending}
            onPress={() => {
              setLines([]);
              setResult(null);
              setAnswer('');
            }}
          />
        </>
      )}
    </AppCard>
  );
}
