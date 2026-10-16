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
  return (
    <View
      className={cn(
        'flex-row items-end gap-3 px-4',
        large ? 'pb-4 pt-3' : 'items-center pb-3 pt-2',
        className,
      )}
    >
      <View className="flex-1 gap-1">
        {eyebrow ? (
          <AppText variant="overline" tone="primary" numberOfLines={1}>
            {eyebrow}
          </AppText>
        ) : null}
        <AppText variant={large ? 'h1' : 'h2'} numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText tone="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right ? <View className="flex-row items-center gap-2">{right}</View> : null}
    </View>
  );
}
