import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

export type AppearProps = {
  children: ReactNode;
  /** Position in a list/grid: entrances are staggered for the first few items only. */
  index?: number;
  /** `rise` fades in while moving up a few dp; `fade` only fades (dense lists). */
  variant?: 'rise' | 'fade';
  /** Also animate size/position changes of this block (expanding sections, reflow). */
  layout?: boolean;
  /** Style only: NativeWind classes are not applied to animated views. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Short, restrained entrance for cards, sections and list rows. Renders a plain
 * wrapper (no animation) when the OS asks for reduced motion.
 */
export function Appear({ children, index = 0, variant = 'rise', layout, style }: AppearProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <Animated.View style={style}>{children}</Animated.View>;

  const delay = Math.min(index, motion.maxStaggerItems) * motion.stagger;
  const entering =
    variant === 'rise'
      ? FadeInDown.duration(motion.duration.base)
          .delay(delay)
          .easing(Easing.out(Easing.cubic))
          .withInitialValues({ transform: [{ translateY: 8 }] })
      : FadeIn.duration(motion.duration.base).delay(delay).easing(Easing.out(Easing.cubic));

  return (
    <Animated.View
      entering={entering}
      layout={layout ? LinearTransition.duration(motion.duration.base) : undefined}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
