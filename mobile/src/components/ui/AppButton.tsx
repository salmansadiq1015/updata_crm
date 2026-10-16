import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, type PressableProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import type { SemanticColors } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';

// Variants mirror client/src/components/ui/button.jsx; sizes are scaled up for
// touch (smallest still reaches a 48dp target through hitSlop).
const VARIANTS = {
  primary: {
    box: 'bg-primary',
    pressed: 'active:opacity-90',
    text: 'text-primary-foreground',
    fg: 'primaryForeground',
    glow: true,
  },
  secondary: {
    box: 'bg-secondary',
    pressed: 'active:opacity-90',
    text: 'text-secondary-foreground',
    fg: 'secondaryForeground',
    glow: false,
  },
  outline: {
    box: 'border border-border bg-card',
    pressed: 'active:bg-muted',
    text: 'text-foreground',
    fg: 'foreground',
    glow: false,
  },
  ghost: {
    box: 'bg-transparent',
    pressed: 'active:bg-muted',
    text: 'text-foreground',
    fg: 'foreground',
    glow: false,
  },
  /** Tinted primary: a quieter call to action next to a filled one. */
  soft: {
    box: 'bg-primary/10',
    pressed: 'active:bg-primary/15',
    text: 'text-primary',
    fg: 'primary',
    glow: false,
  },
  destructive: {
    box: 'bg-destructive',
    pressed: 'active:opacity-90',
    text: 'text-destructive-foreground',
    fg: 'destructiveForeground',
    glow: false,
  },
  success: {
    box: 'bg-success',
    pressed: 'active:opacity-90',
    text: 'text-success-foreground',
    fg: 'successForeground',
    glow: false,
  },
  /** Translucent white, for actions placed on a gradient/hero surface. */
  inverse: {
    box: 'border border-white/20 bg-white/15',
    pressed: 'active:bg-white/25',
    text: 'text-white',
    fg: 'primaryForeground',
    glow: false,
  },
  // Inline text action ("Forgot password?"); keeps a 48dp target through hitSlop.
  link: {
    box: 'h-auto bg-transparent px-0',
    pressed: 'active:opacity-70',
    text: 'text-primary',
    fg: 'primary',
    glow: false,
  },
} as const satisfies Record<
  string,
  { box: string; pressed: string; text: string; fg: keyof SemanticColors; glow: boolean }
>;

const SIZES = {
  sm: { box: 'h-10 gap-1.5 rounded-xl px-3.5', text: 'text-sm', icon: 'sm', hitSlop: 4 },
  md: { box: 'h-12 gap-2 rounded-xl px-5', text: 'text-base', icon: 'sm', hitSlop: 0 },
  lg: { box: 'h-14 gap-2.5 rounded-2xl px-6', text: 'text-lg', icon: 'md', hitSlop: 0 },
} as const;

export type ButtonVariant = keyof typeof VARIANTS;
export type ButtonSize = keyof typeof SIZES;

export type AppButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  title: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  fullWidth?: boolean;
  className?: string;
};

export function AppButton({
  title,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  leftIcon,
  rightIcon,
  fullWidth,
  className,
  accessibilityLabel,
  onPressIn,
  onPressOut,
  ...props
}: AppButtonProps) {
  const { colors, glow } = useTheme();
  const v = VARIANTS[variant];
  const s = SIZES[size];
  const inactive = Boolean(disabled) || loading;
  const press = usePressScale(variant === 'link' ? 1 : motion.pressScale.button, { onPressIn, onPressOut });

  return (
    <Animated.View style={[press.style, fullWidth && { alignSelf: 'stretch' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityState={{ disabled: inactive, busy: loading }}
        disabled={inactive}
        hitSlop={variant === 'link' ? 12 : s.hitSlop}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={v.glow && !inactive ? glow : undefined}
        className={cn(
          'flex-row items-center justify-center',
          s.box,
          v.box,
          variant === 'link' && 'h-auto px-0',
          !inactive && v.pressed,
          fullWidth && 'w-full',
          inactive && 'opacity-50',
          className,
        )}
        {...props}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors[v.fg]} testID="app-button-spinner" />
        ) : leftIcon ? (
          <Icon icon={leftIcon} size={s.icon} color={v.fg} />
        ) : null}
        <AppText numberOfLines={1} className={cn('font-geist-semibold', s.text, v.text)}>
          {title}
        </AppText>
        {rightIcon && !loading ? <Icon icon={rightIcon} size={s.icon} color={v.fg} flipRtl /> : null}
      </Pressable>
    </Animated.View>
  );
}
