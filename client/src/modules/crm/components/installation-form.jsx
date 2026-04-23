'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createInstallationSchema } from '@/modules/crm/validations/installation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormBody } from '@/components/ui/form-field';
import { Loader2, Wrench } from 'lucide-react';
import { INSTALLATION_TYPE_META, FUEL_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { cn } from '@/lib/utils';

const BLANK = {
  type: 'boiler',
  manufacturer: '',
  model: '',
  serialNumber: '',
  commissioningDate: '',
  warrantyEndDate: '',
  powerOutputKw: null,
  fuelType: null,
  yearOfManufacture: null,
  technicalNotes: '',
};

const toDateInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
};

export function InstallationForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm({
    resolver: zodResolver(createInstallationSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK,
        type: defaultValues.type || 'boiler',
        manufacturer: defaultValues.manufacturer || '',
        model: defaultValues.model || '',
        serialNumber: defaultValues.serialNumber || '',
        commissioningDate: toDateInput(defaultValues.commissioningDate),
        warrantyEndDate: toDateInput(defaultValues.warrantyEndDate),
        powerOutputKw: defaultValues.powerOutputKw ?? null,
        fuelType: defaultValues.fuelType ?? null,
        yearOfManufacture: defaultValues.yearOfManufacture ?? null,
        technicalNotes: defaultValues.technicalNotes || '',
      });
    } else reset(BLANK);
  }, [defaultValues, reset, open]);

  const type = watch('type');
  const fuelType = watch('fuelType');

  const submit = async (data) => {
    const cleaned = {
      ...data,
      manufacturer: data.manufacturer || null,
      model: data.model || null,
      serialNumber: data.serialNumber || null,
      commissioningDate: data.commissioningDate || null,
      warrantyEndDate: data.warrantyEndDate || null,
      powerOutputKw: data.powerOutputKw === '' || data.powerOutputKw == null ? null : Number(data.powerOutputKw),
      yearOfManufacture: data.yearOfManufacture === '' || data.yearOfManufacture == null ? null : Number(data.yearOfManufacture),
      fuelType: data.fuelType || null,
      technicalNotes: data.technicalNotes || null,
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
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4.5 w-4.5 text-primary" />
            {isEdit ? t('crm.installations.editInstallation', 'Installation bearbeiten') : t('crm.installations.newInstallation', 'Neue Installation')}
          </DialogTitle>
          <DialogDescription>
            {t('crm.installations.formDesc', 'Anlage / Gerät am Standort (Heizkessel, Wärmepumpe, etc.).')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)}>
          <FormBody>
            <FormField label={t('crm.installations.type', 'Typ')} required error={errors.type?.message}>
              <Select value={type} onValueChange={(v) => setValue('type', v, { shouldDirty: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INSTALLATION_TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.installations.type.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('crm.installations.manufacturer', 'Hersteller')} error={errors.manufacturer?.message}>
                <Input {...register('manufacturer')} />
              </FormField>
              <FormField label={t('crm.installations.model', 'Modell')} error={errors.model?.message}>
                <Input {...register('model')} />
              </FormField>
            </div>

            <FormField label={t('crm.installations.serialNumber', 'Seriennummer')} error={errors.serialNumber?.message}>
              <Input {...register('serialNumber')} className="font-mono" />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('crm.installations.commissioningDate', 'Inbetriebnahme')} error={errors.commissioningDate?.message}>
                <Input type="date" {...register('commissioningDate')} />
              </FormField>
              <FormField label={t('crm.installations.warrantyEndDate', 'Garantie bis')} error={errors.warrantyEndDate?.message}>
                <Input type="date" {...register('warrantyEndDate')} />
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField label={t('crm.installations.powerOutput', 'Leistung (kW)')} error={errors.powerOutputKw?.message}>
                <Input type="number" step="0.1" {...register('powerOutputKw', { valueAsNumber: true })} />
              </FormField>
              <FormField label={t('crm.installations.yearOfManufacture', 'Baujahr')} error={errors.yearOfManufacture?.message}>
                <Input type="number" min="1900" max="2100" {...register('yearOfManufacture', { valueAsNumber: true })} />
              </FormField>
              <FormField label={t('crm.installations.fuelType', 'Energietraeger')} error={errors.fuelType?.message}>
                <Select value={fuelType || ''} onValueChange={(v) => setValue('fuelType', v || null, { shouldDirty: true })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FUEL_TYPE_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key}>{t(`crm.installations.fuel.${key}`, meta.label)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>

            <FormField label={t('crm.installations.technicalNotes', 'Technische Notizen')} error={errors.technicalNotes?.message}>
              <Controller
                name="technicalNotes"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t('crm.installations.technicalNotesPlaceholder', 'Technische Notizen...')}
                    maxLength={5000}
                    minHeight={100}
                  />
                )}
              />
            </FormField>
          </FormBody>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.installations.createInstallation', 'Installation anlegen')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
