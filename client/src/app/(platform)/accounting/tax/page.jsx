'use client';
import { useAccountingFilters } from '@/modules/accounting/state/accounting-currency';

import { useMemo, useState } from 'react';
import { Calculator, FileText, Percent, Plus, Save } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  TAX_DIRECTIONS,
  TAX_SCOPES,
  TAX_TYPES,
} from '@/modules/accounting/constants/accounting-constants';
import {
  useTaxCodes,
  useTaxSummary,
  useTaxTransactions,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { useTaxMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';
import {
  buildTaxCalculationPayload,
  buildTaxCodePayload,
  defaultTaxCalculationForm,
  defaultTaxCodeForm,
  defaultTaxFilters,
  formatPercent,
  isTaxCalculationFormValid,
  isTaxCodeFormValid,
} from '@/modules/accounting/utils/tax-management';

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

function StatTile({ label, value, sub, accent = 'cyan' }) {
  const accentClass = {
    emerald: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
    rose: 'border-rose-300/20 bg-rose-400/10 text-rose-100',
    amber: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    cyan: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
  }[accent] || 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100';

  return (
    <div className={`rounded-xl border p-4 ${accentClass}`}>
      <div className="text-xs font-semibold uppercase opacity-80">{label}</div>
      <div className="mt-3 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs opacity-70">{sub}</div>}
    </div>
  );
}

function TaxCodeDialog({ open, form, pending, de, onChange, onClose, onSubmit }) {
  const valid = isTaxCodeFormValid(form);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{de ? 'Steuercode pflegen' : 'Maintain tax code'}</DialogTitle>
        </DialogHeader>
        <form id="tax-code-form" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">Code</Label>
            <Input className="h-9 uppercase" value={form.code} onChange={(event) => onChange('code', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Name' : 'Name'}</Label>
            <Input className="h-9" value={form.name} onChange={(event) => onChange('name', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Typ' : 'Type'}</Label>
            <SelectField value={form.type} onValueChange={(value) => onChange('type', value)} options={TAX_TYPES} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Richtung' : 'Direction'}</Label>
            <SelectField value={form.direction} onValueChange={(value) => onChange('direction', value)} options={TAX_DIRECTIONS} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Kategorie' : 'Scope'}</Label>
            <SelectField value={form.scope} onValueChange={(value) => onChange('scope', value)} options={TAX_SCOPES} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Land' : 'Country'}</Label>
            <Input className="h-9 uppercase" maxLength={2} value={form.country} onChange={(event) => onChange('country', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Satz' : 'Rate'}</Label>
            <Input className="h-9" type="number" min="0" max="100" step="0.0001" value={form.rate} onChange={(event) => onChange('rate', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Vorsteuer abziehbar' : 'Recoverable'}</Label>
            <Input className="h-9" type="number" min="0" max="100" step="0.01" value={form.recoverablePercent} onChange={(event) => onChange('recoverablePercent', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Gültig ab' : 'Valid from'}</Label>
            <Input className="h-9" type="date" value={form.validFrom} onChange={(event) => onChange('validFrom', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Gültig bis' : 'Valid to'}</Label>
            <Input className="h-9" type="date" value={form.validTo} onChange={(event) => onChange('validTo', event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">{de ? 'Beschreibung' : 'Description'}</Label>
            <Textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} maxLength={500} />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="submit" form="tax-code-form" disabled={!valid || pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? '...' : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function TaxManagementPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useAccountingFilters(defaultTaxFilters());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [taxCodeForm, setTaxCodeForm] = useState(defaultTaxCodeForm());
  const [calcForm, setCalcForm] = useState(defaultTaxCalculationForm());
  const params = useMemo(() => ({
    startDate: filters.startDate,
    endDate: filters.endDate,
    currency: filters.currency,
  }), [filters]);
  const { data: taxCodes = [], isLoading: codesLoading, isError: codesError } = useTaxCodes();
  const { data: summary, isLoading: summaryLoading } = useTaxSummary(params);
  const { data: transactions = [], isLoading: transactionsLoading, isError: transactionsError } = useTaxTransactions({ ...params, limit: 50 });
  const { createTaxCode, calculateTax } = useTaxMutations();
  const calculation = calculateTax.data?.data;

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const setCode = (key, value) => setTaxCodeForm((current) => ({ ...current, [key]: value }));
  const setCalc = (key, value) => setCalcForm((current) => ({ ...current, [key]: value }));

  const handleCreateTaxCode = async (event) => {
    event.preventDefault();
    await createTaxCode.mutateAsync(buildTaxCodePayload(taxCodeForm));
    setTaxCodeForm(defaultTaxCodeForm());
    setDialogOpen(false);
  };

  const handleCalculate = async (event) => {
    event.preventDefault();
    await calculateTax.mutateAsync(buildTaxCalculationPayload(calcForm));
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-200">
            <Percent className="h-3.5 w-3.5" />
            {de ? 'Steuerkontrolle' : 'Tax Control'}
          </div>
          <h1 className="text-2xl font-bold">{de ? 'Steuern' : 'Tax Management'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {de
              ? 'Steuercodes, Vorsteuer/Umsatzsteuer, Quellensteuer und periodische Steuerübersicht.'
              : 'Tax codes, input/output tax, withholding tax, and period tax reporting.'}
          </p>
        </div>
        <Button type="button" onClick={() => setDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {de ? 'Steuercode' : 'Tax code'}
        </Button>
      </div>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_10rem_10rem_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Von' : 'From'}</Label>
          <Input className="h-9" type="date" value={filters.startDate} onChange={(event) => setFilter('startDate', event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Bis' : 'To'}</Label>
          <Input className="h-9" type="date" value={filters.endDate} onChange={(event) => setFilter('endDate', event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Währung' : 'Currency'}</Label>
          <SelectField value={filters.currency} onValueChange={(value) => setFilter('currency', value)} options={ACCOUNTING_CURRENCIES} />
        </div>
        <Button type="button" variant="outline" onClick={() => setFilters(defaultTaxFilters())} className="h-9">
          Reset
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        {summaryLoading ? Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        )) : (
          <>
            <StatTile label={de ? 'Umsatzsteuer' : 'Output tax'} value={formatMoney(summary?.outputTax, filters.currency)} accent="amber" />
            <StatTile label={de ? 'Vorsteuer' : 'Input tax'} value={formatMoney(summary?.inputTax, filters.currency)} accent="emerald" />
            <StatTile label={de ? 'Quellensteuer' : 'Withholding'} value={formatMoney(summary?.withholdingTax, filters.currency)} accent="cyan" />
            <StatTile
              label={de ? 'Zahllast' : 'Net payable'}
              value={formatMoney(summary?.netTaxPayable, filters.currency)}
              accent={(summary?.netTaxPayable || 0) >= 0 ? 'rose' : 'emerald'}
            />
          </>
        )}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_24rem]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              {de ? 'Steuercodes' : 'Tax codes'}
            </div>
            <span className="text-xs text-muted-foreground">{taxCodes.length} {de ? 'Codes' : 'codes'}</span>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">Code</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Name' : 'Name'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Typ' : 'Type'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Satz' : 'Rate'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Gültigkeit' : 'Validity'}</th>
              </tr>
            </thead>
            <tbody>
              {codesLoading && Array.from({ length: 4 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td colSpan={5} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
                </tr>
              ))}
              {!codesLoading && taxCodes.map((code) => (
                <tr key={code._id || code.code} className="border-b border-border/50">
                  <td className="px-3 py-3 font-semibold">{code.code}</td>
                  <td className="px-3 py-3">{code.name}</td>
                  <td className="px-3 py-3 text-muted-foreground">{code.type} / {code.direction}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatPercent(code.rate)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDate(code.validFrom)} - {code.validTo ? formatDate(code.validTo) : '-'}</td>
                </tr>
              ))}
              {!codesLoading && taxCodes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {codesError ? (de ? 'Steuercodes konnten nicht geladen werden.' : 'Could not load tax codes.') : (de ? 'Noch keine Steuercodes.' : 'No tax codes yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form onSubmit={handleCalculate} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300 ring-1 ring-amber-300/20">
              <Calculator className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{de ? 'Steuerrechner' : 'Tax calculator'}</h2>
              <p className="text-xs text-muted-foreground">{de ? 'Einzelposition prüfen.' : 'Check a single line.'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Richtung' : 'Direction'}</Label>
              <SelectField value={calcForm.direction} onValueChange={(value) => setCalc('direction', value)} options={['INPUT', 'OUTPUT', 'WITHHOLDING']} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Währung' : 'Currency'}</Label>
              <SelectField value={calcForm.currency} onValueChange={(value) => setCalc('currency', value)} options={ACCOUNTING_CURRENCIES} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Datum' : 'Date'}</Label>
              <Input className="h-9" type="date" value={calcForm.documentDate} onChange={(event) => setCalc('documentDate', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Betrag netto' : 'Net amount'}</Label>
              <Input className="h-9" type="number" min="0" step="0.01" value={calcForm.lineTotal} onChange={(event) => setCalc('lineTotal', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Satz' : 'Rate'}</Label>
              <Input className="h-9" type="number" min="0" max="100" step="0.0001" value={calcForm.vatRate} onChange={(event) => setCalc('vatRate', event.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Steuercode' : 'Tax code'}</Label>
              <Input className="h-9 uppercase" value={calcForm.taxCode} onChange={(event) => setCalc('taxCode', event.target.value)} placeholder="Optional" />
            </div>
          </div>
          <Button type="submit" disabled={!isTaxCalculationFormValid(calcForm) || calculateTax.isPending}>
            <Calculator className="mr-1.5 h-4 w-4" />
            {calculateTax.isPending ? '...' : (de ? 'Berechnen' : 'Calculate')}
          </Button>
          {calculation && (
            <div className="rounded-xl border border-amber-300/20 bg-amber-400/10 p-4">
              <div className="text-xs font-medium uppercase text-amber-300">{de ? 'Ergebnis' : 'Result'}</div>
              <div className="mt-2 grid gap-2 text-sm">
                <div className="flex justify-between"><span>{de ? 'Steuerbasis' : 'Taxable'}</span><strong>{formatMoney(calculation.totals?.taxableAmount, calculation.currency)}</strong></div>
                <div className="flex justify-between"><span>{de ? 'Steuer' : 'Tax'}</span><strong>{formatMoney(calculation.totals?.taxAmount, calculation.currency)}</strong></div>
                <div className="flex justify-between"><span>{de ? 'Brutto' : 'Gross'}</span><strong>{formatMoney(calculation.totals?.grossAmount, calculation.currency)}</strong></div>
              </div>
            </div>
          )}
          {calculateTax.isError && (
            <Alert variant="destructive">
              <AlertDescription>{de ? 'Steuerberechnung fehlgeschlagen.' : 'Tax calculation failed.'}</AlertDescription>
            </Alert>
          )}
        </form>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">{de ? 'Steuerbuchungen' : 'Tax ledger'}</div>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">{de ? 'Datum' : 'Date'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Quelle' : 'Source'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Code' : 'Code'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Richtung' : 'Direction'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Basis' : 'Taxable'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Steuer' : 'Tax'}</th>
            </tr>
          </thead>
          <tbody>
            {transactionsLoading && Array.from({ length: 4 }).map((_, index) => (
              <tr key={index} className="border-b border-border/50">
                <td colSpan={6} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!transactionsLoading && transactions.map((tx) => (
              <tr key={tx._id} className="border-b border-border/50">
                <td className="px-3 py-3 text-muted-foreground">{formatDate(tx.transactionDate)}</td>
                <td className="px-3 py-3">{tx.sourceType} {tx.sourceNumber || ''}</td>
                <td className="px-3 py-3 font-semibold">{tx.taxCode}</td>
                <td className="px-3 py-3 text-muted-foreground">{tx.direction}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(tx.taxableAmount, tx.currency)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(tx.taxAmount, tx.currency)}</td>
              </tr>
            ))}
            {!transactionsLoading && transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {transactionsError ? (de ? 'Steuerbuchungen konnten nicht geladen werden.' : 'Could not load tax ledger.') : (de ? 'Keine Steuerbuchungen im Zeitraum.' : 'No tax ledger entries in this period.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <TaxCodeDialog
        open={dialogOpen}
        form={taxCodeForm}
        pending={createTaxCode.isPending}
        de={de}
        onChange={setCode}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleCreateTaxCode}
      />
    </div>
  );
}
