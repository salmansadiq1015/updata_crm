'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useDebounce } from '@/shared/hooks/use-debounce';
import { ORDER_PRIORITY, ORDER_TYPE } from '@/modules/field-ops/constants/field-ops-constants';
import { useDeployEmployees } from '@/modules/deploy/hooks/use-deploy-employees';
import { useAssignmentProjectOptions } from '@/modules/deploy/hooks/use-assignment-work-options';
import { stripEmptyHtml } from '@/lib/utils/html';
import {
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  FolderKanban,
  Search,
  UsersRound,
} from 'lucide-react';

// Mirrors the server CRM PHONE_PATTERN (crm.constants.js) so client + API agree.
const PHONE_REGEX = /^(\+[1-9]\d{0,2}[\s.-]?)?(\(?\d{1,4}\)?[\s.-]?){1,5}\d{1,4}$/;

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
  projectId: z.string().optional(),
  customerId: z.string().optional(),
  siteId: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().regex(PHONE_REGEX, 'Ungültige Telefonnummer').or(z.literal('')).optional(),
  customerEmail: z.string().email('Ungültige E-Mail-Adresse').or(z.literal('')).optional(),
  siteAddress: z.string().optional(),
  accessInstructions: z.string().optional(),
  parkingInfo: z.string().optional(),
});

const step4Schema = z.object({
  assignmentTargetType: z.enum(['EMPLOYEE', 'TEAM', 'DEPARTMENT']).optional(),
  employeeId: z.string().optional(),
  assignmentTargetId: z.string().optional(),
  assignmentTargetLabel: z.string().optional(),
  scheduledStart: z.string().optional(),
  scheduledEnd: z.string().optional(),
});

const fullSchema = step1Schema.merge(step2Schema).merge(step3Schema).merge(step4Schema);

const STEP_FIELDS = [
  ['orderType', 'title', 'priority', 'description'],
  ['scopeOfWork', 'specialInstructions'],
  ['projectId', 'customerId', 'siteId', 'customerName', 'customerPhone', 'customerEmail', 'siteAddress', 'accessInstructions', 'parkingInfo'],
  ['assignmentTargetType', 'employeeId', 'assignmentTargetId', 'assignmentTargetLabel', 'scheduledStart', 'scheduledEnd'],
];

const BLANK = {
  orderType: '',
  priority: ORDER_PRIORITY.NORMAL,
  title: '',
  description: '',
  scopeOfWork: '',
  specialInstructions: '',
  projectId: '',
  customerId: '',
  siteId: '',
  customerName: '',
  customerPhone: '',
  customerEmail: '',
  siteAddress: '',
  accessInstructions: '',
  parkingInfo: '',
  assignmentTargetType: 'EMPLOYEE',
  employeeId: '',
  assignmentTargetId: '',
  assignmentTargetLabel: '',
  scheduledStart: '',
  scheduledEnd: '',
};

const slideVariants = {
  enter: (direction) => ({ x: direction > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? -60 : 60, opacity: 0 }),
};

function normalizeId(value) {
  return value?._id || value?.id || value || '';
}

function employeeLabel(employee) {
  return `${employee?.firstName || ''} ${employee?.lastName || ''}`.trim() || employee?.email || employee?._id;
}

function uniqueDepartments(employees) {
  return [...new Set(
    employees
      .map((employee) => String(employee?.department || '').trim())
      .filter(Boolean),
  )].sort((left, right) => left.localeCompare(right));
}

function toInputDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function Step1OrderDetails({ form, de }) {
  const { register, watch, setValue, formState: { errors } } = form;
  return (
    <FormSection
      title={de ? 'Auftragsdetails' : 'Order Details'}
      description={de ? 'Typ, Prioritaet und Titel des Auftrags' : 'Order type, priority and title'}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={de ? 'Auftragstyp' : 'Order Type'} required error={errors.orderType?.message}>
          <Select value={watch('orderType')} onValueChange={(value) => setValue('orderType', value, { shouldValidate: true })}>
            <SelectTrigger className={errors.orderType ? 'border-destructive' : ''}>
              <SelectValue placeholder={de ? 'Typ waehlen...' : 'Select type...'} />
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

        <FormField label={de ? 'Prioritaet' : 'Priority'}>
          <Select value={watch('priority')} onValueChange={(value) => setValue('priority', value)}>
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
          placeholder={de ? 'Auftragstitel...' : 'Order title...'}
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
          placeholder={de ? 'Problembeschreibung...' : 'Problem description...'}
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
        description={de ? 'Geplante Arbeiten, Checklisten, Pruefpunkte' : 'Planned work, checklists, inspection points'}
      >
        <RichTextEditor
          value={watch('scopeOfWork')}
          onChange={(html) => setValue('scopeOfWork', html, { shouldDirty: true })}
          placeholder={de ? 'Was soll gemacht werden...' : 'What needs to be done...'}
          minHeight={200}
        />
      </FormField>

      <FormField
        label={de ? 'Sonderhinweise' : 'Special Instructions'}
        description={de ? 'Sicherheitshinweise, Zugangscodes, Kundenwuensche' : 'Safety notes, access codes, customer requests'}
      >
        <RichTextEditor
          value={watch('specialInstructions')}
          onChange={(html) => setValue('specialInstructions', html, { shouldDirty: true })}
          placeholder={de ? 'Sicherheitshinweise, Zugangscodes...' : 'Safety notes, access codes...'}
          minHeight={120}
        />
      </FormField>
    </FormSection>
  );
}

function Step3CustomerSite({ form, de }) {
  const { register, watch, setValue, formState: { errors } } = form;
  const [projectSearch, setProjectSearch] = useState('');
  const debouncedProjectSearch = useDebounce(projectSearch, 250);
  const { data: projects = [], isFetching } = useAssignmentProjectOptions({
    search: debouncedProjectSearch,
    limit: 40,
  });

  const selectedProject = projects.find((project) => project._id === watch('projectId'));

  const applyProject = (projectId) => {
    if (projectId === 'none') {
      setValue('projectId', '', { shouldValidate: true });
      return;
    }
    const project = projects.find((item) => item._id === projectId);
    setValue('projectId', projectId, { shouldValidate: true });
    if (project?.customerId) setValue('customerId', project.customerId);
    if (project?.siteId) setValue('siteId', project.siteId);
    if (project?.customerName && !watch('customerName')) setValue('customerName', project.customerName);
  };

  return (
    <FormSection
      title={de ? 'Kunde & Standort' : 'Customer & Site'}
      description={de ? 'Projektbezug, Kontaktdaten und Standortinformationen' : 'Project link, contact details and site information'}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={de ? 'Projekt' : 'Project'}>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder={de ? 'Projekt suchen...' : 'Search project...'}
                className="pl-9"
              />
            </div>
            <Select value={watch('projectId') || 'none'} onValueChange={applyProject}>
              <SelectTrigger>
                <SelectValue placeholder={isFetching ? (de ? 'Laedt...' : 'Loading...') : (de ? 'Projekt waehlen' : 'Select project')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{de ? 'Kein Projekt' : 'No Project'}</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project._id} value={project._id}>{project.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedProject && (
            <p className="mt-1 text-xs text-muted-foreground">{selectedProject.customerName || selectedProject.status}</p>
          )}
        </FormField>
        <FormField label={de ? 'Kundenname' : 'Customer Name'}>
          <Input {...register('customerName')} placeholder={de ? 'Firma / Name...' : 'Company / Name...'} />
        </FormField>
        <FormField label={de ? 'Telefon' : 'Phone'} error={errors.customerPhone?.message}>
          <Input {...register('customerPhone')} type="tel" placeholder="+41 79 000 00 00" className={errors.customerPhone ? 'border-destructive' : ''} />
        </FormField>
        <FormField label={de ? 'E-Mail' : 'Email'} error={errors.customerEmail?.message}>
          <Input {...register('customerEmail')} type="email" placeholder="name@firma.ch" className={errors.customerEmail ? 'border-destructive' : ''} />
        </FormField>
        <FormField label={de ? 'Standortadresse' : 'Site Address'}>
          <Input {...register('siteAddress')} placeholder={de ? 'Strasse, PLZ Ort...' : 'Street, ZIP City...'} />
        </FormField>
        <FormField label={de ? 'Zugangshinweise' : 'Access Instructions'}>
          <Input {...register('accessInstructions')} placeholder={de ? 'Schluessel bei...' : 'Key available at...'} />
        </FormField>
        <FormField label={de ? 'Parkinginfo' : 'Parking Info'}>
          <Input {...register('parkingInfo')} placeholder={de ? 'Parkplatz vorne...' : 'Parking in front...'} />
        </FormField>
      </div>
    </FormSection>
  );
}

function Step4Assignment({ form, de }) {
  const { register, watch, setValue } = form;
  const { data: employees = [] } = useDeployEmployees({ limit: 100 });
  const departments = useMemo(() => uniqueDepartments(employees), [employees]);
  const targetType = watch('assignmentTargetType') || 'EMPLOYEE';

  const handleTargetType = (value) => {
    setValue('assignmentTargetType', value, { shouldValidate: true });
    setValue('employeeId', '', { shouldValidate: true });
    setValue('assignmentTargetId', '', { shouldValidate: true });
    setValue('assignmentTargetLabel', '');
  };

  const handleGroupTarget = (value) => {
    if (value === 'none') {
      setValue('assignmentTargetId', '', { shouldValidate: true });
      setValue('assignmentTargetLabel', '');
      return;
    }
    setValue('assignmentTargetId', value, { shouldValidate: true });
    setValue('assignmentTargetLabel', value);
  };

  return (
    <FormSection
      title={de ? 'Zuweisung & Termin' : 'Assignment & Schedule'}
      description={de ? 'Direkt an Mitarbeiter, Team oder Abteilung zuweisen' : 'Assign directly to an employee, team, or department'}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={de ? 'Zuweisungstyp' : 'Assignment Type'}>
          <Select value={targetType} onValueChange={handleTargetType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EMPLOYEE">{de ? 'Mitarbeiter' : 'Employee'}</SelectItem>
              <SelectItem value="TEAM">{de ? 'Team' : 'Team'}</SelectItem>
              <SelectItem value="DEPARTMENT">{de ? 'Abteilung' : 'Department'}</SelectItem>
            </SelectContent>
          </Select>
        </FormField>

        {targetType === 'EMPLOYEE' ? (
          <FormField label={de ? 'Mitarbeiter' : 'Employee'}>
            <Select value={watch('employeeId') || 'none'} onValueChange={(value) => setValue('employeeId', value === 'none' ? '' : value, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder={de ? 'Mitarbeiter waehlen' : 'Select employee'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{de ? 'Nicht zugewiesen' : 'Unassigned'}</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee._id} value={employee._id}>
                    {employeeLabel(employee)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        ) : (
          <FormField label={targetType === 'TEAM' ? (de ? 'Team' : 'Team') : (de ? 'Abteilung' : 'Department')}>
            <Select value={watch('assignmentTargetId') || 'none'} onValueChange={handleGroupTarget}>
              <SelectTrigger>
                <SelectValue placeholder={de ? 'Ziel waehlen' : 'Select target'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{de ? 'Kein Ziel' : 'No target'}</SelectItem>
                {departments.map((department) => (
                  <SelectItem key={department} value={department}>{department}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        )}

        <FormField label={de ? 'Geplanter Start' : 'Scheduled Start'}>
          <Input {...register('scheduledStart')} type="datetime-local" />
        </FormField>
        <FormField label={de ? 'Geplantes Ende' : 'Scheduled End'}>
          <Input {...register('scheduledEnd')} type="datetime-local" />
        </FormField>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <UsersRound className="h-4 w-4 shrink-0" />
        <span>
          {de
            ? 'Team- und Abteilungsauftraege bleiben sichtbar fuer passende Mitarbeiter in der App.'
            : 'Team and department jobs stay visible to matching employees in the app.'}
        </span>
      </div>
    </FormSection>
  );
}

function mapOrderToForm(order) {
  if (!order) return BLANK;
  const targetType = order.assignmentTargetType || order.assignment_target_type || 'EMPLOYEE';
  const employee = order.employeeId || order.employee_id;
  const project = order.projectId || order.project_id;
  const customer = order.customerId || order.customer_id;
  const site = order.siteId || order.site_id;
  return {
    ...BLANK,
    orderType: order.assignmentType || order.orderType || '',
    priority: order.priority || ORDER_PRIORITY.NORMAL,
    title: order.title || '',
    description: order.instructions || order.description || '',
    scopeOfWork: order.scopeOfWork || '',
    specialInstructions: order.specialInstructions || '',
    projectId: normalizeId(project),
    customerId: normalizeId(customer),
    siteId: normalizeId(site),
    customerName: order.appointment?.customerContactName || order.customerName || order.customer_name || '',
    customerPhone: order.appointment?.customerContactPhone || order.customerPhone || order.customer_phone || '',
    customerEmail: order.appointment?.customerContactEmail || order.customerEmail || order.customer_email || '',
    siteAddress: order.siteAddress || order.site_address || order.appointment?.siteAddress || '',
    accessInstructions: order.accessInstructions || order.access_instructions || '',
    parkingInfo: order.parkingInfo || order.parking_info || '',
    assignmentTargetType: targetType,
    employeeId: targetType === 'EMPLOYEE' ? normalizeId(employee) : '',
    assignmentTargetId: targetType === 'EMPLOYEE'
      ? ''
      : (order.assignmentTargetId || order.assignment_target_id || ''),
    assignmentTargetLabel: targetType === 'EMPLOYEE'
      ? ''
      : (order.assignmentTargetLabel || order.assignment_target_label || ''),
    scheduledStart: toInputDateTime(order.startDatetime || order.scheduledStart || order.scheduled_start),
    scheduledEnd: toInputDateTime(order.endDatetime || order.scheduledEnd || order.scheduled_end),
  };
}

function cleanPayload(data) {
  const payload = { ...data };
  payload.description = stripEmptyHtml(payload.description) || undefined;
  payload.scopeOfWork = stripEmptyHtml(payload.scopeOfWork) || undefined;
  payload.specialInstructions = stripEmptyHtml(payload.specialInstructions) || undefined;

  if (payload.assignmentTargetType === 'EMPLOYEE') {
    delete payload.assignmentTargetId;
    delete payload.assignmentTargetLabel;
  } else {
    if (!payload.assignmentTargetId) {
      payload.assignmentTargetType = 'EMPLOYEE';
      delete payload.assignmentTargetId;
      delete payload.assignmentTargetLabel;
    } else if (!payload.assignmentTargetLabel) {
      payload.assignmentTargetLabel = payload.assignmentTargetId;
    }
    delete payload.employeeId;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === '' || payload[key] === null || payload[key] === undefined) {
      delete payload[key];
    }
  });
  if (!payload.priority) payload.priority = ORDER_PRIORITY.NORMAL;
  return payload;
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
      queueMicrotask(() => {
        setCurrentStep(0);
        setDirection(1);
      });
    }
  }, [open, defaultValues, reset]);

  const steps = useMemo(() => [
    { label: de ? 'Auftrag' : 'Order', icon: ClipboardList },
    { label: de ? 'Leistung' : 'Scope', icon: FileText },
    { label: de ? 'Kunde' : 'Customer', icon: Building2 },
    { label: de ? 'Termin' : 'Schedule', icon: CalendarClock },
  ], [de]);

  const stepContent = [
    <Step1OrderDetails key={0} form={form} de={de} />,
    <Step2ScopeOfWork key={1} form={form} de={de} />,
    <Step3CustomerSite key={2} form={form} de={de} />,
    <Step4Assignment key={3} form={form} de={de} />,
  ];

  const isEditMode = Boolean(defaultValues);

  const handleOpenChange = useCallback((value) => {
    onOpenChange(value);
  }, [onOpenChange]);

  const handleNext = useCallback(async () => {
    const valid = await trigger(STEP_FIELDS[currentStep]);
    if (!valid) return;

    if (currentStep === steps.length - 1) {
      onCreate(cleanPayload(getValues()));
      return;
    }
    setDirection(1);
    setCurrentStep((step) => step + 1);
  }, [currentStep, getValues, onCreate, steps.length, trigger]);

  const handleBack = useCallback(() => {
    setDirection(-1);
    setCurrentStep((step) => step - 1);
  }, []);

  const handleStepClick = useCallback((idx) => {
    setDirection(idx < currentStep ? -1 : 1);
    setCurrentStep(idx);
  }, [currentStep]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-3xl"
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 pb-4 pt-5">
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              {isEditMode
                ? (de ? 'Auftrag bearbeiten' : 'Edit Order')
                : (de ? 'Neuer Auftrag' : 'New Order')}
            </span>
            <span className="text-sm font-normal text-muted-foreground">
              {de ? `Schritt ${currentStep + 1} von ${steps.length}` : `Step ${currentStep + 1} of ${steps.length}`}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="shrink-0 px-6 pb-2 pt-5">
          <StepIndicator steps={steps} currentStep={currentStep} onStepClick={handleStepClick} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
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

        <div className="shrink-0 px-6 pb-5">
          <StepFooter
            currentStep={currentStep}
            totalSteps={steps.length}
            onBack={handleBack}
            onNext={handleNext}
            onCancel={() => handleOpenChange(false)}
            isLoading={isLoading}
            nextLabel={de ? 'Weiter' : 'Next'}
            backLabel={de ? 'Zurueck' : 'Back'}
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
