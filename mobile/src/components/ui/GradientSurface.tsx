import { useId, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

export type GradientSurfaceProps = {
  children?: ReactNode;
  /** Defaults to the brand hero gradient of the active scheme. */
  colors?: readonly string[];
  /** Soft light orbs in the corners for depth (decorative). */
  decorated?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
};

const DARK_EDGE = { borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.08)' } as const;

/**
 * Brand-navy gradient panel (react-native-svg, no native gradient dependency).
 * Content sits above the gradient; give it `text-white`-style tones.
 */
export function GradientSurface({
  children,
  colors,
  decorated = true,
  className,
  style,
}: GradientSurfaceProps) {
  const { gradient, scheme } = useTheme();
  const stops = colors ?? gradient;
  const id = useId().replace(/:/g, '');

  return (
    <View
      className={cn('overflow-hidden', className)}
      // Dark mode: a faint light hairline keeps the panel from melting into the background.
      style={[scheme === 'dark' ? DARK_EDGE : undefined, style]}
    >
      <Svg
        style={StyleSheet.absoluteFill}
        width="100%"
        height="100%"
        preserveAspectRatio="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Defs>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            {stops.map((color, index) => (
              <Stop
                key={`${color}-${index}`}
                offset={stops.length === 1 ? 0 : index / (stops.length - 1)}
                stopColor={color}
              />
            ))}
          </LinearGradient>
          <RadialGradient id={`o${id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#g${id})`} />
        {decorated ? (
          <>
            <Circle cx="92%" cy="-6%" r="44%" fill={`url(#o${id})`} />
            <Circle cx="4%" cy="112%" r="36%" fill={`url(#o${id})`} />
          </>
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
