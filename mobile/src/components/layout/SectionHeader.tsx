import type { ReactNode } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { cn } from '@/utils/cn';

export function SectionHeader({
  title,
  right,
  description,
  className,
}: {
  title: string;
  right?: ReactNode;
  /** One muted line under the title. */
  description?: string;
  className?: string;
}) {
  return (
    <View className={cn('min-h-10 flex-row items-center justify-between gap-3', className)}>
      <View className="flex-1 gap-0.5">
        <AppText variant="title" numberOfLines={2}>
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
