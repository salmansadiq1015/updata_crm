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
import { Loader2, ArrowRight, Lock, Eye, EyeOff } from 'lucide-react';
import { showError, showSuccess } from '@/lib/toast';

export function LoginForm() {
  const { t, locale } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
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
      router.push(redirectTo);
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
            ? t('auth.accountLockedUntil', 'Konto gesperrt bis {time}. Bitte versuchen Sie es spaeter erneut.', { time: lockedUntil })
            : t('auth.accountLocked', 'Konto gesperrt. Bitte versuchen Sie es spaeter erneut.')
        );
      } else {
        showError(err.message || t('auth.loginFailed', 'Anmeldung fehlgeschlagen'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          {t('auth.welcomeBack')}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t('auth.signInDesc')}
        </p>
      </div>

      {lockMessage && (
        <Alert variant="destructive" className="mb-6 rounded-xl">
          <Lock className="h-4 w-4" />
          <AlertDescription>{lockMessage}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">
            {t('auth.email')}
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="name@mb-boiler.ch"
            autoComplete="email"
            autoFocus
            className="h-11 rounded-xl bg-muted/40 border-border/60 focus:bg-background transition-colors"
            {...register('email')}
          />
          {errors.email && (
            <p className="text-sm text-destructive">{errors.email.message}</p>
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
              className="h-11 rounded-xl bg-muted/40 border-border/60 focus:bg-background transition-colors pr-10"
              {...register('password')}
            />
            <button
              type="button"
              aria-label={t(showPassword ? 'auth.hidePassword' : 'auth.showPassword', showPassword ? 'Passwort ausblenden' : 'Passwort anzeigen')}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.password && (
            <p className="text-sm text-destructive">{errors.password.message}</p>
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
              {t('auth.signIn')}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
