'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createLoginSchema } from '@/modules/auth/validations/auth';
import { authService } from '@/modules/auth/services/auth-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, Lock, LockKeyhole, Eye, EyeOff } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';

export function LoginForm() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect');
  const [isLoading, setIsLoading] = useState(false);
  const [lockMessage, setLockMessage] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const loginSchema = useMemo(() => createLoginSchema(t), [t]);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setLockMessage(null);
    try {
      const result = await authService.login(data.email, data.password);
      const name = result?.user?.firstName
        ? `${result.user.firstName}`
        : result?.user?.email || data.email;
      showSuccess(t('auth.loginSuccess', 'Welcome back, {name}!', { name }));
      // Role-dependent start page (Key User config); a personal preference and
      // an explicit ?redirect= both take precedence.
      const startPage = result?.user?.preferences?.startPage
        || result?.user?.role?.uiConfig?.desktop?.startPage
        || '/dashboard';
      router.push(redirectTo || startPage);
    } catch (err) {
      const status = err.response?.status ?? err.statusCode;
      const body = err.response?.data ?? err;

      if (status === 423 || body?.lockedUntil) {
        const lockedUntil = body?.lockedUntil
          ? new Intl.DateTimeFormat(locale === 'de' ? 'de-CH' : 'en-US', {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(new Date(body.lockedUntil))
          : null;
        setLockMessage(
          lockedUntil
            ? t('auth.accountLockedUntil', 'Konto gesperrt bis {time}. Bitte versuchen Sie es später erneut.', { time: lockedUntil })
            : t('auth.accountLocked', 'Konto gesperrt. Bitte versuchen Sie es später erneut.')
        );
      } else {
        showError(err.message || t('auth.loginFailed', 'Anmeldung fehlgeschlagen'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-700">
      {/* Header */}
      <div className="mb-9">
        <div className="mb-6 flex size-12 items-center justify-center rounded-2xl border border-primary/15 bg-primary/[0.07] text-primary shadow-sm">
          <LockKeyhole aria-hidden="true" className="size-5" strokeWidth={1.5} />
        </div>
        <h1 className="text-3xl font-semibold tracking-[-0.04em] sm:text-[34px]">
          {t('auth.welcomeBack')}
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {t('auth.signInDesc')}
        </p>
      </div>

      {lockMessage && (
        <Alert variant="destructive" className="mb-6 rounded-xl">
          <Lock className="h-4 w-4" />
          <AlertDescription>{lockMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" aria-busy={isLoading}>
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            {t('auth.email')}
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="name@updata.ai"
            autoComplete="email"
            autoFocus
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
            className="h-12 rounded-xl border-border/80 bg-card/50 px-4 text-sm shadow-xs transition-colors focus:bg-background"
            {...register('email')}
          />
          {errors.email && (
            <p id="login-email-error" role="alert" className="text-sm text-destructive">{errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm font-medium">
              {t('auth.password')}
            </Label>
            <Link
              href="/reset-password"
              className="text-xs font-medium text-primary hover:text-primary/80 transition-colors"
            >
              {t('auth.forgotPassword')}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.passwordPlaceholder', 'Ihr Passwort eingeben')}
              autoComplete="current-password"
              aria-invalid={Boolean(errors.password)}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
              className="h-12 rounded-xl border-border/80 bg-card/50 ps-4 pe-12 text-sm shadow-xs transition-colors focus:bg-background"
              {...register('password')}
            />
            <button
              type="button"
              aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword', showPassword ? 'Passwort ausblenden' : 'Passwort anzeigen')}
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
              className="absolute end-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="login-password-error" role="alert" className="text-sm text-destructive">{errors.password.message}</p>
          )}
        </div>

        <Button
          type="submit"
          className="group h-12 w-full gap-2 rounded-xl text-sm font-semibold shadow-lg shadow-primary/15 transition-all duration-300 hover:shadow-xl hover:shadow-primary/25 motion-safe:active:scale-[0.99]"
          disabled={isLoading}
        >
          {isLoading ? (
            <><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /><span className="sr-only">{t('auth.signIn')}</span></>
          ) : (
            <>
              {t('auth.signIn')}
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-300 rtl:rotate-180 motion-safe:group-hover:translate-x-1 rtl:motion-safe:group-hover:-translate-x-1" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
