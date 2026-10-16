import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import type { SemanticColors } from '@/theme/colors';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';

// client/src/components/ui/badge.jsx: rounded-full pill, tinted backgrounds, plus a
// faint tone-coloured hairline so pills stay crisp on tinted and dark surfaces.
const VARIANTS = {
  default: { box: 'border-primary bg-primary', text: 'text-primary-foreground', fg: 'primaryForeground' },
  primary: { box: 'border-primary/20 bg-primary/10', text: 'text-primary', fg: 'primary' },
  info: { box: 'border-info/25 bg-info/10', text: 'text-info', fg: 'info' },
  success: { box: 'border-success/25 bg-success/10', text: 'text-success', fg: 'success' },
  warning: { box: 'border-warning/30 bg-warning/15', text: 'text-warning', fg: 'warning' },
  destructive: {
    box: 'border-destructive/25 bg-destructive/10',
    text: 'text-destructive',
    fg: 'destructive',
  },
  muted: { box: 'border-border bg-muted', text: 'text-muted-foreground', fg: 'mutedForeground' },
  outline: { box: 'border-border bg-transparent', text: 'text-foreground', fg: 'foreground' },
} as const satisfies Record<string, { box: string; text: string; fg: keyof SemanticColors }>;

const SIZES = {
  sm: { box: 'gap-1 px-2 py-0.5', text: 'caption' },
  md: { box: 'gap-1.5 px-2.5 py-1', text: 'caption' },
} as const;

export type BadgeVariant = keyof typeof VARIANTS;

export type AppBadgeProps = {
  label: string;
  variant?: BadgeVariant;
  icon?: LucideIcon;
  /** Leading status dot (when there is no icon) — a shape cue besides colour. */
  dot?: boolean;
  size?: keyof typeof SIZES;
  className?: string;
};

const DOTS: Record<BadgeVariant, string> = {
  default: 'bg-primary-foreground',
  primary: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground',
  outline: 'bg-foreground',
};

export function AppBadge({ label, variant = 'default', icon, dot, size = 'md', className }: AppBadgeProps) {
  const v = VARIANTS[variant];
  const s = SIZES[size];
  return (
    <View className={cn('flex-row items-center self-start rounded-full border', s.box, v.box, className)}>
      {icon ? (
        <Icon icon={icon} size="xs" color={v.fg} />
      ) : dot ? (
        <View className={cn('h-1.5 w-1.5 rounded-full', DOTS[variant])} />
      ) : null}
      <AppText variant={s.text} className={cn('font-geist-semibold', v.text)} numberOfLines={1}>
        {label}
      </AppText>
    </View>
  );
}
