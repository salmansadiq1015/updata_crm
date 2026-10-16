import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Appear } from '@/components/motion/Appear';
import type { SemanticColors } from '@/theme/colors';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';

export type AppEmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Usually one AppButton: the next useful step. */
  action?: ReactNode;
  iconColor?: keyof SemanticColors;
  className?: string;
};

// Tinted halo per icon colour; anything else falls back to the neutral muted halo.
const HALOS: Partial<Record<keyof SemanticColors, { outer: string; inner: string }>> = {
  destructive: { outer: 'bg-destructive/5', inner: 'bg-destructive/10 border-destructive/20' },
  primary: { outer: 'bg-primary/5', inner: 'bg-primary/10 border-primary/20' },
  warning: { outer: 'bg-warning/5', inner: 'bg-warning/15 border-warning/25' },
  success: { outer: 'bg-success/5', inner: 'bg-success/10 border-success/20' },
};
const NEUTRAL_HALO = { outer: 'bg-muted/50', inner: 'bg-card border-border' };

export function AppEmptyState({
  icon,
  title,
  description,
  action,
  iconColor = 'mutedForeground',
  className,
}: AppEmptyStateProps) {
  const halo = HALOS[iconColor] ?? NEUTRAL_HALO;
  return (
    <View className={cn('items-center gap-3 px-6 py-12', className)} accessibilityRole="summary">
      <Appear variant="fade">
        <View className={cn('mb-1 h-24 w-24 items-center justify-center rounded-full', halo.outer)}>
          <View className={cn('h-16 w-16 items-center justify-center rounded-3xl border', halo.inner)}>
            <Icon icon={icon} size="lg" color={iconColor} />
          </View>
        </View>
      </Appear>
      <AppText variant="title" className="text-center text-xl">
        {title}
      </AppText>
      {description ? (
        <AppText tone="muted" className="max-w-xs text-center">
          {description}
        </AppText>
      ) : null}
      {action ? <View className="mt-3">{action}</View> : null}
    </View>
  );
}
