import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AppIconButton } from './AppIconButton';
import { AppInput, type AppInputProps } from './AppInput';

export type AppPasswordInputProps = Omit<AppInputProps, 'secureTextEntry' | 'rightElement'>;

export function AppPasswordInput(props: AppPasswordInputProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <AppInput
      leftIcon={Lock}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoCorrect={false}
      textContentType="password"
      {...props}
      rightElement={
        <AppIconButton
          icon={visible ? EyeOff : Eye}
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          onPress={() => setVisible((current) => !current)}
          className="-me-3"
        />
      }
    />
  );
}
