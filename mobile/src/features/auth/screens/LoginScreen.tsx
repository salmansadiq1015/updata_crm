import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Mail } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { FormPasswordField, FormTextField } from '@/components/forms/FormFields';
import { AppButton } from '@/components/ui/AppButton';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { errorMessageKey } from '@/utils/errorMessages';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { showSuccessToast } from '@/utils/toast';

import { AuthLayout } from '../components/AuthLayout';
import { createLoginSchema, type LoginValues } from '../schemas/authSchemas';
import { signIn } from '../services/session';
import { useSessionStore } from '../store/sessionStore';

export function LoginScreen({ navigation }: RootScreenProps<'Login'>) {
  const { t } = useTranslation();
  const endReason = useSessionStore((state) => state.endReason);
  const acknowledgeEndReason = useSessionStore((state) => state.acknowledgeEndReason);
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => createLoginSchema(t), [t]);
  const { control, handleSubmit, setError, resetField, formState } = useForm<LoginValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    acknowledgeEndReason();
    try {
      const user = await signIn(values);
      showSuccessToast(t('auth.welcome', { name: user.firstName ?? user.fullName }));
    } catch (error) {
      resetField('password');
      if (!applyServerFieldErrors(error, ['email', 'password'], setError)) {
        setFormError(t(errorMessageKey(error)));
      }
    }
  });

  return (
    <AuthLayout title={t('auth.loginTitle')} subtitle={t('auth.loginSubtitle')}>
      <View className="gap-5">
        {endReason === 'expired' ? <AppAlert tone="warning" message={t('errors.sessionExpired')} /> : null}
        {endReason === 'signed_out' ? <AppAlert tone="info" message={t('auth.signedOut')} /> : null}
        {formError ? <AppAlert tone="destructive" message={formError} /> : null}

        <FormTextField
          control={control}
          name="email"
          label={t('auth.email')}
          placeholder={t('auth.emailPlaceholder')}
          leftIcon={Mail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="username"
          returnKeyType="next"
          disabled={formState.isSubmitting}
        />
        <View className="gap-2">
          <FormPasswordField
            control={control}
            name="password"
            label={t('auth.password')}
            placeholder={t('auth.passwordPlaceholder')}
            autoComplete="current-password"
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            disabled={formState.isSubmitting}
          />
          <AppButton
            title={t('auth.forgotPassword')}
            variant="link"
            size="sm"
            className="self-end"
            disabled={formState.isSubmitting}
            onPress={() => navigation.navigate('ForgotPassword')}
          />
        </View>
        <AppButton
          title={t('auth.signIn')}
          size="lg"
          rightIcon={ArrowRight}
          loading={formState.isSubmitting}
          onPress={onSubmit}
          fullWidth
        />
      </View>
    </AuthLayout>
  );
}
