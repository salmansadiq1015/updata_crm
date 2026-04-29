'use client';

import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';

export function AssignmentRecurrenceForm({ register, errors, watch, setValue }) {
  const { t } = useLanguage();
  const endType = watch('recurrence.endType');

  const frequencyOptions = [
    { value: 'DAILY', label: t('deploy.recurrence.daily', 'Täglich') },
    { value: 'WEEKLY', label: t('deploy.recurrence.weekly', 'Wöchentlich') },
    { value: 'BIWEEKLY', label: t('deploy.recurrence.biweekly', 'Alle 2 Wochen') },
    { value: 'MONTHLY', label: t('deploy.recurrence.monthly', 'Monatlich') },
    { value: 'CUSTOM', label: t('deploy.recurrence.custom', 'Benutzerdefiniert') },
  ];

  const endTypeOptions = [
    { value: 'NEVER', label: t('deploy.recurrence.never', 'Nie') },
    { value: 'AFTER_COUNT', label: t('deploy.recurrence.afterCount', 'Nach Anzahl') },
    { value: 'UNTIL_DATE', label: t('deploy.recurrence.untilDate', 'Bis Datum') },
  ];

  return (
    <div className="space-y-3 p-3 rounded-lg border bg-muted/30">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {t('deploy.recurrence.title', 'Wiederholung')}
      </p>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('deploy.recurrence.frequency', 'Häufigkeit')} required error={errors?.recurrence?.frequency?.message}>
          <Select
            value={watch('recurrence.frequency') || ''}
            onValueChange={(v) => setValue('recurrence.frequency', v, { shouldValidate: true })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder={t('deploy.form.selectPlaceholder', 'Auswählen')} />
            </SelectTrigger>
            <SelectContent>
              {frequencyOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={t('deploy.recurrence.interval', 'Intervall')} error={errors?.recurrence?.interval?.message}>
          <Input type="number" min={1} max={52} className="h-9 text-xs" {...register('recurrence.interval', { valueAsNumber: true })} />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label={t('deploy.recurrence.ends', 'Endet')} error={errors?.recurrence?.endType?.message}>
          <Select
            value={endType || 'NEVER'}
            onValueChange={(v) => setValue('recurrence.endType', v, { shouldValidate: true })}
          >
            <SelectTrigger className="h-9 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {endTypeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        {endType === 'AFTER_COUNT' && (
          <FormField label={t('deploy.recurrence.count', 'Anzahl')} error={errors?.recurrence?.endCount?.message}>
            <Input type="number" min={1} max={365} className="h-9 text-xs" {...register('recurrence.endCount', { valueAsNumber: true })} />
          </FormField>
        )}
        {endType === 'UNTIL_DATE' && (
          <FormField label={t('deploy.recurrence.endDate', 'Enddatum')} error={errors?.recurrence?.endDate?.message}>
            <Input type="date" className="h-9 text-xs" {...register('recurrence.endDate')} />
          </FormField>
        )}
      </div>
    </div>
  );
}
