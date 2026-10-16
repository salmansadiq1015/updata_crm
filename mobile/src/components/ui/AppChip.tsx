import { Check, type LucideIcon } from 'lucide-react-native';
import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePressScale } from '@/components/motion/usePressScale';
import { motion } from '@/theme/tokens';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';

export type AppChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Leading icon while not selected (selected chips show a check). */
  icon?: LucideIcon;
  className?: string;
};

/** Filter toggle. Selected state is announced and marked with a check, not only coloured. */
export function AppChip({ label, selected, onPress, icon, className }: AppChipProps) {
  const press = usePressScale(motion.pressScale.chip);
  const leading = selected ? Check : icon;
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={{ top: 6, bottom: 6 }}
        className={cn(
          'h-9 flex-row items-center justify-center gap-1.5 rounded-full border px-3.5',
          selected ? 'border-primary bg-primary' : 'border-border bg-card active:bg-muted',
          className,
        )}
      >
        {leading ? (
          <Icon
            icon={leading}
            size="xs"
            strokeWidth={selected ? 3 : 2}
            color={selected ? 'primaryForeground' : 'mutedForeground'}
          />
        ) : null}
        <AppText
          variant="label"
          numberOfLines={1}
          className={selected ? 'text-primary-foreground' : 'text-foreground'}
        >
          {label}
        </AppText>
      </Pressable>
    </Animated.View>
  );
}
