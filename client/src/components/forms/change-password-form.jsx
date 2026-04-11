'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { changePasswordSchema } from '@/lib/validations/auth';
import { useMutation } from '@tanstack/react-query';
import { authService } from '@/services/auth-service';
import { showSuccess, showError } from '@/lib/toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

export function ChangePasswordForm() {
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
      showSuccess('Passwort geaendert');
      reset();
    },
    onError: (err) => showError(err.message),
  });

  const onSubmit = (data) => {
    mutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passwort aendern</CardTitle>
        <CardDescription>Waehlen Sie ein sicheres Passwort mit mindestens 10 Zeichen.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currentPassword">Aktuelles Passwort</Label>
            <Input id="currentPassword" type="password" {...register('currentPassword')} />
            {errors.currentPassword && <p className="text-sm text-destructive">{errors.currentPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">Neues Passwort</Label>
            <Input id="newPassword" type="password" {...register('newPassword')} />
            {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Passwort bestaetigen</Label>
            <Input id="confirmPassword" type="password" {...register('confirmPassword')} />
            {errors.confirmPassword && <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>}
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Passwort aendern
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
