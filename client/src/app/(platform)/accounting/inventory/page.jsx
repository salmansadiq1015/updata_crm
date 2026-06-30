'use client';

import { useMemo, useState } from 'react';
import { Boxes, CheckCircle2, Layers3, PackageCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  ACCOUNTING_CURRENCIES,
  INVENTORY_COSTING_METHODS,
} from '@/modules/accounting/constants/accounting-constants';
import { useInventoryAccountingMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import {
  useInventoryAccountingEntries,
  useInventoryMovements,
  useInventoryValuation,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';
import {
  buildInventoryMovementParams,
  buildInventoryPostingPayload,
  buildInventoryValuationParams,
  defaultInventoryFilters,
  movementDirectionClass,
  movementDirectionLabel,
} from '@/modules/accounting/utils/inventory-accounting';

function SelectField({ value, onValueChange, options }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricTile({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-emerald-50">
      <div className="text-xs font-semibold uppercase opacity-75">{label}</div>
      <div className="mt-4 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-emerald-100/70">{sub}</div>}
    </div>
  );
}

export default function InventoryAccountingPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useState(defaultInventoryFilters());
  const valuationParams = useMemo(() => buildInventoryValuationParams(filters), [filters]);
  const movementParams = useMemo(() => buildInventoryMovementParams(filters), [filters]);
  const { data: valuation, isLoading: valuationLoading } = useInventoryValuation(valuationParams);
  const { data: movements, isLoading: movementsLoading, isError: movementsError } = useInventoryMovements(movementParams);
  const { data: entries = [], isLoading: entriesLoading } = useInventoryAccountingEntries({
    currency: filters.currency,
    costingMethod: filters.costingMethod,
    limit: 8,
  });
  const { postInventoryMovement, postInventoryPeriod } = useInventoryAccountingMutations();

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const unpostedLines = movements?.lines || [];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-300/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            <Boxes className="h-3.5 w-3.5" />
            {de ? 'Bestandsbewertung' : 'Inventory Accounting'}
          </div>
          <h1 className="text-2xl font-bold">{de ? 'Inventory Accounting' : 'Inventory Accounting'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {de
              ? 'Bewertung, Kostenmethode und Journalbuchungen fuer Lagerbewegungen.'
              : 'Valuation, costing method, and journal postings for stock movements.'}
          </p>
        </div>
        <Button
          type="button"
          onClick={() => postInventoryPeriod.mutateAsync(buildInventoryPostingPayload(filters))}
          disabled={postInventoryPeriod.isPending || unpostedLines.length === 0}
        >
          <PackageCheck className="mr-1.5 h-4 w-4" />
          {postInventoryPeriod.isPending ? '...' : (de ? 'Periode buchen' : 'Post Period')}
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {valuationLoading ? Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        )) : (
          <>
            <MetricTile label={de ? 'Bestandswert' : 'Inventory value'} value={formatMoney(valuation?.totalValue, filters.currency)} sub={valuation?.costingMethod} />
            <MetricTile label={de ? 'Artikel' : 'Items'} value={valuation?.lineCount ?? 0} />
            <MetricTile label={de ? 'Ohne Kosten' : 'Zero cost'} value={valuation?.zeroCostCount ?? 0} />
            <MetricTile label={de ? 'Ungebucht' : 'Unposted'} value={unpostedLines.length} />
          </>
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_14rem_10rem_10rem_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Waehrung' : 'Currency'}</Label>
          <SelectField value={filters.currency} onValueChange={(value) => setFilter('currency', value)} options={ACCOUNTING_CURRENCIES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Kostenmethode' : 'Costing method'}</Label>
          <SelectField value={filters.costingMethod} onValueChange={(value) => setFilter('costingMethod', value)} options={INVENTORY_COSTING_METHODS} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Von' : 'From'}</Label>
          <Input className="h-9" type="date" value={filters.startDate} onChange={(event) => setFilter('startDate', event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Bis' : 'To'}</Label>
          <Input className="h-9" type="date" value={filters.endDate} onChange={(event) => setFilter('endDate', event.target.value)} />
        </div>
        <Button type="button" variant="outline" onClick={() => setFilters(defaultInventoryFilters())} className="h-9">Reset</Button>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_26rem]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">{de ? 'Bewegung' : 'Movement'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Artikel' : 'Item'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Menge' : 'Qty'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Wert' : 'Value'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Aktion' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {movementsLoading && Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td colSpan={5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {!movementsLoading && movementsError && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-red-300">{de ? 'Bewegungen konnten nicht geladen werden.' : 'Unable to load movements.'}</td></tr>
              )}
              {!movementsLoading && !movementsError && unpostedLines.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">{de ? 'Keine ungebuchten Bewegungen.' : 'No unposted movements.'}</td></tr>
              )}
              {!movementsLoading && unpostedLines.map((line) => (
                <tr key={line.movementId} className="border-b border-border/50">
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${movementDirectionClass(line.quantity)}`}>
                      {movementDirectionLabel(line.quantity)}
                    </span>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDate(line.movementDate)}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="font-semibold">{line.partName}</div>
                    <div className="text-xs text-muted-foreground">{line.partNumber || line.category}</div>
                  </td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{formatMoney(line.valuationAmount, line.currency)}</td>
                  <td className="px-3 py-3 text-right">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label={de ? 'Bewegung buchen' : 'Post movement'}
                      title={de ? 'Bewegung buchen' : 'Post movement'}
                      onClick={() => postInventoryMovement.mutateAsync({
                        movementId: line.movementId,
                        data: { costingMethod: filters.costingMethod },
                      })}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{de ? 'Gebuchte Bewegungen' : 'Posted Entries'}</h2>
            <Layers3 className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid gap-2">
            {entriesLoading && Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14 rounded-lg" />)}
            {!entriesLoading && entries.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                {de ? 'Noch keine Buchungen.' : 'No postings yet.'}
              </div>
            )}
            {!entriesLoading && entries.map((entry) => (
              <div key={entry._id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{entry.partName}</div>
                  <div className="text-sm font-semibold tabular-nums">{formatMoney(entry.valuationAmount, entry.currency)}</div>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{entry.costingMethod} · {formatDate(entry.createdAt)}</div>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}
