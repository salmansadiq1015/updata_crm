'use client';

import { useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createContactSchema } from '@/modules/crm/validations/contact';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, UserRound, AlertCircle } from 'lucide-react';

const BLANK = {
  firstName: '',
  lastName: '',
  functionTitle: '',
  siteId: '',
  phone: '',
  mobile: '',
  email: '',
  isPrimary: false,
  notes: '',
};

const FUNCTION_PRESETS = [
  { value: 'Eigentümer', label: 'Eigentümer' },
  { value: 'Bewohner/Mieter', label: 'Bewohner/Mieter' },
  { value: 'Hausverwaltung', label: 'Hausverwaltung' },
  { value: 'Objektleiter', label: 'Objektleiter' },
  { value: 'Ansprechpartner', label: 'Ansprechpartner' },
  { value: 'Sonstige', label: 'Sonstige' },
];

export function ContactForm({
  open,
  onOpenChange,
  onSubmit,
  defaultValues,
  isLoading,
  contextField = null,
  isSubmitDisabled = false,
  sites = [],
}) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm({
    resolver: zodResolver(createContactSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (defaultValues) {
      const siteVal = defaultValues.siteId;
      reset({
        ...BLANK,
        ...defaultValues,
        firstName: defaultValues.firstName || '',
        lastName: defaultValues.lastName || '',
        functionTitle: defaultValues.functionTitle || '',
        siteId: (typeof siteVal === 'object' ? siteVal?._id : siteVal) || '',
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

  const isPrimary = useWatch({ control, name: 'isPrimary' });

  const submit = async (data) => {
    const cleaned = {
      ...data,
      functionTitle: data.functionTitle || null,
      siteId: data.siteId || null,
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
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 shrink-0">
              <UserRound className="h-5 w-5 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {isEdit
                  ? t('crm.contacts.editContact', 'Kontakt bearbeiten')
                  : t('crm.contacts.newContact', 'Neuer Kontakt')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {t('crm.contacts.formDesc', 'Kontakt wie Ansprechpartner oder Hausverwaltung hinzufügen.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-4">
            {contextField && (
              <div className="space-y-1.5">
                {contextField}
              </div>
            )}

            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.contacts.sectionName', 'Name')}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <DarkField label={t('crm.contacts.firstName', 'Vorname')} required error={errors.firstName}>
                <Input
                  {...register('firstName')}
                  autoFocus
                  className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
                />
              </DarkField>
              <DarkField label={t('crm.contacts.lastName', 'Nachname')} required error={errors.lastName}>
                <Input
                  {...register('lastName')}
                  className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
                />
              </DarkField>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <DarkField label={t('crm.contacts.functionTitle', 'Funktion / Rolle')} error={errors.functionTitle}>
                <Select
                  value={useWatch({ control, name: 'functionTitle' }) || '_custom'}
                  onValueChange={(v) => setValue('functionTitle', v === '_custom' ? '' : v, { shouldDirty: true })}
                >
                  <SelectTrigger className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground focus:border-violet-500/50 focus:ring-violet-500/20">
                    <SelectValue placeholder={t('crm.contacts.selectFunction', 'Rolle wählen...')} />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNCTION_PRESETS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                    <SelectItem value="_custom">{t('crm.contacts.customFunction', 'Andere...')}</SelectItem>
                  </SelectContent>
                </Select>
                {(!useWatch({ control, name: 'functionTitle' }) || !FUNCTION_PRESETS.some((p) => p.value === useWatch({ control, name: 'functionTitle' }))) && (
                  <Input
                    {...register('functionTitle')}
                    placeholder={t('crm.contacts.functionPlaceholder', 'z.B. Hausverwaltung')}
                    className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20 mt-1.5"
                  />
                )}
              </DarkField>
              {sites.length > 0 && (
                <DarkField label={t('crm.contacts.site', 'Objekt')}>
                  <Select
                    value={useWatch({ control, name: 'siteId' }) || 'none'}
                    onValueChange={(v) => setValue('siteId', v === 'none' ? '' : v, { shouldDirty: true })}
                  >
                    <SelectTrigger className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground focus:border-violet-500/50 focus:ring-violet-500/20">
                      <SelectValue placeholder={t('crm.contacts.selectSite', 'Objekt wählen...')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t('crm.contacts.noSite', 'Kein Objekt (global)')}</SelectItem>
                      {sites.map((s) => (
                        <SelectItem key={s._id} value={s._id}>{s.name || s.street || s._id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </DarkField>
              )}
            </div>

            <Separator className="my-5 bg-border" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.contacts.sectionContact', 'Kontaktdaten')}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <DarkField label={t('crm.phone', 'Telefon')} error={errors.phone}>
                <Input
                  {...register('phone')}
                  className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
                />
              </DarkField>
              <DarkField label={t('crm.mobile', 'Mobil')} error={errors.mobile}>
                <Input
                  {...register('mobile')}
                  className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
                />
              </DarkField>
            </div>

            <DarkField label={t('crm.email', 'E-Mail')} error={errors.email}>
              <Input
                type="email"
                {...register('email')}
                className="bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20"
              />
            </DarkField>

            <DarkField label={t('crm.notes', 'Notizen')} error={errors.notes}>
              <Textarea
                rows={2}
                {...register('notes')}
                className="bg-muted/50 border-border rounded-lg text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-violet-500/50 focus-visible:ring-violet-500/20 resize-none"
              />
            </DarkField>

            <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3">
              <div>
                <Label className="text-[13px] font-medium text-foreground">{t('crm.contacts.isPrimary', 'Primärkontakt')}</Label>
                <p className="text-xs text-muted-foreground mt-0.5">{t('crm.contacts.isPrimaryHint', 'Als Hauptansprechpartner markieren')}</p>
              </div>
              <Switch checked={isPrimary} onCheckedChange={(v) => setValue('isPrimary', v, { shouldDirty: true })} />
            </div>
          </div>

          {/* Fixed Footer */}
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading || isSubmitDisabled}
              className="bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('common.create', 'Erstellen')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DarkField({ label, required, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[12px] font-medium text-muted-foreground mb-1.5 block">
        {label}{required && <span className="text-red-400 ml-1">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-red-400 text-[11px] mt-1 flex items-center gap-1">
          <AlertCircle className="h-3 w-3 shrink-0" /> {error.message}
        </p>
      )}
    </div>
  );
}
