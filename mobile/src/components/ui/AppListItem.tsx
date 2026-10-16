import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconContainer } from './IconContainer';

export type AppListItemProps = {
  label: string;
  value?: string | null;
  icon?: LucideIcon;
  /** Shown instead of `value` for rich content (badges, switches). */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  bordered?: boolean;
  className?: string;
};

/** Label/value row for detail and settings lists. Becomes a button when `onPress` is set. */
export function AppListItem({
  label,
  value,
  icon,
  trailing,
  onPress,
  accessibilityHint,
  bordered,
  className,
}: AppListItemProps) {
  const content = (
    <>
      {icon ? <IconContainer icon={icon} tone="muted" size="sm" /> : null}
      <View className="flex-1 gap-0.5">
        <AppText variant="caption" tone="muted">
          {label}
        </AppText>
        {value ? (
          <AppText selectable={!onPress} className="font-geist-medium">
            {value}
          </AppText>
        ) : null}
      </View>
      {trailing}
      {onPress ? <Icon icon={ChevronRight} size="sm" color="mutedForeground" flipRtl /> : null}
    </>
  );

  const classes = cn(
    'min-h-12 flex-row items-center gap-3 py-3',
    bordered && 'border-t border-border',
    className,
  );

  if (!onPress) {
    return (
      <View className={classes} accessible accessibilityLabel={value ? `${label}: ${value}` : label}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}: ${value}` : label}
      accessibilityHint={accessibilityHint}
      onPress={onPress}
      className={cn(classes, 'active:opacity-60')}
    >
      {content}
    </Pressable>
  );
}
