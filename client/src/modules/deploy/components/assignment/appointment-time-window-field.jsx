'use client';

import { useMemo, useState } from 'react';
import { Clock, TimerReset } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { FormField } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import {
  TIME_WINDOW_PRESETS,
  formatAppointmentTimeWindow,
  getAppointmentTimeWindowPresetKey,
  isValidAppointmentTimeRange,
  parseAppointmentTimeWindow,
} from '../../utils/appointment-time-window';

function presetRange(preset) {
  return `${preset.start}-${preset.end}`;
}

export function AppointmentTimeWindowField({
  value,
  error,
  register,
  setValue,
  t,
  disabled,
}) {
  const parsedValue = useMemo(() => parseAppointmentTimeWindow(value), [value]);
  const selectedPreset = useMemo(() => getAppointmentTimeWindowPresetKey(value), [value]);
  const [customStart, setCustomStart] = useState(parsedValue?.start || '');
  const [customEnd, setCustomEnd] = useState(parsedValue?.end || '');
  const rangeInvalid = !isValidAppointmentTimeRange(customStart, customEnd);

  const setWindowValue = (start, end) => {
    const nextValue = start && end && isValidAppointmentTimeRange(start, end)
      ? formatAppointmentTimeWindow(start, end)
      : '';
    setValue('appointment.appointmentWindow', nextValue, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const applyPreset = (preset) => {
    setCustomStart(preset.start);
    setCustomEnd(preset.end);
    setWindowValue(preset.start, preset.end);
  };

  const updateCustomStart = (nextStart) => {
    setCustomStart(nextStart);
    setWindowValue(nextStart, customEnd);
  };

  const updateCustomEnd = (nextEnd) => {
    setCustomEnd(nextEnd);
    setWindowValue(customStart, nextEnd);
  };

  const clearWindow = () => {
    setCustomStart('');
    setCustomEnd('');
    setWindowValue('', '');
  };

  return (
    <FormField
      label={t('deploy.form.timeWindow', 'Time Window')}
      error={error || (rangeInvalid ? t('deploy.form.timeWindowInvalidRange', 'End time must be after start time.') : '')}
      description={!rangeInvalid ? t('deploy.form.timeWindowHelper', 'Choose a common window or set exact times.') : ''}
    >
      <input type="hidden" {...register('appointment.appointmentWindow')} />
      <div className="space-y-3 rounded-2xl border border-border/70 bg-background/50 p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIME_WINDOW_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset.key;
            return (
              <button
                key={preset.key}
                type="button"
                disabled={disabled}
                onClick={() => applyPreset(preset)}
                className={cn(
                  'min-h-16 rounded-xl border px-3 py-2 text-left transition-colors',
                  'hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  isSelected
                    ? 'border-primary/60 bg-primary/10 text-foreground'
                    : 'border-border/70 bg-muted/20 text-muted-foreground',
                  disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <Clock className="h-4 w-4 text-primary" />
                  {t(preset.labelKey, preset.fallback)}
                </span>
                <span className="mt-1 block text-xs tabular-nums">{presetRange(preset)}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <FormField label={t('deploy.form.timeWindowFrom', 'From')}>
            <Input
              type="time"
              value={customStart}
              onChange={(event) => updateCustomStart(event.target.value)}
              disabled={disabled}
              className="h-11 rounded-xl text-sm tabular-nums"
            />
          </FormField>
          <div className="pb-3 text-xs font-medium text-muted-foreground">
            {t('deploy.form.timeWindowToSeparator', 'to')}
          </div>
          <FormField label={t('deploy.form.timeWindowTo', 'To')}>
            <Input
              type="time"
              value={customEnd}
              onChange={(event) => updateCustomEnd(event.target.value)}
              disabled={disabled}
              className="h-11 rounded-xl text-sm tabular-nums"
            />
          </FormField>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {value ? (
            <Badge variant="secondary" className="gap-1.5 rounded-lg px-2.5 py-1">
              <Clock className="h-3.5 w-3.5" />
              {t('deploy.form.timeWindowSelected', 'Selected')}: {value}
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t('deploy.form.timeWindowOptional', 'No fixed time window selected')}
            </span>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || (!customStart && !customEnd && !value)}
            onClick={clearWindow}
            className="h-8 rounded-lg px-2.5 text-xs"
          >
            <TimerReset className="mr-1.5 h-3.5 w-3.5" />
            {t('deploy.form.timeWindowClear', 'Clear')}
          </Button>
        </div>
      </div>
    </FormField>
  );
}
