import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { AppCard } from '@/components/ui/AppCard';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { IconContainer, type IconContainerTone } from '@/components/ui/IconContainer';

type Props = {
  label: string;
  value: number | undefined;
  icon: LucideIcon;
  loading?: boolean;
  /** Tint of the icon tile; tiles in a grid each get their own. */
  tone?: IconContainerTone;
};

/** KPI tile (web dashboard stat card): icon tile, large value, label. */
export function StatTile({ label, value, icon, loading, tone = 'accent' }: Props) {
  return (
    <AppCard className="min-w-[45%] flex-1 gap-4">
      <IconContainer icon={icon} tone={tone} size="md" />
      <View className="gap-1" accessible accessibilityLabel={`${label}: ${value ?? '…'}`}>
        {loading || value === undefined ? (
          <AppSkeleton className="h-9 w-20" />
        ) : (
          <AppText variant="h1" accessibilityRole="text">
            {value.toLocaleString()}
          </AppText>
        )}
        <AppText variant="label" tone="muted" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </AppCard>
  );
}
