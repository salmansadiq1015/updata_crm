import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppBadge } from '@/components/ui/AppBadge';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { formatRelative } from '@/utils/date';

import { callerTypeKey, formatDuration, rangDuringOtherCall } from '../domain/incomingCallDomain';
import type { InboundCallRow } from '../types';

import { CallerTypeBadge, CallStatusBadge, CallWaitingNote } from './CallBadges';
import { WorkStatusBadge } from './WorkPanel';

/** One call in the recent-calls list. */
export function CallRow({ call, onPress }: { call: InboundCallRow; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const myId = useSessionStore((state) => state.user?.id ?? null);
  const withheld = callerTypeKey(call.callerType) === 'private';
  const title =
    call.caller.name ||
    call.lead?.name ||
    call.caller.number ||
    (withheld ? t('incomingCalls.privateNumber') : t('incomingCalls.unknownCaller'));
  const when = formatRelative(call.detectedAt, i18n.language);
  const handledBy =
    call.answeredBy === 'ai'
      ? t('incomingCalls.detail.answeredByAi')
      : call.answeredBy === 'human'
        ? t('incomingCalls.detail.answeredByHuman')
        : null;
  return (
    <AppPressableCard
      variant="outline"
      className="gap-2"
      accessibilityLabel={`${title}, ${t(`incomingCalls.status.${call.status}`, { defaultValue: call.status })}`}
      onPress={onPress}
    >
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1">
          <AppText variant="title" numberOfLines={1}>
            {title}
          </AppText>
          {call.caller.number && title !== call.caller.number ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {call.caller.number}
            </AppText>
          ) : null}
        </View>
        <CallStatusBadge status={call.status} />
      </View>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <WorkStatusBadge status={call.workStatus} />
        {call.assignedTo && call.assignedTo === myId ? (
          <AppBadge label={t('incomingCalls.work.assignedToYou')} variant="info" size="sm" />
        ) : null}
        <CallerTypeBadge call={call} />
        {handledBy ? (
          <AppBadge label={handledBy} variant={call.answeredBy === 'ai' ? 'info' : 'outline'} size="sm" />
        ) : null}
        {call.primaryInquiry ? (
          <AppBadge
            label={t(`incomingCalls.inquiry.${call.primaryInquiry}`, { defaultValue: call.primaryInquiry })}
            variant="muted"
            size="sm"
          />
        ) : null}
        {rangDuringOtherCall(call) ? <CallWaitingNote compact /> : null}
        {call.humanRequested ? (
          <AppBadge label={t('incomingCalls.handoff.badge')} variant="warning" size="sm" />
        ) : null}
      </View>
      <AppText variant="caption" tone="muted">
        {[when, call.durationSeconds > 0 ? formatDuration(call.durationSeconds) : null, call.agent?.name]
          .filter(Boolean)
          .join(' · ')}
      </AppText>
    </AppPressableCard>
  );
}
