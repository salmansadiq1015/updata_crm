'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createContactSchema } from '@/modules/crm/validations/contact';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { FormField, FormBody } from '@/components/ui/form-field';
import { Loader2, User } from 'lucide-react';

const BLANK = {
  firstName: '',
  lastName: '',
  functionTitle: '',
  phone: '',
  mobile: '',
  email: '',
  isPrimary: false,
  notes: '',
};

export function ContactForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(createContactSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK,
        ...defaultValues,
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        functionTitle: defaultValues.functionTitle || '',
        phone: defaultValues.phone || '',
        mobile: defaultValues.mobile || '',
        email: defaultValues.email || '',
        notes: defaultValues.notes || '',
        isPrimary: !!defaultValues.isPrimary,
      });
    } else {
      reset(BLANK);
    }
  }, [defaultValues, reset, open]);

  const isPrimary = watch('isPrimary');

  const submit = async (data) => {
    const cleaned = {
      ...data,
      functionTitle: data.functionTitle || null,
      phone: data.phone || null,
      mobile: data.mobile || null,
      email: data.email || null,
      notes: data.notes || null,
    };
    try {
      await onSubmit(cleaned);
      onOpenChange(false);
      reset(BLANK);
    } catch {
      // Keep the modal open on failure so the user can fix & retry.
      // Parent's mutation onError has already surfaced a toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            {isEdit
              ? t('crm.contacts.editContact', 'Kontakt bearbeiten')
              : t('crm.contacts.newContact', 'Neuer Kontakt')}
          </DialogTitle>
          <DialogDescription>
            {t('crm.contacts.formDesc', 'Kontakt wie Ansprechpartner oder Hausverwaltung hinzufügen.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
          <FormBody>
            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('crm.contacts.firstName', 'Vorname')} required error={errors.firstName?.message}>
                <Input {...register('firstName')} autoFocus />
              </FormField>
              <FormField label={t('crm.contacts.lastName', 'Nachname')} required error={errors.lastName?.message}>
                <Input {...register('lastName')} />
              </FormField>
            </div>

            <FormField label={t('crm.contacts.functionTitle', 'Funktion / Position')} error={errors.functionTitle?.message}>
              <Input {...register('functionTitle')} placeholder={t('crm.contacts.functionPlaceholder', 'z.B. Hausverwaltung')} />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('crm.phone', 'Telefon')} error={errors.phone?.message}>
                <Input {...register('phone')} />
              </FormField>
              <FormField label={t('crm.mobile', 'Mobil')} error={errors.mobile?.message}>
                <Input {...register('mobile')} />
              </FormField>
            </div>

            <FormField label={t('crm.email', 'E-Mail')} error={errors.email?.message}>
              <Input type="email" {...register('email')} />
            </FormField>

            <FormField label={t('crm.notes', 'Notizen')} error={errors.notes?.message}>
              <Textarea rows={2} {...register('notes')} />
            </FormField>

            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div>
                <Label className="text-[13px] font-medium">{t('crm.contacts.isPrimary', 'Primärkontakt')}</Label>
                <p className="text-xs text-muted-foreground/70">{t('crm.contacts.isPrimaryHint', 'Als Hauptansprechpartner markieren')}</p>
              </div>
              <Switch checked={isPrimary} onCheckedChange={(v) => setValue('isPrimary', v, { shouldDirty: true })} />
            </div>
          </FormBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

