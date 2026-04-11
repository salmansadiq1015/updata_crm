'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordRequestSchema } from '@/lib/validations/auth';
import { authService } from '@/services/auth-service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { showError } from '@/lib/toast';

export function ResetPasswordRequestForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(resetPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      await authService.requestPasswordReset(data.email);
      setIsSuccess(true);
    } catch (err) {
      showError(err.message || 'Anfrage fehlgeschlagen');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="animate-in fade-in slide-in-from-right-4 duration-500">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight">E-Mail gesendet</h1>
          <p className="mt-3 text-muted-foreground leading-relaxed">
            Falls ein Konto mit dieser E-Mail existiert, erhalten Sie eine E-Mail mit Anweisungen zum Zuruecksetzen Ihres Passworts.
          </p>
        </div>
        <Link
          href="/login"
          className="flex items-center justify-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="mb-8">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Passwort zuruecksetzen
        </h1>
        <p className="mt-2 text-muted-foreground">
          Geben Sie Ihre E-Mail-Adresse ein, um Anweisungen zum Zuruecksetzen zu erhalten.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium">E-Mail</Label>
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

        <Button
          type="submit"
          className="w-full h-11 rounded-xl text-[0.9rem] font-semibold shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-all gap-2"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Mail className="h-4 w-4" />
              Link senden
            </>
          )}
        </Button>

        <Link
          href="/login"
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurueck zur Anmeldung
        </Link>
      </form>
    </div>
  );
}
