'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordConfirmSchema } from '@/lib/validations/auth';
import { authService } from '@/services/auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, KeyRound, CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { showError } from '@/lib/toast';

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: '', color: '' };
  let score = 0;
  if (password.length >= 10) score++;
  if (password.length >= 14) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 2) return { score: 1, label: 'Schwach', color: 'bg-destructive' };
  if (score <= 4) return { score: 2, label: 'Mittel', color: 'bg-warning' };
  return { score: 3, label: 'Stark', color: 'bg-success' };
}

function PasswordStrengthIndicator({ password }) {
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
      <p className="text-xs text-muted-foreground">{strength.label}</p>
    </div>
  );
}

export function ResetPasswordConfirmForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(resetPasswordConfirmSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const passwordValue = watch('password');

  if (!token) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <Alert variant="destructive" className="rounded-xl">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Ungueltiger oder fehlender Token. Bitte fordern Sie einen neuen Link an.
          </AlertDescription>
        </Alert>
        <Link
          href="/reset-password"
          className="mt-4 flex items-center justify-center text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          Neuen Link anfordern
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">Passwort zurueckgesetzt</h1>
          <p className="mt-3 text-muted-foreground">
            Ihr Passwort wurde erfolgreich geaendert. Sie koennen sich jetzt anmelden.
          </p>
        </div>
        <Link href="/login">
          <Button className="w-full h-11 rounded-xl text-[0.9rem] font-semibold shadow-md shadow-primary/20 gap-2">
            Zur Anmeldung
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    );
  }

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await authService.confirmPasswordReset(token, data.password);
      setIsSuccess(true);
    } catch (err) {
      showError(err.message || 'Passwort konnte nicht zurueckgesetzt werden');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Neues Passwort setzen
        </h1>
        <p className="mt-2 text-muted-foreground">
          Waehlen Sie ein sicheres Passwort mit mindestens 10 Zeichen.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium">Neues Passwort</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mindestens 10 Zeichen"
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
          <Label htmlFor="confirmPassword" className="text-sm font-medium">Passwort bestaetigen</Label>
          <Input
            id="confirmPassword"
            type="password"
            placeholder="Passwort erneut eingeben"
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
              <KeyRound className="h-4 w-4" />
              Passwort zuruecksetzen
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
