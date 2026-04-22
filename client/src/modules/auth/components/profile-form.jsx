'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { profileService } from '@/modules/auth/services/profile-service';
import { userService } from '@/modules/users/services/user-service';
import { authService } from '@/modules/auth/services/auth-service';
import { useAuthStore } from '@/stores/auth-store';
import { showSuccess, showError } from '@/lib/toast';
import { AvatarUpload } from '@/shared/components/avatar-upload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Vorname ist erforderlich').max(100),
  lastName: z.string().min(1, 'Nachname ist erforderlich').max(100),
  phone: z.string().max(30).optional().or(z.literal('')),
  language: z.string().default('de'),
});

export function ProfileForm() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      language: 'de',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        language: user.language || 'de',
      });
    }
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (data) => profileService.updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      showSuccess('Profil aktualisiert');
    },
    onError: (err) => showError(err.message),
  });

  const avatarUploadMutation = useMutation({
    mutationFn: (file) => userService.uploadAvatar(user._id || 'me', file),
    onSuccess: () => {
      authService.fetchMe();
      showSuccess('Avatar aktualisiert');
    },
    onError: (err) => showError(err.message || 'Avatar-Upload fehlgeschlagen'),
  });

  const avatarRemoveMutation = useMutation({
    mutationFn: () => userService.removeAvatar(user._id || 'me'),
    onSuccess: () => {
      authService.fetchMe();
      showSuccess('Avatar entfernt');
    },
    onError: (err) => showError(err.message || 'Avatar konnte nicht entfernt werden'),
  });

  const userInitials = user
    ? `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase()
    : '?';

  const onSubmit = (data) => {
    mutation.mutate(data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil</CardTitle>
        <CardDescription>Aktualisieren Sie Ihre persoenlichen Daten.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="flex justify-center pb-2">
            <AvatarUpload
              avatarUrl={user?.avatarUrl || user?.avatar}
              initials={userInitials}
              onUpload={(file) => avatarUploadMutation.mutate(file)}
              onRemove={() => avatarRemoveMutation.mutate()}
              isLoading={avatarUploadMutation.isPending || avatarRemoveMutation.isPending}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="profile-firstName">Vorname</Label>
              <Input id="profile-firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-lastName">Nachname</Label>
              <Input id="profile-lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-email">E-Mail</Label>
            <Input id="profile-email" value={user?.email || ''} disabled className="bg-muted" />
            <p className="text-xs text-muted-foreground">E-Mail kann nicht geaendert werden.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="profile-phone">Telefon</Label>
            <Input id="profile-phone" {...register('phone')} />
          </div>
          <div className="space-y-2">
            <Label>Sprache</Label>
            <Select value={watch('language')} onValueChange={(val) => setValue('language', val)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="fr">Francais</SelectItem>
                <SelectItem value="it">Italiano</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Speichern
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
