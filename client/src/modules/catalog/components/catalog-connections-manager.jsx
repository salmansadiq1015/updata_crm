'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  DatabaseZap,
  History,
  KeyRound,
  Loader2,
  Pencil,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ListPage } from '@/components/ui/list-page';
import { TablePagination } from '@/components/ui/table-pagination';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCatalogCategoryOptions, useCatalogConnections, useCatalogConnectionLogs } from '../hooks/use-catalog-queries';
import { useCatalogConnectionMutations } from '../hooks/use-catalog-mutations';
import { useClientPagination } from '@/shared/hooks/use-client-pagination';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const NO_CATEGORY = '__none__';
const PAGE_SIZE = 10;
const TYPE_OPTIONS = ['SUPPLIER', 'MANUFACTURER', 'IGH', 'GENERIC'];
const FORMAT_OPTIONS = ['CSV', 'JSON', 'XML'];
const STEP_FIELDS = [
  ['name', 'providerKey', 'type', 'format', 'endpointUrl'],
  ['syncSchedule', 'supplierName', 'manufacturerName', 'defaultCategoryId', 'defaultMarkupPercent', 'defaultMarginPercent'],
  ['credentials.apiKey', 'credentials.token', 'credentials.username', 'credentials.password', 'isEnabled', 'isPreferred', 'preferredRank'],
];

const DEFAULT_VALUES = {
  name: '', providerKey: '', type: 'SUPPLIER', format: 'CSV', endpointUrl: '', syncSchedule: '@daily',
  supplierName: '', manufacturerName: '', defaultCategoryId: '', defaultMarkupPercent: '', defaultMarginPercent: '',
  isEnabled: true, isPreferred: false, preferredRank: 100,
  credentials: { apiKey: '', token: '', username: '', password: '' },
};

const statusVariant = { HEALTHY: 'default', RUNNING: 'secondary', FAILED: 'destructive', DISABLED: 'outline', NEVER: 'outline' };

function optionalNumber(min, max, message) {
  return z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return Number(value);
  }, z.number({ error: message }).min(min, message).max(max, message).optional());
}

function optionalInteger(min, max, message) {
  return z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return undefined;
    return Number(value);
  }, z.number({ error: message }).int(message).min(min, message).max(max, message).optional());
}

function createConnectionSchema(t) {
  return z.object({
    name: z.string().trim().min(1, t('catalog.connections.errorNameRequired')).max(160),
    providerKey: z.string().trim().min(1, t('catalog.connections.errorProviderKeyRequired')).max(80),
    type: z.enum(TYPE_OPTIONS),
    format: z.enum(FORMAT_OPTIONS),
    endpointUrl: z.string().trim().optional().refine((value) => {
      if (!value) return true;
      try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol);
      } catch {
        return false;
      }
    }, t('catalog.connections.errorEndpointUrlInvalid')),
    syncSchedule: z.string().trim().max(80).optional(),
    supplierName: z.string().trim().max(255).optional(),
    manufacturerName: z.string().trim().max(255).optional(),
    defaultCategoryId: z.string().optional(),
    defaultMarkupPercent: optionalNumber(-100, 1000, t('catalog.connections.errorMarkupRange')),
    defaultMarginPercent: optionalNumber(-100, 99.99, t('catalog.connections.errorMarginRange')),
    isEnabled: z.boolean().default(true),
    isPreferred: z.boolean().default(false),
    preferredRank: optionalInteger(0, 100000, t('catalog.connections.errorRankRange')),
    credentials: z.object({
      apiKey: z.string().max(2000).optional(),
      token: z.string().max(2000).optional(),
      username: z.string().max(255).optional(),
      password: z.string().max(2000).optional(),
    }).default({}),
  });
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function unwrapList(result) {
  return result?.data ?? [];
}

function displayValue(value) {
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function getMutationMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

export function CatalogConnectionsManager() {
  const { t } = useLanguage();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [logConnectionId, setLogConnectionId] = useState(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const { data: result = { data: [] }, isLoading, isError } = useCatalogConnections({ limit: 100 });
  const { data: logs = [] } = useCatalogConnectionLogs(logConnectionId);
  const { createConnection, updateConnection, removeConnection, syncConnection } = useCatalogConnectionMutations();
  const connections = unwrapList(result);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return connections.filter((c) => {
      if (q && ![c.name, c.providerKey, c.supplierName, c.manufacturerName].some((v) => String(v ?? '').toLowerCase().includes(q))) return false;
      if (typeFilter !== ALL && c.type !== typeFilter) return false;
      if (statusFilter !== ALL && (c.lastSyncStatus || 'NEVER') !== statusFilter) return false;
      return true;
    });
  }, [connections, search, typeFilter, statusFilter]);

  const { page, setPage, pageItems, total } = useClientPagination(filtered, PAGE_SIZE);

  const openCreate = () => { setEditing(null); setFormOpen(true); };

  return (
    <ListPage>
      <ListPage.Toolbar>
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder={t('catalog.connections.searchPlaceholder', 'Search connections...')} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('catalog.connections.table.type')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('catalog.connections.allTypes', 'All types')}</SelectItem>
            {TYPE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t('catalog.connections.table.status')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('catalog.connections.allStatuses', 'All statuses')}</SelectItem>
            {Object.keys(statusVariant).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{total} {t('common.results', 'results')}</span>
          <Button size="sm" className="gap-1.5" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />{t('catalog.connections.add')}
          </Button>
        </div>
      </ListPage.Toolbar>

      <ListPage.Body
        isLoading={isLoading}
        isError={isError}
        isEmpty={!isLoading && total === 0}
        errorMessage={t('catalog.connections.loadError')}
        empty={{ icon: PlugZap, title: t('catalog.connections.empty'), description: t('catalog.connections.emptyHint', 'Connect a supplier or manufacturer catalog to import articles.'), action: <Button variant="outline" size="sm" onClick={openCreate}><Plus className="mr-1.5 h-3.5 w-3.5" />{t('catalog.connections.createFirst')}</Button> }}
      >
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.connections.table.catalog')}</th>
                <th className="w-32 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.connections.table.type')}</th>
                <th className="w-44 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.connections.table.sync')}</th>
                <th className="w-36 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.connections.table.status')}</th>
                <th className="w-44 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('catalog.connections.table.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {pageItems.map((connection) => {
                const id = connection._id || connection.id;
                return (
                  <tr key={id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="truncate font-medium">{connection.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {connection.providerKey} - {connection.supplierName || connection.manufacturerName || connection.endpointUrl}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{connection.type}</Badge>
                        {connection.isPreferred && <Badge variant="secondary">{t('catalog.connections.preferred')}</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium">{connection.syncSchedule || '-'}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(connection.lastSyncedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant[connection.lastSyncStatus] || 'outline'}>{connection.lastSyncStatus || 'NEVER'}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => syncConnection.mutate({ id, mode: 'MANUAL' })} disabled={syncConnection.isPending} aria-label={t('catalog.connections.actionSync')}>
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLogConnectionId(logConnectionId === id ? null : id)} aria-label={t('catalog.connections.actionLogs')}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(connection); setFormOpen(true); }} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" aria-label={t('common.delete')}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t('catalog.connections.deleteTitle', 'Delete this connection?')}</AlertDialogTitle>
                              <AlertDialogDescription>{t('common.cannotUndo')}</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => removeConnection.mutate(id)}>
                                {t('common.delete')}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <TablePagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={setPage} />
        </div>
      </ListPage.Body>

      {logConnectionId && (
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-medium">{t('catalog.connections.history')}</div>
          <div className="divide-y">
            {logs.length === 0 ? (
              <div className="px-4 py-6 text-sm text-muted-foreground">{t('catalog.connections.noHistory')}</div>
            ) : logs.map((log) => (
              <div key={log._id || log.id} className="grid grid-cols-5 gap-3 px-4 py-3 text-xs">
                <div className="font-medium">{log.status}</div>
                <div>{log.mode}</div>
                <div>{t('catalog.connections.logCreated')} {log.created ?? 0}</div>
                <div>{t('catalog.connections.logUpdated')} {log.updated ?? 0}</div>
                <div className="text-right text-muted-foreground">{formatDate(log.completedAt || log.createdAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ConnectionDialog
        key={`${formOpen ? 'open' : 'closed'}-${editing?._id || editing?.id || 'new'}`}
        open={formOpen}
        onOpenChange={setFormOpen}
        connection={editing}
        onCreate={(data) => createConnection.mutateAsync(data)}
        onUpdate={(id, data) => updateConnection.mutateAsync({ id, data })}
        isSaving={createConnection.isPending || updateConnection.isPending}
        mutationError={createConnection.error || updateConnection.error}
      />
    </ListPage>
  );
}

function ConnectionDialog({ open, onOpenChange, connection, onCreate, onUpdate, isSaving = false, mutationError = null }) {
  const { t } = useLanguage();
  const { data: categories = [] } = useCatalogCategoryOptions();
  const [activeStep, setActiveStep] = useState(0);
  const schema = useMemo(() => createConnectionSchema(t), [t]);
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: DEFAULT_VALUES,
    mode: 'onBlur',
  });
  const { control, handleSubmit, reset, trigger, formState: { isSubmitting } } = form;
  const values = useWatch({ control });
  const busy = isSubmitting || isSaving;

  const steps = useMemo(() => [
    {
      key: 'source',
      icon: PlugZap,
      label: t('catalog.connections.stepSource'),
      description: t('catalog.connections.stepSourceDescription'),
      fields: STEP_FIELDS[0],
    },
    {
      key: 'mapping',
      icon: Settings2,
      label: t('catalog.connections.stepMapping'),
      description: t('catalog.connections.stepMappingDescription'),
      fields: STEP_FIELDS[1],
    },
    {
      key: 'security',
      icon: ShieldCheck,
      label: t('catalog.connections.stepSecurity'),
      description: t('catalog.connections.stepSecurityDescription'),
      fields: STEP_FIELDS[2],
    },
  ], [t]);

  useEffect(() => {
    if (!open) return;
    reset(connection ? {
      ...DEFAULT_VALUES, ...connection,
      defaultCategoryId: connection.defaultCategoryId?._id || connection.defaultCategoryId || '',
      credentials: { apiKey: '', token: '', username: '', password: '' },
    } : DEFAULT_VALUES);
  }, [connection, open, reset]);

  const title = connection ? t('catalog.connections.editTitle') : t('catalog.connections.createTitle');
  const activeStepConfig = steps[activeStep];
  const ActiveStepIcon = activeStepConfig.icon;
  const isLastStep = activeStep === steps.length - 1;

  const categoryLabel = useMemo(() => {
    const selected = categories.find((category) => (category._id || category.id) === values?.defaultCategoryId);
    return selected?.name || t('catalog.connections.noDefaultCategory');
  }, [categories, t, values?.defaultCategoryId]);

  const goNext = async () => {
    const valid = await trigger(activeStepConfig.fields, { shouldFocus: true });
    if (valid) setActiveStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const goBack = () => {
    setActiveStep((current) => Math.max(current - 1, 0));
  };

  const closeDialog = () => {
    if (!busy) onOpenChange(false);
  };

  const onSubmit = async (values) => {
    const payload = {
      ...values,
      defaultCategoryId: values.defaultCategoryId || null,
      preferredRank: values.preferredRank ?? 100,
      credentials: Object.fromEntries(Object.entries(values.credentials || {}).filter(([, value]) => value)),
    };
    if (connection) await onUpdate(connection._id || connection.id, payload);
    else await onCreate(payload);
    onOpenChange(false);
  };

  const onStepSubmit = (event) => {
    event.preventDefault();
    void goNext();
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) closeDialog(); else onOpenChange(true); }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-5xl overflow-hidden p-0">
        <Form {...form}>
          <form onSubmit={isLastStep ? handleSubmit(onSubmit) : onStepSubmit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="gap-5 border-b border-border/70 bg-card/95 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 pr-10 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <DatabaseZap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription className="mt-1 max-w-2xl">
                      {t('catalog.connections.dialogDescription')}
                    </DialogDescription>
                  </div>
                </div>
                <Badge variant="outline" className="w-fit">
                  {t('catalog.connections.stepStatus', null, { current: activeStep + 1, total: steps.length })}
                </Badge>
              </div>
              <WizardStepper steps={steps} activeStep={activeStep} onStepClick={setActiveStep} t={t} />
          </DialogHeader>

            <DialogBody className="space-y-5 px-5 py-5 sm:px-6">
              {mutationError && (
                <Alert variant="destructive">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>{t('catalog.connections.saveFailed')}</AlertTitle>
                  <AlertDescription>
                    {getMutationMessage(mutationError, t('catalog.connections.saveFailedDescription'))}
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-xl border border-border/70 bg-muted/15 p-4 sm:p-5">
                <div className="mb-5 flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
                    <ActiveStepIcon className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{activeStepConfig.label}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">{activeStepConfig.description}</p>
                  </div>
                </div>

                {activeStep === 0 && (
                  <SourceStep control={control} connection={connection} t={t} />
                )}
                {activeStep === 1 && (
                  <MappingStep control={control} categories={categories} t={t} />
                )}
                {activeStep === 2 && (
                  <SecurityStep
                    control={control}
                    values={values}
                    categoryLabel={categoryLabel}
                    t={t}
                  />
                )}
              </div>
            </DialogBody>

            <DialogFooter className="items-center gap-3 sm:justify-between">
              <p className="text-xs text-muted-foreground sm:mr-auto">
                {isLastStep ? t('catalog.connections.reviewHint') : t('catalog.connections.nextHint')}
              </p>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button type="button" variant="outline" onClick={closeDialog} disabled={busy}>
                  {t('common.cancel')}
                </Button>
                {activeStep > 0 && (
                  <Button type="button" variant="outline" onClick={goBack} disabled={busy}>
                    <ArrowLeft className="h-3.5 w-3.5" />
                    {t('common.back')}
                  </Button>
                )}
                {!isLastStep ? (
                  <Button type="button" onClick={goNext} disabled={busy}>
                    {t('common.next')}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                ) : (
                  <Button type="submit" disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    {busy ? t('common.saving') : t('common.save')}
                  </Button>
                )}
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function WizardStepper({ steps, activeStep, onStepClick, t }) {
  return (
    <nav aria-label={t('catalog.connections.stepperLabel')} className="grid gap-2 lg:grid-cols-3">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const current = index === activeStep;
        const complete = index < activeStep;
        const disabled = index > activeStep;
        return (
          <button
            key={step.key}
            type="button"
            disabled={disabled}
            aria-current={current ? 'step' : undefined}
            onClick={() => onStepClick(index)}
            className={cn(
              'flex min-w-0 items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3 text-left transition-all',
              'hover:border-primary/35 hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/20',
              current && 'border-primary/50 bg-primary/10 shadow-sm ring-1 ring-primary/20',
              complete && 'border-success/40 bg-success/10',
              disabled && 'cursor-not-allowed opacity-55 hover:border-border/70 hover:bg-muted/20',
            )}
          >
            <span className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground',
              current && 'border-primary/30 bg-primary/15 text-primary',
              complete && 'border-success/30 bg-success/15 text-success',
            )}
            >
              {complete ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">{step.label}</span>
              <span className="mt-0.5 line-clamp-2 block text-xs leading-4 text-muted-foreground">{step.description}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function SourceStep({ control, connection, t }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <TextFormField control={control} name="name" label={t('catalog.connections.fieldName')} required />
      <TextFormField
        control={control}
        name="providerKey"
        label={t('catalog.connections.providerKey')}
        required
        disabled={Boolean(connection)}
        inputClassName="uppercase"
        description={connection ? t('catalog.connections.providerKeyLocked') : t('catalog.connections.providerKeyHint')}
      />
      <SelectFormField control={control} name="type" label={t('catalog.connections.type')} options={TYPE_OPTIONS} />
      <SelectFormField control={control} name="format" label={t('catalog.connections.format')} options={FORMAT_OPTIONS} />
      <TextFormField
        control={control}
        name="endpointUrl"
        label={t('catalog.connections.endpointUrl')}
        className="lg:col-span-2"
        placeholder="https://supplier.example/catalog.csv"
        description={t('catalog.connections.endpointHint')}
      />
    </div>
  );
}

function MappingStep({ control, categories, t }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <TextFormField control={control} name="syncSchedule" label={t('catalog.connections.schedule')} placeholder="@daily" />
      <TextFormField control={control} name="supplierName" label={t('catalog.connections.supplier')} />
      <TextFormField control={control} name="manufacturerName" label={t('catalog.connections.manufacturer')} />
      <FormField
        control={control}
        name="defaultCategoryId"
        render={({ field }) => (
          <FormItem>
            <FormLabel>{t('catalog.connections.defaultCategory')}</FormLabel>
            <Select value={field.value || NO_CATEGORY} onValueChange={(value) => field.onChange(value === NO_CATEGORY ? '' : value)}>
              <FormControl>
                <SelectTrigger className="h-11">
                  <SelectValue placeholder={t('catalog.connections.categoryPlaceholder')} />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>{t('catalog.connections.noDefaultCategory')}</SelectItem>
                {categories.map((category) => (
                  <SelectItem key={category._id || category.id} value={category._id || category.id}>{category.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormDescription>{t('catalog.connections.categoryHint')}</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
      <TextFormField
        control={control}
        name="defaultMarkupPercent"
        label={t('catalog.connections.defaultMarkupPercent')}
        type="number"
        step="0.01"
        description={t('catalog.connections.markupHint')}
      />
      <TextFormField
        control={control}
        name="defaultMarginPercent"
        label={t('catalog.connections.defaultMarginPercent')}
        type="number"
        step="0.01"
        description={t('catalog.connections.marginHint')}
      />
    </div>
  );
}

function SecurityStep({ control, values, categoryLabel, t }) {
  const credentialCount = Object.values(values?.credentials || {}).filter(Boolean).length;
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextFormField control={control} name="credentials.apiKey" label={t('catalog.connections.apiKey')} type="password" autoComplete="off" />
          <TextFormField control={control} name="credentials.token" label={t('catalog.connections.token')} type="password" autoComplete="off" />
          <TextFormField control={control} name="credentials.username" label={t('catalog.connections.username')} autoComplete="off" />
          <TextFormField control={control} name="credentials.password" label={t('catalog.connections.password')} type="password" autoComplete="new-password" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CheckboxFormField
            control={control}
            name="isEnabled"
            icon={ShieldCheck}
            label={t('catalog.connections.enabled')}
            description={t('catalog.connections.enabledHint')}
          />
          <CheckboxFormField
            control={control}
            name="isPreferred"
            icon={CheckCircle2}
            label={t('catalog.connections.preferred')}
            description={t('catalog.connections.preferredHint')}
          />
        </div>
        <TextFormField
          control={control}
          name="preferredRank"
          label={t('catalog.connections.rank')}
          type="number"
          min="0"
          step="1"
          className="max-w-xs"
          description={t('catalog.connections.rankHint')}
        />
      </div>

      <div className="rounded-xl border border-border/70 bg-card/60 p-4">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{t('catalog.connections.reviewTitle')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('catalog.connections.reviewDescription')}</p>
          </div>
          <Badge variant={credentialCount > 0 ? 'success' : 'secondary'}>
            <KeyRound className="h-3 w-3" />
            {credentialCount > 0 ? t('catalog.connections.credentialsSet') : t('catalog.connections.credentialsEmpty')}
          </Badge>
        </div>
        <dl className="space-y-3 text-sm">
          <ReviewRow label={t('catalog.connections.fieldName')} value={displayValue(values?.name)} />
          <ReviewRow label={t('catalog.connections.providerKey')} value={displayValue(values?.providerKey)} />
          <ReviewRow label={t('catalog.connections.type')} value={displayValue(values?.type)} />
          <ReviewRow label={t('catalog.connections.format')} value={displayValue(values?.format)} />
          <ReviewRow label={t('catalog.connections.defaultCategory')} value={categoryLabel} />
          <ReviewRow label={t('catalog.connections.schedule')} value={displayValue(values?.syncSchedule)} />
          <ReviewRow label={t('catalog.connections.rank')} value={displayValue(values?.preferredRank ?? 100)} />
        </dl>
      </div>
    </div>
  );
}

function TextFormField({
  control,
  name,
  label,
  description,
  required = false,
  className,
  inputClassName,
  type = 'text',
  ...inputProps
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel>
            {label}{required && <span className="ml-1 text-destructive">*</span>}
          </FormLabel>
          <FormControl>
            <Input
              {...field}
              {...inputProps}
              type={type}
              value={field.value ?? ''}
              className={cn('h-11', inputClassName)}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function SelectFormField({ control, name, label, options }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select value={field.value} onValueChange={field.onChange}>
            <FormControl>
              <SelectTrigger className="h-11">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>{options.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function CheckboxFormField({ control, name, icon: Icon, label, description }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex h-full items-start gap-3 rounded-xl border border-border/70 bg-muted/20 p-4 transition-colors hover:border-primary/35 hover:bg-muted/35">
            <FormControl>
              <Checkbox checked={Boolean(field.value)} onCheckedChange={(value) => field.onChange(Boolean(value))} className="mt-1" />
            </FormControl>
            <div className="flex min-w-0 gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <FormLabel className="block text-sm font-semibold text-foreground">{label}</FormLabel>
                <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
              </div>
            </div>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ReviewRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 pb-2.5 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[12rem] truncate text-right font-medium">{value}</dd>
    </div>
  );
}
