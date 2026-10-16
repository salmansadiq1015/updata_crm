import type { ReactNode } from 'react';
import { Pressable, View, type PressableProps } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';

// client/src/components/ui/card.jsx, softened for touch: rounded-2xl, hairline border,
// layered low-contrast shadow.
const BASE = 'rounded-2xl border border-border bg-card';

const VARIANTS = {
  /** Raised surface (default). */
  elevated: { box: '', shadow: 'md' },
  /** Flat with a border: dense groups, nested cards. */
  outline: { box: '', shadow: null },
  /** Recessed tinted panel, no shadow. */
  muted: { box: 'border-transparent bg-muted/60', shadow: null },
} as const;

export type AppCardVariant = keyof typeof VARIANTS;

type CardProps = {
  children: ReactNode;
  className?: string;
  variant?: AppCardVariant;
};

type PressableCardProps = CardProps &
  Omit<PressableProps, 'children' | 'style'> & {
    onPress: NonNullable<PressableProps['onPress']>;
    accessibilityLabel: string;
  };

export function AppCard({ children, className, variant = 'elevated' }: CardProps) {
  const { shadows } = useTheme();
  const v = VARIANTS[variant];
  return (
    <View style={v.shadow ? shadows[v.shadow] : undefined} className={cn(BASE, 'p-4', v.box, className)}>
      {children}
    </View>
  );
}

/** A card that is one tap target (list rows, KPI tiles linking somewhere). Shrinks slightly on press. */
export function AppPressableCard({
  children,
  className,
  variant = 'elevated',
  onPressIn,
  onPressOut,
  ...props
}: PressableCardProps) {
  const { shadows } = useTheme();
  const v = VARIANTS[variant];
  const press = usePressScale(motion.pressScale.card, { onPressIn, onPressOut });
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        style={v.shadow ? shadows[v.shadow] : undefined}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        className={cn(BASE, 'p-4 active:bg-muted/60', v.box, className)}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
