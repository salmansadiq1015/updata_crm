'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { PlugZap, Plus, RefreshCw, Pencil, Trash2, History } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useLanguage } from '@/lib/i18n/language-context';
import { useCatalogCategoryOptions, useCatalogConnections, useCatalogConnectionLogs } from '../hooks/use-catalog-queries';
import { useCatalogConnectionMutations } from '../hooks/use-catalog-mutations';

const DEFAULT_VALUES = {
  name: '',
  providerKey: '',
  type: 'SUPPLIER',
  format: 'CSV',
  endpointUrl: '',
  syncSchedule: '@daily',
  supplierName: '',
  manufacturerName: '',
  defaultCategoryId: '',
  defaultMarkupPercent: '',
  defaultMarginPercent: '',
  isEnabled: true,
  isPreferred: false,
  preferredRank: 100,
  credentials: { apiKey: '', token: '', username: '', password: '' },
};

const statusVariant = {
  HEALTHY: 'default',
  RUNNING: 'secondary',
  FAILED: 'destructive',
  DISABLED: 'outline',
  NEVER: 'outline',
};

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
  const { data: result = { data: [] }, isLoading, isError } = useCatalogConnections({ limit: 100 });
  const { data: logs = [] } = useCatalogConnectionLogs(logConnectionId);
  const { createConnection, updateConnection, removeConnection, syncConnection } = useCatalogConnectionMutations();
  const connections = unwrapList(result);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button size="sm" className="h-8 gap-1.5" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5" />
          {t('catalog.connections.add')}
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-12 text-sm text-destructive">
            {t('catalog.connections.loadError')}
          </div>
        ) : connections.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16">
            <PlugZap className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {t('catalog.connections.empty')}
            </p>
            <Button variant="outline" size="sm" onClick={openCreate}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              {t('catalog.connections.createFirst')}
            </Button>
          </div>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.connections.table.catalog')}
                </th>
                <th className="w-32 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.connections.table.type')}
                </th>
                <th className="w-44 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.connections.table.sync')}
                </th>
                <th className="w-36 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.connections.table.status')}
                </th>
                <th className="w-44 px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('catalog.connections.table.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {connections.map((connection) => {
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
                      <Badge variant={statusVariant[connection.lastSyncStatus] || 'outline'}>
                        {connection.lastSyncStatus || 'NEVER'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => syncConnection.mutate({ id, mode: 'MANUAL' })}
                          disabled={syncConnection.isPending}
                          aria-label={t('catalog.connections.actionSync')}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setLogConnectionId(logConnectionId === id ? null : id)} aria-label={t('catalog.connections.actionLogs')}>
                          <History className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditing(connection); setFormOpen(true); }} aria-label={t('common.edit')}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => confirm(t('catalog.connections.deleteConfirm')) && removeConnection.mutate(id)}
                          aria-label={t('common.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
    </div>
  );
}

function ConnectionDialog({ open, onOpenChange, connection, onCreate, onUpdate }) {
  const { t } = useLanguage();
  const { data: categories = [] } = useCatalogCategoryOptions();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { isSubmitting },
  } = useForm({ defaultValues: DEFAULT_VALUES });
  const type = useWatch({ control, name: 'type' });
  const format = useWatch({ control, name: 'format' });
  const defaultCategoryId = useWatch({ control, name: 'defaultCategoryId' });
  const isEnabled = useWatch({ control, name: 'isEnabled' });
  const isPreferred = useWatch({ control, name: 'isPreferred' });

  useEffect(() => {
    if (!open) return;
    reset(connection ? {
      ...DEFAULT_VALUES,
      ...connection,
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

  const typeOptions = useMemo(() => ['SUPPLIER', 'MANUFACTURER', 'IGH', 'GENERIC'], []);
  const formatOptions = useMemo(() => ['CSV', 'JSON', 'XML'], []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('catalog.connections.dialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('catalog.connections.fieldName')}><Input {...register('name', { required: true })} className="h-8" /></Field>
            <Field label={t('catalog.connections.providerKey')}><Input {...register('providerKey', { required: true })} disabled={Boolean(connection)} className="h-8 uppercase" /></Field>
            <Field label={t('catalog.connections.type')}>
              <Select value={type} onValueChange={(value) => setValue('type', value)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{typeOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label={t('catalog.connections.format')}>
              <Select value={format} onValueChange={(value) => setValue('format', value)}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{formatOptions.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
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

          <div className="flex flex-wrap gap-5">
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
