'use client';

import { useState, useCallback, useEffect } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StepIndicator, StepFooter } from '@/components/ui/form-stepper';
import { FormField, FormSection } from '@/components/ui/form-field';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n/language-context';
import { useFieldOpsOrders } from '@/modules/field-ops/hooks/use-field-ops-queries';
import {
  FIELD_OPS_ORDER_PICKER_QUERY,
  formatFieldOpsOrderOptionLabel,
  getFieldOpsOrderId,
  toFieldOpsOrderItems,
} from '@/modules/field-ops/utils/order-option-utils';
import { ClipboardList, FileText, StickyNote, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { stripEmptyHtml } from '@/lib/utils/html';

const isHtmlNonEmpty = (v) => !!stripEmptyHtml(v ?? '');

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  orderId: z.string().min(1, 'Required'),
  reportDate: z.string().min(1, 'Required'),
  arrivalTime: z.string().optional(),
  departureTime: z.string().optional(),
});

const step2Schema = z.object({
  workPerformed: z.string().refine(isHtmlNonEmpty, { message: 'Required' }),
  findings: z.string().optional(),
  nextSteps: z.string().optional(),
  followUpNeeded: z.boolean().optional(),
});

const step3Schema = z.object({
  technicianNotes: z.string().optional(),
  customerSignerName: z.string().optional(),
  materialItems: z.array(z.object({
    catalogSource: z.enum(['IGH', 'INTERNAL', 'CUSTOM']),
    description: z.string().min(1),
    quantity: z.coerce.number().min(0),
    unit: z.string().min(1),
  })).optional(),
});

const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema);

const STEP_FIELDS = [
  ['orderId', 'reportDate', 'arrivalTime', 'departureTime'],
  ['workPerformed', 'findings', 'nextSteps'],
  ['technicianNotes', 'customerSignerName', 'materialItems'],
];

const BLANK = {
  orderId: '', reportDate: '', arrivalTime: '', departureTime: '',
  workPerformed: '', findings: '', nextSteps: '', followUpNeeded: false,
  technicianNotes: '', customerSignerName: '', materialItems: [],
};

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

// ── Step components ───────────────────────────────────────────────────────────

function Step1OrderDate({ form, de, isEdit, loadOrders }) {
  const { register, watch, setValue, formState: { errors } } = form;
  const { data: ordersResponse, isFetching: ordersLoading, isError: ordersError } = useFieldOpsOrders(
    FIELD_OPS_ORDER_PICKER_QUERY,
    { enabled: loadOrders },
  );
  const orders = toFieldOpsOrderItems(ordersResponse);

  return (
    <FormSection
      title={de ? 'Auftrag & Datum' : 'Order & Date'}
      description={de ? 'Auftrag zuordnen und Einsatzzeitraum festlegen' : 'Assign to an order and set the service period'}
    >
      <FormField label={de ? 'Auftrag' : 'Order'} required error={errors.orderId?.message}>
        <Select
          value={watch('orderId')}
          onValueChange={(v) => setValue('orderId', v, { shouldValidate: true })}
          disabled={isEdit}
        >
          <SelectTrigger className={errors.orderId ? 'border-destructive' : ''}>
            <SelectValue placeholder={de ? 'Auftrag wählen…' : 'Select order…'} />
          </SelectTrigger>
          <SelectContent>
            {loadOrders && ordersLoading ? (
              <SelectItem value="__orders_loading" disabled>
                {de ? 'Auftraege werden geladen...' : 'Loading orders...'}
              </SelectItem>
            ) : null}
            {loadOrders && !ordersLoading && ordersError ? (
              <SelectItem value="__orders_error" disabled>
                {de ? 'Auftraege konnten nicht geladen werden' : 'Orders could not be loaded'}
              </SelectItem>
            ) : null}
            {loadOrders && !ordersLoading && !ordersError && orders.length === 0 ? (
              <SelectItem value="__orders_empty" disabled>
                {de ? 'Keine Auftraege verfuegbar' : 'No orders available'}
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

      <FormField label={de ? 'Berichtsdatum' : 'Report Date'} required error={errors.reportDate?.message}>
        <Input
          {...register('reportDate')}
          type="date"
          className={errors.reportDate ? 'border-destructive' : ''}
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label={de ? 'Ankunftszeit' : 'Arrival Time'}>
          <Input {...register('arrivalTime')} type="time" />
        </FormField>
        <FormField label={de ? 'Abfahrtszeit' : 'Departure Time'}>
          <Input {...register('departureTime')} type="time" />
        </FormField>
      </div>
    </FormSection>
  );
}

function Step2WorkDetails({ form, de }) {
  const { watch, setValue, register, formState: { errors } } = form;

  return (
    <FormSection
      title={de ? 'Durchgeführte Arbeiten' : 'Work Details'}
      description={de ? 'Was wurde gemacht, Feststellungen und nächste Schritte' : 'What was done, findings and next steps'}
    >
      <FormField
        label={de ? 'Durchgeführte Arbeiten' : 'Work Performed'}
        required
        error={errors.workPerformed?.message}
      >
        <RichTextEditor
          value={watch('workPerformed')}
          onChange={(html) => setValue('workPerformed', html, { shouldDirty: true, shouldValidate: true })}
          placeholder={de ? 'Beschreibung der ausgeführten Arbeiten…' : 'Description of work carried out…'}
          minHeight={180}
        />
      </FormField>

      <FormField label={de ? 'Feststellungen' : 'Findings'}>
        <RichTextEditor
          value={watch('findings')}
          onChange={(html) => setValue('findings', html, { shouldDirty: true })}
          placeholder={de ? 'Feststellungen, Mängel, Auffälligkeiten…' : 'Findings, defects, observations…'}
          minHeight={100}
        />
      </FormField>

      <FormField label={de ? 'Nächste Schritte' : 'Next Steps'}>
        <RichTextEditor
          value={watch('nextSteps')}
          onChange={(html) => setValue('nextSteps', html, { shouldDirty: true })}
          placeholder={de ? 'Empfohlene Folgemassnahmen…' : 'Recommended follow-up actions…'}
          minHeight={100}
        />
      </FormField>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          {...register('followUpNeeded')}
          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
        />
        <span className="text-sm">{de ? 'Folgeeinsatz erforderlich' : 'Follow-up required'}</span>
      </label>
    </FormSection>
  );
}

function Step3NotesAndMaterials({ form, de }) {
  const { register, watch, setValue, control } = form;
  const { fields, append, remove } = useFieldArray({ control, name: 'materialItems' });

  return (
    <div className="space-y-6">
      <FormSection
        title={de ? 'Material' : 'Materials'}
        description={de ? 'Verwendetes Material und Ersatzteile' : 'Materials and spare parts used'}
      >
        <div className="space-y-2">
          {fields.map((field, idx) => (
            <div key={field.id} className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-end">
              <FormField label={idx === 0 ? (de ? 'Bezeichnung' : 'Description') : undefined}>
                <Input
                  {...register(`materialItems.${idx}.description`)}
                  placeholder={de ? 'Beschreibung…' : 'Description…'}
                />
              </FormField>
              <FormField label={idx === 0 ? (de ? 'Menge' : 'Qty') : undefined}>
                <Input
                  {...register(`materialItems.${idx}.quantity`)}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0"
                />
              </FormField>
              <FormField label={idx === 0 ? (de ? 'Einheit' : 'Unit') : undefined}>
                <Input {...register(`materialItems.${idx}.unit`)} placeholder="Stk." />
              </FormField>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn('h-9 w-9 text-destructive hover:bg-destructive/10', idx === 0 && 'mt-5')}
                onClick={() => remove(idx)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              {/* hidden required field */}
              <input type="hidden" {...register(`materialItems.${idx}.catalogSource`)} value="CUSTOM" />
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-1"
          onClick={() => append({ catalogSource: 'CUSTOM', description: '', quantity: 1, unit: 'Stk.' })}
        >
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {de ? 'Material hinzufügen' : 'Add Material'}
        </Button>
      </FormSection>

      <FormSection
        title={de ? 'Notizen & Unterschrift' : 'Notes & Signature'}
        description={de ? 'Technikernotizen und Kundenunterschrift' : 'Technician notes and customer signature'}
      >
        <FormField label={de ? 'Technikernotizen' : 'Technician Notes'}>
          <RichTextEditor
            value={watch('technicianNotes')}
            onChange={(html) => setValue('technicianNotes', html, { shouldDirty: true })}
            placeholder={de ? 'Interne Notizen für das Team…' : 'Internal notes for the team…'}
            minHeight={100}
          />
        </FormField>

        <FormField
          label={de ? 'Unterzeichner (Kunde)' : 'Signer Name (Customer)'}
          description={de ? 'Name der Person, die den Bericht unterzeichnet hat' : 'Name of person who signed the report'}
        >
          <Input
            {...register('customerSignerName')}
            placeholder={de ? 'Vor- und Nachname…' : 'First and last name…'}
          />
        </FormField>
      </FormSection>
    </div>
  );
}

// ── Mapper (edit mode) ────────────────────────────────────────────────────────

function mapReportToForm(report) {
  if (!report) return BLANK;
  const toTime = (d) => d ? new Date(d).toTimeString().slice(0, 5) : '';
  return {
    orderId: report.orderId?._id || report.orderId || '',
    reportDate: report.reportDate ? new Date(report.reportDate).toISOString().slice(0, 10) : '',
    arrivalTime: toTime(report.arrivalTime),
    departureTime: toTime(report.departureTime),
    workPerformed: report.workPerformed || '',
    findings: report.findings || '',
    nextSteps: report.nextSteps || '',
    followUpNeeded: !!report.followUpNeeded,
    technicianNotes: report.technicianNotes || '',
    customerSignerName: report.customerSignerName || '',
    materialItems: (report.materialItems || []).map((m) => ({
      catalogSource: m.catalogSource || 'CUSTOM',
      description: m.description || '',
      quantity: m.quantity ?? 0,
      unit: m.unit || 'Stk.',
    })),
  };
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function FieldOpsCreateReportDialog({ open, onOpenChange, onSave, isLoading, defaultValues }) {
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
      reset(isEdit ? mapReportToForm(defaultValues) : BLANK);
      setCurrentStep(0);
      setDirection(1);
    }
  }, [open, defaultValues, isEdit, reset]);

  const STEPS = [
    { label: de ? 'Auftrag' : 'Order',    icon: ClipboardList },
    { label: de ? 'Arbeiten' : 'Work',    icon: FileText },
    { label: de ? 'Notizen' : 'Notes',    icon: StickyNote },
  ];

  const stepContent = [
    <Step1OrderDate key={0} form={form} de={de} isEdit={isEdit} loadOrders={open} />,
    <Step2WorkDetails key={1} form={form} de={de} />,
    <Step3NotesAndMaterials key={2} form={form} de={de} />,
  ];

  const handleNext = useCallback(async () => {
    // On final step: re-validate all required fields across all steps
    const fieldsToCheck = currentStep === STEPS.length - 1
      ? STEP_FIELDS.flat()
      : STEP_FIELDS[currentStep];

    const valid = await trigger(fieldsToCheck);
    if (!valid) return;

    if (currentStep === STEPS.length - 1) {
      const data = getValues();

      const buildDateTime = (dateStr, timeStr) => {
        if (!dateStr) return undefined;
        return new Date(`${dateStr}T${timeStr || '00:00'}`).toISOString();
      };

      const payload = {
        reportDate: new Date(data.reportDate).toISOString(),
        arrivalTime: data.arrivalTime ? buildDateTime(data.reportDate, data.arrivalTime) : undefined,
        departureTime: data.departureTime ? buildDateTime(data.reportDate, data.departureTime) : undefined,
        workPerformed: stripEmptyHtml(data.workPerformed),
        findings: stripEmptyHtml(data.findings) ?? undefined,
        nextSteps: stripEmptyHtml(data.nextSteps) ?? undefined,
        followUpNeeded: data.followUpNeeded || false,
        technicianNotes: stripEmptyHtml(data.technicianNotes) ?? undefined,
        customerSignerName: data.customerSignerName || undefined,
        materialItems: (data.materialItems || []).filter((m) => m.description),
      };

      Object.keys(payload).forEach((k) => { if (payload[k] === undefined || payload[k] === null) delete payload[k]; });

      onSave({ orderId: data.orderId, payload });
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
      <DialogContent className="sm:max-w-2xl p-0 gap-0 flex flex-col max-h-[90vh]">

        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {isEdit ? (de ? 'Bericht bearbeiten' : 'Edit Report') : (de ? 'Neuer Bericht' : 'New Report')}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {de ? `Schritt ${currentStep + 1} von ${STEPS.length}` : `Step ${currentStep + 1} of ${STEPS.length}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 pt-5 pb-2 shrink-0">
          <StepIndicator steps={STEPS} currentStep={currentStep} onStepClick={(idx) => {
            setDirection(idx < currentStep ? -1 : 1);
            setCurrentStep(idx);
          }} />
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
            submitLabel={isEdit ? (de ? 'Speichern' : 'Save Changes') : (de ? 'Bericht erstellen' : 'Create Report')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
