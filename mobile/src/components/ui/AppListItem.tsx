import { ChevronRight, type LucideIcon } from 'lucide-react-native';
import { Children, createContext, Fragment, isValidElement, use, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';
import { IconContainer, type IconContainerTone } from './IconContainer';

export type AppListItemProps = {
  label: string;
  value?: string | null;
  icon?: LucideIcon;
  /** Tint of the leading icon tile (settings rows use colour to aid scanning). */
  iconTone?: IconContainerTone;
  /** Shown instead of `value` for rich content (badges, switches). */
  trailing?: ReactNode;
  onPress?: () => void;
  accessibilityHint?: string;
  /**
   * `stacked` (default): small muted label above the value (detail lists).
   * `inline`: label as the row title, value muted at the trailing edge (settings rows).
   */
  layout?: 'stacked' | 'inline';
  bordered?: boolean;
  className?: string;
};

// Rows inside an AppListGroup take the group's gutter and its inset dividers.
const GroupContext = createContext(false);

/** Label/value row for detail and settings lists. Becomes a button when `onPress` is set. */
export function AppListItem({
  label,
  value,
  icon,
  iconTone = 'muted',
  trailing,
  onPress,
  accessibilityHint,
  layout = 'stacked',
  bordered,
  className,
}: AppListItemProps) {
  const grouped = use(GroupContext);
  const inline = layout === 'inline';
  const content = (
    <>
      {icon ? <IconContainer icon={icon} tone={iconTone} size="sm" /> : null}
      {inline ? (
        <>
          <AppText className="flex-1 font-geist-medium" numberOfLines={2}>
            {label}
          </AppText>
          {value ? (
            <AppText
              variant="label"
              tone="muted"
              numberOfLines={1}
              selectable={!onPress}
              className="max-w-[55%] text-right"
            >
              {value}
            </AppText>
          ) : null}
        </>
      ) : (
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
      )}
      {trailing}
      {onPress ? <Icon icon={ChevronRight} size="sm" color="mutedForeground" flipRtl /> : null}
    </>
  );

  const classes = cn(
    'min-h-12 flex-row items-center gap-3 py-2.5',
    grouped && 'px-4',
    bordered && !grouped && 'border-t border-border',
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
      className={cn(classes, 'active:bg-muted/70')}
    >
      {content}
    </Pressable>
  );
}

export type AppListGroupProps = {
  children: ReactNode;
  /** Small label above the group (iOS / Material 3 grouped list). */
  title?: string;
  /** Muted helper line under the group. */
  footer?: string;
  /** Rows have no leading icon: dividers run from the gutter instead of after the icon. */
  plain?: boolean;
  className?: string;
};

/**
 * Grouped card of rows with hairline dividers inset past the icon column.
 * Children are AppListItems (or any row that pads itself with `px-4`).
 */
export function AppListGroup({ children, title, footer, plain, className }: AppListGroupProps) {
  const { shadows, scheme } = useTheme();
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View className={cn('gap-1.5', className)}>
      {title ? (
        <AppText variant="overline" tone="muted" accessibilityRole="header" className="px-1">
          {title}
        </AppText>
      ) : null}
      <View
        style={scheme === 'dark' ? undefined : shadows.sm}
        className="overflow-hidden rounded-2xl border border-border bg-card"
      >
        <GroupContext value>
          {rows.map((row, index) => (
            <Fragment key={row.key ?? index}>
              {index > 0 ? <View className={cn('h-px bg-border', plain ? 'ms-4' : 'ms-[60px]')} /> : null}
              {row}
            </Fragment>
          ))}
        </GroupContext>
      </View>
      {footer ? (
        <AppText variant="caption" tone="muted" className="px-1">
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}
