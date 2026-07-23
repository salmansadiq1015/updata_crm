'use client';

import { useMemo, useState } from 'react';
import { Banknote, CalendarDays, Pencil, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useBankAccounts, useCashBalances, useCashForecast } from '@/modules/accounting/hooks/use-accounting-queries';
import { useCashMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';

function sum(items, key) {
  return items.reduce((total, item) => total + Number(item?.[key] || 0), 0);
}

function aggregatePeriods(projections = []) {
  const windows = [7, 14, 30, 60, 90];
  return windows.map((days) => {
    const rows = projections.slice(0, days);
    return {
      days,
      inflows: sum(rows, 'inflows'),
      outflows: sum(rows, 'outflows'),
      netPosition: rows.at(-1)?.netPosition ?? 0,
    };
  });
}

function ManualBalanceDialog({ open, onClose, accounts, de }) {
  const { updateManualBalance } = useCashMutations();
  const [form, setForm] = useState({
    bankAccountId: '',
    balance: '',
    date: new Date().toISOString().slice(0, 10),
  });

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    await updateManualBalance.mutateAsync({
      bankAccountId: form.bankAccountId,
      balance: Number(form.balance),
      date: form.date,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{de ? 'Saldo aktualisieren' : 'Update Balance'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Bankkonto' : 'Bank account'}</Label>
            <Select value={form.bankAccountId} onValueChange={(value) => set('bankAccountId', value)}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder={de ? 'Auswählen' : 'Select'} /></SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account._id} value={account._id}>{account.displayName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Saldo' : 'Balance'}</Label>
              <Input type="number" step="0.01" className="h-9" value={form.balance} onChange={(event) => set('balance', event.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Datum' : 'Date'}</Label>
              <Input type="date" className="h-9" value={form.date} onChange={(event) => set('date', event.target.value)} required />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={updateManualBalance.isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={updateManualBalance.isPending || !form.bankAccountId || !form.balance}>
              {updateManualBalance.isPending ? '...' : (de ? 'Speichern' : 'Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CashManagementPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedDays, setSelectedDays] = useState(30);
  const [scenario, setScenario] = useState({ delayAmount: '', delayBeyondDays: '30' });
  const { data: balances = [], isLoading: balancesLoading } = useCashBalances();
  const { data: forecast, isLoading: forecastLoading } = useCashForecast({ days: 90 });
  const { data: accounts = [] } = useBankAccounts();
  const periods = useMemo(() => aggregatePeriods(forecast?.projections || []), [forecast?.projections]);
  const selectedRows = (forecast?.projections || [])
    .slice(0, selectedDays)
    .filter((row) => Number(row.inflows || 0) !== 0 || Number(row.outflows || 0) !== 0);
  const delayAmount = Math.max(0, Number(scenario.delayAmount || 0));
  const delayBeyondDays = Number(scenario.delayBeyondDays || 0);
  const totalBalance = balances.reduce((total, account) => total + Number(account.balance || 0), 0);

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Liquidität' : 'Cash Management'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {de ? 'Bankguthaben und 90-Tage-Cashflow.' : 'Bank balances and 90-day cash flow.'}
          </p>
        </div>
        <Button size="sm" onClick={() => setManualOpen(true)}>
          <Pencil className="h-4 w-4 mr-1.5" />
          {de ? 'Saldo setzen' : 'Set Balance'}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {balancesLoading || forecastLoading ? (
          Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)
        ) : (
          <>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{de ? 'Bankguthaben' : 'Bank Balance'}</span>
                <Banknote className="h-5 w-5 text-sky-500" />
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{formatMoney(totalBalance)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{de ? 'Nächste 30 Tage' : 'Next 30 Days'}</span>
                <CalendarDays className="h-5 w-5 text-brand-500" />
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{formatMoney(periods[2]?.netPosition)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{de ? '90-Tage Position' : '90-Day Position'}</span>
                {(periods[4]?.netPosition || 0) >= totalBalance ? <TrendingUp className="h-5 w-5 text-emerald-500" /> : <TrendingDown className="h-5 w-5 text-red-500" />}
              </div>
              <p className="mt-3 text-2xl font-bold tabular-nums">{formatMoney(periods[4]?.netPosition)}</p>
            </div>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="border-b border-border bg-muted/30 px-3 py-2.5">
            <h2 className="text-sm font-semibold">{de ? 'Kontosalden' : 'Account Balances'}</h2>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {balances.map((account) => (
                <tr key={account.accountId} className="border-b border-border/50 last:border-0">
                  <td className="px-3 py-3">
                    <p className="font-medium">{account.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{account.iban}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="font-semibold tabular-nums">{formatMoney(account.balance, account.currency)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(account.balanceDate)}</p>
                  </td>
                </tr>
              ))}
              {!balancesLoading && balances.length === 0 && (
                <tr>
                  <td className="px-3 py-10 text-center text-sm text-muted-foreground">{de ? 'Keine Bankkonten.' : 'No bank accounts.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{de ? 'Cashflow-Projektion' : 'Cash Flow Projection'}</h2>
            <div className="flex items-center gap-2 text-xs">
              <Input
                type="number"
                min="0"
                step="0.01"
                className="h-8 w-28"
                value={scenario.delayAmount}
                onChange={(event) => setScenario((current) => ({ ...current, delayAmount: event.target.value }))}
                placeholder={de ? 'Betrag' : 'Amount'}
              />
              <Select value={scenario.delayBeyondDays} onValueChange={(value) => setScenario((current) => ({ ...current, delayBeyondDays: value }))}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">+7d</SelectItem>
                  <SelectItem value="14">+14d</SelectItem>
                  <SelectItem value="30">+30d</SelectItem>
                  <SelectItem value="60">+60d</SelectItem>
                  <SelectItem value="90">+90d</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {periods.map((period) => {
              const inflowWidth = Math.min(100, Math.abs(period.inflows) / Math.max(1, Math.abs(period.inflows) + Math.abs(period.outflows)) * 100);
              const scenarioNet = delayAmount && period.days <= delayBeyondDays
                ? period.netPosition + delayAmount
                : period.netPosition;
              return (
                <button
                  key={period.days}
                  type="button"
                  onClick={() => setSelectedDays(period.days)}
                  className={`grid grid-cols-[4rem_1fr_8rem] items-center gap-3 rounded-lg p-2 text-left text-sm hover:bg-muted/40 ${selectedDays === period.days ? 'bg-muted/50' : ''}`}
                >
                  <span className="text-xs text-muted-foreground">{period.days}d</span>
                  <div className="h-3 rounded-full bg-red-500/20 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${inflowWidth}%` }} />
                  </div>
                  <span className="text-right font-semibold tabular-nums">
                    {formatMoney(scenarioNet)}
                    {delayAmount > 0 && scenarioNet !== period.netPosition && (
                      <span className="block text-[10px] font-normal text-emerald-600">+{formatMoney(delayAmount)}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <div className="border-b border-border bg-muted/30 px-3 py-2.5">
          <h2 className="text-sm font-semibold">
            {de ? `Details ${selectedDays} Tage` : `${selectedDays}-Day Detail`}
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">{de ? 'Datum' : 'Date'}</th>
              <th className="px-3 py-2 text-right">{de ? 'Eingang' : 'Inflows'}</th>
              <th className="px-3 py-2 text-right">{de ? 'Ausgang' : 'Outflows'}</th>
              <th className="px-3 py-2 text-right">{de ? 'Netto' : 'Net Position'}</th>
            </tr>
          </thead>
          <tbody>
            {selectedRows.slice(0, 20).map((row) => (
              <tr key={row.date} className="border-t border-border/50">
                <td className="px-3 py-2">{formatDate(row.date)}</td>
                <td className="px-3 py-2 text-right text-emerald-600 tabular-nums">{formatMoney(row.inflows)}</td>
                <td className="px-3 py-2 text-right text-red-600 tabular-nums">{formatMoney(row.outflows)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(row.netPosition)}</td>
              </tr>
            ))}
            {selectedRows.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">{de ? 'Keine Bewegungen in diesem Zeitraum.' : 'No movements in this period.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <ManualBalanceDialog open={manualOpen} onClose={() => setManualOpen(false)} accounts={accounts} de={de} />
    </div>
  );
}
