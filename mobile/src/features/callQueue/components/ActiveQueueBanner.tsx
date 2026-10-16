import { ChevronRight, ListOrdered } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { IconContainer } from '@/components/ui/IconContainer';
import { cn } from '@/utils/cn';

import { useActiveCallQueue } from '../hooks/useCallQueue';

/** "Resume call queue (3 of 10)": shown on the Leads screen and the Call Agent hub. */
export function ActiveQueueBanner({ onPress, className }: { onPress: () => void; className?: string }) {
  const { t } = useTranslation();
  const { queue, progress, finished } = useActiveCallQueue();
  if (!queue || !progress) return null;
  const title = finished
    ? t('callQueue.banner.finished')
    : t('callQueue.banner.resume', { position: Math.max(1, progress.position), total: progress.total });
  const hint = queue.paused ? t('callQueue.header.paused') : t('callQueue.banner.hint');
  return (
    <AppPressableCard
      variant="outline"
      accessibilityLabel={`${title}. ${hint}`}
      onPress={onPress}
      className={cn(
        'min-h-14 flex-row items-center gap-3 border-primary/30 bg-primary/5 px-3 py-2.5',
        className,
      )}
    >
      <IconContainer icon={ListOrdered} tone="primary" size="sm" />
      <View className="flex-1">
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {hint}
        </AppText>
      </View>
      <Icon icon={ChevronRight} size="sm" color="mutedForeground" flipRtl />
    </AppPressableCard>
  );
}
