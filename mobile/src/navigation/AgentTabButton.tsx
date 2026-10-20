import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import { AppText } from '@/components/ui/AppText';
import { AiAgentAvatar } from '@/features/callAgent/components/AiAgentAvatar';
import { brand, withAlpha } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { motion } from '@/theme/tokens';

const SIZE = 60;
// The source PNG has intentional transparent breathing room. Render it slightly
// beyond the 60dp backing disc so the visible orb reads at the same weight as
// the neighbouring 22dp navigation glyphs.
const IMAGE_SIZE = 64;
/** How far the button rises above the tab bar's top edge. */
const LIFT = 24;
/** Must match MainNavigator's tabBarItemStyle.paddingTop and the default 24dp icon. */
const TAB_PADDING_TOP = 8;
const ICON_SLOT = 24;

type Props = BottomTabBarButtonProps & {
  label: string;
  /** Full name read by screen readers ("Updata Call Agent"). */
  a11yLabel: string;
};

/**
 * The highlighted centre tab: the canonical Agent image on a raised surface with
 * a soft glow and its label underneath. Still a real tab for assistive tech (role, selected state,
 * full-height ≥48dp target). Focus/press motion is skipped under reduced motion.
 */
export function AgentTabButton({ onPress, onLongPress, testID, style, label, a11yLabel, ...rest }: Props) {
  const { scheme, colors } = useTheme();
  const selected = rest['aria-selected'] === true;
  const reduceMotion = useReducedMotion();
  const press = usePressScale(motion.pressScale.chip);

  const focus = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    const target = selected ? 1 : 0;
    if (reduceMotion) focus.set(target);
    else focus.set(withTiming(target, { duration: motion.duration.base, easing: Easing.out(Easing.cubic) }));
  }, [focus, reduceMotion, selected]);
  const focusStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * focus.value }] }));

  const glow =
    scheme === 'dark'
      ? `0px 6px 18px ${withAlpha(brand[400], selected ? 0.55 : 0.3)}`
      : `0px 8px 20px ${withAlpha(brand[600], selected ? 0.48 : 0.3)}`;

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
            {
              backgroundColor: colors.card,
              borderColor: colors.card,
              boxShadow: glow,
              opacity: selected ? 1 : 0.9,
            },
            selected && { outlineColor: withAlpha(colors.primary, 0.28), outlineWidth: 3 },
            focusStyle,
          ]}
        >
          <AiAgentAvatar size={IMAGE_SIZE} testID="ai-agent-tab-logo" />
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
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  labelBox: { marginTop: 2 },
  label: { fontFamily: 'Geist-SemiBold', fontSize: 11 },
});
