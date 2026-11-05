import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cn } from '@/utils/cn';

import type { TranscriptTurn } from '../types';

/** Chat-style transcript: the AI on the start side, the caller on the end side. */
export function TranscriptView({ turns, emptyLabel }: { turns: TranscriptTurn[]; emptyLabel?: string }) {
  const { t } = useTranslation();
  if (turns.length === 0) {
    return (
      <AppText tone="muted" variant="caption">
        {emptyLabel ?? t('incomingCalls.transcript.empty')}
      </AppText>
    );
  }
  return (
    <View className="gap-2">
      {turns.map((turn, index) => {
        const caller = turn.role === 'caller';
        const system = turn.role === 'system';
        const who = caller
          ? t('incomingCalls.transcript.caller')
          : system
            ? t('incomingCalls.transcript.system')
            : t('incomingCalls.transcript.ai');
        return (
          <View
            key={turn.itemId ?? `${index}-${turn.at ?? ''}`}
            className={cn(
              'max-w-[85%] gap-0.5',
              caller ? 'self-end items-end' : 'self-start',
              system && 'self-center',
            )}
            accessibilityLabel={`${who}: ${turn.text}`}
          >
            <AppText variant="caption" tone="muted">
              {turn.interrupted ? `${who} · ${t('incomingCalls.transcript.interrupted')}` : who}
            </AppText>
            <View
              className={cn(
                'rounded-2xl px-3 py-2',
                caller ? 'rounded-br-sm bg-primary' : 'rounded-bl-sm bg-muted',
                system && 'bg-transparent',
              )}
            >
              <AppText
                className={caller ? 'text-primary-foreground' : undefined}
                tone={system ? 'muted' : 'default'}
              >
                {turn.text}
              </AppText>
            </View>
          </View>
        );
      })}
    </View>
  );
}
