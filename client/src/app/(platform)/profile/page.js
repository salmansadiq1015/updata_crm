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
import { useLanguage } from '@/lib/i18n/language-context';
import { showSuccess, showError } from '@/lib/toast';
import { AvatarUpload } from '@/shared/components/avatar-upload';
import { ChangePasswordForm } from '@/modules/auth/components/change-password-form';
import { CalendarSyncCard } from '@/modules/integrations/components/calendar-sync-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ProfileSkeleton } from '@/shared/components/page-skeletons';
import {
  Loader2, User, Mail, Phone, Globe, Shield, Calendar, Clock,
  MapPin, Briefcase, Save, Lock, Pencil,
} from 'lucide-react';

const profileSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  phone: z.string().max(30).optional().or(z.literal('')),
  department: z.string().max(100).optional().or(z.literal('')),
  position: z.string().max(100).optional().or(z.literal('')),
  street: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  zip: z.string().max(20).optional().or(z.literal('')),
  country: z.string().max(100).optional().or(z.literal('')),
  language: z.string().default('de'),
});

const langNames = { de: 'Deutsch', en: 'English', fr: 'Francais', it: 'Italiano' };

export default function ProfilePage() {
  const { t } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors, isDirty } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: '', lastName: '', phone: '',
      department: '', position: '',
      street: '', city: '', zip: '', country: 'Schweiz',
      language: 'de',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        department: user.department || '',
        position: user.position || '',
        street: user.street || '',
        city: user.city || '',
        zip: user.zip || '',
        country: user.country || 'Schweiz',
        language: user.language || 'de',
      });
    }
  }, [user, reset]);

  const mutation = useMutation({
    mutationFn: (data) => profileService.updateProfile(data),
    onSuccess: (updatedUser) => {
      setUser(updatedUser);
      showSuccess(t('profile.saved') || 'Profil aktualisiert');
    },
    onError: (err) => showError(err.message),
  });

  const avatarUploadMutation = useMutation({
    mutationFn: (file) => userService.uploadAvatar(user?._id || user?.id || 'me', file),
    onSuccess: () => {
      authService.fetchMe();
      showSuccess(t('profile.avatarUpdated') || 'Avatar aktualisiert');
    },
    onError: (err) => showError(err.message),
  });

  const avatarRemoveMutation = useMutation({
    mutationFn: () => userService.removeAvatar(user?._id || user?.id || 'me'),
    onSuccess: () => {
      authService.fetchMe();
      showSuccess(t('profile.avatarRemoved') || 'Avatar entfernt');
    },
    onError: (err) => showError(err.message),
  });

  if (!user) return <ProfileSkeleton />;

  const initials = `${(user.firstName || '')[0] || ''}${(user.lastName || '')[0] || ''}`.toUpperCase();

  const inputCn = 'h-10 rounded-lg bg-muted/40 border-border/60 focus:bg-background';

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="overflow-hidden">
        <div className="h-24 bg-gradient-to-r from-primary/20 via-sky-500/10 to-transparent" />
        <CardContent className="-mt-12 pb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <AvatarUpload
              avatarUrl={user?.avatarUrl || user?.avatar}
              initials={initials}
              onUpload={(file) => avatarUploadMutation.mutate(file)}
              onRemove={() => avatarRemoveMutation.mutate()}
              isLoading={avatarUploadMutation.isPending || avatarRemoveMutation.isPending}
            />
            <div className="flex-1 min-w-0 pb-1">
              <h1 className="text-xl font-bold tracking-tight">{user?.firstName} {user?.lastName}</h1>
              <p className="text-sm text-muted-foreground">{user?.email}</p>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="gap-1.5 text-xs">
                  <Shield className="h-3 w-3" />
                  {user?.role?.name || 'User'}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {langNames[user?.language] || 'Deutsch'}
                </Badge>
                {user?.department && (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <Briefcase className="h-3 w-3" />
                    {user.department}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList>
          <TabsTrigger value="profile" className="gap-1.5">
            <User className="h-3.5 w-3.5" />
            {t('profile.tab.info') || 'Profil'}
          </TabsTrigger>
          <TabsTrigger value="password" className="gap-1.5">
            <Lock className="h-3.5 w-3.5" />
            {t('profile.tab.password') || 'Passwort'}
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            Kalender
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile">
          <form onSubmit={handleSubmit((data) => mutation.mutate(data))}>
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Personal Info */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <User className="h-4 w-4 text-primary" />
                    {t('users.personalInfo') || 'Persönliche Daten'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('users.firstName')}</Label>
                      <Input className={inputCn} {...register('firstName')} />
                      {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('users.lastName')}</Label>
                      <Input className={inputCn} {...register('lastName')} />
                      {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('users.email')}</Label>
                    <Input value={user?.email || ''} disabled className="h-10 rounded-lg bg-muted/60 border-border/40" />
                    <p className="text-[0.7rem] text-muted-foreground">{t('profile.emailReadonly') || 'E-Mail kann nicht geändert werden.'}</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('users.phone')} (optional)</Label>
                    <Input placeholder="+41 79 123 45 67" className={inputCn} {...register('phone')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">{t('users.language')}</Label>
                    <Select value={watch('language')} onValueChange={(val) => setValue('language', val, { shouldDirty: true })}>
                      <SelectTrigger className="h-10 rounded-lg bg-muted/40 border-border/60">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="de">Deutsch</SelectItem>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Francais</SelectItem>
                        <SelectItem value="it">Italiano</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Work & Address */}
              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Briefcase className="h-4 w-4 text-primary" />
                      {t('users.workInfo') || 'Arbeit'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('users.department') || 'Abteilung'}</Label>
                        <Input placeholder={t('users.departmentPlaceholder') || 'z.B. Technik'} className={inputCn} {...register('department')} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('users.position') || 'Position'}</Label>
                        <Input placeholder={t('users.positionPlaceholder') || 'z.B. Projektleiter'} className={inputCn} {...register('position')} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {t('users.address') || 'Adresse'}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('users.street') || 'Strasse'}</Label>
                      <Input placeholder="Musterstrasse 1" className={inputCn} {...register('street')} />
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('users.zip') || 'PLZ'}</Label>
                        <Input placeholder="3000" className={inputCn} {...register('zip')} />
                      </div>
                      <div className="space-y-1.5 col-span-2">
                        <Label className="text-xs">{t('users.city') || 'Stadt'}</Label>
                        <Input placeholder="Bern" className={inputCn} {...register('city')} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">{t('users.country') || 'Land'}</Label>
                      <Input placeholder="Schweiz" className={inputCn} {...register('country')} />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Save button */}
            <div className="flex justify-end mt-6">
              <Button
                type="submit"
                disabled={mutation.isPending || !isDirty}
                className="gap-2 rounded-xl h-10 px-6 shadow-md shadow-primary/20 hover:shadow-lg hover:shadow-primary/25 transition-all"
              >
                {mutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {t('users.save')}
              </Button>
            </div>
          </form>
        </TabsContent>

        {/* Password Tab */}
        <TabsContent value="password">
          <div className="max-w-lg">
            <ChangePasswordForm />
          </div>
        </TabsContent>

        <TabsContent value="calendar">
          <div className="max-w-3xl">
            <CalendarSyncCard />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
