import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';

export type RadioOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type AppRadioGroupProps<T extends string> = {
  options: readonly RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel: string;
  disabled?: boolean;
  className?: string;
};

/** Single choice as a bordered list of full-width rows (each a 48dp+ target). */
export function AppRadioGroup<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled,
  className,
}: AppRadioGroupProps<T>) {
  const { shadows } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={shadows.sm}
      className={cn('overflow-hidden rounded-2xl border border-border bg-card', className)}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        const inactive = disabled || option.disabled;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, disabled: inactive }}
            accessibilityLabel={option.label}
            accessibilityHint={option.description}
            disabled={inactive}
            onPress={() => onChange(option.value)}
            className={cn(
              'min-h-12 flex-row items-center gap-3 px-4 py-3 active:bg-muted',
              index > 0 && 'border-t border-border',
              selected && 'bg-primary/5',
              inactive && 'opacity-50',
            )}
          >
            <View className="flex-1 gap-0.5">
              <AppText className={selected ? 'font-geist-semibold' : undefined}>{option.label}</AppText>
              {option.description ? (
                <AppText variant="caption" tone="muted">
                  {option.description}
                </AppText>
              ) : null}
            </View>
            <View
              className={cn(
                'h-6 w-6 items-center justify-center rounded-full border',
                selected ? 'border-primary bg-primary' : 'border-2 border-input',
              )}
            >
              {selected ? <Icon icon={Check} size="xs" color="primaryForeground" strokeWidth={3} /> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
