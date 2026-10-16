import type { LucideIcon } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { IconContainer, type IconContainerTone } from '@/components/ui/IconContainer';
import { readinessMessage } from '@/features/aiAgent/components/ReadinessNotice';
import type { Readiness } from '@/features/aiAgent/domain/agentDomain';
import type { AgentChannel } from '@/features/aiAgent/types';

const LOOK: Record<Readiness['state'], { badge: BadgeVariant; tone: IconContainerTone; key: string }> = {
  ready: { badge: 'success', tone: 'success', key: 'ready' },
  not_ready: { badge: 'destructive', tone: 'destructive', key: 'notReady' },
  unknown: { badge: 'warning', tone: 'warning', key: 'unknown' },
  checking: { badge: 'muted', tone: 'muted', key: 'checking' },
};

type Props = { channel: AgentChannel; icon: LucideIcon; title: string; readiness: Readiness };

/** Live provider readiness exactly as the server reported it (never optimistic). */
export function ReadinessCard({ channel, icon, title, readiness }: Props) {
  const { t } = useTranslation();
  const look = LOOK[readiness.state];
  const status = t(`callAgent.readiness.${look.key as 'ready'}`);
  const { message } = readinessMessage(t, channel, readiness);
  // One compact row: icon · title + the server's reason · status pill (no nested alert box).
  return (
    <AppCard className="flex-row items-center gap-3 px-4 py-3">
      <IconContainer icon={icon} tone={look.tone} size="md" />
      <View className="flex-1 gap-0.5" accessible accessibilityLabel={`${title}: ${status}. ${message}`}>
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={2}>
          {message}
        </AppText>
      </View>
      <AppBadge label={status} variant={look.badge} dot />
    </AppCard>
  );
}
