'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema } from '@/lib/validations/user';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, User, Mail, Phone, Shield, Globe } from 'lucide-react';

export function UserForm({ open, onOpenChange, onSubmit, defaultValues, roles = [], isLoading }) {
  const isEdit = !!defaultValues?._id;
  const defaultRoleId = roles.find((r) => r.name === 'User')?._id || '';

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      roleId: defaultRoleId,
      language: 'de',
      ...defaultValues,
    },
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        email: defaultValues.email || '',
        phone: defaultValues.phone || '',
        roleId: defaultValues.role?._id || defaultValues.roleId || '',
        language: defaultValues.language || 'de',
      });
    } else {
      reset({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        roleId: defaultRoleId,
        language: 'de',
      });
    }
  }, [defaultValues, reset, defaultRoleId]);

  const handleFormSubmit = async (data) => {
    await onSubmit(data);
    onOpenChange(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden rounded-2xl">
        <DialogHeader className="px-6 pt-6 pb-4">
          <DialogTitle className="text-lg">{isEdit ? 'Benutzer bearbeiten' : 'Neuer Benutzer'}</DialogTitle>
          <DialogDescription className="text-sm">
            {isEdit
              ? 'Bearbeiten Sie die Benutzerinformationen.'
              : 'Erstellen Sie einen neuen Benutzer. Eine Aktivierungs-E-Mail wird gesendet.'
            }
          </DialogDescription>
        </DialogHeader>

        <Separator />

        <form onSubmit={handleSubmit(handleFormSubmit)} className="px-6 py-5 space-y-5">
          {/* Personal Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Persoenliche Daten
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-xs">Vorname</Label>
                <Input
                  id="firstName"
                  placeholder="Max"
                  className="h-10 rounded-lg bg-muted/40 border-border/60 focus:bg-background"
                  {...register('firstName')}
                />
                {errors.firstName && <p className="text-xs text-destructive">{errors.firstName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-xs">Nachname</Label>
                <Input
                  id="lastName"
                  placeholder="Muster"
                  className="h-10 rounded-lg bg-muted/40 border-border/60 focus:bg-background"
                  {...register('lastName')}
                />
                {errors.lastName && <p className="text-xs text-destructive">{errors.lastName.message}</p>}
              </div>
            </div>
          </div>

          {/* Contact Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              Kontaktdaten
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="max.muster@mbboiler.ch"
                  className="h-10 rounded-lg bg-muted/40 border-border/60 focus:bg-background"
                  {...register('email')}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">Telefon (optional)</Label>
                <Input
                  id="phone"
                  placeholder="+41 79 123 45 67"
                  className="h-10 rounded-lg bg-muted/40 border-border/60 focus:bg-background"
                  {...register('phone')}
                />
              </div>
            </div>
          </div>

          {/* Access & Preferences */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Shield className="h-3.5 w-3.5" />
              Zugriff & Einstellungen
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Rolle</Label>
                <Select value={watch('roleId')} onValueChange={(val) => setValue('roleId', val)}>
                  <SelectTrigger className="h-10 rounded-lg bg-muted/40 border-border/60">
                    <SelectValue placeholder="Rolle waehlen" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((role) => (
                      <SelectItem key={role._id} value={role._id}>{role.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.roleId && <p className="text-xs text-destructive">{errors.roleId.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sprache</Label>
                <Select value={watch('language')} onValueChange={(val) => setValue('language', val)}>
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
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" className="rounded-lg" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" className="rounded-lg shadow-sm gap-1.5" disabled={isLoading}>
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? 'Speichern' : 'Erstellen'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
