import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { FormTextField } from '@/components/forms/FormFields';
import { AppButton } from '@/components/ui/AppButton';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { errorMessageKey } from '@/utils/errorMessages';

import { authApi } from '../api/authApi';
import { AuthLayout } from '../components/AuthLayout';
import { createResetRequestSchema, type ResetRequestValues } from '../schemas/authSchemas';

export function ForgotPasswordScreen({ navigation }: RootScreenProps<'ForgotPassword'>) {
  const { t } = useTranslation();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const schema = useMemo(() => createResetRequestSchema(t), [t]);
  const { control, handleSubmit, formState } = useForm<ResetRequestValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await authApi.requestPasswordReset(email);
      setSent(true);
    } catch (error) {
      setFormError(t(errorMessageKey(error)));
    }
  });

  return (
    <AuthLayout title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      <View className="gap-4">
        {sent ? (
          <AppAlert tone="success" message={t('auth.resetLinkSent')} />
        ) : (
          <>
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
              returnKeyType="send"
              onSubmitEditing={onSubmit}
              disabled={formState.isSubmitting}
            />
            <AppButton
              title={t('auth.sendResetLink')}
              size="lg"
              loading={formState.isSubmitting}
              onPress={onSubmit}
              fullWidth
            />
          </>
        )}
        <AppButton
          title={t('auth.haveResetLink')}
          variant="outline"
          onPress={() => navigation.navigate('ResetPassword')}
          fullWidth
        />
        <AppButton
          title={t('auth.backToLogin')}
          variant="ghost"
          leftIcon={ArrowLeft}
          onPress={() => navigation.popTo('Login')}
          fullWidth
        />
      </View>
    </AuthLayout>
  );
}
