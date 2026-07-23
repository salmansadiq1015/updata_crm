'use client';

import { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  PauseCircle,
  PlayCircle,
  Plus,
  Repeat2,
  Save,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  RECURRENCE_FREQUENCIES,
  RECURRING_TRANSACTION_STATUSES,
  RECURRING_TRANSACTION_TYPES,
} from '@/modules/accounting/constants/accounting-constants';
import { useRecurringTransactionMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import {
  useRecurringTransactionRuns,
  useRecurringTransactionSummary,
  useRecurringTransactions,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { formatDate } from '@/modules/accounting/utils/accounting-ui';
import {
  buildRecurringFilters,
  buildRecurringPayload,
  defaultRecurringFilters,
  defaultRecurringForm,
  defaultTemplatePayload,
  isRecurringFormValid,
  recurringStatusClass,
  recurringTypeLabel,
} from '@/modules/accounting/utils/recurring-transactions';

function SelectField({ value, onValueChange, options, includeAll = false, getLabel = (option) => option }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="ALL">All</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option} value={option}>{getLabel(option)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-cyan-100">
      <div className="text-xs font-semibold uppercase opacity-75">{label}</div>
      <div className="mt-4 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${recurringStatusClass(status)}`}>
      {status}
    </span>
  );
}

function RecurringDialog({ open, form, error, pending, de, onChange, onClose, onSubmit }) {
  const valid = isRecurringFormValid(form);

  const changeType = (type) => {
    onChange('transactionType', type);
    onChange('templatePayloadText', JSON.stringify(defaultTemplatePayload(type), null, 2));
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{de ? 'Wiederkehrende Buchung' : 'Recurring transaction'}</DialogTitle>
        </DialogHeader>
        <form id="recurring-form" onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label className="text-xs">{de ? 'Name' : 'Name'}</Label>
              <Input className="h-9" value={form.name} onChange={(event) => onChange('name', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Typ' : 'Type'}</Label>
              <SelectField value={form.transactionType} onValueChange={changeType} options={RECURRING_TRANSACTION_TYPES} getLabel={recurringTypeLabel} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Frequenz' : 'Frequency'}</Label>
              <SelectField value={form.frequency} onValueChange={(value) => onChange('frequency', value)} options={RECURRENCE_FREQUENCIES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Intervall' : 'Interval'}</Label>
              <Input className="h-9" type="number" min="1" value={form.interval} onChange={(event) => onChange('interval', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Start' : 'Start'}</Label>
              <Input className="h-9" type="date" value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Nächster Lauf' : 'Next run'}</Label>
              <Input className="h-9" type="date" value={form.nextRunDate} onChange={(event) => onChange('nextRunDate', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Ende' : 'End'}</Label>
              <Input className="h-9" type="date" value={form.endDate} onChange={(event) => onChange('endDate', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Max. Läufe' : 'Max runs'}</Label>
              <Input className="h-9" type="number" min="1" value={form.maxRuns} onChange={(event) => onChange('maxRuns', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-4">
              <Label className="text-xs">{de ? 'Beschreibung' : 'Description'}</Label>
              <Input className="h-9" value={form.description} onChange={(event) => onChange('description', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-4">
              <Label className="text-xs">{de ? 'Vorlage' : 'Template payload'}</Label>
              <Textarea
                className="min-h-64 font-mono text-xs"
                value={form.templatePayloadText}
                onChange={(event) => onChange('templatePayloadText', event.target.value)}
                spellCheck={false}
              />
              {error && <div className="text-xs font-medium text-red-300">{error}</div>}
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="submit" form="recurring-form" disabled={!valid || pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? '...' : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RecurringTransactionsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useState(defaultRecurringFilters());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultRecurringForm());
  const [formError, setFormError] = useState('');
  const params = useMemo(() => buildRecurringFilters(filters), [filters]);
  const { data: recurring = [], isLoading, isError } = useRecurringTransactions(params);
  const { data: summary, isLoading: summaryLoading } = useRecurringTransactionSummary();
  const { data: runs = [], isLoading: runsLoading } = useRecurringTransactionRuns({ limit: 8 });
  const {
    createRecurringTransaction,
    activateRecurringTransaction,
    pauseRecurringTransaction,
    archiveRecurringTransaction,
    runRecurringTransaction,
    runDueRecurringTransactions,
  } = useRecurringTransactionMutations();

  const pending = createRecurringTransaction.isPending;
  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const setRecurringForm = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const closeDialog = () => {
    setDialogOpen(false);
    setForm(defaultRecurringForm());
    setFormError('');
  };

  const submitRecurring = async (event) => {
    event.preventDefault();
    try {
      await createRecurringTransaction.mutateAsync(buildRecurringPayload(form));
      closeDialog();
    } catch (err) {
      setFormError(err.message || 'Invalid recurring template');
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
            <Repeat2 className="h-3.5 w-3.5" />
            {de ? 'Automatisierung' : 'Automation'}
          </div>
          <h1 className="text-2xl font-bold">{de ? 'Wiederkehrende Transaktionen' : 'Recurring Transactions'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {de
              ? 'Geplante Journale, Lieferantenrechnungen und Kundenrechnungen mit Laufhistorie.'
              : 'Scheduled journals, supplier bills, and sales invoices with run history.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => runDueRecurringTransactions.mutateAsync({})}
            disabled={runDueRecurringTransactions.isPending}
          >
            <Sparkles className="mr-1.5 h-4 w-4" />
            {de ? 'Fällige ausführen' : 'Run Due'}
          </Button>
          <Button type="button" onClick={() => setDialogOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {de ? 'Vorlage' : 'Template'}
          </Button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {summaryLoading ? Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        )) : (
          <>
            <MetricTile label={de ? 'Total' : 'Total'} value={summary?.total ?? 0} />
            <MetricTile label={de ? 'Aktiv' : 'Active'} value={summary?.activeCount ?? 0} />
            <MetricTile label={de ? 'Pausiert' : 'Paused'} value={summary?.pausedCount ?? 0} />
            <MetricTile label={de ? 'Fällig' : 'Due'} value={summary?.dueCount ?? 0} />
          </>
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_12rem_1fr_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <SelectField value={filters.status} onValueChange={(value) => setFilter('status', value)} options={RECURRING_TRANSACTION_STATUSES} includeAll />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Typ' : 'Type'}</Label>
          <SelectField value={filters.transactionType} onValueChange={(value) => setFilter('transactionType', value)} options={RECURRING_TRANSACTION_TYPES} includeAll getLabel={recurringTypeLabel} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Suche' : 'Search'}</Label>
          <Input className="h-9" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => setFilters(defaultRecurringFilters())} className="h-9">Reset</Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_26rem]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">{de ? 'Vorlage' : 'Template'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Plan' : 'Schedule'}</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Läufe' : 'Runs'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Aktion' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td colSpan={5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {!isLoading && isError && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-red-300">{de ? 'Daten konnten nicht geladen werden.' : 'Unable to load recurring transactions.'}</td></tr>
              )}
              {!isLoading && !isError && recurring.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">{de ? 'Keine Vorlagen gefunden.' : 'No recurring templates found.'}</td></tr>
              )}
              {!isLoading && recurring.map((item) => (
                <tr key={item._id} className="border-b border-border/50 align-top">
                  <td className="px-3 py-3">
                    <div className="font-semibold">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.recurringNumber} · {recurringTypeLabel(item.transactionType)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-medium">{item.frequency} / {item.interval || 1}</div>
                    <div className="text-xs text-muted-foreground">{de ? 'Nächster Lauf' : 'Next'}: {formatDate(item.nextRunDate) || '-'}</div>
                  </td>
                  <td className="px-3 py-3"><StatusBadge status={item.status} /></td>
                  <td className="px-3 py-3 text-right tabular-nums">{item.runCount || 0}{item.maxRuns ? ` / ${item.maxRuns}` : ''}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap justify-end gap-2">
                      {['DRAFT', 'PAUSED'].includes(item.status) && (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          aria-label={de ? 'Aktivieren' : 'Activate'}
                          title={de ? 'Aktivieren' : 'Activate'}
                          onClick={() => activateRecurringTransaction.mutateAsync(item._id)}
                        >
                          <PlayCircle className="h-4 w-4" />
                        </Button>
                      )}
                      {item.status === 'ACTIVE' && (
                        <>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={de ? 'Ausführen' : 'Run'}
                            title={de ? 'Ausführen' : 'Run'}
                            onClick={() => runRecurringTransaction.mutateAsync({ id: item._id, data: {} })}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            aria-label={de ? 'Pausieren' : 'Pause'}
                            title={de ? 'Pausieren' : 'Pause'}
                            onClick={() => pauseRecurringTransaction.mutateAsync(item._id)}
                          >
                            <PauseCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      {['DRAFT', 'PAUSED', 'COMPLETED'].includes(item.status) && (
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          aria-label={de ? 'Archivieren' : 'Archive'}
                          title={de ? 'Archivieren' : 'Archive'}
                          onClick={() => archiveRecurringTransaction.mutateAsync(item._id)}
                        >
                          <Archive className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{de ? 'Letzte Läufe' : 'Recent Runs'}</h2>
            <Repeat2 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid gap-2">
            {runsLoading && Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}
            {!runsLoading && runs.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                {de ? 'Noch keine Läufe.' : 'No runs yet.'}
              </div>
            )}
            {!runsLoading && runs.map((run) => (
              <div key={run._id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{run.recurringNumber}</div>
                  <StatusBadge status={run.status} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{run.periodKey} · {formatDate(run.runDate)}</div>
                {run.errorMessage && <div className="mt-2 text-xs text-red-300">{run.errorMessage}</div>}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <RecurringDialog
        open={dialogOpen}
        form={form}
        error={formError}
        pending={pending}
        de={de}
        onChange={setRecurringForm}
        onClose={closeDialog}
        onSubmit={submitRecurring}
      />
    </div>
  );
}
