'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createSiteSchema } from '@/modules/crm/validations/site';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Building2, MapPin } from 'lucide-react';
import { CH_CANTONS } from '@/modules/crm/constants/customer-constants';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';

const BLANK = {
  name: '',
  street: '',
  postalCode: '',
  city: '',
  canton: '',
  country: 'CH',
  floorUnit: '',
  accessInstructions: '',
  siteType: 'residential',
  latitude: null,
  longitude: null,
};

export function SiteForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(createSiteSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK,
        ...defaultValues,
        name: defaultValues.name || '',
        street: defaultValues.street || '',
        postalCode: defaultValues.postalCode || '',
        city: defaultValues.city || '',
        canton: defaultValues.canton || '',
        country: defaultValues.country || 'CH',
        floorUnit: defaultValues.floorUnit || '',
        accessInstructions: defaultValues.accessInstructions || '',
        siteType: defaultValues.siteType || 'residential',
      });
    } else {
      reset(BLANK);
    }
  }, [defaultValues, reset, open]);

  const canton = watch('canton');
  const siteType = watch('siteType');

  const submit = async (data) => {
    const cleaned = {
      ...data,
      street: data.street || null,
      postalCode: data.postalCode || null,
      city: data.city || null,
      canton: data.canton || null,
      floorUnit: data.floorUnit || null,
      accessInstructions: data.accessInstructions || null,
    };
    try {
      await onSubmit(cleaned);
      onOpenChange(false);
    } catch {
      // keep modal open on failure
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            {isEdit ? t('crm.sites.editSite', 'Objekt bearbeiten') : t('crm.sites.newSite', 'Neues Objekt')}
          </DialogTitle>
          <DialogDescription>
            {t('crm.sites.formDesc', 'Gebäude oder Standort, an dem Installationen betrieben werden.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="space-y-4 pt-2">
          <FormField label={`${t('crm.sites.label', 'Bezeichnung')}*`} error={errors.name?.message}>
            <Input {...register('name')} autoFocus placeholder={t('crm.sites.labelPlaceholder', 'z.B. Mehrfamilienhaus Mustergasse')} />
          </FormField>

          <FormField label={t('crm.sites.type', 'Objekttyp')} error={errors.siteType?.message}>
            <Select value={siteType} onValueChange={(v) => setValue('siteType', v, { shouldDirty: true })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(SITE_TYPE_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>{t(`crm.sites.type.${key}`, meta.label)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="h-3 w-3" /> {t('crm.address', 'Adresse')}
            </div>
            <FormField label={t('crm.street', 'Strasse')} error={errors.street?.message}>
              <Input {...register('street')} />
            </FormField>
            <div className="grid grid-cols-[120px_1fr] gap-3">
              <FormField label={t('crm.postalCode', 'PLZ')} error={errors.postalCode?.message}>
                <Input {...register('postalCode')} />
              </FormField>
              <FormField label={t('crm.city', 'Ort')} error={errors.city?.message}>
                <Input {...register('city')} />
              </FormField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('crm.canton', 'Kanton')} error={errors.canton?.message}>
                <Select value={canton || ''} onValueChange={(v) => setValue('canton', v, { shouldDirty: true })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {CH_CANTONS.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        <span className="font-mono text-[10px] mr-1.5">{c.code}</span>{c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={t('crm.sites.floorUnit', 'Etage / Einheit')} error={errors.floorUnit?.message}>
                <Input {...register('floorUnit')} placeholder={t('crm.sites.floorUnitPlaceholder', 'z.B. 3. OG')} />
              </FormField>
            </div>
          </div>

          <FormField label={t('crm.sites.accessInstructions', 'Zugangsinformationen')} error={errors.accessInstructions?.message}>
            <Textarea rows={2} {...register('accessInstructions')} placeholder={t('crm.sites.accessInstructionsPlaceholder', 'z.B. Schlüssel bei Hauswart Huber')} />
          </FormField>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.sites.createSite', 'Objekt anlegen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormField({ label, error, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
