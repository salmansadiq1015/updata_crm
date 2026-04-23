# Project Stepper Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the single-page "New Project" dialog into a 5-step stepper wizard with animated transitions, per-step validation, and a review summary.

**Architecture:** A reusable `FormStepper` UI component handles step indicator rendering, navigation state, and animated content transitions. The existing `ProjectForm` is refactored to define 5 step content components that plug into `FormStepper`. Zod validation schemas are split into per-step partials.

**Tech Stack:** React 19, React Hook Form, Zod, Framer Motion, shadcn/ui (Dialog, Button, Input, Select, etc.), Lucide React, Tailwind CSS v4

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `client/src/components/ui/form-stepper.jsx` | Reusable stepper: indicator bar, content wrapper, footer nav |
| Modify | `client/src/modules/pm/validations/project.js` | Add per-step partial Zod schemas |
| Create | `client/src/modules/pm/components/project-form-steps.jsx` | Step 1–4 content components + Step 5 review |
| Rewrite | `client/src/modules/pm/components/project-form.jsx` | Orchestrator: wires FormStepper + step components + form state |

---

### Task 1: Per-Step Zod Validation Schemas

**Files:**
- Modify: `client/src/modules/pm/validations/project.js`

- [ ] **Step 1: Add step schemas below the existing `createProjectSchema`**

Add these exports at the end of `client/src/modules/pm/validations/project.js`:

```js
export const projectStep1Schema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  projectType: z.enum(['NEW_INSTALLATION', 'RENOVATION', 'MAINTENANCE', 'SERVICE_CONTRACT', 'OTHER']),
  description: z.string().max(5000).nullable().optional(),
});

export const projectStep2Schema = z.object({
  customerId: objectId,
  siteId: objectId.nullable().optional(),
});

export const projectStep3Schema = z.object({
  projectManagerId: objectId,
  plannedStartDate: z.coerce.date().nullable().optional(),
  plannedEndDate: z.coerce.date().nullable().optional(),
});

export const projectStep4Schema = z.object({
  estimatedBudget: z.coerce.number().min(0).nullable().optional(),
  currency: z.string().trim().max(3).optional(),
  notes: z.string().max(5000).nullable().optional(),
});
```

- [ ] **Step 2: Verify the file saves without syntax errors**

Run: `cd client && npx -y acorn --ecma2020 --module src/modules/pm/validations/project.js`

If acorn is not available, simply open the file and verify exports look correct. The existing `createProjectSchema` and `updateProjectSchema` remain unchanged.

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/pm/validations/project.js
git commit -m "feat(pm): add per-step Zod validation schemas for project stepper"
```

---

### Task 2: Reusable FormStepper Component

**Files:**
- Create: `client/src/components/ui/form-stepper.jsx`

- [ ] **Step 1: Create the FormStepper component**

Create `client/src/components/ui/form-stepper.jsx` with the following content:

```jsx
'use client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Check, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const slideVariants = {
  enter: (direction) => ({ x: direction > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction) => ({ x: direction > 0 ? -80 : 80, opacity: 0 }),
};

function StepIndicator({ steps, currentStep, onStepClick }) {
  return (
    <div className="flex items-center justify-between px-2">
      {steps.map((step, idx) => {
        const isCompleted = idx < currentStep;
        const isActive = idx === currentStep;
        const isUpcoming = idx > currentStep;
        const Icon = isCompleted ? Check : step.icon;

        return (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            {/* Step circle + label */}
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={isUpcoming}
                onClick={() => isCompleted && onStepClick(idx)}
                className={cn(
                  'relative flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                  isCompleted && 'border-primary bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90',
                  isActive && 'border-primary bg-primary/10 text-primary ring-4 ring-primary/20',
                  isUpcoming && 'border-muted-foreground/30 bg-muted text-muted-foreground cursor-not-allowed',
                )}
              >
                <Icon className="h-4 w-4" />
                {isActive && (
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  />
                )}
              </button>
              <span
                className={cn(
                  'text-[11px] font-medium whitespace-nowrap transition-colors',
                  isCompleted && 'text-primary',
                  isActive && 'text-primary',
                  isUpcoming && 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>

            {/* Connecting line */}
            {idx < steps.length - 1 && (
              <div className="relative flex-1 mx-2 mt-[-18px]">
                <div className="h-0.5 w-full bg-muted-foreground/20 rounded-full" />
                <motion.div
                  className="absolute top-0 left-0 h-0.5 bg-primary rounded-full"
                  initial={false}
                  animate={{ width: isCompleted ? '100%' : '0%' }}
                  transition={{ duration: 0.4, ease: 'easeInOut' }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StepContent({ children, direction, currentStep }) {
  return (
    <div className="relative min-h-[340px] overflow-hidden">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={currentStep}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.25, ease: 'easeInOut' }}
          className="py-4"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function StepFooter({ currentStep, totalSteps, onBack, onNext, onCancel, isLoading, nextLabel, backLabel, cancelLabel, submitLabel }) {
  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="flex justify-between items-center pt-4 border-t">
      <div>
        {isFirst ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel || 'Cancel'}
          </Button>
        ) : (
          <Button type="button" variant="outline" onClick={onBack}>
            {backLabel || 'Back'}
          </Button>
        )}
      </div>
      <Button type="button" onClick={onNext} disabled={isLoading}>
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isLast ? (submitLabel || 'Create') : (nextLabel || 'Next')}
      </Button>
    </div>
  );
}

export function FormStepper({
  steps,
  currentStep,
  direction,
  onStepClick,
  onBack,
  onNext,
  onCancel,
  isLoading,
  labels = {},
  children,
}) {
  return (
    <div className="flex flex-col gap-4">
      <StepIndicator steps={steps} currentStep={currentStep} onStepClick={onStepClick} />
      <StepContent direction={direction} currentStep={currentStep}>{children}</StepContent>
      <StepFooter
        currentStep={currentStep}
        totalSteps={steps.length}
        onBack={onBack}
        onNext={onNext}
        onCancel={onCancel}
        isLoading={isLoading}
        nextLabel={labels.next}
        backLabel={labels.back}
        cancelLabel={labels.cancel}
        submitLabel={labels.submit}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify the file exists and has no import issues**

Run: `ls client/src/components/ui/form-stepper.jsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/components/ui/form-stepper.jsx
git commit -m "feat(ui): add reusable FormStepper component with Framer Motion animations"
```

---

### Task 3: Step Content Components (Steps 1–4 + Review)

**Files:**
- Create: `client/src/modules/pm/components/project-form-steps.jsx`

- [ ] **Step 1: Create the step content components file**

Create `client/src/modules/pm/components/project-form-steps.jsx`. This file contains 5 exported components, one per step. Each receives `{ form, language, t }` props where `form` is the react-hook-form instance.

```jsx
'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { PROJECT_TYPE_CONFIG } from '@/modules/pm/constants/pm-constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Search, Check, ChevronsUpDown, FileText, Building2, CalendarClock, Wallet, Pencil } from 'lucide-react';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';
import { useState } from 'react';

function Field({ label, error, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-destructive animate-in fade-in slide-in-from-left-1">{error.message}</p>
      )}
    </div>
  );
}

// ── Step 1: Overview ──────────────────────────────────────────
export function Step1Overview({ form, language, t }) {
  const { register, watch, setValue, formState: { errors } } = form;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('pm.projectName', 'Project Name')} error={errors.name} required>
          <Input {...register('name')} placeholder={language === 'de' ? 'z.B. Heizungssanierung Muster' : 'e.g. Heating renovation'} />
        </Field>
        <Field label={t('pm.projectType', 'Project Type')} error={errors.projectType} required>
          <Select value={watch('projectType')} onValueChange={(v) => setValue('projectType', v, { shouldValidate: true })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(PROJECT_TYPE_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>
                  {language === 'de' ? cfg.label : cfg.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={t('pm.description', 'Description')} error={errors.description}>
        <Textarea {...register('description')} rows={3} />
      </Field>
    </div>
  );
}

// ── Step 2: Customer & Site ───────────────────────────────────
export function Step2CustomerSite({ form, language, t, customerState }) {
  const { setValue, watch, formState: { errors } } = form;
  const watchedCustomerId = watch('customerId');
  const { customerSearch, setCustomerSearch, customerOpen, setCustomerOpen, customers, debouncedCustomerSearch, selectedCustomer } = customerState;

  const { data: sitesData } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(watchedCustomerId),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_SITES(watchedCustomerId));
      return res.data;
    },
    enabled: !!watchedCustomerId,
  });
  const sites = Array.isArray(sitesData) ? sitesData : [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('pm.customer', 'Customer')} error={errors.customerId} required>
          <Popover open={customerOpen} onOpenChange={setCustomerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className={cn('w-full justify-between font-normal', !watchedCustomerId && 'text-muted-foreground')}>
                {selectedCustomer?.name || (watchedCustomerId ? watchedCustomerId : (language === 'de' ? 'Kunde waehlen...' : 'Select customer...'))}
                <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[320px] p-0" align="start">
              <div className="p-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder={language === 'de' ? 'Kunde suchen...' : 'Search customers...'}
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="pl-8 h-8"
                  />
                </div>
              </div>
              <div className="max-h-[200px] overflow-y-auto">
                {customers?.length === 0 && debouncedCustomerSearch.length >= 2 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {language === 'de' ? 'Keine Kunden gefunden' : 'No customers found'}
                  </p>
                )}
                {customers?.map((c) => (
                  <button
                    key={c._id}
                    type="button"
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent transition-colors',
                      watchedCustomerId === c._id && 'bg-accent',
                    )}
                    onClick={() => {
                      setValue('customerId', c._id, { shouldValidate: true });
                      setValue('siteId', '', { shouldValidate: false });
                      setCustomerSearch(c.name);
                      setCustomerOpen(false);
                    }}
                  >
                    {watchedCustomerId === c._id && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                    <span className="truncate">{c.name}</span>
                    {c.customerNumber && <span className="ml-auto text-xs text-muted-foreground">{c.customerNumber}</span>}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </Field>
        <Field label={t('pm.site', 'Site')} error={errors.siteId}>
          <Select
            value={watch('siteId') || 'none'}
            onValueChange={(v) => setValue('siteId', v === 'none' ? '' : v, { shouldValidate: true })}
            disabled={!watchedCustomerId}
          >
            <SelectTrigger><SelectValue placeholder={language === 'de' ? 'Objekt waehlen...' : 'Select site...'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{language === 'de' ? 'Kein Objekt' : 'No site'}</SelectItem>
              {sites.map((s) => (
                <SelectItem key={s._id} value={s._id}>{s.name || s.address || s._id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      {!watchedCustomerId && (
        <p className="text-xs text-muted-foreground italic">{language === 'de' ? 'Waehlen Sie zuerst einen Kunden, um Objekte zu laden' : 'Select a customer first to load sites'}</p>
      )}
    </div>
  );
}

// ── Step 3: Manager & Dates ───────────────────────────────────
export function Step3ManagerDates({ form, language, t }) {
  const { register, watch, setValue, formState: { errors } } = form;

  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ status: 'active', limit: 100 }),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.USERS.LIST, { params: { status: 'active', limit: 100 } });
      return res.data;
    },
  });
  const users = Array.isArray(usersData) ? usersData : [];

  return (
    <div className="space-y-4">
      <Field label={t('pm.projectManager', 'Project Manager')} error={errors.projectManagerId} required>
        <Select value={watch('projectManagerId')} onValueChange={(v) => setValue('projectManagerId', v, { shouldValidate: true })}>
          <SelectTrigger><SelectValue placeholder={language === 'de' ? 'Projektleiter waehlen...' : 'Select PM...'} /></SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u._id} value={u._id}>
                {u.firstName} {u.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('pm.plannedStart', 'Planned Start')} error={errors.plannedStartDate}>
          <Input type="date" {...register('plannedStartDate')} />
        </Field>
        <Field label={t('pm.plannedEnd', 'Planned End')} error={errors.plannedEndDate}>
          <Input type="date" {...register('plannedEndDate')} />
        </Field>
      </div>
    </div>
  );
}

// ── Step 4: Budget & Notes ────────────────────────────────────
export function Step4BudgetNotes({ form, language, t }) {
  const { register, watch, setValue, formState: { errors } } = form;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label={t('pm.budget', 'Budget')} error={errors.estimatedBudget}>
          <Input type="number" step="0.01" min="0" {...register('estimatedBudget')} placeholder="0.00" />
        </Field>
        <Field label={t('pm.currency', 'Currency')} error={errors.currency}>
          <Select value={watch('currency')} onValueChange={(v) => setValue('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="CHF">CHF</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label={t('pm.notes', 'Notes')} error={errors.notes}>
        <Textarea {...register('notes')} rows={3} />
      </Field>
    </div>
  );
}

// ── Step 5: Review ────────────────────────────────────────────
const REVIEW_SECTIONS = [
  { key: 'overview', stepIndex: 0, icon: FileText, labelEn: 'Overview', labelDe: 'Uebersicht' },
  { key: 'customer', stepIndex: 1, icon: Building2, labelEn: 'Customer & Site', labelDe: 'Kunde & Objekt' },
  { key: 'manager', stepIndex: 2, icon: CalendarClock, labelEn: 'Manager & Dates', labelDe: 'Leiter & Termine' },
  { key: 'budget', stepIndex: 3, icon: Wallet, labelEn: 'Budget & Notes', labelDe: 'Budget & Notizen' },
];

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%] truncate">
        {value || <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

export function Step5Review({ form, language, t, onGoToStep, resolvers }) {
  const values = form.getValues();
  const { customerName, siteName, managerName } = resolvers;

  const typeLabel = PROJECT_TYPE_CONFIG[values.projectType]
    ? (language === 'de' ? PROJECT_TYPE_CONFIG[values.projectType].label : PROJECT_TYPE_CONFIG[values.projectType].labelEn)
    : values.projectType;

  const formatDate = (d) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString(language === 'de' ? 'de-CH' : 'en-GB'); } catch { return null; }
  };

  const sections = [
    {
      ...REVIEW_SECTIONS[0],
      rows: [
        { label: t('pm.projectName', 'Project Name'), value: values.name },
        { label: t('pm.projectType', 'Project Type'), value: typeLabel },
        { label: t('pm.description', 'Description'), value: values.description },
      ],
    },
    {
      ...REVIEW_SECTIONS[1],
      rows: [
        { label: t('pm.customer', 'Customer'), value: customerName },
        { label: t('pm.site', 'Site'), value: siteName },
      ],
    },
    {
      ...REVIEW_SECTIONS[2],
      rows: [
        { label: t('pm.projectManager', 'Project Manager'), value: managerName },
        { label: t('pm.plannedStart', 'Planned Start'), value: formatDate(values.plannedStartDate) },
        { label: t('pm.plannedEnd', 'Planned End'), value: formatDate(values.plannedEndDate) },
      ],
    },
    {
      ...REVIEW_SECTIONS[3],
      rows: [
        { label: t('pm.budget', 'Budget'), value: values.estimatedBudget ? `${values.estimatedBudget} ${values.currency || 'CHF'}` : null },
        { label: t('pm.notes', 'Notes'), value: values.notes },
      ],
    },
  ];

  return (
    <div className="space-y-3">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <div key={section.key} className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold">{language === 'de' ? section.labelDe : section.labelEn}</span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
                onClick={() => onGoToStep(section.stepIndex)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                {language === 'de' ? 'Bearbeiten' : 'Edit'}
              </Button>
            </div>
            <div className="divide-y divide-border/50">
              {section.rows.map((row) => (
                <ReviewRow key={row.label} label={row.label} value={row.value} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify file exists**

Run: `ls client/src/modules/pm/components/project-form-steps.jsx`

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/pm/components/project-form-steps.jsx
git commit -m "feat(pm): add step content components for project stepper wizard"
```

---

### Task 4: Refactor ProjectForm to Use FormStepper

**Files:**
- Rewrite: `client/src/modules/pm/components/project-form.jsx`

This is the orchestrator. It wires together `FormStepper`, the 5 step components, the react-hook-form instance, and per-step validation.

- [ ] **Step 1: Rewrite project-form.jsx**

Replace the entire contents of `client/src/modules/pm/components/project-form.jsx` with:

```jsx
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  createProjectSchema,
  projectStep1Schema,
  projectStep2Schema,
  projectStep3Schema,
  projectStep4Schema,
} from '@/modules/pm/validations/project';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FormStepper } from '@/components/ui/form-stepper';
import {
  Step1Overview,
  Step2CustomerSite,
  Step3ManagerDates,
  Step4BudgetNotes,
  Step5Review,
} from '@/modules/pm/components/project-form-steps';
import { FolderKanban, FileText, Building2, CalendarClock, Wallet, ClipboardCheck } from 'lucide-react';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';

const BLANK_VALUES = {
  name: '',
  description: '',
  projectType: 'NEW_INSTALLATION',
  customerId: '',
  siteId: '',
  projectManagerId: '',
  teamId: '',
  plannedStartDate: '',
  plannedEndDate: '',
  estimatedBudget: '',
  currency: 'CHF',
  notes: '',
};

const STEP_SCHEMAS = [projectStep1Schema, projectStep2Schema, projectStep3Schema, projectStep4Schema, null];

export function ProjectForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t, language } = useLanguage();
  const isEdit = !!defaultValues?._id;

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const form = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: BLANK_VALUES,
  });

  const { reset, watch, setValue, getValues, trigger } = form;
  const watchedCustomerId = watch('customerId');

  // ── Customer search state ────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const { data: customers = [] } = useQuery({
    queryKey: queryKeys.crm.customers.search(debouncedCustomerSearch),
    queryFn: () => customerService.searchCustomers(debouncedCustomerSearch, 20),
    enabled: debouncedCustomerSearch.length >= 2,
  });

  const selectedCustomer = useMemo(() => {
    if (!watchedCustomerId) return null;
    return customers?.find((c) => c._id === watchedCustomerId)
      || defaultValues?.customerId?._id === watchedCustomerId
        ? (defaultValues?.customerId?.name ? defaultValues.customerId : null)
        : null;
  }, [watchedCustomerId, customers, defaultValues]);

  // ── Users for review display ─────────────────────────────────
  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ status: 'active', limit: 100 }),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.USERS.LIST, { params: { status: 'active', limit: 100 } });
      return res.data;
    },
  });
  const users = Array.isArray(usersData) ? usersData : [];

  // ── Sites for review display ─────────────────────────────────
  const { data: sitesData } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(watchedCustomerId),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_SITES(watchedCustomerId));
      return res.data;
    },
    enabled: !!watchedCustomerId,
  });
  const sites = Array.isArray(sitesData) ? sitesData : [];

  // ── Reset on open/close ──────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
    setDirection(1);
    if (defaultValues) {
      const cId = typeof defaultValues.customerId === 'object' ? defaultValues.customerId?._id : defaultValues.customerId;
      const sId = typeof defaultValues.siteId === 'object' ? defaultValues.siteId?._id : defaultValues.siteId;
      const pmId = typeof defaultValues.projectManagerId === 'object' ? defaultValues.projectManagerId?._id : defaultValues.projectManagerId;
      reset({
        ...BLANK_VALUES,
        name: defaultValues.name || '',
        description: defaultValues.description || '',
        projectType: defaultValues.projectType || 'NEW_INSTALLATION',
        customerId: cId || '',
        siteId: sId || '',
        projectManagerId: pmId || '',
        teamId: defaultValues.teamId || '',
        plannedStartDate: defaultValues.plannedStartDate ? new Date(defaultValues.plannedStartDate).toISOString().split('T')[0] : '',
        plannedEndDate: defaultValues.plannedEndDate ? new Date(defaultValues.plannedEndDate).toISOString().split('T')[0] : '',
        estimatedBudget: defaultValues.estimatedBudget ?? '',
        currency: defaultValues.currency || 'CHF',
        notes: defaultValues.notes || '',
      });
      if (typeof defaultValues.customerId === 'object' && defaultValues.customerId?.name) {
        setCustomerSearch(defaultValues.customerId.name);
      }
    } else {
      reset(BLANK_VALUES);
      setCustomerSearch('');
    }
  }, [open, defaultValues, reset]);

  // ── Steps config ─────────────────────────────────────────────
  const steps = useMemo(() => [
    { label: language === 'de' ? 'Uebersicht' : 'Overview', icon: FileText },
    { label: language === 'de' ? 'Kunde & Objekt' : 'Customer & Site', icon: Building2 },
    { label: language === 'de' ? 'Leiter & Termine' : 'Manager & Dates', icon: CalendarClock },
    { label: language === 'de' ? 'Budget & Notizen' : 'Budget & Notes', icon: Wallet },
    { label: language === 'de' ? 'Ueberpruefung' : 'Review', icon: ClipboardCheck },
  ], [language]);

  // ── Navigation ───────────────────────────────────────────────
  const goToStep = useCallback((idx) => {
    setDirection(idx > currentStep ? 1 : -1);
    setCurrentStep(idx);
  }, [currentStep]);

  const handleNext = useCallback(async () => {
    const schema = STEP_SCHEMAS[currentStep];
    if (schema) {
      const fields = Object.keys(schema.shape);
      const valid = await trigger(fields);
      if (!valid) return;
    }

    if (currentStep === steps.length - 1) {
      const values = getValues();
      const cleaned = { ...values };
      if (!cleaned.siteId) delete cleaned.siteId;
      if (!cleaned.teamId) delete cleaned.teamId;
      if (!cleaned.estimatedBudget && cleaned.estimatedBudget !== 0) delete cleaned.estimatedBudget;
      if (!cleaned.notes) delete cleaned.notes;
      if (!cleaned.description) delete cleaned.description;
      onSubmit(cleaned);
      return;
    }

    setDirection(1);
    setCurrentStep((s) => s + 1);
  }, [currentStep, steps.length, trigger, getValues, onSubmit]);

  const handleBack = useCallback(() => {
    setDirection(-1);
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  // ── Resolve display names for review ─────────────────────────
  const resolvers = useMemo(() => {
    const vals = getValues();
    const cust = customers?.find((c) => c._id === vals.customerId) || selectedCustomer;
    const site = sites?.find((s) => s._id === vals.siteId);
    const user = users?.find((u) => u._id === vals.projectManagerId);
    return {
      customerName: cust?.name || vals.customerId || null,
      siteName: site?.name || site?.address || null,
      managerName: user ? `${user.firstName} ${user.lastName}` : null,
    };
  }, [customers, selectedCustomer, sites, users, getValues]);

  // ── Customer state bundle ────────────────────────────────────
  const customerState = useMemo(() => ({
    customerSearch,
    setCustomerSearch,
    customerOpen,
    setCustomerOpen,
    customers,
    debouncedCustomerSearch,
    selectedCustomer,
  }), [customerSearch, customerOpen, customers, debouncedCustomerSearch, selectedCustomer]);

  // ── Render current step ──────────────────────────────────────
  const stepContent = useMemo(() => {
    const props = { form, language, t };
    switch (currentStep) {
      case 0: return <Step1Overview {...props} />;
      case 1: return <Step2CustomerSite {...props} customerState={customerState} />;
      case 2: return <Step3ManagerDates {...props} />;
      case 3: return <Step4BudgetNotes {...props} />;
      case 4: return <Step5Review {...props} onGoToStep={goToStep} resolvers={resolvers} />;
      default: return null;
    }
  }, [currentStep, form, language, t, customerState, goToStep, resolvers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FolderKanban className="h-4 w-4 text-primary" />
            </div>
            {isEdit ? t('pm.editProject', 'Edit Project') : t('pm.newProject', 'New Project')}
          </DialogTitle>
        </DialogHeader>

        <FormStepper
          steps={steps}
          currentStep={currentStep}
          direction={direction}
          onStepClick={goToStep}
          onBack={handleBack}
          onNext={handleNext}
          onCancel={() => onOpenChange(false)}
          isLoading={isLoading}
          labels={{
            next: language === 'de' ? 'Weiter' : 'Next',
            back: language === 'de' ? 'Zurueck' : 'Back',
            cancel: t('common.cancel', 'Cancel'),
            submit: isEdit ? t('common.save', 'Save') : t('common.create', 'Create'),
          }}
        >
          {stepContent}
        </FormStepper>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify the dev server compiles without errors**

Run: `cd client && npm run dev`

Open the browser, navigate to the Projects page, click "New Project", and verify:
- The stepper bar appears with 5 steps
- Step 1 shows Project Name, Type, and Description fields
- Clicking "Next" with empty name shows validation error
- Filling in name and clicking "Next" advances to Step 2
- The slide animation works in both directions
- Clicking a completed step circle jumps back to it
- The review step shows all entered data with edit buttons
- Creating a project from the review step works

- [ ] **Step 3: Commit**

```bash
git add client/src/modules/pm/components/project-form.jsx
git commit -m "feat(pm): refactor ProjectForm to use 5-step stepper wizard"
```

---

### Task 5: Visual Polish & Edge Cases

**Files:**
- Modify: `client/src/modules/pm/components/project-form.jsx`

- [ ] **Step 1: Add dirty-check on dialog close**

In `project-form.jsx`, add a dirty check. Find the Dialog `onOpenChange` in the return JSX:

```jsx
<Dialog open={open} onOpenChange={onOpenChange}>
```

Replace with:

```jsx
<Dialog open={open} onOpenChange={(isOpen) => {
  if (!isOpen && form.formState.isDirty) {
    if (window.confirm(language === 'de' ? 'Aenderungen verwerfen?' : 'Discard changes?')) {
      onOpenChange(false);
    }
  } else {
    onOpenChange(isOpen);
  }
}}>
```

- [ ] **Step 3: Test edge cases in the browser**

Verify:
- Close dialog with dirty form → shows confirm prompt
- Close dialog with clean form → closes immediately
- Step labels don't overflow on smaller screens
- The connecting lines between steps render correctly for all 5 steps

- [ ] **Step 4: Commit**

```bash
git add client/src/components/ui/form-stepper.jsx client/src/modules/pm/components/project-form.jsx
git commit -m "fix(pm): visual polish and dirty-check on stepper dialog close"
```

---

### Task 6: Edit Mode Diff Indicators on Review Step

**Files:**
- Modify: `client/src/modules/pm/components/project-form-steps.jsx`
- Modify: `client/src/modules/pm/components/project-form.jsx`

- [ ] **Step 1: Pass `initialValues` to Step5Review for diff comparison**

In `project-form.jsx`, add an `initialValues` ref. After the `BLANK_VALUES` const, inside the component, add a ref that captures the initial form values when the dialog opens.

Find in the `useEffect` that handles `open`:
```jsx
  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
    setDirection(1);
```

After `setDirection(1);` and after the `reset(...)` calls, we need to capture the initial values. The cleanest approach: add a state variable.

Add at the top of the component, near other `useState` calls:
```jsx
const [initialFormValues, setInitialFormValues] = useState(BLANK_VALUES);
```

Then in the `useEffect`, after each `reset(...)` call, also call `setInitialFormValues(...)` with the same values object. For the `defaultValues` branch, add after the `reset({...})` call:
```jsx
setInitialFormValues({
  ...BLANK_VALUES,
  name: defaultValues.name || '',
  description: defaultValues.description || '',
  projectType: defaultValues.projectType || 'NEW_INSTALLATION',
  customerId: cId || '',
  siteId: sId || '',
  projectManagerId: pmId || '',
  teamId: defaultValues.teamId || '',
  plannedStartDate: defaultValues.plannedStartDate ? new Date(defaultValues.plannedStartDate).toISOString().split('T')[0] : '',
  plannedEndDate: defaultValues.plannedEndDate ? new Date(defaultValues.plannedEndDate).toISOString().split('T')[0] : '',
  estimatedBudget: defaultValues.estimatedBudget ?? '',
  currency: defaultValues.currency || 'CHF',
  notes: defaultValues.notes || '',
});
```

For the else branch (new project): add `setInitialFormValues(BLANK_VALUES);` after `reset(BLANK_VALUES);`.

Then pass `initialFormValues` to `Step5Review`:
```jsx
case 4: return <Step5Review {...props} onGoToStep={goToStep} resolvers={resolvers} initialValues={initialFormValues} isEdit={isEdit} />;
```

- [ ] **Step 2: Add diff dot indicator in Step5Review**

In `project-form-steps.jsx`, update the `ReviewRow` component to accept an `isChanged` prop:

Find:
```jsx
function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
```

Replace with:
```jsx
function ReviewRow({ label, value, isChanged }) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {label}
        {isChanged && <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
      </span>
```

Update `Step5Review` to accept `initialValues` and `isEdit`, then compute `isChanged` for each row:

Change the function signature from:
```jsx
export function Step5Review({ form, language, t, onGoToStep, resolvers }) {
```
To:
```jsx
export function Step5Review({ form, language, t, onGoToStep, resolvers, initialValues, isEdit }) {
```

Add a helper function inside `Step5Review`:
```jsx
const isChanged = (field) => {
  if (!isEdit || !initialValues) return false;
  const current = values[field];
  const initial = initialValues[field];
  return String(current ?? '') !== String(initial ?? '');
};
```

Then update each `ReviewRow` in the sections array to include `isChanged`. For example, the overview section becomes:
```jsx
{
  ...REVIEW_SECTIONS[0],
  rows: [
    { label: t('pm.projectName', 'Project Name'), value: values.name, changed: isChanged('name') },
    { label: t('pm.projectType', 'Project Type'), value: typeLabel, changed: isChanged('projectType') },
    { label: t('pm.description', 'Description'), value: values.description, changed: isChanged('description') },
  ],
},
```

Do the same for all 4 sections, mapping each row's field name to `isChanged(fieldName)`.

Finally, update the rendering to pass `isChanged` to `ReviewRow`:
```jsx
{section.rows.map((row) => (
  <ReviewRow key={row.label} label={row.label} value={row.value} isChanged={row.changed} />
))}
```

- [ ] **Step 3: Test in browser**

Open an existing project for editing, change a field, navigate to Review step. Changed fields should show a small purple dot next to the label.

- [ ] **Step 4: Commit**

```bash
git add client/src/modules/pm/components/project-form.jsx client/src/modules/pm/components/project-form-steps.jsx
git commit -m "feat(pm): add diff indicators on review step for edit mode"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Per-step Zod schemas | `validations/project.js` |
| 2 | Reusable FormStepper component | `components/ui/form-stepper.jsx` |
| 3 | Step content components (1–5) | `pm/components/project-form-steps.jsx` |
| 4 | Refactor ProjectForm orchestrator | `pm/components/project-form.jsx` |
| 5 | Visual polish + dirty check | `pm/components/project-form.jsx` |
| 6 | Edit mode diff indicators | Both PM files |
