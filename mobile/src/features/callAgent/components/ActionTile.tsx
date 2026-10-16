import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { AppPressableCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { IconContainer, type IconContainerTone } from '@/components/ui/IconContainer';

type Props = {
  icon: LucideIcon;
  tone?: IconContainerTone;
  title: string;
  hint: string;
  /** Extra line under the hint (e.g. why only drafts are possible right now). */
  note?: string | null;
  onPress: () => void;
};

/** One quick action of the Call Agent hub: a whole-card tap target. */
export function ActionTile({ icon, tone = 'primary', title, hint, note, onPress }: Props) {
  return (
    <AppPressableCard
      accessibilityLabel={[title, hint, note].filter(Boolean).join('. ')}
      onPress={onPress}
      className="min-h-16 flex-row items-center gap-3 px-4 py-3"
    >
      <IconContainer icon={icon} tone={tone} size="md" />
      <View className="flex-1 gap-0.5">
        <AppText variant="title" numberOfLines={1}>
          {title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={2}>
          {hint}
        </AppText>
        {note ? (
          <AppText variant="caption" tone="warning" numberOfLines={2}>
            {note}
          </AppText>
        ) : null}
      </View>
      <Icon icon={ChevronRight} size="sm" color="mutedForeground" flipRtl />
    </AppPressableCard>
  );
}
