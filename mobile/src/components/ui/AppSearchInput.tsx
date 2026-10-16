import { Search, X } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { AppIconButton } from './AppIconButton';
import { AppInput, type AppInputProps } from './AppInput';

export type AppSearchInputProps = Omit<
  AppInputProps,
  'leftIcon' | 'rightElement' | 'value' | 'onChangeText'
> & {
  value: string;
  onChangeText: (text: string) => void;
};

/** Controlled search field with a clear button. Debounce in the caller (useDebouncedValue). */
export function AppSearchInput({ value, onChangeText, ...props }: AppSearchInputProps) {
  const { t } = useTranslation();
  return (
    <AppInput
      leftIcon={Search}
      value={value}
      onChangeText={onChangeText}
      returnKeyType="search"
      autoCapitalize="none"
      autoCorrect={false}
      accessibilityRole="search"
      {...props}
      rightElement={
        value.length > 0 ? (
          <AppIconButton
            icon={X}
            accessibilityLabel={t('common.clearSearch')}
            onPress={() => onChangeText('')}
            className="-me-3"
          />
        ) : null
      }
    />
  );
}
