import {
  Bot,
  CircleDot,
  Pause,
  Play,
  FileText,
  Mail,
  MessageCircle,
  MessageSquare,
  Phone,
  Users,
  type LucideIcon,
} from 'lucide-react-native';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppPressableCard } from '@/components/ui/AppCard';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { formatRelative, supportsRelativeTime } from '@/utils/date';

import type { FollowUpAiAction } from '../hooks/useFollowUpAiAction';
import { AI_ACTIVE_STATES, type FollowUp } from '../types';
import { deviceTimeZone, formatFollowUpTime } from '../utils/grouping';

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  whatsapp: MessageCircle,
  in_person: Users,
  letter: FileText,
};

const STATE_VARIANT: Record<string, BadgeVariant> = {
  scheduled: 'info', queued: 'primary', calling: 'primary', retry_scheduled: 'warning', paused: 'muted',
  completed: 'success', no_answer: 'warning', busy: 'warning', failed: 'destructive', requires_human: 'warning',
  cancelled: 'muted', skipped: 'muted',
};

type Props = {
  item: FollowUp;
  overdue?: boolean;
  onOpen: (item: FollowUp) => void;
  onCall: (item: FollowUp) => void;
  /** AI follow-up controls; omitted → read-only. */
  onAiAction?: (item: FollowUp, action: FollowUpAiAction) => void;
  aiBusy?: boolean;
};

/** One follow-up: lead, when (device time zone + relative), channel, note excerpt, Call. */
export const FollowUpRow = memo(function FollowUpRow({ item, overdue, onOpen, onCall, onAiAction, aiBusy }: Props) {
  const { t, i18n } = useTranslation();
  const when = formatFollowUpTime(item.followUpAt, i18n.language);
  // Without Intl.RelativeTimeFormat the fallback is the same absolute date: don't show it twice.
  const relative = supportsRelativeTime() ? formatRelative(item.followUpAt, i18n.language) : null;
  const device = deviceTimeZone();
  const otherZone =
    item.followUpTimezone && device && item.followUpTimezone !== device ? item.followUpTimezone : null;
  const ai = item.automation?.mode === 'ai' ? item.automation : null;
  const aiState = ai?.state ?? null;
  const aiActive = aiState ? (AI_ACTIVE_STATES as readonly string[]).includes(aiState) : false;
  const canAct = Boolean(ai && item.followUpId && onAiAction);

  return (
    <AppPressableCard
      onPress={() => onOpen(item)}
      accessibilityLabel={[item.leadName, when, relative].filter(Boolean).join(', ')}
      className="px-3.5 py-3"
    >
      <View className="flex-row items-center gap-3">
        <IconContainer icon={CHANNEL_ICONS[item.channel] ?? CircleDot} tone="muted" size="sm" />
        <View className="flex-1 gap-0.5">
          <AppText variant="title" numberOfLines={1}>
            {item.leadName}
          </AppText>
          <AppText
            variant="caption"
            tone={overdue ? 'destructive' : 'muted'}
            numberOfLines={1}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {[when, relative].filter(Boolean).join(' · ')}
          </AppText>
          {otherZone ? (
            <AppText variant="caption" tone="muted" numberOfLines={1}>
              {t('followUps.setInZone', { zone: otherZone })}
            </AppText>
          ) : null}
          {item.latestCall ? (
            <AppText variant="caption" tone="muted" numberOfLines={2}>
              {[item.latestCall.qualificationStatus, item.latestCall.callStatus]
                .filter(Boolean)
                .map((status) =>
                  t(`leads.lifecycle.${status}`, { defaultValue: status!.replace(/_/g, ' ').toLowerCase() }),
                )
                .join(' · ')}
            </AppText>
          ) : null}
          {item.note ? (
            <AppText variant="caption" tone="muted" numberOfLines={2}>
              {item.note}
            </AppText>
          ) : null}
          {ai ? (
            <View className="mt-1 gap-1">
              <View className="flex-row flex-wrap items-center gap-1.5">
                <AppBadge
                  size="sm"
                  icon={Bot}
                  variant="primary"
                  label={ai.agentName ? t('followUps.ai.agent', { name: ai.agentName }) : t('followUps.ai.managed')}
                />
                {aiState ? (
                  <AppBadge
                    size="sm"
                    dot
                    variant={STATE_VARIANT[aiState] ?? 'muted'}
                    label={t(`followUps.ai.state.${aiState}`, { defaultValue: aiState.replace(/_/g, ' ') })}
                  />
                ) : null}
              </View>
              {ai.summary ? (
                <AppText variant="caption" tone="muted" numberOfLines={2}>
                  {ai.summary}
                </AppText>
              ) : null}
              {ai.lastError ? (
                <AppText variant="caption" tone="destructive" numberOfLines={2}>
                  {ai.lastError}
                </AppText>
              ) : null}
            </View>
          ) : null}
        </View>
        {canAct && aiState === 'paused' ? (
          <AppIconButton
            icon={Play}
            variant="outline"
            disabled={aiBusy}
            accessibilityLabel={t('followUps.ai.resumeA11y', { name: item.leadName })}
            onPress={() => onAiAction?.(item, 'resume')}
          />
        ) : canAct && (aiState === 'scheduled' || aiActive) ? (
          <AppIconButton
            icon={Pause}
            variant="outline"
            disabled={aiBusy}
            accessibilityLabel={t('followUps.ai.pauseA11y', { name: item.leadName })}
            onPress={() => onAiAction?.(item, 'pause')}
          />
        ) : null}
        {canAct && !aiActive ? (
          <AppIconButton
            icon={Bot}
            variant="outline"
            disabled={aiBusy}
            accessibilityLabel={t('followUps.ai.callNowA11y', { name: item.leadName })}
            onPress={() => onAiAction?.(item, 'call-now')}
          />
        ) : null}
        <AppIconButton
          icon={Phone}
          variant="soft"
          accessibilityLabel={t('leads.callA11y', { name: item.leadName })}
          onPress={() => onCall(item)}
        />
      </View>
    </AppPressableCard>
  );
});
