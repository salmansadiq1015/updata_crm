import { useCallback } from 'react';
import type { GestureResponderEvent } from 'react-native';
import {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '@/theme/tokens';

type PressHandler = ((event: GestureResponderEvent) => void) | null | undefined;

/**
 * Subtle press feedback: the target shrinks to `scaleTo` while held and settles back
 * on release. Returns a style for an `Animated.View` plus press handlers that also
 * call the caller's own `onPressIn` / `onPressOut`. A no-op under reduce motion.
 *
 * NativeWind cannot merge an animated style into a `className` element, so the
 * animated view is a style-only wrapper around the styled Pressable.
 */
export function usePressScale(
  scaleTo: number = motion.pressScale.button,
  handlers: { onPressIn?: PressHandler; onPressOut?: PressHandler } = {},
) {
  const reduceMotion = useReducedMotion();
  const progress = useSharedValue(0);
  const { onPressIn, onPressOut } = handlers;

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - scaleTo) * progress.value }],
  }));

  const handlePressIn = useCallback(
    (event: GestureResponderEvent) => {
      if (!reduceMotion) {
        progress.set(withTiming(1, { duration: motion.duration.instant, easing: Easing.out(Easing.quad) }));
      }
      onPressIn?.(event);
    },
    [onPressIn, progress, reduceMotion],
  );

  const handlePressOut = useCallback(
    (event: GestureResponderEvent) => {
      if (!reduceMotion) {
        progress.set(withTiming(0, { duration: motion.duration.fast, easing: Easing.out(Easing.cubic) }));
      }
      onPressOut?.(event);
    },
    [onPressOut, progress, reduceMotion],
  );

  return { style, onPressIn: handlePressIn, onPressOut: handlePressOut };
}
