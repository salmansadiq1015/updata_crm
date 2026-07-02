'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  createProjectSchema,
  projectStep1Schema,
  projectStep2Schema,
  projectStep3Schema,
  projectStep4Schema,
} from '@/modules/pm/validations/project';
import { customerService, normalizeCustomerList } from '@/modules/crm/services/customer-service';
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
import { stripEmptyHtml } from '@/lib/utils/html';
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
const CUSTOMER_DROPDOWN_LIMIT = 20;
const CUSTOMER_DROPDOWN_LIST_PARAMS = Object.freeze({
  limit: CUSTOMER_DROPDOWN_LIMIT,
  sortBy: 'name',
  sortOrder: 'asc',
  status: 'active',
});

export function ProjectForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t, language } = useLanguage();
  const isEdit = !!defaultValues?._id;

  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [initialFormValues, setInitialFormValues] = useState(BLANK_VALUES);

  const form = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: BLANK_VALUES,
  });

  const { reset, setValue, getValues, trigger } = form;
  const watchedCustomerId = useWatch({ control: form.control, name: 'customerId' });

  // ── Customer search state ────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const trimmedCustomerSearch = debouncedCustomerSearch.trim();

  const {
    data: customers = [],
    isFetching: isCustomerFetching,
    isError: isCustomerError,
  } = useQuery({
    queryKey: trimmedCustomerSearch.length >= 2
      ? queryKeys.crm.customers.search(trimmedCustomerSearch)
      : queryKeys.crm.customers.list(CUSTOMER_DROPDOWN_LIST_PARAMS),
    queryFn: async () => {
      const payload = trimmedCustomerSearch.length >= 2
        ? await customerService.searchCustomers(trimmedCustomerSearch, CUSTOMER_DROPDOWN_LIMIT)
        : await customerService.getCustomers(CUSTOMER_DROPDOWN_LIST_PARAMS);
      return normalizeCustomerList(payload);
    },
    enabled: customerOpen,
    staleTime: 120_000,
  });

  const selectedCustomer = useMemo(() => {
    if (!watchedCustomerId) return null;
    const resultCustomer = customers?.find((c) => c._id === watchedCustomerId);
    if (resultCustomer) return resultCustomer;

    const defaultCustomer = defaultValues?.customerId;
    if (
      defaultCustomer
      && typeof defaultCustomer === 'object'
      && defaultCustomer._id === watchedCustomerId
      && defaultCustomer.name
    ) {
      return defaultCustomer;
    }

    return null;
  }, [watchedCustomerId, customers, defaultValues]);

  // ── Users for review display ─────────────────────────────────
  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ status: 'active', limit: 100 }),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.USERS.LIST, { params: { status: 'active', limit: 100 } });
      return res.data;
    },
  });
  const users = useMemo(() => (Array.isArray(usersData) ? usersData : []), [usersData]);

  // ── Sites for review display ─────────────────────────────────
  const { data: sitesData } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(watchedCustomerId),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_SITES(watchedCustomerId));
      return res.data;
    },
    enabled: !!watchedCustomerId,
  });
  const sites = useMemo(() => (Array.isArray(sitesData) ? sitesData : []), [sitesData]);

  // ── Reset on open/close ──────────────────────────────────────
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    setCurrentStep(0);
    setDirection(1);
    if (defaultValues) {
      const cId = typeof defaultValues.customerId === 'object' ? defaultValues.customerId?._id : defaultValues.customerId;
      const sId = typeof defaultValues.siteId === 'object' ? defaultValues.siteId?._id : defaultValues.siteId;
      const pmId = typeof defaultValues.projectManagerId === 'object' ? defaultValues.projectManagerId?._id : defaultValues.projectManagerId;
      const editValues = {
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
      };
      reset(editValues);
      setInitialFormValues(editValues);
      if (typeof defaultValues.customerId === 'object' && defaultValues.customerId?.name) {
        setCustomerSearch(defaultValues.customerId.name);
      }
    } else {
      reset(BLANK_VALUES);
      setInitialFormValues(BLANK_VALUES);
      setCustomerSearch('');
    }
  }, [open, defaultValues, reset]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // ── Steps config ─────────────────────────────────────────────
  const steps = useMemo(() => [
    { label: language === 'de' ? 'Übersicht' : 'Overview', icon: FileText },
    { label: language === 'de' ? 'Kunde & Objekt' : 'Customer & Site', icon: Building2 },
    { label: language === 'de' ? 'Leiter & Termine' : 'Manager & Dates', icon: CalendarClock },
    { label: language === 'de' ? 'Budget & Notizen' : 'Budget & Notes', icon: Wallet },
    { label: language === 'de' ? 'Überprüfung' : 'Review', icon: ClipboardCheck },
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
      cleaned.description = stripEmptyHtml(cleaned.description);
      cleaned.notes = stripEmptyHtml(cleaned.notes);
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
    debouncedCustomerSearch: trimmedCustomerSearch,
    selectedCustomer,
    isCustomerFetching,
    isCustomerError,
  }), [customerSearch, customerOpen, customers, trimmedCustomerSearch, selectedCustomer, isCustomerFetching, isCustomerError]);

  // ── Render current step ──────────────────────────────────────
  const stepContent = useMemo(() => {
    const props = { form, language, t };
    switch (currentStep) {
      case 0: return <Step1Overview {...props} />;
      case 1: return <Step2CustomerSite {...props} customerState={customerState} />;
      case 2: return <Step3ManagerDates {...props} />;
      case 3: return <Step4BudgetNotes {...props} />;
      case 4: return <Step5Review {...props} onGoToStep={goToStep} resolvers={resolvers} initialValues={initialFormValues} isEdit={isEdit} />;
      default: return null;
    }
  }, [currentStep, form, language, t, customerState, goToStep, resolvers, initialFormValues, isEdit]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen && form.formState.isDirty) {
        if (window.confirm(language === 'de' ? 'Änderungen verwerfen?' : 'Discard changes?')) {
          onOpenChange(false);
        }
      } else {
        onOpenChange(isOpen);
      }
    }}>
      <DialogContent className="sm:max-w-2xl max-h-[95vh] overflow-y-auto scrollbar-hide p-6">
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
            back: language === 'de' ? 'Zurück' : 'Back',
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
