'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { siteService } from '@/modules/crm/services/site-service';
import { queryKeys } from '@/lib/query/keys';
import { createInstallationSchema } from '@/modules/crm/validations/installation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Controller } from 'react-hook-form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Flame, AlertCircle, Check } from 'lucide-react';
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
  additionalSiteIds: [],
};

const toDateInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
};

/**
 * customerId + primarySiteId enable the "Weitere Objekte" section: the other
 * sites of the same customer this component also supplies. Without customerId
 * (caller can't provide it) the section simply doesn't render.
 */
export function InstallationForm({ open, onOpenChange, onSubmit, defaultValues, isLoading, customerId, primarySiteId }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;

  const { data: customerSites = [] } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(customerId),
    queryFn: () => siteService.listByCustomer(customerId),
    enabled: open && !!customerId,
  });
  const otherSites = customerSites.filter((s) => String(s._id) !== String(primarySiteId));
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
        additionalSiteIds: (defaultValues.additionalSiteIds || []).map((s) => String(s?._id ?? s)),
      });
    } else reset(BLANK);
  }, [defaultValues, reset, open]);

  const type = watch('type');
  const fuelType = watch('fuelType');
  const additionalSiteIds = watch('additionalSiteIds') || [];

  const toggleSite = (siteId) => {
    const id = String(siteId);
    const next = additionalSiteIds.includes(id)
      ? additionalSiteIds.filter((s) => s !== id)
      : [...additionalSiteIds, id];
    setValue('additionalSiteIds', next, { shouldDirty: true });
  };

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

  const inputCls = 'bg-background border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20';
  const selectTriggerCls = 'bg-background border-border rounded-lg h-9 text-[13px] text-foreground focus:border-emerald-500/50 focus:ring-emerald-500/20';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20 shrink-0">
              <Flame className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {isEdit
                  ? t('crm.installations.editInstallation', 'Komponente bearbeiten')
                  : t('crm.installations.newInstallation', 'Neue Komponente')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {t('crm.installations.formDesc', 'Komponente am Objekt (Heizkessel, Wärmepumpe, etc.).')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.installations.sectionType', 'Gerätetyp')}
            </p>

            <DarkField label={t('crm.installations.type', 'Typ')} required error={errors.type}>
              <Select value={type} onValueChange={(v) => setValue('type', v, { shouldDirty: true })}>
                <SelectTrigger className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {Object.entries(INSTALLATION_TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key} className="text-foreground focus:bg-muted/50 focus:text-foreground">
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

            <Separator className="my-5 bg-muted/50" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
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
                  <SelectContent className="bg-card border-border">
                    {Object.entries(FUEL_TYPE_META).map(([key, meta]) => (
                      <SelectItem key={key} value={key} className="text-foreground focus:bg-muted/50 focus:text-foreground">
                        {t(`crm.installations.fuel.${key}`, meta.label)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </DarkField>
            </div>

            {otherSites.length > 0 && (
              <>
                <Separator className="my-5 bg-muted/50" />
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  {t('crm.installations.sectionSupplies', 'Weitere Objekte')}
                </p>
                <p className="text-[12px] text-muted-foreground mb-3">
                  {t('crm.installations.suppliesHint', 'Versorgt diese Komponente weitere Objekte des Kunden (z.B. Heizzentrale)? Wartungen, Dokumente und Historie werden nur einmal geführt.')}
                </p>
                <div className="rounded-lg border border-border bg-muted/30 p-2 space-y-1 max-h-44 overflow-y-auto scrollbar-thin">
                  {otherSites.map((site) => {
                    const checked = additionalSiteIds.includes(String(site._id));
                    return (
                      <button
                        key={site._id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggleSite(site._id)}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left transition-colors',
                          checked ? 'bg-brand-500/10 text-foreground' : 'hover:bg-muted/60 text-muted-foreground',
                        )}
                      >
                        <span className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                          checked ? 'border-brand-600 bg-brand-600 text-white' : 'border-border bg-background',
                        )}>
                          {checked && <Check className="h-3 w-3" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-medium">{site.name}</span>
                          {(site.street || site.city) && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {[site.street, [site.postalCode, site.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <Separator className="my-5 bg-muted/50" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
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
          <div className="px-6 py-4 border-t border-border shrink-0 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
              className="text-muted-foreground hover:text-foreground hover:bg-muted/50"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
              className="bg-linear-to-r from-brand-700 to-brand-600 hover:from-brand-600 hover:to-brand-500 text-white gap-2"
            >
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Speichern') : t('crm.installations.createInstallation', 'Komponente anlegen')}
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
