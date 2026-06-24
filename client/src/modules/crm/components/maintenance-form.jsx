'use client';

import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createMaintenanceSchema } from '@/modules/crm/validations/maintenance';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Wrench, AlertCircle } from 'lucide-react';
import { MAINTENANCE_TYPE_META } from '@/modules/crm/constants/crm-constants';
import { cn } from '@/lib/utils';

const BLANK = {
  maintenanceType: 'annual_service',
  customTypeLabel: '',
  frequencyMonths: 12,
  lastServiceDate: '',
  notes: '',
};

const toDateInput = (v) => {
  if (!v) return '';
  const d = new Date(v);
  if (isNaN(d)) return '';
  return d.toISOString().split('T')[0];
};

export function MaintenanceForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t } = useLanguage();
  const isEdit = !!defaultValues?._id;
  const { register, handleSubmit, reset, setValue, watch, control, formState: { errors } } = useForm({
    resolver: zodResolver(createMaintenanceSchema),
    defaultValues: BLANK,
  });

  useEffect(() => {
    if (defaultValues) {
      reset({
        ...BLANK,
        maintenanceType: defaultValues.maintenanceType || 'annual_service',
        customTypeLabel: defaultValues.customTypeLabel || '',
        frequencyMonths: defaultValues.frequencyMonths ?? 12,
        lastServiceDate: toDateInput(defaultValues.lastServiceDate),
        notes: defaultValues.notes || '',
      });
    } else reset(BLANK);
  }, [defaultValues, reset, open]);

  const type = watch('maintenanceType');

  const submit = async (data) => {
    const cleaned = {
      ...data,
      customTypeLabel: type === 'other' ? (data.customTypeLabel || null) : null,
      lastServiceDate: data.lastServiceDate || null,
      notes: data.notes || null,
    };
    try {
      await onSubmit(cleaned);
      onOpenChange(false);
    } catch {
      // keep modal open on failure
    }
  };

  const inputCls = 'bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus-visible:border-orange-500/50 focus-visible:ring-orange-500/20';
  const selectTriggerCls = 'bg-muted/50 border-border rounded-lg h-9 text-[13px] text-foreground focus:border-orange-500/50 focus:ring-orange-500/20';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[92vh] rounded-2xl border border-border bg-card shadow-2xl">
        {/* Fixed Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-orange-500/10 ring-1 ring-orange-500/20 shrink-0">
              <Wrench className="h-5 w-5 text-orange-400" />
            </div>
            <div>
              <DialogTitle className="text-[16px] font-semibold text-foreground">
                {isEdit
                  ? t('crm.maintenance.editInterval', 'Wartungsintervall bearbeiten')
                  : t('crm.maintenance.newIntervalTitle', 'Neues Wartungsintervall')}
              </DialogTitle>
              <DialogDescription className="text-[13px] text-muted-foreground mt-0.5">
                {t('crm.maintenance.formDesc', 'Definieren Sie, wie oft diese Installation gewartet werden soll.')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable Body */}
        <form onSubmit={handleSubmit(submit)} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 scrollbar-thin space-y-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.maintenance.sectionType', 'Wartungsart')}
            </p>

            <DarkField label={t('crm.maintenance.maintenanceType', 'Wartungsart')} required error={errors.maintenanceType}>
              <Select value={type} onValueChange={(v) => setValue('maintenanceType', v, { shouldDirty: true })}>
                <SelectTrigger className={selectTriggerCls}><SelectValue /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {Object.entries(MAINTENANCE_TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key} className="text-foreground focus:bg-muted/60 focus:text-foreground">
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.maintenance.type.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </DarkField>

            {type === 'other' && (
              <DarkField label={t('crm.maintenance.customLabel', 'Eigene Bezeichnung')} error={errors.customTypeLabel}>
                <Input
                  {...register('customTypeLabel')}
                  placeholder={t('crm.maintenance.customLabelPlaceholder', 'z.B. Kesselreinigung')}
                  className={inputCls}
                />
              </DarkField>
            )}

            <Separator className="my-5 bg-border" />
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
              {t('crm.maintenance.sectionSchedule', 'Zeitplan')}
            </p>

            <div className="grid grid-cols-2 gap-4">
              <DarkField label={t('crm.maintenance.frequencyMonths', 'Intervall (Monate)')} required error={errors.frequencyMonths}>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  {...register('frequencyMonths', { valueAsNumber: true })}
                  className={inputCls}
                />
              </DarkField>
              <DarkField label={t('crm.maintenance.lastServiceDate', 'Letzter Service')} error={errors.lastServiceDate}>
                <Input type="date" {...register('lastServiceDate')} className={inputCls} />
              </DarkField>
            </div>

            <DarkField label={t('crm.notes', 'Notizen')} error={errors.notes}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    placeholder={t('crm.maintenance.notesPlaceholder', 'Notizen zur Wartung...')}
                    maxLength={2000}
                    minHeight={120}
                    error={errors.notes}
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
              className="text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              type="submit"
              disabled={isLoading}
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
