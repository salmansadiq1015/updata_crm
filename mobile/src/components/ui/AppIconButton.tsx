import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';

import type { SemanticColors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

import { Icon } from './Icon';

const VARIANTS = {
  ghost: { box: 'bg-transparent active:bg-muted', fg: 'foreground', raised: false },
  outline: { box: 'border border-border bg-card active:bg-muted', fg: 'foreground', raised: true },
  primary: { box: 'bg-primary active:opacity-90', fg: 'primaryForeground', raised: false },
  soft: { box: 'bg-accent active:opacity-80', fg: 'accentForeground', raised: false },
  /** On a gradient/hero surface. */
  inverse: {
    box: 'border border-white/20 bg-white/15 active:bg-white/25',
    fg: 'primaryForeground',
    raised: false,
  },
} as const satisfies Record<string, { box: string; fg: keyof SemanticColors; raised: boolean }>;

export type AppIconButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  icon: LucideIcon;
  /** Required: an icon alone says nothing to a screen reader. */
  accessibilityLabel: string;
  variant?: keyof typeof VARIANTS;
  loading?: boolean;
  flipRtl?: boolean;
  className?: string;
};

/** 48dp square — the minimum Android touch target. */
export function AppIconButton({
  icon,
  accessibilityLabel,
  variant = 'ghost',
  loading,
  disabled,
  flipRtl,
  className,
  ...props
}: AppIconButtonProps) {
  const { colors, shadows } = useTheme();
  const v = VARIANTS[variant];
  const inactive = Boolean(disabled) || Boolean(loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: Boolean(loading) }}
      disabled={inactive}
      style={v.raised && !inactive ? shadows.sm : undefined}
      className={cn(
        'h-12 w-12 items-center justify-center rounded-2xl',
        v.box,
        inactive && 'opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors[v.fg]} />
      ) : (
        <Icon icon={icon} color={v.fg} flipRtl={flipRtl} />
      )}
    </Pressable>
  );
}
