'use client';

import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { createProjectSchema } from '@/modules/pm/validations/project';
import { customerService } from '@/modules/crm/services/customer-service';
import { queryKeys } from '@/lib/query/keys';
import { useLanguage } from '@/lib/i18n/language-context';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { PROJECT_TYPE_CONFIG } from '@/modules/pm/constants/pm-constants';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Loader2, FolderKanban, Search, Check, ChevronsUpDown } from 'lucide-react';
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

export function ProjectForm({ open, onOpenChange, onSubmit, defaultValues, isLoading }) {
  const { t, language } = useLanguage();
  const isEdit = !!defaultValues?._id;

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    resolver: zodResolver(createProjectSchema),
    defaultValues: BLANK_VALUES,
  });

  const watchedCustomerId = watch('customerId');

  // Customer search
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerOpen, setCustomerOpen] = useState(false);
  const debouncedCustomerSearch = useDebounce(customerSearch, 300);

  const { data: customers = [] } = useQuery({
    queryKey: queryKeys.crm.customers.search(debouncedCustomerSearch),
    queryFn: () => customerService.searchCustomers(debouncedCustomerSearch, 20),
    enabled: debouncedCustomerSearch.length >= 2,
  });

  // Sites for selected customer
  const { data: sitesData } = useQuery({
    queryKey: queryKeys.crm.sites.byCustomer(watchedCustomerId),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.CRM.CUSTOMER_SITES(watchedCustomerId));
      return res.data;
    },
    enabled: !!watchedCustomerId,
  });
  const sites = Array.isArray(sitesData) ? sitesData : [];

  // Users for project manager
  const { data: usersData } = useQuery({
    queryKey: queryKeys.users.list({ status: 'active', limit: 100 }),
    queryFn: async () => {
      const res = await apiClient.get(ENDPOINTS.USERS.LIST, { params: { status: 'active', limit: 100 } });
      return res.data;
    },
  });
  const users = Array.isArray(usersData) ? usersData : [];

  // Selected customer display
  const selectedCustomer = useMemo(() => {
    if (!watchedCustomerId) return null;
    return customers?.find((c) => c._id === watchedCustomerId)
      || defaultValues?.customerId?._id === watchedCustomerId
        ? (defaultValues?.customerId?.name ? defaultValues.customerId : null)
        : null;
  }, [watchedCustomerId, customers, defaultValues]);

  useEffect(() => {
    if (!open) return;
    if (defaultValues) {
      const cId = typeof defaultValues.customerId === 'object'
        ? defaultValues.customerId?._id
        : defaultValues.customerId;
      const sId = typeof defaultValues.siteId === 'object'
        ? defaultValues.siteId?._id
        : defaultValues.siteId;
      const pmId = typeof defaultValues.projectManagerId === 'object'
        ? defaultValues.projectManagerId?._id
        : defaultValues.projectManagerId;
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

  const onFormSubmit = (data) => {
    const cleaned = { ...data };
    if (!cleaned.siteId) delete cleaned.siteId;
    if (!cleaned.teamId) delete cleaned.teamId;
    if (!cleaned.estimatedBudget && cleaned.estimatedBudget !== 0) delete cleaned.estimatedBudget;
    if (!cleaned.notes) delete cleaned.notes;
    if (!cleaned.description) delete cleaned.description;
    onSubmit(cleaned);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <FolderKanban className="h-4 w-4 text-primary" />
            </div>
            {isEdit ? t('pm.editProject', 'Edit Project') : t('pm.newProject', 'New Project')}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-6 pt-2">
          {/* General Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t('pm.overview', 'General')}</h3>
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
              <Textarea {...register('description')} rows={2} />
            </Field>
          </div>

          <Separator />

          {/* Customer & Site */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t('pm.customer', 'Customer')} & {t('pm.site', 'Site')}</h3>
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
          </div>

          <Separator />

          {/* Responsibility & Dates */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t('pm.projectManager', 'Project Manager')} & {language === 'de' ? 'Termine' : 'Dates'}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <div />
              <Field label={t('pm.plannedStart', 'Planned Start')} error={errors.plannedStartDate}>
                <Input type="date" {...register('plannedStartDate')} />
              </Field>
              <Field label={t('pm.plannedEnd', 'Planned End')} error={errors.plannedEndDate}>
                <Input type="date" {...register('plannedEndDate')} />
              </Field>
            </div>
          </div>

          <Separator />

          {/* Budget & Notes */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground">{t('pm.budget', 'Budget')}</h3>
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
              <Textarea {...register('notes')} rows={2} />
            </Field>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? t('common.save', 'Save') : t('common.create', 'Create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
