import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, Link2 } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { z } from 'zod';

import { AppAlert } from '@/components/feedback/AppAlert';
import { FormPasswordField, FormTextField } from '@/components/forms/FormFields';
import { AppButton } from '@/components/ui/AppButton';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { errorMessageKey } from '@/utils/errorMessages';
import { applyServerFieldErrors } from '@/utils/formErrors';
import { showSuccessToast } from '@/utils/toast';

import { authApi } from '../api/authApi';
import { AuthLayout } from '../components/AuthLayout';
import { createResetConfirmSchema } from '../schemas/authSchemas';
import { extractResetToken } from '../utils/resetToken';

/** Reached from `updata://reset-password?token=…`, or by pasting the emailed link. */
export function ResetPasswordScreen({ navigation, route }: RootScreenProps<'ResetPassword'>) {
  const { t } = useTranslation();
  const linkedToken = route.params?.token ? extractResetToken(`?token=${route.params.token}`) : null;
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      createResetConfirmSchema(t).and(
        z.object({
          resetLink: linkedToken
            ? z.string()
            : z
                .string()
                .refine((value) => extractResetToken(value) !== null, t('validation.resetLinkInvalid')),
        }),
      ),
    [t, linkedToken],
  );
  type Values = z.infer<typeof schema>;

  const { control, handleSubmit, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { resetLink: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const token = linkedToken ?? extractResetToken(values.resetLink);
    if (!token) return;
    try {
      await authApi.confirmPasswordReset(token, values.password);
      showSuccessToast(t('auth.passwordResetDone'));
      navigation.popTo('Login');
    } catch (error) {
      if (!applyServerFieldErrors(error, ['password'], setError)) setFormError(t(errorMessageKey(error)));
    }
  });

  return (
    <AuthLayout title={t('auth.resetTitle')} subtitle={t('auth.resetSubtitle')}>
      <View className="gap-5">
        {formError ? <AppAlert tone="destructive" message={formError} /> : null}
        {linkedToken ? null : (
          <FormTextField
            control={control}
            name="resetLink"
            label={t('auth.resetLink')}
            helperText={t('auth.resetLinkHelp')}
            leftIcon={Link2}
            autoCapitalize="none"
            autoCorrect={false}
            disabled={formState.isSubmitting}
          />
        )}
        <FormPasswordField
          control={control}
          name="password"
          label={t('auth.newPassword')}
          autoComplete="new-password"
          textContentType="newPassword"
          disabled={formState.isSubmitting}
        />
        <FormPasswordField
          control={control}
          name="confirmPassword"
          label={t('auth.confirmPassword')}
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          disabled={formState.isSubmitting}
        />
        <AppButton
          title={t('auth.setPassword')}
          size="lg"
          loading={formState.isSubmitting}
          onPress={onSubmit}
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
