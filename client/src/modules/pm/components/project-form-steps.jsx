'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { PROJECT_TYPE_CONFIG } from '@/modules/pm/constants/pm-constants';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Search, Check, ChevronsUpDown, FileText, Building2, CalendarClock, Wallet, Pencil } from 'lucide-react';
import { ENDPOINTS } from '@/lib/api/endpoints';
import apiClient from '@/lib/api/client';

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

function ReviewRow({ label, value, isChanged }) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-xs text-muted-foreground flex items-center gap-1.5">
        {label}
        {isChanged && <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" />}
      </span>
      <span className="text-sm font-medium text-right max-w-[60%] truncate">
        {value || <span className="text-muted-foreground/50">—</span>}
      </span>
    </div>
  );
}

export function Step5Review({ form, language, t, onGoToStep, resolvers, initialValues, isEdit }) {
  const values = form.getValues();
  const { customerName, siteName, managerName } = resolvers;

  const typeLabel = PROJECT_TYPE_CONFIG[values.projectType]
    ? (language === 'de' ? PROJECT_TYPE_CONFIG[values.projectType].label : PROJECT_TYPE_CONFIG[values.projectType].labelEn)
    : values.projectType;

  const formatDate = (d) => {
    if (!d) return null;
    try { return new Date(d).toLocaleDateString(language === 'de' ? 'de-CH' : 'en-GB'); } catch { return null; }
  };

  const isChanged = (field) => {
    if (!isEdit || !initialValues) return false;
    const current = values[field];
    const initial = initialValues[field];
    return String(current ?? '') !== String(initial ?? '');
  };

  const sections = [
    {
      ...REVIEW_SECTIONS[0],
      rows: [
        { label: t('pm.projectName', 'Project Name'), value: values.name, changed: isChanged('name') },
        { label: t('pm.projectType', 'Project Type'), value: typeLabel, changed: isChanged('projectType') },
        { label: t('pm.description', 'Description'), value: values.description, changed: isChanged('description') },
      ],
    },
    {
      ...REVIEW_SECTIONS[1],
      rows: [
        { label: t('pm.customer', 'Customer'), value: customerName, changed: isChanged('customerId') },
        { label: t('pm.site', 'Site'), value: siteName, changed: isChanged('siteId') },
      ],
    },
    {
      ...REVIEW_SECTIONS[2],
      rows: [
        { label: t('pm.projectManager', 'Project Manager'), value: managerName, changed: isChanged('projectManagerId') },
        { label: t('pm.plannedStart', 'Planned Start'), value: formatDate(values.plannedStartDate), changed: isChanged('plannedStartDate') },
        { label: t('pm.plannedEnd', 'Planned End'), value: formatDate(values.plannedEndDate), changed: isChanged('plannedEndDate') },
      ],
    },
    {
      ...REVIEW_SECTIONS[3],
      rows: [
        { label: t('pm.budget', 'Budget'), value: values.estimatedBudget ? `${values.estimatedBudget} ${values.currency || 'CHF'}` : null, changed: isChanged('estimatedBudget') || isChanged('currency') },
        { label: t('pm.notes', 'Notes'), value: values.notes, changed: isChanged('notes') },
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
                <ReviewRow key={row.label} label={row.label} value={row.value} isChanged={row.changed} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
