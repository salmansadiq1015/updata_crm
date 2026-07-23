'use client';

import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createChangePasswordSchema } from '@/modules/auth/validations/auth';
import { useMutation } from '@tanstack/react-query';
import { authService } from '@/modules/auth/services/auth-service';
import { showSuccess, showError } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLanguage } from '@/lib/i18n/language-context';
import { Loader2 } from 'lucide-react';

export function ChangePasswordForm() {
  const { t } = useLanguage();
  const changePasswordSchema = useMemo(() => createChangePasswordSchema(t), [t]);
  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const mutation = useMutation({
    mutationFn: (data) => authService.changePassword({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    }),
    onSuccess: () => {
      showSuccess(t('auth.passwordChanged', 'Passwort geändert'));
      reset();
    },
    onError: (err) => showError(err.message || t('auth.changePasswordFailed', 'Passwort konnte nicht geändert werden')),
  });

  const onSubmit = (data) => {
    mutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.changePassword', 'Passwort ändern')}</CardTitle>
        <CardDescription>{t('auth.changePasswordDesc', 'Wählen Sie ein sicheres Passwort mit mindestens 10 Zeichen.')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t('auth.currentPassword', 'Aktuelles Passwort')}</Label>
            <Input id="currentPassword" type="password" {...register('currentPassword')} />
            {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t('auth.newPassword', 'Neues Passwort')}</Label>
            <Input id="newPassword" type="password" {...register('newPassword')} />
            {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('auth.confirmPassword', 'Passwort bestätigen')}</Label>
            <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('auth.changePassword', 'Passwort ändern')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
