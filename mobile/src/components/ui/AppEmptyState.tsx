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
  /**
   * `screen` (default): centred, for a whole-screen list with nothing in it.
   * `inline`: one compact row for an empty section inside a scrolling screen.
   */
  size?: 'screen' | 'inline';
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
  size = 'screen',
  className,
}: AppEmptyStateProps) {
  const halo = HALOS[iconColor] ?? NEUTRAL_HALO;

  if (size === 'inline') {
    return (
      <View
        accessibilityRole="summary"
        className={cn(
          'min-h-14 flex-row items-center gap-3 rounded-2xl border border-dashed border-border px-3.5 py-3',
          className,
        )}
      >
        <View className={cn('h-9 w-9 items-center justify-center rounded-xl border', halo.inner)}>
          <Icon icon={icon} size="sm" color={iconColor} />
        </View>
        <View className="flex-1 gap-0.5">
          <AppText variant="label" className="font-geist-semibold">
            {title}
          </AppText>
          {description ? (
            <AppText variant="caption" tone="muted">
              {description}
            </AppText>
          ) : null}
        </View>
        {action}
      </View>
    );
  }

  return (
    <View className={cn('items-center gap-2 px-6 py-10', className)} accessibilityRole="summary">
      <Appear variant="fade">
        <View className={cn('mb-2 h-20 w-20 items-center justify-center rounded-full', halo.outer)}>
          <View className={cn('h-14 w-14 items-center justify-center rounded-2xl border', halo.inner)}>
            <Icon icon={icon} size="lg" color={iconColor} />
          </View>
        </View>
      </Appear>
      <AppText variant="h3" accessibilityRole="text" className="text-center">
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
