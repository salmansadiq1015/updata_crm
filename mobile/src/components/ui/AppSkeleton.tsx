import { useEffect, useId, useState } from 'react';
import { I18nManager, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';

export type AppSkeletonProps = {
  className?: string;
};

/**
 * Placeholder block shaped like the content it stands for, with a soft light band
 * sweeping across it. Static (plain muted block) when reduce-motion is on.
 */
export function AppSkeleton({ className }: AppSkeletonProps) {
  const { colors, scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);
  const id = useId().replace(/:/g, '');

  useEffect(() => {
    if (reduceMotion || width === 0) return;
    progress.set(0);
    progress.set(
      withRepeat(
        withTiming(1, { duration: motion.shimmerDuration, easing: Easing.inOut(Easing.ease) }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, [progress, reduceMotion, width]);

  // The band is as wide as the block and travels from fully before it to fully after
  // it, in reading direction.
  const direction = I18nManager.isRTL ? -1 : 1;
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: (progress.value * 2 - 1) * width * direction }],
  }));

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };

  const highlight = scheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.75)';

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={reduceMotion ? undefined : onLayout}
      style={{ backgroundColor: colors.muted }}
      className={cn('overflow-hidden rounded-lg', className)}
    >
      {!reduceMotion && width > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, sweep]}>
          <Svg width="100%" height="100%" preserveAspectRatio="none">
            <Defs>
              <LinearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={highlight} stopOpacity={0} />
                <Stop offset="0.5" stopColor={highlight} stopOpacity={1} />
                <Stop offset="1" stopColor={highlight} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={`url(#s${id})`} />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}
