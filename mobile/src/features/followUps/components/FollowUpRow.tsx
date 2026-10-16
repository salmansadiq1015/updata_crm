import {
  CircleDot,
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

import { AppPressableCard } from '@/components/ui/AppCard';
import { AppIconButton } from '@/components/ui/AppIconButton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer } from '@/components/ui/IconContainer';
import { formatRelative, supportsRelativeTime } from '@/utils/date';

import type { FollowUp } from '../types';
import { deviceTimeZone, formatFollowUpTime } from '../utils/grouping';

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  whatsapp: MessageCircle,
  in_person: Users,
  letter: FileText,
};

type Props = {
  item: FollowUp;
  overdue?: boolean;
  onOpen: (item: FollowUp) => void;
  onCall: (item: FollowUp) => void;
};

/** One follow-up: lead, when (device time zone + relative), channel, note excerpt, Call. */
export const FollowUpRow = memo(function FollowUpRow({ item, overdue, onOpen, onCall }: Props) {
  const { t, i18n } = useTranslation();
  const when = formatFollowUpTime(item.followUpAt, i18n.language);
  // Without Intl.RelativeTimeFormat the fallback is the same absolute date: don't show it twice.
  const relative = supportsRelativeTime() ? formatRelative(item.followUpAt, i18n.language) : null;
  const device = deviceTimeZone();
  const otherZone =
    item.followUpTimezone && device && item.followUpTimezone !== device ? item.followUpTimezone : null;

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
          {item.note ? (
            <AppText variant="caption" tone="muted" numberOfLines={2}>
              {item.note}
            </AppText>
          ) : null}
        </View>
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
