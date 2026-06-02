'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createInstallationSchema } from '@/modules/crm/validations/installation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Flame, AlertCircle } from 'lucide-react';
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

  const inputCls = 'bg-white/4 border-white/10 rounded-lg h-9 text-[13px] text-white/90 placeholder:text-white/25 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20';
  const selectTriggerCls = 'bg-white/4 border-white/10 rounded-lg h-9 text-[13px] text-white/90 focus:border-emerald-500/50 focus:ring-emerald-500/20';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-white/8 bg-[#0D1117] shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-white/6 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 shrink-0">
              <Flame className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-white/90">
                {isEdit
                  ? t('crm.installations.editInstallation', 'Installation bearbeiten')
                  : t('crm.installations.newInstallation', 'Neue Installation')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-white/45 mt-0.5">
                {t('crm.installations.formDesc', 'Anlage / Gerät am Standort (Heizkessel, Wärmepumpe, etc.).')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-3">
              {t('crm.installations.sectionType', 'Gerätetyp')}
            </p>

            <DarkField label={t('crm.installations.type', 'Typ')} required error={errors.type}>
              <Select value={type} onValueChange={(v) => setValue('type', v, { shouldDirty: true })}>
                <SelectTrigger className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-[#0D1117] border-white/10">
                  {Object.entries(INSTALLATION_TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key} className="text-white/80 focus:bg-white/5 focus:text-white/90">
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.installations.type.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </DarkField>

            <div className="grid grid-cols-2 gap-4">
              <DarkField label={t('crm.installations.manufacturer', 'Hersteller')} error={errors.manufacturer}>
                <Input {...register('manufacturer')} className={inputCls} />
              </DarkField>
              <DarkField label={t('crm.installations.model', 'Modell')} error={errors.model}>
                <Input {...register('model')} className={inputCls} />
              </DarkField>
            </div>

            <DarkField label={t('crm.installations.serialNumber', 'Seriennummer')} error={errors.serialNumber}>
              <Input
                {...register('serialNumber')}
                className={cn(inputCls, 'font-mono')}
              />
            </DarkField>

            <Separator className="my-5 bg-white/6" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-3">
              {t('crm.installations.sectionDates', 'Daten & Leistung')}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <DarkField label={t('crm.installations.commissioningDate', 'Inbetriebnahme')} error={errors.commissioningDate}>
                <Input type="date" {...register('commissioningDate')} className={inputCls} />
              </DarkField>
              <DarkField label={t('crm.installations.warrantyEndDate', 'Garantie bis')} error={errors.warrantyEndDate}>
                <Input type="date" {...register('warrantyEndDate')} className={inputCls} />
              </DarkField>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <DarkField label={t('crm.installations.powerOutput', 'Leistung (kW)')} error={errors.powerOutputKw}>
                <Input type="number" step="0.1" {...register('powerOutputKw', { valueAsNumber: true })} className={inputCls} />
              </DarkField>
              <DarkField label={t('crm.installations.yearOfManufacture', 'Baujahr')} error={errors.yearOfManufacture}>
                <Input type="number" min="1900" max="2100" {...register('yearOfManufacture', { valueAsNumber: true })} className={inputCls} />
              </DarkField>
              <DarkField label={t('crm.installations.fuelType', 'Energieträger')} error={errors.fuelType}>
                <Select value={fuelType || ''} onValueChange={(v) => setValue('fuelType', v || null, { shouldDirty: true })}>
                  <SelectTrigger className={selectTriggerCls}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="bg-[#0D1117] border-white/10">
                    {Object.entries(FUEL_TYPE_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key} className="text-white/80 focus:bg-white/5 focus:text-white/90">
                        {t(`crm.installations.fuel.${key}`, meta.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DarkField>
            </div>

            <Separator className="my-5 bg-white/6" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/35 mb-3">
              {t('crm.installations.sectionNotes', 'Technische Notizen')}
            </p>

            <DarkField label={t('crm.installations.technicalNotes', 'Technische Notizen')} error={errors.technicalNotes}>
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
            </DarkField>
          </div>

          {/* Fixed Footer */}
          <div className="px-6 py-4 border-t border-white/6 shrink-0 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="text-white/55 hover:text-white/80 hover:bg-white/5"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-linear-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.installations.createInstallation', 'Installation anlegen')}
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
      <Label className="text-[12px] font-medium text-white/60 mb-1.5 block">
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
