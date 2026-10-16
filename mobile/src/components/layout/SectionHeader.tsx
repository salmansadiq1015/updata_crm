import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cn } from '@/utils/cn';

export function SectionHeader({
  title,
  right,
  description,
  size = 'default',
  className,
}: {
  title: string;
  right?: ReactNode;
  /** One muted line under the title. */
  description?: string;
  /**
   * `default`: 17pt section title (screen sections, card titles).
   * `group`: small uppercase label above a grouped card, inset to the card's corner.
   */
  size?: 'default' | 'group';
  className?: string;
}) {
  const group = size === 'group';
  return (
    <View
      className={cn(
        'flex-row items-center justify-between gap-3',
        group ? 'min-h-6 px-1' : 'min-h-9',
        className,
      )}
    >
      <View className="flex-1 gap-0.5">
        <AppText
          variant={group ? 'overline' : 'h3'}
          tone={group ? 'muted' : 'default'}
          accessibilityRole="header"
          numberOfLines={2}
        >
          {title}
        </AppText>
        {description ? (
          <AppText variant="caption" tone="muted">
            {description}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}
