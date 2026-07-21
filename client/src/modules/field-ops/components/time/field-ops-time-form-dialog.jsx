'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StepIndicator, StepFooter } from '@/components/ui/form-stepper';
import { FormField, FormSection } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import { ACTIVITY_TYPE_LABELS } from '@/modules/field-ops/constants/field-ops-constants';
import {
  FIELD_OPS_ORDER_PICKER_QUERY,
  formatFieldOpsOrderOptionLabel,
  getFieldOpsOrderId,
  toFieldOpsOrderItems,
} from '@/modules/field-ops/utils/order-option-utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { Clock, StickyNote } from 'lucide-react';

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  orderId: z.string().min(1, 'Required'),
  date: z.string().min(1, 'Required'),
  startTime: z.string().min(1, 'Required'),
  endTime: z.string().min(1, 'Required'),
  breakDurationMin: z.coerce.number().min(0).default(0),
}).refine((d) => !d.startTime || !d.endTime || d.endTime > d.startTime, {
  message: 'End time must be after start time',
  path: ['endTime'],
});

const step2Schema = z.object({
  activityType: z.string().min(1, 'Required'),
  note: z.string().optional(),
});

const fullSchema = step1Schema.merge(step2Schema);

const STEP_FIELDS = [
  ['orderId', 'date', 'startTime', 'endTime', 'breakDurationMin'],
  ['activityType'],
];

const BLANK = {
  orderId: '', date: '', startTime: '', endTime: '',
  breakDurationMin: 0, activityType: '', note: '',
};

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseMinutes(t) {
  if (!t || !t.includes(':')) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtDuration(min) {
  if (!min || min <= 0) return null;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ''}`.trim() : `${m}m`;
}

function toDateLocal(iso) {
  if (!iso) return '';
  return iso.slice(0, 10);
}

function toTimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso.slice(11, 16) || '';
  return d.toTimeString().slice(0, 5);
}

// ── Step components ───────────────────────────────────────────────────────────

function Step1OrderTime({ form, de, isEdit, loadOrders }) {
  const { register, watch, setValue, formState: { errors } } = form;
  const { data: ordersResponse, isFetching: ordersLoading, isError: ordersError } = useFieldOpsOrders(
    FIELD_OPS_ORDER_PICKER_QUERY,
    { enabled: loadOrders },
  );
  const orders = toFieldOpsOrderItems(ordersResponse);

  const [startTime, endTime, breakDurationMin] = watch(['startTime', 'endTime', 'breakDurationMin']);
  const netPreview = useMemo(() => {
    const s = parseMinutes(startTime);
    const e = parseMinutes(endTime);
    if (s === null || e === null || e <= s) return null;
    return fmtDuration(e - s - (Number(breakDurationMin) || 0));
  }, [startTime, endTime, breakDurationMin]);

  return (
    <div className="space-y-5">
      <FormSection
        title={de ? 'Einsatz & Datum' : 'Assignment & Date'}
        description={de ? 'Einsatz zuordnen und Einsatzdatum festlegen' : 'Link to an order and set the service date'}
      >
        <FormField label={de ? 'Einsatz' : 'Assignment'} required error={errors.orderId?.message}>
          <Select
            value={watch('orderId')}
            onValueChange={(v) => setValue('orderId', v, { shouldValidate: true })}
            disabled={isEdit}
          >
            <SelectTrigger className={errors.orderId ? 'border-destructive' : ''}>
              <SelectValue placeholder={de ? 'Einsatz wählen…' : 'Select order…'} />
            </SelectTrigger>
            <SelectContent>
              {loadOrders && ordersLoading ? (
                <SelectItem value="__orders_loading" disabled>
                  {de ? 'Einsaetze werden geladen...' : 'Loading orders...'}
                </SelectItem>
              ) : null}
              {loadOrders && !ordersLoading && ordersError ? (
                <SelectItem value="__orders_error" disabled>
                  {de ? 'Einsaetze konnten nicht geladen werden' : 'Assignments could not be loaded'}
                </SelectItem>
              ) : null}
              {loadOrders && !ordersLoading && !ordersError && orders.length === 0 ? (
                <SelectItem value="__orders_empty" disabled>
                  {de ? 'Keine Einsaetze verfuegbar' : 'No orders available'}
                </SelectItem>
              ) : null}
              {orders.map((order) => {
                const orderId = getFieldOpsOrderId(order);
                if (!orderId) return null;

                return (
                  <SelectItem key={orderId} value={orderId}>
                    {formatFieldOpsOrderOptionLabel(order, de ? 'de' : 'en')}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={de ? 'Datum' : 'Date'} required error={errors.date?.message}>
          <Input type="date" {...register('date')} className={errors.date ? 'border-destructive' : ''} />
        </FormField>
      </FormSection>

      <FormSection
        title={de ? 'Zeitspanne' : 'Time Range'}
        description={de ? 'Start- und Endzeit sowie Pausendauer' : 'Start and end time plus break duration'}
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label={de ? 'Startzeit' : 'Start Time'} required error={errors.startTime?.message}>
            <Input type="time" {...register('startTime')} className={errors.startTime ? 'border-destructive' : ''} />
          </FormField>
          <FormField label={de ? 'Endzeit' : 'End Time'} required error={errors.endTime?.message}>
            <Input type="time" {...register('endTime')} className={errors.endTime ? 'border-destructive' : ''} />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-4 items-end">
          <FormField label={de ? 'Pause (Minuten)' : 'Break (minutes)'}>
            <Input type="number" min="0" {...register('breakDurationMin')} />
          </FormField>
          {netPreview && (
            <div className="pb-0.5">
              <p className="text-[13px] font-medium text-foreground/80 mb-1.5">{de ? 'Nettozeit' : 'Net Duration'}</p>
              <div className="h-9 flex items-center px-3 rounded-md bg-primary/8 border border-primary/25">
                <span className="text-sm font-bold text-primary font-mono">{netPreview}</span>
              </div>
            </div>
          )}
        </div>
      </FormSection>
    </div>
  );
}

function Step2ActivityNote({ form, de }) {
  const { register, watch, setValue, formState: { errors } } = form;

  const activityOptions = Object.entries(ACTIVITY_TYPE_LABELS).map(([v, c]) => ({
    value: v,
    label: de ? c.label : c.labelEn,
  }));

  return (
    <FormSection
      title={de ? 'Tätigkeit & Notiz' : 'Activity & Notes'}
      description={de ? 'Tätigkeitsart und optionale Zusatzinformationen' : 'Activity type and optional additional information'}
    >
      <FormField label={de ? 'Tätigkeitsart' : 'Activity Type'} required error={errors.activityType?.message}>
        <Select
          value={watch('activityType')}
          onValueChange={(v) => setValue('activityType', v, { shouldValidate: true })}
        >
          <SelectTrigger className={errors.activityType ? 'border-destructive' : ''}>
            <SelectValue placeholder={de ? 'Tätigkeit wählen…' : 'Select activity…'} />
          </SelectTrigger>
          <SelectContent>
            {activityOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label={de ? 'Notiz' : 'Note'}
        description={de ? 'Zusätzliche Informationen zu diesem Eintrag' : 'Additional information about this entry'}
      >
        <Textarea
          {...register('note')}
          rows={4}
          placeholder={de ? 'Zusätzliche Informationen…' : 'Additional notes…'}
          className="resize-none text-sm"
        />
      </FormField>
    </FormSection>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function FieldOpsTimeFormDialog({ open, onOpenChange, onSave, isLoading, defaultValues }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const isEdit = !!defaultValues;

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const form = useForm({
    resolver: zodResolver(fullSchema),
    defaultValues: BLANK,
    mode: 'onTouched',
  });

  const { trigger, getValues, reset } = form;

  useEffect(() => {
    if (open) {
      reset(isEdit ? {
        orderId: defaultValues.orderId?._id || defaultValues.orderId || '',
        date: toDateLocal(defaultValues.date),
        startTime: toTimeLocal(defaultValues.startTime),
        endTime: toTimeLocal(defaultValues.endTime),
        breakDurationMin: defaultValues.breakDurationMin ?? defaultValues.break_duration_min ?? 0,
        activityType: defaultValues.activityType || '',
        note: defaultValues.note || '',
      } : BLANK);
      setCurrentStep(0);
      setDirection(1);
    }
  }, [open, defaultValues, isEdit, reset]);

  const STEPS = [
    { label: de ? 'Zeit' : 'Time',        icon: Clock },
    { label: de ? 'Tätigkeit' : 'Activity', icon: StickyNote },
  ];

  const stepContent = [
    <Step1OrderTime key={0} form={form} de={de} isEdit={isEdit} loadOrders={open} />,
    <Step2ActivityNote key={1} form={form} de={de} />,
  ];

  const handleNext = useCallback(async () => {
    const fieldsToCheck = currentStep === STEPS.length - 1
      ? STEP_FIELDS.flat()
      : STEP_FIELDS[currentStep];

    const valid = await trigger(fieldsToCheck);
    if (!valid) return;

    if (currentStep === STEPS.length - 1) {
      const data = getValues();
      const { orderId, ...rest } = data;
      const payload = {
        ...rest,
        date: rest.date ? `${rest.date}T00:00:00.000Z` : undefined,
        startTime: rest.date && rest.startTime ? `${rest.date}T${rest.startTime}:00.000Z` : undefined,
        endTime: rest.date && rest.endTime ? `${rest.date}T${rest.endTime}:00.000Z` : undefined,
      };
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined || payload[k] === null || payload[k] === '') delete payload[k];
      });
      onSave({ orderId, payload });
      return;
    }

    setDirection(1);
    setCurrentStep((s) => s + 1);
  }, [currentStep, trigger, getValues, onSave, STEPS.length]);

  const handleBack = useCallback(() => {
    setDirection(-1);
    setCurrentStep((s) => s - 1);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 gap-0 flex flex-col max-h-[90vh]">

        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              {isEdit
                ? (de ? 'Zeiteintrag bearbeiten' : 'Edit Time Entry')
                : (de ? 'Neuer Zeiteintrag' : 'New Time Entry')}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {de
                ? `Schritt ${currentStep + 1} von ${STEPS.length}`
                : `Step ${currentStep + 1} of ${STEPS.length}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-5 pb-2 shrink-0">
          <StepIndicator
            steps={STEPS}
            currentStep={currentStep}
            onStepClick={(idx) => {
              setDirection(idx < currentStep ? -1 : 1);
              setCurrentStep(idx);
            }}
          />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: 'easeInOut' }}
            >
              {stepContent[currentStep]}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="px-6 pb-5 shrink-0">
          <StepFooter
            currentStep={currentStep}
            totalSteps={STEPS.length}
            onBack={handleBack}
            onNext={handleNext}
            onCancel={() => onOpenChange(false)}
            isLoading={isLoading}
            nextLabel={de ? 'Weiter' : 'Next'}
            backLabel={de ? 'Zurück' : 'Back'}
            cancelLabel={de ? 'Abbrechen' : 'Cancel'}
            submitLabel={isEdit
              ? (de ? 'Änderungen speichern' : 'Save Changes')
              : (de ? 'Eintrag erstellen' : 'Create Entry')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
