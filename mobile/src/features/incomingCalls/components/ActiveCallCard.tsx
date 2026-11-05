import { ChevronRight, Radio } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import { aiStatusKey, formatDuration, isRinging, rangDuringOtherCall } from '../domain/incomingCallDomain';
import type { LiveInboundCall } from '../types';

import {
  AiStatusBadge,
  AudioStatusBadge,
  CallerHeader,
  CallRouting,
  CallStatusBadge,
  CallWaitingNote,
  HandoffBanner,
} from './CallBadges';
import { CallControls } from './CallControls';
import { TranscriptView } from './TranscriptView';

/** Seconds since the call was answered (or detected while ringing), from server timestamps. */
function elapsed(call: LiveInboundCall, now = Date.now()): number | null {
  const from = call.answeredAt ?? call.detectedAt;
  if (!from) return null;
  const ms = now - new Date(from).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
}

/**
 * One incoming call that is ringing or in progress. `compact` (dashboard) shows who, the call and
 * AI state, the hand-off alert and the controls; the live screen adds the transcript tail and
 * what the AI has collected.
 */
export function ActiveCallCard({
  call,
  compact = false,
  onOpen,
}: {
  call: LiveInboundCall;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const { t } = useTranslation();
  // GET /live sends `handoff` only once the caller asked for a person ({ status, reason }).
  const handoffWaiting = (call.handoff?.status ?? (call.humanRequested ? 'waiting' : null)) === 'waiting';
  const seconds = elapsed(call);
  const aiKey = aiStatusKey(call.aiStatus, call.agentActivity?.speaker);
  const callWaiting = rangDuringOtherCall(call);

  return (
    <AppCard className="gap-3 border-primary/30">
      <View className="flex-row items-center gap-2">
        <Icon icon={Radio} size="sm" color={isRinging(call.status) ? 'warning' : 'success'} />
        <AppText variant="overline" tone="muted" className="flex-1">
          {isRinging(call.status) ? t('incomingCalls.live.ringing') : t('incomingCalls.live.inProgress')}
        </AppText>
        {seconds != null ? (
          <AppText variant="caption" tone="muted" accessibilityLabel={t('incomingCalls.meta.duration')}>
            {formatDuration(seconds)}
          </AppText>
        ) : null}
      </View>

      <CallerHeader call={call} />

      {handoffWaiting ? <HandoffBanner reason={call.handoff?.reason ?? null} /> : null}
      {callWaiting ? <CallWaitingNote /> : null}

      <View className="gap-1.5">
        <MetaRow label={t('incomingCalls.meta.state')}>
          <CallStatusBadge status={call.status} />
        </MetaRow>
        <MetaRow label={t('incomingCalls.meta.ai')}>
          <AiStatusBadge aiStatus={call.aiStatus} speaker={call.agentActivity?.speaker} />
        </MetaRow>
        <MetaRow label={t('incomingCalls.meta.audio')}>
          <AudioStatusBadge audioStatus={call.audioStatus} />
        </MetaRow>
      </View>
      <CallRouting call={call} />
      {call.aiBlockedBy && !callWaiting && aiKey === 'unavailable' ? (
        <AppText variant="caption" tone="warning">
          {t('incomingCalls.live.aiBlocked', { reason: call.aiBlockedBy.replace(/_/g, ' ') })}
        </AppText>
      ) : null}

      <CallControls call={call} />

      {compact ? null : (
        <>
          <View className="gap-2">
            <AppText variant="label" className="font-geist-semibold">
              {t('incomingCalls.transcript.title')}
            </AppText>
            <TranscriptView turns={call.lastTurns} />
          </View>
          <View className="gap-2">
            <AppText variant="label" className="font-geist-semibold">
              {t('incomingCalls.collected.title')}
            </AppText>
            {call.collected.length === 0 ? (
              <AppText variant="caption" tone="muted">
                {t('incomingCalls.collected.none')}
              </AppText>
            ) : (
              call.collected.map((field) => (
                <View key={field.key} className="flex-row items-start gap-2">
                  <AppText variant="caption" tone="muted" className="w-32">
                    {t(`incomingCalls.fields.${field.key}`, { defaultValue: field.key.replace(/_/g, ' ') })}
                  </AppText>
                  <AppText className="flex-1">{field.value}</AppText>
                  {field.explicit ? null : (
                    <AppBadge label={t('incomingCalls.detail.inferred')} variant="warning" size="sm" />
                  )}
                </View>
              ))
            )}
            {call.questionCount > 0 ? (
              <AppText variant="caption" tone="muted">
                {t('incomingCalls.collected.questions', { count: call.questionCount })}
              </AppText>
            ) : null}
          </View>
        </>
      )}

      {onOpen ? (
        <Pressable
          onPress={onOpen}
          accessibilityRole="button"
          accessibilityLabel={t('incomingCalls.openLive')}
          className="flex-row items-center justify-between rounded-xl bg-muted/60 px-3 py-2.5 active:bg-muted"
        >
          <AppText variant="label" tone="primary">
            {t('incomingCalls.openLive')}
          </AppText>
          <Icon icon={ChevronRight} size="sm" color="primary" flipRtl />
        </Pressable>
      ) : null}
    </AppCard>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="flex-row items-center gap-2">
      <AppText variant="caption" tone="muted" className="w-24">
        {label}
      </AppText>
      {children}
    </View>
  );
}
