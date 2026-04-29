'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLanguage } from '@/lib/i18n/language-context';
import { createMaintenanceSchema } from '@/modules/crm/validations/maintenance';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormField, FormBody } from '@/components/ui/form-field';
import { Loader2, Wrench } from 'lucide-react';
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
  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4.5 w-4.5 text-primary" />
            {isEdit ? t('crm.maintenance.editInterval', 'Wartungsintervall bearbeiten') : t('crm.maintenance.newIntervalTitle', 'Neues Wartungsintervall')}
          </DialogTitle>
          <DialogDescription>
            {t('crm.maintenance.formDesc', 'Definieren Sie, wie oft diese Installation gewartet werden soll.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(submit)} className="flex flex-1 flex-col overflow-hidden">
          <FormBody>
            <FormField label={t('crm.maintenance.maintenanceType', 'Wartungsart')} required error={errors.maintenanceType?.message}>
              <Select value={type} onValueChange={(v) => setValue('maintenanceType', v, { shouldDirty: true })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(MAINTENANCE_TYPE_META).map(([key, meta]) => {
                    const Icon = meta.icon;
                    return (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <Icon className={cn('h-3.5 w-3.5', meta.color)} />
                          {t(`crm.maintenance.type.${key}`, meta.label)}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </FormField>

            {type === 'other' && (
              <FormField label={t('crm.maintenance.customLabel', 'Eigene Bezeichnung')} error={errors.customTypeLabel?.message}>
                <Input {...register('customTypeLabel')} placeholder={t('crm.maintenance.customLabelPlaceholder', 'z.B. Kesselreinigung')} />
              </FormField>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField label={t('crm.maintenance.frequencyMonths', 'Intervall (Monate)')} required error={errors.frequencyMonths?.message}>
                <Input
                  type="number"
                  min="1"
                  max="120"
                  {...register('frequencyMonths', { valueAsNumber: true })}
                />
              </FormField>
              <FormField label={t('crm.maintenance.lastServiceDate', 'Letzter Service')} error={errors.lastServiceDate?.message}>
                <Input type="date" {...register('lastServiceDate')} />
              </FormField>
            </div>

            <FormField label={t('crm.notes', 'Notizen')} error={errors.notes?.message}>
              <Textarea rows={2} {...register('notes')} />
            </FormField>
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
