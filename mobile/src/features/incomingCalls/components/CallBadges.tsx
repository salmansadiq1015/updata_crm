import { AlertTriangle, Cpu, PhoneForwarded, Smartphone, UserRound } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';

import {
  AI_STATUS_VARIANT,
  aiStatusKey,
  audioVariant,
  callerTypeKey,
  simLabel,
  statusVariant,
} from '../domain/incomingCallDomain';
import type { InboundCallRow } from '../types';

export function AiStatusBadge({ aiStatus, speaker }: { aiStatus: string; speaker?: string | null }) {
  const { t } = useTranslation();
  const key = aiStatusKey(aiStatus, speaker);
  return (
    <AppBadge
      label={t(`incomingCalls.aiStatus.${key}`)}
      variant={AI_STATUS_VARIANT[key]}
      dot={key === 'listening' || key === 'speaking' || key === 'callerSpeaking'}
      size="sm"
    />
  );
}

export function CallStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <AppBadge
      label={t(`incomingCalls.status.${status}`, { defaultValue: status.toLowerCase().replace(/_/g, ' ') })}
      variant={statusVariant(status)}
      size="sm"
    />
  );
}

export function AudioStatusBadge({ audioStatus }: { audioStatus: string }) {
  const { t } = useTranslation();
  return (
    <AppBadge
      label={t(`incomingCalls.audio.${audioStatus}`, { defaultValue: audioStatus })}
      variant={audioVariant(audioStatus)}
      size="sm"
    />
  );
}

export function CallerTypeBadge({ call }: { call: Pick<InboundCallRow, 'callerType' | 'lead'> }) {
  const { t } = useTranslation();
  const key = callerTypeKey(call.callerType);
  // A new caller whose lead was just created reads as "New lead"; an existing match as "Existing lead".
  const variant =
    key === 'new' ? 'primary' : key === 'existing' ? 'success' : key === 'ambiguous' ? 'warning' : 'muted';
  return <AppBadge label={t(`incomingCalls.callerType.${key}`)} variant={variant} size="sm" />;
}

/** Caller name (or number), the number underneath, and the lead badge. */
export function CallerHeader({ call }: { call: InboundCallRow }) {
  const { t } = useTranslation();
  const withheld = call.callerType === 'private' || call.caller.presentation !== 'available';
  const name = call.caller.name || call.lead?.name || null;
  const number = call.caller.number;
  const title =
    name ?? number ?? (withheld ? t('incomingCalls.privateNumber') : t('incomingCalls.unknownCaller'));
  return (
    <View className="flex-row items-start gap-3">
      <View className="h-10 w-10 items-center justify-center rounded-full bg-primary/10">
        <Icon icon={UserRound} size="sm" color="primary" />
      </View>
      <View className="flex-1 gap-1">
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        {name && number ? (
          <AppText variant="caption" tone="muted" numberOfLines={1}>
            {number}
          </AppText>
        ) : null}
        <View className="flex-row flex-wrap gap-1.5">
          <CallerTypeBadge call={call} />
          {call.lead?.number ? <AppBadge label={call.lead.number} variant="outline" size="sm" /> : null}
        </View>
      </View>
    </View>
  );
}

/** SIM · phone · agent, as reported by the bridge and the routing decision. */
export function CallRouting({ call }: { call: InboundCallRow }) {
  const { t } = useTranslation();
  const sim = simLabel(call.sim);
  return (
    <View className="flex-row flex-wrap gap-x-3 gap-y-1">
      {sim ? (
        <AppText variant="caption" tone="muted">
          {`${t('incomingCalls.meta.sim')}: ${sim}`}
        </AppText>
      ) : null}
      {call.device?.name ? (
        <View className="flex-row items-center gap-1">
          <Icon icon={Smartphone} size="xs" color="mutedForeground" />
          <AppText variant="caption" tone="muted">
            {call.device.name}
          </AppText>
        </View>
      ) : null}
      <View className="flex-row items-center gap-1">
        <Icon icon={Cpu} size="xs" color="mutedForeground" />
        <AppText variant="caption" tone="muted">
          {call.agent?.name ?? t('incomingCalls.meta.noAgent')}
        </AppText>
      </View>
    </View>
  );
}

/** Shown while the caller has asked for a person and nobody has taken over yet. */
export function HandoffBanner({ reason }: { reason: string | null }) {
  const { t } = useTranslation();
  return (
    <View
      className="gap-1 rounded-xl border border-warning/40 bg-warning/10 p-3"
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <View className="flex-row items-center gap-2">
        <Icon icon={AlertTriangle} size="sm" color="warning" />
        <AppText variant="label" className="flex-1 font-geist-semibold">
          {t('incomingCalls.handoff.title')}
        </AppText>
      </View>
      {reason ? <AppText>{t('incomingCalls.handoff.reason', { reason })}</AppText> : null}
      <AppText variant="caption" tone="muted">
        {t('incomingCalls.handoff.hint')}
      </AppText>
    </View>
  );
}

/** "Rang while the phone was in another call" — the AI does not take a call-waiting call. */
export function CallWaitingNote({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  if (compact)
    return (
      <AppBadge icon={PhoneForwarded} label={t('incomingCalls.callWaiting')} variant="warning" size="sm" />
    );
  return (
    <View className="flex-row items-center gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2">
      <Icon icon={PhoneForwarded} size="sm" color="warning" />
      <AppText variant="label" className="flex-1">
        {t('incomingCalls.callWaiting')}
      </AppText>
    </View>
  );
}
