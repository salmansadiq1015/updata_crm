import type { LucideIcon } from 'lucide-react-native';
import { useState, type ReactNode, type Ref } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';

import { withAlpha } from '@/theme/colors';
import { useTheme } from '@/theme/ThemeProvider';
import { cn } from '@/utils/cn';

import { AppText } from './AppText';
import { Icon } from './Icon';

export type AppInputProps = Omit<TextInputProps, 'style' | 'editable'> & {
  label?: string;
  helperText?: string;
  error?: string;
  leftIcon?: LucideIcon;
  /** Trailing control such as a show-password or clear button. */
  rightElement?: ReactNode;
  disabled?: boolean;
  containerClassName?: string;
  ref?: Ref<TextInput>;
};

// Mirrors client/src/components/ui/input.jsx: rounded-xl, muted fill, ring on focus,
// destructive border when invalid. The focus ring is a soft 3dp halo (box-shadow)
// so the field does not shift when it gains focus.
export function AppInput({
  label,
  helperText,
  error,
  leftIcon,
  rightElement,
  disabled,
  containerClassName,
  accessibilityLabel,
  onFocus,
  onBlur,
  ref,
  ...props
}: AppInputProps) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);
  const message = error ?? helperText;
  const ringColor = error ? colors.destructive : colors.ring;
  const ring = focused ? { boxShadow: `0px 0px 0px 3px ${withAlpha(ringColor, 0.18)}` } : undefined;

  return (
    <View className={cn('gap-1.5', containerClassName)}>
      {label ? (
        <AppText
          variant="label"
          className={cn('ms-0.5', focused && !error && 'text-primary')}
          accessibilityElementsHidden
          importantForAccessibility="no"
        >
          {label}
        </AppText>
      ) : null}
      <View
        style={ring}
        className={cn(
          'h-12 flex-row items-center gap-2.5 rounded-xl border px-3.5',
          focused ? 'border-ring bg-card' : 'border-input bg-muted/50',
          error && 'border-destructive',
          disabled && 'opacity-50',
        )}
      >
        {leftIcon ? (
          <Icon
            icon={leftIcon}
            size="sm"
            color={error ? 'destructive' : focused ? 'primary' : 'mutedForeground'}
          />
        ) : null}
        <TextInput
          ref={ref}
          editable={!disabled}
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityHint={message}
          accessibilityState={{ disabled }}
          aria-invalid={Boolean(error)}
          placeholderTextColor={colors.mutedForeground}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          className="h-full flex-1 font-geist text-lg text-foreground"
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
          {...props}
        />
        {rightElement}
      </View>
      {message ? (
        <AppText
          variant="caption"
          tone={error ? 'destructive' : 'muted'}
          className="ms-0.5"
          accessibilityLiveRegion={error ? 'polite' : 'none'}
        >
          {message}
        </AppText>
      ) : null}
    </View>
  );
}
