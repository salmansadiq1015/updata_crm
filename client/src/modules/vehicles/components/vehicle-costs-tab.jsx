'use client';

import { useState } from 'react';
import {
  Plus, Wallet, Trash2, Loader2, Fuel, Zap, Receipt, ParkingMeter, ShieldCheck, Landmark, KeyRound, Gavel, Sparkles, Package, Wrench, CircleDollarSign,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useVehicleCosts, useVehicleMutations } from '../hooks/use-vehicles';
import { VEHICLE_COST_TYPES, CURRENCIES, useFleetFormat } from '../lib/fleet-meta';

const COST_ICONS = {
  fuel: Fuel, charging: Zap, toll: Receipt, parking: ParkingMeter, insurance: ShieldCheck, tax: Landmark,
  leasing: KeyRound, fine: Gavel, cleaning: Sparkles, accessories: Package, service: Wrench, other: CircleDollarSign,
};
const today = () => new Date().toISOString().slice(0, 10);
const blank = (currency) => ({ type: 'fuel', date: today(), amount: '', currency, quantity: '', meterReading: '', vendor: '', note: '' });

export function VehicleCostsTab({ vehicle, canWrite }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const id = vehicle._id;
  const unit = vehicle.meterUnit || 'km';
  const [filter, setFilter] = useState('all');
  const { data, isLoading } = useVehicleCosts(id, filter === 'all' ? undefined : { type: filter });
  const { addCost, deleteCost } = useVehicleMutations(id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(() => blank(vehicle.currency || 'CHF'));
  const [deleteTarget, setDeleteTarget] = useState(null);
  const items = data?.items || [];
  const summary = data?.summary || { totals: [], byType: [], consumption: [] };
  const primary = summary.totals[0];
  const maxType = Math.max(1, ...summary.byType.filter((r) => r.currency === primary?.currency).map((r) => r.amount));
  const set = (k, v) => setForm((s) => ({ ...s, [k]: v }));
  const energy = form.type === 'fuel' || form.type === 'charging';

  const submit = async (e) => {
    e.preventDefault();
    if (form.amount === '' || !form.date) return;
    await addCost.mutateAsync({
      type: form.type,
      date: form.date,
      amount: Number(form.amount),
      currency: form.currency,
      ...(energy && form.quantity !== '' ? { quantity: Number(form.quantity), quantityUnit: form.type === 'charging' ? 'kwh' : 'l' } : {}),
      ...(form.meterReading !== '' ? { meterReading: Number(form.meterReading) } : {}),
      ...(form.vendor.trim() ? { vendor: form.vendor.trim() } : {}),
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
    }).then(() => { setOpen(false); setForm(blank(vehicle.currency || 'CHF')); }).catch(() => {});
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-sky-500/10 via-card to-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t('fleet.costs.total', 'Total recorded')}</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-32" /> : (
            <p className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-foreground">{primary ? f.money(primary.amount, primary.currency) : f.money(0, vehicle.currency || 'CHF')}</p>
          )}
          {summary.totals.slice(1).map((r) => <p key={r.currency} className="text-sm tabular-nums text-muted-foreground">+ {f.money(r.amount, r.currency)}</p>)}
          <p className="mt-2 text-xs text-muted-foreground">{t('fleet.costs.totalHint', 'Running costs plus service invoices')}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t('fleet.costs.consumption', 'Average consumption')}</p>
          {summary.consumption.filter((c) => c.per100 != null).length ? summary.consumption.filter((c) => c.per100 != null).map((c) => (
            <p key={c.unit} className="mt-1.5 text-3xl font-semibold tabular-nums tracking-tight text-foreground">
              {f.number(c.per100)} <span className="text-base font-medium text-muted-foreground">{c.unit === 'kwh' ? 'kWh' : 'l'}/100 {unit}</span>
            </p>
          )) : <p className="mt-2 text-sm text-muted-foreground">{t('fleet.costs.consumptionHint', 'Log two or more fills with quantity and meter reading.')}</p>}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{t('fleet.costs.breakdown', 'Breakdown')}</p>
          <ul className="space-y-2">
            {summary.byType.filter((r) => r.currency === primary?.currency).slice(0, 5).map((r) => {
              const Icon = COST_ICONS[r.type] || CircleDollarSign;
              return (
                <li key={r.type} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Icon className="size-3.5" aria-hidden="true" />{t(`fleet.cost.${r.type}`, r.type)}</span>
                    <span className="tabular-nums font-medium text-foreground">{f.money(r.amount, r.currency)}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400" style={{ width: `${Math.max(4, (r.amount / maxType) * 100)}%` }} /></div>
                </li>
              );
            })}
            {!summary.byType.length && !isLoading ? <li className="text-sm text-muted-foreground">—</li> : null}
          </ul>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="h-9 w-[200px] rounded-xl"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('fleet.costs.allTypes', 'All cost types')}</SelectItem>
            {VEHICLE_COST_TYPES.map((c) => <SelectItem key={c} value={c}>{t(`fleet.cost.${c}`, c)}</SelectItem>)}
          </SelectContent>
        </Select>
        {canWrite ? <Button size="sm" className="gap-2 rounded-full" onClick={() => setOpen(true)}><Plus className="size-4" />{t('fleet.costs.add', 'Log cost')}</Button> : null}
      </div>

      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : !items.length ? (
        <EmptyState icon={Wallet} title={t('fleet.costs.empty', 'No costs logged yet')} description={t('fleet.costs.emptyDesc', 'Track fuel, charging, tolls, parking and more — or tell the AI assistant “Filled 60 litres for 110 CHF”.')} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {items.map((c) => {
            const Icon = COST_ICONS[c.type] || CircleDollarSign;
            return (
              <li key={c._id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/10"><Icon className="size-4 text-sky-600 dark:text-sky-300" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {t(`fleet.cost.${c.type}`, c.type)}{c.vendor ? <span className="text-muted-foreground"> · {c.vendor}</span> : null}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {f.date(c.date)}
                    {c.quantity != null ? ` · ${f.number(c.quantity)} ${c.quantityUnit === 'kwh' ? 'kWh' : c.quantityUnit || ''}` : ''}
                    {c.meterReading != null ? ` · ${f.meter(c.meterReading, unit)}` : ''}
                    {c.note ? ` · ${c.note}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">{f.money(c.amount, c.currency, 2)}</span>
                {canWrite ? (
                  <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(c)} aria-label={t('common.delete', 'Delete')}>
                    <Trash2 className="size-4" />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('fleet.costs.add', 'Log cost')}</DialogTitle>
            <DialogDescription>{t('fleet.costs.addDesc', 'A higher meter reading also updates the vehicle.')}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {VEHICLE_COST_TYPES.slice(0, 8).map((c) => {
                const Icon = COST_ICONS[c];
                return (
                  <button key={c} type="button" onClick={() => set('type', c)} aria-pressed={form.type === c}
                    className={cn('flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition', form.type === c ? 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-200' : 'border-border text-muted-foreground hover:text-foreground')}>
                    <Icon className="size-4" aria-hidden="true" />{t(`fleet.cost.${c}`, c)}
                  </button>
                );
              })}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="c-date">{t('fleet.field.date', 'Date')} *</Label><Input id="c-date" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} required /></div>
              <div className="grid grid-cols-[1fr_92px] gap-2">
                <div className="space-y-1.5"><Label htmlFor="c-amount">{t('fleet.field.amount', 'Amount')} *</Label><Input id="c-amount" type="number" step="0.01" min="0" inputMode="decimal" value={form.amount} onChange={(e) => set('amount', e.target.value)} required /></div>
                <div className="space-y-1.5"><Label>{t('fleet.field.currency', 'Currency')}</Label>
                  <Select value={form.currency} onValueChange={(v) => set('currency', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
                </div>
              </div>
              {energy ? <div className="space-y-1.5"><Label htmlFor="c-qty">{form.type === 'charging' ? t('fleet.costs.kwh', 'Energy (kWh)') : t('fleet.costs.litres', 'Quantity (litres)')}</Label><Input id="c-qty" type="number" step="0.01" min="0" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} /></div> : null}
              <div className="space-y-1.5"><Label htmlFor="c-meter">{t('fleet.field.meterReading', 'Meter reading ({unit})', { unit })}</Label><Input id="c-meter" type="number" min="0" value={form.meterReading} onChange={(e) => set('meterReading', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-vendor">{t('fleet.field.vendor', 'Vendor / station')}</Label><Input id="c-vendor" value={form.vendor} onChange={(e) => set('vendor', e.target.value)} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="c-note">{t('fleet.field.note', 'Note')}</Label><Input id="c-note" value={form.note} onChange={(e) => set('note', e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
              <Button type="submit" className="gap-2" disabled={addCost.isPending || form.amount === ''}>
                {addCost.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{t('common.save', 'Save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('fleet.costs.deleteTitle', 'Delete cost entry?')}
        description={t('fleet.costs.deleteDesc', 'The entry is removed from the totals.')}
        confirmText={t('common.delete', 'Delete')}
        variant="destructive"
        onConfirm={async () => { await deleteCost.mutateAsync(deleteTarget._id); setDeleteTarget(null); }}
        isLoading={deleteCost.isPending}
      />
    </div>
  );
}
