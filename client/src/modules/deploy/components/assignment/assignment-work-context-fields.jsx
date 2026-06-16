'use client';

import { useMemo, useState } from 'react';
import { useWatch } from 'react-hook-form';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FormField, FormSection } from '@/components/ui/form-field';
import {
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronsUpDown,
  ClipboardList,
  FolderKanban,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import {
  normalizeOrderOption,
  normalizeProjectOption,
  orderLabel,
  projectLabel,
  useAssignmentOrderOptions,
  useAssignmentProjectOptions,
} from '../../hooks/use-assignment-work-options';

function getId(value) {
  return value?._id || value?.id || value || '';
}

function mergeSelectedOption(options, selected) {
  if (!selected?._id) return options;
  if (options.some((option) => option._id === selected._id)) return options;
  return [selected, ...options];
}

function ContextPicker({
  icon: Icon,
  label,
  placeholder,
  searchPlaceholder,
  clearLabel,
  value,
  options,
  isFetching,
  emptyLabel,
  onSearch,
  onSelect,
  onClear,
  renderOption,
}) {
  const selected = options.find((option) => option._id === value);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="h-11 w-full justify-between rounded-xl px-3.5 text-sm font-normal">
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{selected?.label || placeholder}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] overflow-hidden rounded-2xl p-0" align="start">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              onChange={(event) => onSearch(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-10 rounded-xl pl-9 text-sm"
            />
          </div>
        </div>
        <div className="max-h-[300px] overflow-y-auto p-1.5">
          {value && (
            <button
              type="button"
              onClick={onClear}
              className="mb-1 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X className="h-4 w-4" />
              {clearLabel}
            </button>
          )}
          {options.map((option) => {
            const isSelected = option._id === value;
            return (
              <button
                key={option._id}
                type="button"
                onClick={() => onSelect(option)}
                className="flex w-full items-start gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">{renderOption(option)}</span>
                <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'}`}>
                  {isSelected && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                </span>
              </button>
            );
          })}
          {isFetching && options.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {label}
            </div>
          )}
          {!isFetching && options.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AssignmentWorkContextFields({ control, setValue, errors, defaultValues, prefill, open, t }) {
  const [projectSearch, setProjectSearch] = useState('');
  const [orderSearch, setOrderSearch] = useState('');
  const debouncedProjectSearch = useDebounce(projectSearch, 250);
  const debouncedOrderSearch = useDebounce(orderSearch, 250);

  const projectId = useWatch({ control, name: 'projectId' }) || '';
  const orderId = useWatch({ control, name: 'orderId' }) || '';
  const title = useWatch({ control, name: 'title' }) || '';

  const defaultProject = useMemo(
    () => normalizeProjectOption(defaultValues?.projectId || prefill?.projectId),
    [defaultValues?.projectId, prefill?.projectId],
  );
  const defaultOrder = useMemo(
    () => normalizeOrderOption(defaultValues?.orderId || prefill?.orderId),
    [defaultValues?.orderId, prefill?.orderId],
  );

  const { data: fetchedProjects = [], isFetching: projectsFetching } = useAssignmentProjectOptions({
    enabled: open,
    search: debouncedProjectSearch,
  });
  const projects = useMemo(
    () => mergeSelectedOption(fetchedProjects, defaultProject),
    [fetchedProjects, defaultProject],
  );

  const { data: fetchedOrders = [], isFetching: ordersFetching } = useAssignmentOrderOptions({
    enabled: open,
    search: debouncedOrderSearch,
    projectId,
  });
  const orders = useMemo(
    () => mergeSelectedOption(fetchedOrders, defaultOrder),
    [fetchedOrders, defaultOrder],
  );

  const selectedProject = projects.find((project) => project._id === projectId);
  const selectedOrder = orders.find((order) => order._id === orderId);

  const applyProject = (project) => {
    setValue('projectId', project._id, { shouldValidate: true });
    if (project.customerId) setValue('customerId', project.customerId);
    if (project.siteId) setValue('siteId', project.siteId);
    if (!title) setValue('title', projectLabel(project));

    if (selectedOrder?.projectId && selectedOrder.projectId !== project._id) {
      setValue('orderId', '', { shouldValidate: true });
    }
  };

  const applyOrder = (order) => {
    setValue('orderId', order._id, { shouldValidate: true });
    if (order.projectId) setValue('projectId', order.projectId, { shouldValidate: true });
    if (order.customerId) setValue('customerId', order.customerId);
    if (!title) setValue('title', orderLabel(order));
  };

  const clearProject = () => {
    setValue('projectId', '', { shouldValidate: true });
    if (selectedOrder?.projectId) setValue('orderId', '', { shouldValidate: true });
  };

  const clearOrder = () => {
    setValue('orderId', '', { shouldValidate: true });
  };

  return (
    <FormSection title={t('deploy.form.workContext', 'Arbeitskontext')} className="border-b border-border/70 pb-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label={t('deploy.form.project', 'Projekt')} error={errors.projectId?.message}>
          <ContextPicker
            icon={FolderKanban}
            label={t('deploy.form.loadingProjects', 'Projekte werden geladen...')}
            placeholder={t('deploy.form.selectProject', 'Projekt auswaehlen')}
            searchPlaceholder={t('deploy.form.searchProjects', 'Projekt suchen...')}
            clearLabel={t('deploy.form.noProject', 'Kein Projekt')}
            value={projectId}
            options={projects}
            isFetching={projectsFetching}
            emptyLabel={t('deploy.form.noProjects', 'Keine Projekte gefunden')}
            onSearch={setProjectSearch}
            onSelect={applyProject}
            onClear={clearProject}
            renderOption={(project) => (
              <>
                <span className="block truncate font-medium text-foreground">{project.label}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{project.customerName || project.status}</span>
                </span>
              </>
            )}
          />
        </FormField>

        <FormField label={t('deploy.form.order', 'Auftrag')} error={errors.orderId?.message}>
          <ContextPicker
            icon={ClipboardList}
            label={t('deploy.form.loadingOrders', 'Auftraege werden geladen...')}
            placeholder={t('deploy.form.selectOrder', 'Auftrag auswaehlen')}
            searchPlaceholder={t('deploy.form.searchOrders', 'Auftrag suchen...')}
            clearLabel={t('deploy.form.noOrder', 'Kein Auftrag')}
            value={orderId}
            options={orders}
            isFetching={ordersFetching}
            emptyLabel={t('deploy.form.noOrders', 'Keine Auftraege gefunden')}
            onSearch={setOrderSearch}
            onSelect={applyOrder}
            onClear={clearOrder}
            renderOption={(order) => (
              <>
                <span className="block truncate font-medium text-foreground">{order.label}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{order.projectName || order.customerName || order.status}</span>
                </span>
              </>
            )}
          />
        </FormField>
      </div>

      {(selectedProject || selectedOrder) && (
        <div className="flex flex-wrap gap-2">
          {selectedProject && (
            <Badge variant="secondary" className="gap-1.5 rounded-lg px-2.5 py-1">
              <FolderKanban className="h-3.5 w-3.5" />
              {selectedProject.label}
            </Badge>
          )}
          {selectedOrder && (
            <Badge variant="outline" className="gap-1.5 rounded-lg px-2.5 py-1">
              <ClipboardList className="h-3.5 w-3.5" />
              {selectedOrder.label}
            </Badge>
          )}
        </div>
      )}
    </FormSection>
  );
}
