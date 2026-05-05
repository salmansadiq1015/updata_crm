'use client';

import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StepIndicator, StepFooter } from '@/components/ui/form-stepper';
import { FormField, FormSection } from '@/components/ui/form-field';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { ORDER_TYPE, ORDER_PRIORITY } from '@/modules/field-ops/constants/field-ops-constants';
import { stripEmptyHtml } from '@/lib/utils/html';
import { ClipboardList, FileText, Building2, CalendarClock } from 'lucide-react';

// ── Schemas ───────────────────────────────────────────────────────────────────

const step1Schema = z.object({
  orderType: z.string().min(1, 'Required'),
  priority: z.string().optional(),
  title: z.string().min(2, 'Min. 2 Zeichen'),
  description: z.string().optional(),
});

const step2Schema = z.object({
  scopeOfWork: z.string().optional(),
  specialInstructions: z.string().optional(),
});

const step3Schema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerEmail: z.string().optional(),
  siteAddress: z.string().optional(),
  accessInstructions: z.string().optional(),
  parkingInfo: z.string().optional(),
});

const step4Schema = z.object({
  assignedTo: z.string().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
});

const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema).merge(step4Schema);

const STEP_FIELDS = [
  ['orderType', 'title', 'priority', 'description'],
  ['scopeOfWork', 'specialInstructions'],
  ['customerName', 'customerPhone', 'customerEmail', 'siteAddress', 'accessInstructions', 'parkingInfo'],
  ['assignedTo', 'scheduledStart', 'scheduledEnd'],
];

const BLANK = {
  orderType: '', priority: 'NORMAL', title: '', description: '',
  scopeOfWork: '', specialInstructions: '',
  customerName: '', customerPhone: '', customerEmail: '', siteAddress: '',
  accessInstructions: '', parkingInfo: '',
  assignedTo: '', scheduledStart: '', scheduledEnd: '',
};

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
};

// ── Step content components ───────────────────────────────────────────────────

function Step1OrderDetails({ form, de }) {
  const { register, watch, setValue, formState: { errors } } = form;
  return (
    <FormSection
      title={de ? 'Auftragsdetails' : 'Order Details'}
      description={de ? 'Typ, Priorität und Titel des Auftrags' : 'Order type, priority and title'}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label={de ? 'Auftragstyp' : 'Order Type'} required error={errors.orderType?.message}>
          <Select value={watch('orderType')} onValueChange={(v) => setValue('orderType', v, { shouldValidate: true })}>
            <SelectTrigger className={errors.orderType ? 'border-destructive' : ''}>
              <SelectValue placeholder={de ? 'Typ wählen…' : 'Select type…'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ORDER_TYPE.SERVICE_CALL}>{de ? 'Serviceeinsatz' : 'Service Call'}</SelectItem>
              <SelectItem value={ORDER_TYPE.PROJECT_WORK}>{de ? 'Projektarbeit' : 'Project Work'}</SelectItem>
              <SelectItem value={ORDER_TYPE.MAINTENANCE}>{de ? 'Wartung' : 'Maintenance'}</SelectItem>
              <SelectItem value={ORDER_TYPE.INSTALLATION}>{de ? 'Installation' : 'Installation'}</SelectItem>
              <SelectItem value={ORDER_TYPE.INSPECTION}>{de ? 'Inspektion' : 'Inspection'}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        <FormField label={de ? 'Priorität' : 'Priority'}>
          <Select value={watch('priority')} onValueChange={(v) => setValue('priority', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ORDER_PRIORITY.NORMAL}>{de ? 'Normal' : 'Normal'}</SelectItem>
              <SelectItem value={ORDER_PRIORITY.HIGH}>{de ? 'Hoch' : 'High'}</SelectItem>
              <SelectItem value={ORDER_PRIORITY.URGENT}>{de ? 'Dringend' : 'Urgent'}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
      </div>

      <FormField label={de ? 'Titel' : 'Title'} required error={errors.title?.message}>
        <Input
          {...register('title')}
          placeholder={de ? 'Auftragstitel…' : 'Order title…'}
          className={errors.title ? 'border-destructive' : ''}
        />
      </FormField>

      <FormField
        label={de ? 'Beschreibung' : 'Description'}
        description={de ? 'Problembeschreibung, Symptome oder Hintergrundinformationen' : 'Problem description, symptoms or background info'}
      >
        <RichTextEditor
          value={watch('description')}
          onChange={(html) => setValue('description', html, { shouldDirty: true })}
          placeholder={de ? 'Problembeschreibung…' : 'Problem description…'}
          minHeight={160}
        />
      </FormField>
    </FormSection>
  );
}

function Step2ScopeOfWork({ form, de }) {
  const { watch, setValue } = form;
  return (
    <FormSection
      title={de ? 'Leistungsumfang' : 'Scope of Work'}
      description={de ? 'Was soll gemacht werden und besondere Hinweise' : 'What needs to be done and any special notes'}
    >
      <FormField
        label={de ? 'Leistungsumfang' : 'Scope of Work'}
        description={de ? 'Geplante Arbeiten, Checklisten, Prüfpunkte' : 'Planned work, checklists, inspection points'}
      >
        <RichTextEditor
          value={watch('scopeOfWork')}
          onChange={(html) => setValue('scopeOfWork', html, { shouldDirty: true })}
          placeholder={de ? 'Was soll gemacht werden…' : 'What needs to be done…'}
          minHeight={200}
        />
      </FormField>

      <FormField
        label={de ? 'Sonderhinweise' : 'Special Instructions'}
        description={de ? 'Sicherheitshinweise, Zugangscodes, Kundenwünsche' : 'Safety notes, access codes, customer requests'}
      >
        <RichTextEditor
          value={watch('specialInstructions')}
          onChange={(html) => setValue('specialInstructions', html, { shouldDirty: true })}
          placeholder={de ? 'Sicherheitshinweise, Zugangscodes…' : 'Safety notes, access codes…'}
          minHeight={120}
        />
      </FormField>
    </FormSection>
  );
}

function Step3CustomerSite({ form, de }) {
  const { register } = form;
  return (
    <FormSection
      title={de ? 'Kunde & Standort' : 'Customer & Site'}
      description={de ? 'Kontaktdaten und Standortinformationen' : 'Contact details and site information'}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label={de ? 'Kundenname' : 'Customer Name'}>
          <Input {...register('customerName')} placeholder={de ? 'Firma / Name…' : 'Company / Name…'} />
        </FormField>
        <FormField label={de ? 'Telefon' : 'Phone'}>
          <Input {...register('customerPhone')} type="tel" placeholder="+41 79 000 00 00" />
        </FormField>
        <FormField label={de ? 'E-Mail' : 'Email'}>
          <Input {...register('customerEmail')} type="email" placeholder="name@firma.ch" />
        </FormField>
        <FormField label={de ? 'Standortadresse' : 'Site Address'}>
          <Input {...register('siteAddress')} placeholder={de ? 'Strasse, PLZ Ort…' : 'Street, ZIP City…'} />
        </FormField>
        <FormField label={de ? 'Zugangshinweise' : 'Access Instructions'}>
          <Input {...register('accessInstructions')} placeholder={de ? 'Schlüssel bei…' : 'Key available at…'} />
        </FormField>
        <FormField label={de ? 'Parkinginfo' : 'Parking Info'}>
          <Input {...register('parkingInfo')} placeholder={de ? 'Parkplatz vorne…' : 'Parking in front…'} />
        </FormField>
      </div>
    </FormSection>
  );
}

function Step4Assignment({ form, de }) {
  const { register } = form;
  return (
    <FormSection
      title={de ? 'Zuweisung & Termin' : 'Assignment & Schedule'}
      description={de ? 'Techniker und geplante Einsatzzeiten' : 'Technician and planned service times'}
    >
      <div className="grid grid-cols-2 gap-4">
        <FormField label={de ? 'Zugewiesener Techniker' : 'Assigned Technician'}>
          <Input {...register('assignedTo')} placeholder={de ? 'Name oder ID…' : 'Name or ID…'} />
        </FormField>
        <div />
        <FormField label={de ? 'Geplanter Start' : 'Scheduled Start'}>
          <Input {...register('scheduledStart')} type="datetime-local" />
        </FormField>
        <FormField label={de ? 'Geplantes Ende' : 'Scheduled End'}>
          <Input {...register('scheduledEnd')} type="datetime-local" />
        </FormField>
      </div>
    </FormSection>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

function mapOrderToForm(order) {
  if (!order) return BLANK;
  return {
    orderType: order.assignmentType || order.orderType || '',
    priority: order.priority || 'NORMAL',
    title: order.title || '',
    description: order.instructions || order.description || '',
    scopeOfWork: order.scopeOfWork || '',
    specialInstructions: order.specialInstructions || '',
    customerName: order.appointment?.customerContactName || order.customerName || '',
    customerPhone: order.appointment?.customerContactPhone || order.customerPhone || '',
    customerEmail: order.appointment?.customerEmail || order.customerEmail || '',
    siteAddress: order.siteAddress || order.appointment?.siteAddress || '',
    accessInstructions: order.accessInstructions || '',
    parkingInfo: order.parkingInfo || '',
    assignedTo: order.employeeId?.firstName
      ? `${order.employeeId.firstName} ${order.employeeId.lastName}`.trim()
      : (order.assignedTo || ''),
    scheduledStart: order.startDatetime
      ? new Date(order.startDatetime).toISOString().slice(0, 16)
      : (order.scheduledStart ? new Date(order.scheduledStart).toISOString().slice(0, 16) : ''),
    scheduledEnd: order.endDatetime
      ? new Date(order.endDatetime).toISOString().slice(0, 16)
      : (order.scheduledEnd ? new Date(order.scheduledEnd).toISOString().slice(0, 16) : ''),
  };
}

export function FieldOpsCreateOrderDialog({ open, onOpenChange, onCreate, isLoading, defaultValues }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

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
      reset(defaultValues ? mapOrderToForm(defaultValues) : BLANK);
      setCurrentStep(0);
      setDirection(1);
    }
  }, [open, defaultValues, reset]);

  const STEPS = [
    { label: de ? 'Auftrag' : 'Order',   icon: ClipboardList },
    { label: de ? 'Leistung' : 'Scope',  icon: FileText },
    { label: de ? 'Kunde' : 'Customer',  icon: Building2 },
    { label: de ? 'Termin' : 'Schedule', icon: CalendarClock },
  ];

  const stepContent = [
    <Step1OrderDetails key={0} form={form} de={de} />,
    <Step2ScopeOfWork  key={1} form={form} de={de} />,
    <Step3CustomerSite key={2} form={form} de={de} />,
    <Step4Assignment   key={3} form={form} de={de} />,
  ];

  const isEditMode = !!defaultValues;

  const handleOpenChange = useCallback((v) => {
    onOpenChange(v);
  }, [onOpenChange]);

  const handleNext = useCallback(async () => {
    const valid = await trigger(STEP_FIELDS[currentStep]);
    if (!valid) return;

    if (currentStep === STEPS.length - 1) {
      const data = getValues();
      const payload = { ...data };
      payload.description        = stripEmptyHtml(payload.description) || undefined;
      payload.scopeOfWork        = stripEmptyHtml(payload.scopeOfWork) || undefined;
      payload.specialInstructions = stripEmptyHtml(payload.specialInstructions) || undefined;
      Object.keys(payload).forEach((k) => { if (!payload[k]) delete payload[k]; });
      if (!payload.priority) payload.priority = 'NORMAL';
      onCreate(payload);
      return;
    }
    setDirection(1);
    setCurrentStep((s) => s + 1);
  }, [currentStep, trigger, getValues, onCreate, STEPS.length]);

  const handleBack = useCallback(() => {
    setDirection(-1);
    setCurrentStep((s) => s - 1);
  }, []);

  const handleStepClick = useCallback((idx) => {
    setDirection(idx < currentStep ? -1 : 1);
    setCurrentStep(idx);
  }, [currentStep]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 gap-0 flex flex-col max-h-[90vh]">

        {/* Header — fixed */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {isEditMode
                ? (de ? 'Auftrag bearbeiten' : 'Edit Order')
                : (de ? 'Neuer Auftrag' : 'New Order')}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {de ? `Schritt ${currentStep + 1} von ${STEPS.length}` : `Step ${currentStep + 1} of ${STEPS.length}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator — fixed */}
        <div className="px-6 pt-5 pb-2 shrink-0">
          <StepIndicator steps={STEPS} currentStep={currentStep} onStepClick={handleStepClick} />
        </div>

        {/* Scrollable content */}
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

        {/* Footer — fixed */}
        <div className="px-6 pb-5 shrink-0">
          <StepFooter
            currentStep={currentStep}
            totalSteps={STEPS.length}
            onBack={handleBack}
            onNext={handleNext}
            onCancel={() => handleOpenChange(false)}
            isLoading={isLoading}
            nextLabel={de ? 'Weiter' : 'Next'}
            backLabel={de ? 'Zurück' : 'Back'}
            cancelLabel={de ? 'Abbrechen' : 'Cancel'}
            submitLabel={isEditMode
              ? (de ? 'Speichern' : 'Save Changes')
              : (de ? 'Auftrag erstellen' : 'Create Order')}
          />
        </div>

      </DialogContent>
    </Dialog>
  );
}
