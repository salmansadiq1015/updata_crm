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
  /**
   * `list` (default): grouped card of full-width rows.
   * `segmented`: equal-width choices for 2–4 short options (e.g. theme).
   */
  appearance?: 'list' | 'segmented';
  className?: string;
};

/** Single choice as a bordered list of full-width rows (each a 48dp+ target). */
export function AppRadioGroup<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  disabled,
  appearance = 'list',
  className,
}: AppRadioGroupProps<T>) {
  const { shadows, scheme } = useTheme();

  if (appearance === 'segmented') {
    return (
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={accessibilityLabel}
        className={cn('min-h-14 flex-row gap-1 rounded-2xl border border-border bg-muted p-1', className)}
      >
        {options.map((option) => {
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
              hitSlop={{ top: 4, bottom: 4 }}
              style={selected && scheme === 'light' ? shadows.sm : undefined}
              className={cn(
                'min-h-12 min-w-0 flex-1 items-center justify-center rounded-xl border px-2 py-2',
                selected ? 'border-primary/30 bg-card' : 'border-transparent active:bg-card/60',
                inactive && 'opacity-50',
              )}
            >
              <AppText
                variant="label"
                className={cn(
                  'text-center',
                  selected ? 'font-geist-semibold text-accent-foreground' : 'text-muted-foreground',
                )}
              >
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={scheme === 'light' ? shadows.sm : undefined}
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
              selected && 'bg-accent',
              inactive && 'opacity-50',
            )}
          >
            {index > 0 ? (
              <View className="absolute end-0 start-4 top-0 h-px bg-border" pointerEvents="none" />
            ) : null}
            <View className="flex-1 gap-0.5">
              <AppText
                className={selected ? 'font-geist-semibold text-accent-foreground' : 'font-geist-medium'}
              >
                {option.label}
              </AppText>
              {option.description ? (
                <AppText variant="caption" tone="muted">
                  {option.description}
                </AppText>
              ) : null}
            </View>
            <View
              className={cn(
                'h-5 w-5 items-center justify-center rounded-full',
                selected ? 'bg-primary' : 'border-2 border-muted-foreground',
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
