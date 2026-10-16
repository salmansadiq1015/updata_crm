import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cn } from '@/utils/cn';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Primary screen action(s), e.g. an AppIconButton. */
  right?: ReactNode;
  /** Small uppercase label above the title (context, date, section). */
  eyebrow?: string;
  /** `large` (default): large-title header for top-level screens. `compact`: pushed screens. */
  size?: 'large' | 'compact';
  className?: string;
};

export function ScreenHeader({
  title,
  subtitle,
  right,
  eyebrow,
  size = 'large',
  className,
}: ScreenHeaderProps) {
  const large = size === 'large';
  // One pattern everywhere: eyebrow, then a 48dp row with the title flush to the
  // content gutter and actions vertically centred on it, then an optional subtitle.
  return (
    <View className={cn('px-4', large ? 'pb-3 pt-2' : 'pb-2 pt-1', className)}>
      {eyebrow ? (
        <AppText variant="overline" tone="primary" numberOfLines={1}>
          {eyebrow}
        </AppText>
      ) : null}
      <View className="min-h-12 flex-row items-center gap-2">
        <AppText variant={large ? 'h1' : 'h2'} numberOfLines={1} className="flex-1">
          {title}
        </AppText>
        {right ? <View className="-me-1 flex-row items-center gap-1">{right}</View> : null}
      </View>
      {subtitle ? (
        <AppText tone="muted" numberOfLines={2}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}
