'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { PlugZap, Plus, RefreshCw, Pencil, Trash2, History, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
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

const ALL = '__all__';
const PAGE_SIZE = 10;
const TYPE_OPTIONS = ['SUPPLIER', 'MANUFACTURER', 'IGH', 'GENERIC'];
const FORMAT_OPTIONS = ['CSV', 'JSON', 'XML'];

const DEFAULT_VALUES = {
  name: '', providerKey: '', type: 'SUPPLIER', format: 'CSV', endpointUrl: '', syncSchedule: '@daily',
  supplierName: '', manufacturerName: '', defaultCategoryId: '', defaultMarkupPercent: '', defaultMarginPercent: '',
  isEnabled: true, isPreferred: false, preferredRank: 100,
  credentials: { apiKey: '', token: '', username: '', password: '' },
};

const statusVariant = { HEALTHY: 'default', RUNNING: 'secondary', FAILED: 'destructive', DISABLED: 'outline', NEVER: 'outline' };

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('de-CH', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function unwrapList(result) {
  return result?.data ?? [];
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
        open={formOpen}
        onOpenChange={setFormOpen}
        connection={editing}
        onCreate={(data) => createConnection.mutateAsync(data)}
        onUpdate={(id, data) => updateConnection.mutateAsync({ id, data })}
      />
    </ListPage>
  );
}

function ConnectionDialog({ open, onOpenChange, connection, onCreate, onUpdate }) {
  const { t } = useLanguage();
  const { data: categories = [] } = useCatalogCategoryOptions();
  const {
    register, handleSubmit, reset, setValue, control, formState: { isSubmitting },
  } = useForm({ defaultValues: DEFAULT_VALUES });
  const type = useWatch({ control, name: 'type' });
  const format = useWatch({ control, name: 'format' });
  const defaultCategoryId = useWatch({ control, name: 'defaultCategoryId' });
  const isEnabled = useWatch({ control, name: 'isEnabled' });
  const isPreferred = useWatch({ control, name: 'isPreferred' });

  useEffect(() => {
    if (!open) return;
    reset(connection ? {
      ...DEFAULT_VALUES, ...connection,
      defaultCategoryId: connection.defaultCategoryId?._id || connection.defaultCategoryId || '',
      credentials: { apiKey: '', token: '', username: '', password: '' },
    } : DEFAULT_VALUES);
  }, [connection, open, reset]);

  const title = connection ? t('catalog.connections.editTitle') : t('catalog.connections.createTitle');
  const onSubmit = async (values) => {
    const payload = {
      ...values,
      defaultCategoryId: values.defaultCategoryId || null,
      credentials: Object.fromEntries(Object.entries(values.credentials || {}).filter(([, value]) => value)),
    };
    if (connection) await onUpdate(connection._id || connection.id, payload);
    else await onCreate(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{t('catalog.connections.dialogDescription')}</DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t('catalog.connections.fieldName')}><Input {...register('name', { required: true })} className="h-8" /></Field>
              <Field label={t('catalog.connections.providerKey')}><Input {...register('providerKey', { required: true })} disabled={Boolean(connection)} className="h-8 uppercase" /></Field>
              <Field label={t('catalog.connections.type')}>
                <Select value={type} onValueChange={(value) => setValue('type', value)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPE_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label={t('catalog.connections.format')}>
                <Select value={format} onValueChange={(value) => setValue('format', value)}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{FORMAT_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>

            <Field label={t('catalog.connections.endpointUrl')}><Input {...register('endpointUrl')} className="h-8" placeholder="https://supplier.example/catalog.csv" /></Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t('catalog.connections.schedule')}><Input {...register('syncSchedule')} className="h-8" placeholder="@daily" /></Field>
              <Field label={t('catalog.connections.supplier')}><Input {...register('supplierName')} className="h-8" /></Field>
              <Field label={t('catalog.connections.manufacturer')}><Input {...register('manufacturerName')} className="h-8" /></Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label={t('catalog.connections.defaultCategory')}>
                <Select value={defaultCategoryId} onValueChange={(value) => setValue('defaultCategoryId', value)}>
                  <SelectTrigger className="h-8"><SelectValue placeholder={t('catalog.connections.categoryPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    {categories.map((category) => (
                      <SelectItem key={category._id || category.id} value={category._id || category.id}>{category.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t('catalog.connections.defaultMarkupPercent')}><Input {...register('defaultMarkupPercent')} type="number" step="0.01" className="h-8" /></Field>
              <Field label={t('catalog.connections.defaultMarginPercent')}><Input {...register('defaultMarginPercent')} type="number" step="0.01" className="h-8" /></Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Field label={t('catalog.connections.apiKey')}><Input {...register('credentials.apiKey')} type="password" className="h-8" /></Field>
              <Field label={t('catalog.connections.token')}><Input {...register('credentials.token')} type="password" className="h-8" /></Field>
              <Field label={t('catalog.connections.username')}><Input {...register('credentials.username')} className="h-8" /></Field>
              <Field label={t('catalog.connections.password')}><Input {...register('credentials.password')} type="password" className="h-8" /></Field>
            </div>

            <div className="flex flex-wrap items-end gap-5">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(isEnabled)} onCheckedChange={(value) => setValue('isEnabled', Boolean(value))} />
                {t('catalog.connections.enabled')}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={Boolean(isPreferred)} onCheckedChange={(value) => setValue('isPreferred', Boolean(value))} />
                {t('catalog.connections.preferred')}
              </label>
              <Field label={t('catalog.connections.rank')} className="w-28"><Input {...register('preferredRank')} type="number" min="0" className="h-8" /></Field>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" size="sm" disabled={isSubmitting}>{isSubmitting ? t('common.saving') : t('common.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children, className = '' }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
