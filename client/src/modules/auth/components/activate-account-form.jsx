'use client';

import { useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createActivateAccountSchema } from '@/modules/auth/validations/auth';
import { authService } from '@/modules/auth/services/auth-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, UserCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';

function getPasswordStrength(password) {
  if (!password) return { score: 0, labelKey: '', color: '' };
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { score: 1, labelKey: 'auth.weak', color: 'bg-destructive' };
  if (score <= 4) return { score: 2, labelKey: 'auth.medium', color: 'bg-warning' };
  return { score: 3, labelKey: 'auth.strong', color: 'bg-success' };
}

function PasswordStrengthIndicator({ password }) {
  const { t } = useLanguage();
  const strength = useMemo(() => getPasswordStrength(password), [password]);
  if (!password) return null;
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {[1, 2, 3].map((level) => (
          <div
            key={level}
            className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
              level <= strength.score ? strength.color : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t(strength.labelKey, '')}</p>
    </div>
  );
}

export function ActivateAccountForm() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [isLoading, setIsLoading] = useState(false);
  const activateAccountSchema = useMemo(() => createActivateAccountSchema(t), [t]);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(activateAccountSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password');

  if (!token) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <Alert variant="destructive" className="rounded-xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {t('auth.invalidActivationToken', 'Ungueltiger oder fehlender Token. Bitte kontaktieren Sie Ihren Administrator.')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await authService.activate(token, data.password);
      showSuccess(t('auth.activationSuccess', 'Konto erfolgreich aktiviert'));
      router.push('/login');
    } catch (err) {
      showError(err.message || t('auth.activationFailed', 'Aktivierung fehlgeschlagen'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-8">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          {t('auth.activateAccount')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t('auth.activateDesc')}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">{t('auth.password')}</Label>
          <Input
            id="password"
            type="password"
            placeholder={t('auth.passwordMinPlaceholder', 'Mindestens 10 Zeichen')}
            autoComplete="new-password"
            autoFocus
            className="h-11 rounded-xl bg-muted/40 border-border/60 focus:bg-background transition-colors"
            {...register('password')}
          />
          <PasswordStrengthIndicator password={passwordValue} />
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmPassword" className="text-sm font-medium">{t('auth.confirmPassword')}</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder={t('auth.confirmPasswordPlaceholder', 'Passwort erneut eingeben')}
            autoComplete="new-password"
            className="h-11 rounded-xl bg-muted/40 border-border/60 focus:bg-background transition-colors"
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="w-full h-11 rounded-xl text-[0.9rem] font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-all gap-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <UserCheck className="h-4 w-4" />
              {t('auth.activateButton')}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
