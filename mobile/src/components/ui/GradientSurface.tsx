import { useId, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
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
  // The SVG is drawn at the measured pixel size: percentage sizes inside scroll
  // views can resolve to a sliver on Android, leaving white text on a light page.
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (!size || Math.abs(size.width - width) > 0.5 || Math.abs(size.height - height) > 0.5)
      setSize({ width, height });
  };

  return (
    <View
      className={cn('overflow-hidden', className)}
      onLayout={onLayout}
      // Solid brand fallback underneath (before the first layout, and if SVG fails), so
      // inverse text is always legible. Dark mode adds a faint light hairline edge.
      style={[{ backgroundColor: stops[1] ?? stops[0] }, scheme === 'dark' ? DARK_EDGE : undefined, style]}
    >
      {size ? (
        <Svg
          style={StyleSheet.absoluteFill}
          width={size.width}
          height={size.height}
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
          <Rect x="0" y="0" width={size.width} height={size.height} fill={`url(#g${id})`} />
          {decorated ? (
            <>
              <Circle
                cx={size.width * 0.92}
                cy={size.height * -0.06}
                r={Math.max(size.width, size.height) * 0.42}
                fill={`url(#o${id})`}
              />
              <Circle
                cx={size.width * 0.04}
                cy={size.height * 1.12}
                r={Math.max(size.width, size.height) * 0.34}
                fill={`url(#o${id})`}
              />
            </>
          ) : null}
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
