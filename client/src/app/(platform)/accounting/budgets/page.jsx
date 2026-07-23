'use client';

import { useMemo, useState } from 'react';
import { BarChart3, CheckCircle2, LockKeyhole, Plus, Save, Trash2 } from 'lucide-react';
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
  ACCOUNTING_CURRENCIES,
  BUDGET_STATUSES,
} from '@/modules/accounting/constants/accounting-constants';
import {
  useAccounts,
  useBudgetSummary,
  useBudgetVariance,
  useBudgets,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { useBudgetMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';
import {
  budgetStatusClass,
  buildBudgetFilters,
  buildBudgetPayload,
  defaultBudgetFilters,
  defaultBudgetForm,
  defaultBudgetLine,
  isBudgetFormValid,
} from '@/modules/accounting/utils/budgets';

function SelectField({ value, onValueChange, options, includeAll = false }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="ALL">All</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricTile({ label, value }) {
  return (
    <div className="rounded-xl border border-sky-300/20 bg-sky-400/10 p-4 text-sky-100">
      <div className="text-xs font-semibold uppercase opacity-75">{label}</div>
      <div className="mt-4 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function BudgetDialog({ open, form, accounts, pending, de, onChange, onLineChange, onAddLine, onRemoveLine, onClose, onSubmit }) {
  const valid = isBudgetFormValid(form);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{de ? 'Budget erstellen' : 'Create budget'}</DialogTitle>
        </DialogHeader>
        <form id="budget-form" onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <Label className="text-xs">{de ? 'Name' : 'Name'}</Label>
              <Input className="h-9" value={form.name} onChange={(event) => onChange('name', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Von' : 'From'}</Label>
              <Input className="h-9" type="date" value={form.startDate} onChange={(event) => onChange('startDate', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Bis' : 'To'}</Label>
              <Input className="h-9" type="date" value={form.endDate} onChange={(event) => onChange('endDate', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Währung' : 'Currency'}</Label>
              <SelectField value={form.currency} onValueChange={(value) => onChange('currency', value)} options={ACCOUNTING_CURRENCIES} />
            </div>
            <div className="flex flex-col gap-1.5 md:col-span-3">
              <Label className="text-xs">{de ? 'Beschreibung' : 'Description'}</Label>
              <Textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} maxLength={500} />
            </div>
          </div>

          <div className="rounded-xl border border-border">
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-sm font-semibold">{de ? 'Budgetzeilen' : 'Budget lines'}</span>
              <Button type="button" size="sm" variant="outline" onClick={onAddLine}>
                <Plus className="mr-1.5 h-4 w-4" />
                {de ? 'Zeile' : 'Line'}
              </Button>
            </div>
            <div className="grid gap-3 p-3">
              {form.lines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-border/70 p-3 md:grid-cols-[1fr_9rem_9rem_8rem_auto] md:items-end">
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{de ? 'Konto' : 'Account'}</Label>
                    <Select value={line.accountId || 'NONE'} onValueChange={(value) => onLineChange(index, 'accountId', value === 'NONE' ? '' : value)}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">{de ? 'Konto wählen' : 'Select account'}</SelectItem>
                        {accounts.map((account) => (
                          <SelectItem key={account._id} value={account._id}>
                            {account.accountNumber} - {account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{de ? 'Von' : 'From'}</Label>
                    <Input className="h-9" type="date" value={line.periodStart} onChange={(event) => onLineChange(index, 'periodStart', event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{de ? 'Bis' : 'To'}</Label>
                    <Input className="h-9" type="date" value={line.periodEnd} onChange={(event) => onLineChange(index, 'periodEnd', event.target.value)} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">{de ? 'Betrag' : 'Amount'}</Label>
                    <Input className="h-9" type="number" min="0" step="0.01" value={line.amount} onChange={(event) => onLineChange(index, 'amount', event.target.value)} />
                  </div>
                  <Button type="button" size="icon" variant="outline" onClick={() => onRemoveLine(index)} disabled={form.lines.length === 1}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="submit" form="budget-form" disabled={!valid || pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? '...' : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BudgetsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useState(defaultBudgetFilters());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(defaultBudgetForm());
  const [selectedBudgetId, setSelectedBudgetId] = useState(null);
  const params = useMemo(() => buildBudgetFilters(filters), [filters]);
  const { data: budgets = [], isLoading, isError } = useBudgets(params);
  const { data: summary, isLoading: summaryLoading } = useBudgetSummary({ currency: filters.currency });
  const { data: variance, isLoading: varianceLoading } = useBudgetVariance(selectedBudgetId);
  const { data: accounts = [] } = useAccounts({ isActive: true });
  const { createBudget, approveBudget, lockBudget } = useBudgetMutations();
  const postingAccounts = accounts.filter((account) => !account.isGroup && account.isActive !== false);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const setBudget = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const setLine = (index, key, value) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [key]: value } : line)),
    }));
  };
  const addLine = () => setForm((current) => ({ ...current, lines: [...current.lines, defaultBudgetLine()] }));
  const removeLine = (index) => setForm((current) => ({
    ...current,
    lines: current.lines.filter((_, lineIndex) => lineIndex !== index),
  }));

  const submitBudget = async (event) => {
    event.preventDefault();
    await createBudget.mutateAsync(buildBudgetPayload(form));
    setForm(defaultBudgetForm());
    setDialogOpen(false);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
            <BarChart3 className="h-3.5 w-3.5" />
            {de ? 'Budgetkontrolle' : 'Budget Control'}
          </div>
          <h1 className="text-2xl font-bold">{de ? 'Budgets' : 'Budgets'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {de
              ? 'Planwerte, Freigaben, gesperrte Baselines und Soll-Ist-Abweichungen.'
              : 'Planned values, approvals, locked baselines, and budget-vs-actual variance.'}
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {de ? 'Budget' : 'Budget'}
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {summaryLoading ? Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        )) : (
          <>
            <MetricTile label={de ? 'Budget total' : 'Total budget'} value={formatMoney(summary?.totalBudget, filters.currency)} />
            <MetricTile label={de ? 'Budgets' : 'Budgets'} value={summary?.budgetCount ?? 0} />
            <MetricTile label={de ? 'Freigegeben' : 'Approved'} value={summary?.approvedCount ?? 0} />
            <MetricTile label={de ? 'Gesperrt' : 'Locked'} value={summary?.lockedCount ?? 0} />
          </>
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_10rem_1fr_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">Status</Label>
          <SelectField value={filters.status} onValueChange={(value) => setFilter('status', value)} options={BUDGET_STATUSES} includeAll />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Währung' : 'Currency'}</Label>
          <SelectField value={filters.currency} onValueChange={(value) => setFilter('currency', value)} options={ACCOUNTING_CURRENCIES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Suche' : 'Search'}</Label>
          <Input className="h-9" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => setFilters(defaultBudgetFilters())} className="h-9">Reset</Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_30rem]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">{de ? 'Budget' : 'Budget'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Periode' : 'Period'}</th>
                <th className="px-3 py-2.5 text-left">Status</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Total' : 'Total'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Aktion' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td colSpan={5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {!isLoading && budgets.map((budget) => (
                <tr key={budget._id} className="border-b border-border/50">
                  <td className="px-3 py-3">
                    <div className="font-semibold">{budget.budgetNumber}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{budget.name}</div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDate(budget.startDate)} - {formatDate(budget.endDate)}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${budgetStatusClass(budget.status)}`}>{budget.status}</span>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(budget.totalBudget, budget.currency)}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setSelectedBudgetId(budget._id)}>
                        {de ? 'Varianz' : 'Variance'}
                      </Button>
                      {budget.status === 'DRAFT' && (
                        <Button type="button" size="sm" variant="outline" onClick={() => approveBudget.mutateAsync(budget._id)}>
                          <CheckCircle2 className="mr-1.5 h-4 w-4" />
                          {de ? 'Freigeben' : 'Approve'}
                        </Button>
                      )}
                      {budget.status === 'APPROVED' && (
                        <Button type="button" size="sm" variant="outline" onClick={() => lockBudget.mutateAsync(budget._id)}>
                          <LockKeyhole className="mr-1.5 h-4 w-4" />
                          {de ? 'Sperren' : 'Lock'}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!isLoading && budgets.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    {isError ? (de ? 'Budgets konnten nicht geladen werden.' : 'Could not load budgets.') : (de ? 'Noch keine Budgets.' : 'No budgets yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">
            {de ? 'Soll-Ist' : 'Budget vs Actual'}
          </div>
          {!selectedBudgetId && (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {de ? 'Budget auswählen, um Varianz zu sehen.' : 'Select a budget to view variance.'}
            </div>
          )}
          {selectedBudgetId && varianceLoading && <div className="p-4"><Skeleton className="h-40 w-full" /></div>}
          {selectedBudgetId && variance && (
            <div className="p-4">
              <div className="grid gap-2 rounded-lg border border-border/70 p-3 text-sm">
                <div className="flex justify-between"><span>{de ? 'Budget' : 'Budget'}</span><strong>{formatMoney(variance.totalBudget, variance.currency)}</strong></div>
                <div className="flex justify-between"><span>{de ? 'Ist' : 'Actual'}</span><strong>{formatMoney(variance.totalActual, variance.currency)}</strong></div>
                <div className="flex justify-between"><span>{de ? 'Abweichung' : 'Variance'}</span><strong>{formatMoney(variance.totalVariance, variance.currency)}</strong></div>
              </div>
              <div className="mt-4 max-h-96 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="text-muted-foreground">
                    <tr>
                      <th className="py-2 text-left">{de ? 'Konto' : 'Account'}</th>
                      <th className="py-2 text-right">{de ? 'Budget' : 'Budget'}</th>
                      <th className="py-2 text-right">{de ? 'Ist' : 'Actual'}</th>
                      <th className="py-2 text-right">{de ? 'Varianz' : 'Variance'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {variance.rows.map((row) => (
                      <tr key={row.lineId || `${row.accountId}-${row.period}`} className="border-t border-border/50">
                        <td className="py-2">
                          <div className="font-medium">{row.accountNumber}</div>
                          <div className="text-muted-foreground">{row.period}</div>
                        </td>
                        <td className="py-2 text-right">{formatMoney(row.budgetAmount, variance.currency)}</td>
                        <td className="py-2 text-right">{formatMoney(row.actualAmount, variance.currency)}</td>
                        <td className="py-2 text-right font-semibold">{formatMoney(row.variance, variance.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </section>

      <BudgetDialog
        open={dialogOpen}
        form={form}
        accounts={postingAccounts}
        pending={createBudget.isPending}
        de={de}
        onChange={setBudget}
        onLineChange={setLine}
        onAddLine={addLine}
        onRemoveLine={removeLine}
        onClose={() => setDialogOpen(false)}
        onSubmit={submitBudget}
      />
    </div>
  );
}
