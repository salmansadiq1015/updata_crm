import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Sparkles } from 'lucide-react-native';
import { useEffect, useId } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

import { usePressScale } from '@/components/motion/usePressScale';
import { AppText } from '@/components/ui/AppText';
import { brand, withAlpha } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';

const SIZE = 58;
/** How far the button rises above the tab bar's top edge. */
const LIFT = 24;
/** Must match MainNavigator's tabBarItemStyle.paddingTop and the default 24dp icon. */
const TAB_PADDING_TOP = 8;
const ICON_SLOT = 24;

const STOPS = {
  light: [brand[400], brand[600], brand[800]],
  dark: [brand[300], brand[500], brand[700]],
} as const;

type Props = BottomTabBarButtonProps & {
  label: string;
  /** Full name read by screen readers ("Updata Call Agent"). */
  a11yLabel: string;
};

/**
 * The highlighted centre tab: a raised brand-gradient disc with a soft glow, its
 * label underneath. Still a real tab for assistive tech (role, selected state,
 * full-height ≥48dp target). Focus/press motion is skipped under reduced motion.
 */
export function AgentTabButton({ onPress, onLongPress, testID, style, label, a11yLabel, ...rest }: Props) {
  const { scheme, colors } = useTheme();
  const selected = rest['aria-selected'] === true;
  const reduceMotion = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const press = usePressScale(motion.pressScale.chip);

  const focus = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    if (reduceMotion) focus.set(target);
    else focus.set(withTiming(target, { duration: motion.duration.base, easing: Easing.out(Easing.cubic) }));
  }, [focus, reduceMotion, selected]);
  const focusStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * focus.value }] }));

  const stops = STOPS[scheme];
  const glow =
    scheme === 'dark'
      ? `0px 6px 18px ${withAlpha(brand[400], selected ? 0.5 : 0.32)}`
      : `0px 8px 20px ${withAlpha(brand[600], selected ? 0.5 : 0.36)}`;

  return (
    <Pressable
      testID={testID ?? 'tab-call-agent'}
      onPress={onPress}
      onLongPress={onLongPress ?? undefined}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      accessibilityRole="tab"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ selected }}
      style={[style, styles.target]}
    >
      {/* Same column as the other tabs (8 top padding, 24 icon slot, label); the disc is
          drawn over the icon slot and rises above the bar, so the label baseline matches. */}
      <View style={styles.iconSlot} />
      <Animated.View style={[styles.discAnchor, press.style]}>
        <Animated.View
          style={[
            styles.disc,
            { borderColor: colors.card, boxShadow: glow },
            selected && { outlineColor: withAlpha(colors.primary, 0.28), outlineWidth: 3 },
            focusStyle,
          ]}
        >
          <Svg
            style={StyleSheet.absoluteFill}
            width="100%"
            height="100%"
            viewBox="0 0 100 100"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Defs>
              <LinearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1">
                {stops.map((color, index) => (
                  <Stop key={color} offset={index / (stops.length - 1)} stopColor={color} />
                ))}
              </LinearGradient>
              <RadialGradient id={`h${id}`} cx="30%" cy="22%" r="55%">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.42} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx="50" cy="50" r="50" fill={`url(#t${id})`} />
            <Circle cx="50" cy="50" r="50" fill={`url(#h${id})`} />
          </Svg>
          <Sparkles
            size={26}
            color="#FFFFFF"
            strokeWidth={selected ? 2.4 : 2.1}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
        </Animated.View>
      </Animated.View>
      <View style={styles.labelBox}>
        <AppText
          numberOfLines={1}
          maxFontSizeMultiplier={1.3}
          style={[styles.label, { color: selected ? colors.primary : colors.mutedForeground }]}
        >
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  target: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    minHeight: 48,
    paddingTop: TAB_PADDING_TOP,
  },
  iconSlot: { height: ICON_SLOT },
  // Disc rises LIFT above the bar; it ends exactly where the label starts (8 + 24 + 2).
  discAnchor: {
    position: 'absolute',
    top: -LIFT,
    alignSelf: 'center',
  },
  disc: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: { marginTop: 2 },
  label: { fontFamily: 'Geist-SemiBold', fontSize: 11 },
});
