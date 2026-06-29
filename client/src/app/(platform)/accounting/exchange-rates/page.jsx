'use client';

import { useMemo, useState } from 'react';
import { Calculator, Edit3, Globe2, Plus, RefreshCw, Save, Scale } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  EXCHANGE_RATE_SOURCES,
} from '@/modules/accounting/constants/accounting-constants';
import {
  useExchangeRates,
  useFxRevaluationPreview,
  useFxRevaluationRuns,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { useExchangeRateMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { formatDate, formatMoney, toDateInput } from '@/modules/accounting/utils/accounting-ui';
import {
  buildConversionPayload,
  buildExchangeRateFilters,
  buildExchangeRatePayload,
  buildFxRevaluationPayload,
  defaultConversionForm,
  defaultExchangeRateFilters,
  defaultExchangeRateForm,
  defaultFxRevaluationForm,
  formatExchangeRate,
  isConversionFormValid,
  isExchangeRateFormValid,
  isFxRevaluationFormValid,
} from '@/modules/accounting/utils/exchange-rates';

function CurrencySelect({ value, onValueChange, includeAll = false }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="ALL">All</SelectItem>}
        {ACCOUNTING_CURRENCIES.map((currency) => (
          <SelectItem key={currency} value={currency}>{currency}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ExchangeRateEditor({ open, form, pending, de, onChange, onClose, onSubmit }) {
  const valid = isExchangeRateFormValid(form);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{de ? 'Wechselkurs pflegen' : 'Maintain exchange rate'}</DialogTitle>
        </DialogHeader>
        <form id="exchange-rate-form" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Basis' : 'Base'}</Label>
            <CurrencySelect value={form.baseCurrency} onValueChange={(value) => onChange('baseCurrency', value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Ziel' : 'Quote'}</Label>
            <CurrencySelect value={form.quoteCurrency} onValueChange={(value) => onChange('quoteCurrency', value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Kursdatum' : 'Rate date'}</Label>
            <Input
              className="h-9"
              type="date"
              value={form.rateDate}
              onChange={(event) => onChange('rateDate', event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Kurs' : 'Rate'}</Label>
            <Input
              className="h-9"
              inputMode="decimal"
              type="number"
              min="0.00000001"
              step="0.0000000001"
              value={form.rate}
              onChange={(event) => onChange('rate', event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">{de ? 'Quelle' : 'Source'}</Label>
            <Select value={form.source} onValueChange={(value) => onChange('source', value)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXCHANGE_RATE_SOURCES.map((source) => (
                  <SelectItem key={source} value={source}>{source}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">{de ? 'Notiz' : 'Note'}</Label>
            <Textarea
              value={form.note}
              onChange={(event) => onChange('note', event.target.value)}
              maxLength={500}
              className="min-h-24"
            />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            {de ? 'Abbrechen' : 'Cancel'}
          </Button>
          <Button type="submit" form="exchange-rate-form" disabled={!valid || pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? '...' : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ExchangeRatesPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useState(defaultExchangeRateFilters());
  const [editorOpen, setEditorOpen] = useState(false);
  const [rateForm, setRateForm] = useState(defaultExchangeRateForm());
  const [conversionForm, setConversionForm] = useState(defaultConversionForm());
  const [revaluationForm, setRevaluationForm] = useState(defaultFxRevaluationForm());
  const params = useMemo(() => buildExchangeRateFilters(filters), [filters]);
  const revaluationPayload = useMemo(() => buildFxRevaluationPayload(revaluationForm), [revaluationForm]);
  const { data: rates = [], isLoading, isError, refetch } = useExchangeRates(params);
  const { data: revaluationPreview, isLoading: revaluationLoading, isError: revaluationError } = useFxRevaluationPreview(revaluationPayload, {
    enabled: isFxRevaluationFormValid(revaluationForm),
  });
  const { data: revaluationRuns = [], isLoading: revaluationRunsLoading } = useFxRevaluationRuns({ baseCurrency: revaluationForm.baseCurrency, limit: 5 });
  const { upsertExchangeRate, convertAmount, postFxRevaluation } = useExchangeRateMutations();
  const conversion = convertAmount.data?.data;

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const setRate = (key, value) => setRateForm((current) => ({ ...current, [key]: value }));
  const setConversion = (key, value) => setConversionForm((current) => ({ ...current, [key]: value }));
  const setRevaluation = (key, value) => setRevaluationForm((current) => ({ ...current, [key]: value }));

  const openCreate = () => {
    setRateForm(defaultExchangeRateForm());
    setEditorOpen(true);
  };

  const openEdit = (rate) => {
    setRateForm({
      baseCurrency: rate.baseCurrency || 'CHF',
      quoteCurrency: rate.quoteCurrency || 'EUR',
      rate: String(rate.rate ?? ''),
      rateDate: toDateInput(rate.rateDate),
      source: rate.source || 'MANUAL',
      note: rate.note || '',
    });
    setEditorOpen(true);
  };

  const submitRate = async (event) => {
    event.preventDefault();
    await upsertExchangeRate.mutateAsync(buildExchangeRatePayload(rateForm));
    setEditorOpen(false);
  };

  const submitConversion = async (event) => {
    event.preventDefault();
    await convertAmount.mutateAsync(buildConversionPayload(conversionForm));
  };

  const toggleRevaluationSource = (sourceType, checked) => {
    setRevaluationForm((current) => {
      const currentTypes = current.sourceTypes || [];
      return {
        ...current,
        sourceTypes: checked
          ? [...new Set([...currentTypes, sourceType])]
          : currentTypes.filter((type) => type !== sourceType),
      };
    });
  };

  const submitRevaluation = async (event) => {
    event.preventDefault();
    await postFxRevaluation.mutateAsync(revaluationPayload);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-xs font-semibold text-sky-200">
            <Globe2 className="h-3.5 w-3.5" />
            {de ? 'Multi-Waehrung' : 'Multi-currency'}
          </div>
          <h1 className="text-2xl font-bold">{de ? 'Wechselkurse' : 'Exchange Rates'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {de
              ? 'Historische Kurse fuer Buchungen, Reporting, Umrechnung und spaetere Neubewertung.'
              : 'Historical rates for postings, reporting, conversion, and the revaluation foundation.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {de ? 'Aktualisieren' : 'Refresh'}
          </Button>
          <Button type="button" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            {de ? 'Kurs' : 'Rate'}
          </Button>
        </div>
      </div>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_10rem_10rem_10rem_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Basis' : 'Base'}</Label>
          <CurrencySelect value={filters.baseCurrency} onValueChange={(value) => setFilter('baseCurrency', value)} includeAll />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Ziel' : 'Quote'}</Label>
          <CurrencySelect value={filters.quoteCurrency} onValueChange={(value) => setFilter('quoteCurrency', value)} includeAll />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Von' : 'From'}</Label>
          <Input className="h-9" type="date" value={filters.startDate} onChange={(event) => setFilter('startDate', event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Bis' : 'To'}</Label>
          <Input className="h-9" type="date" value={filters.endDate} onChange={(event) => setFilter('endDate', event.target.value)} />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setFilters(defaultExchangeRateFilters())}
          className="h-9"
        >
          {de ? 'Reset' : 'Reset'}
        </Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_24rem]">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-3 py-2.5 text-left">{de ? 'Paar' : 'Pair'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Datum' : 'Date'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Kurs' : 'Rate'}</th>
                <th className="px-3 py-2.5 text-left">{de ? 'Quelle' : 'Source'}</th>
                <th className="px-3 py-2.5 text-right">{de ? 'Aktion' : 'Action'}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && Array.from({ length: 5 }).map((_, index) => (
                <tr key={index} className="border-b border-border/50">
                  <td colSpan={5} className="px-3 py-3">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
              {!isLoading && rates.map((rate) => (
                <tr key={rate._id || `${rate.baseCurrency}-${rate.quoteCurrency}-${rate.rateDate}`} className="border-b border-border/50">
                  <td className="px-3 py-3">
                    <div className="font-semibold">{rate.baseCurrency}/{rate.quoteCurrency}</div>
                    {rate.note && <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{rate.note}</div>}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{formatDate(rate.rateDate)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatExchangeRate(rate.rate)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{rate.source || 'MANUAL'}</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Button type="button" size="sm" variant="outline" onClick={() => openEdit(rate)}>
                      <Edit3 className="mr-1.5 h-4 w-4" />
                      {de ? 'Bearbeiten' : 'Edit'}
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && rates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-12 text-center text-sm text-muted-foreground">
                    {isError
                      ? (de ? 'Kurse konnten nicht geladen werden.' : 'Could not load exchange rates.')
                      : (de ? 'Keine Wechselkurse fuer diese Filter.' : 'No exchange rates for these filters.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-4">
        <form onSubmit={submitConversion} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-300/20">
              <Calculator className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{de ? 'Umrechnung' : 'Conversion'}</h2>
              <p className="text-xs text-muted-foreground">{de ? 'Historischer Kurs per Datum.' : 'Historical rate as of date.'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs">{de ? 'Betrag' : 'Amount'}</Label>
              <Input
                className="h-9"
                inputMode="decimal"
                type="number"
                min="0"
                step="0.01"
                value={conversionForm.amount}
                onChange={(event) => setConversion('amount', event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Von' : 'From'}</Label>
              <CurrencySelect value={conversionForm.fromCurrency} onValueChange={(value) => setConversion('fromCurrency', value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Nach' : 'To'}</Label>
              <CurrencySelect value={conversionForm.toCurrency} onValueChange={(value) => setConversion('toCurrency', value)} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label className="text-xs">{de ? 'Per Datum' : 'As of'}</Label>
              <Input
                className="h-9"
                type="date"
                value={conversionForm.asOfDate}
                onChange={(event) => setConversion('asOfDate', event.target.value)}
              />
            </div>
          </div>
          <Button type="submit" disabled={!isConversionFormValid(conversionForm) || convertAmount.isPending}>
            <Calculator className="mr-1.5 h-4 w-4" />
            {convertAmount.isPending ? '...' : (de ? 'Berechnen' : 'Convert')}
          </Button>
          {conversion && (
            <div className="rounded-xl border border-cyan-300/20 bg-cyan-400/10 p-4">
              <div className="text-xs font-medium uppercase text-cyan-300">{de ? 'Ergebnis' : 'Result'}</div>
              <div className="mt-2 text-2xl font-bold tabular-nums">
                {formatMoney(conversion.convertedAmount, conversion.toCurrency)}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {conversion.fromCurrency}/{conversion.toCurrency} {formatExchangeRate(conversion.rate)} - {formatDate(conversion.rateDate)}
              </div>
            </div>
          )}
          {convertAmount.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {de ? 'Kein passender Wechselkurs gefunden.' : 'No matching exchange rate found.'}
              </AlertDescription>
            </Alert>
          )}
        </form>

        <form onSubmit={submitRevaluation} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-10 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300 ring-1 ring-violet-300/20">
              <Scale className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-semibold">{de ? 'FX Neubewertung' : 'FX Revaluation'}</h2>
              <p className="text-xs text-muted-foreground">{de ? 'Offene AR/AP zum Stichtag.' : 'Open AR/AP as of date.'}</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Basis' : 'Base'}</Label>
              <CurrencySelect value={revaluationForm.baseCurrency} onValueChange={(value) => setRevaluation('baseCurrency', value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Stichtag' : 'As of'}</Label>
              <Input
                className="h-9"
                type="date"
                value={revaluationForm.revaluationDate}
                onChange={(event) => setRevaluation('revaluationDate', event.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
              <Checkbox
                checked={revaluationForm.sourceTypes.includes('AR_INVOICE')}
                onCheckedChange={(checked) => toggleRevaluationSource('AR_INVOICE', Boolean(checked))}
              />
              {de ? 'Forderungen' : 'Receivables'}
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
              <Checkbox
                checked={revaluationForm.sourceTypes.includes('AP_BILL')}
                onCheckedChange={(checked) => toggleRevaluationSource('AP_BILL', Boolean(checked))}
              />
              {de ? 'Verbindlichkeiten' : 'Payables'}
            </label>
          </div>

          {revaluationLoading ? (
            <Skeleton className="h-24 rounded-xl" />
          ) : (
            <div className="grid gap-2 rounded-xl border border-violet-300/20 bg-violet-400/10 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{de ? 'Positionen' : 'Lines'}</span>
                <span className="font-semibold tabular-nums">{revaluationPreview?.lineCount ?? 0}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{de ? 'Gewinn' : 'Gain'}</span>
                <span className="font-semibold tabular-nums">{formatMoney(revaluationPreview?.totalGain, revaluationForm.baseCurrency)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{de ? 'Verlust' : 'Loss'}</span>
                <span className="font-semibold tabular-nums">{formatMoney(revaluationPreview?.totalLoss, revaluationForm.baseCurrency)}</span>
              </div>
              <div className="border-t border-violet-300/20 pt-2 text-right text-xl font-bold tabular-nums">
                {formatMoney(revaluationPreview?.netGainLoss, revaluationForm.baseCurrency)}
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={!isFxRevaluationFormValid(revaluationForm) || postFxRevaluation.isPending || (revaluationPreview?.lineCount ?? 0) === 0}
          >
            <Scale className="mr-1.5 h-4 w-4" />
            {postFxRevaluation.isPending ? '...' : (de ? 'Buchen' : 'Post')}
          </Button>
          {revaluationError && (
            <Alert variant="destructive">
              <AlertDescription>
                {de ? 'Neubewertung konnte nicht berechnet werden.' : 'Unable to calculate revaluation.'}
              </AlertDescription>
            </Alert>
          )}
        </form>

        <section className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold">{de ? 'FX Laeufe' : 'FX Runs'}</h2>
            <Scale className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="grid gap-2">
            {revaluationRunsLoading && Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-12 rounded-lg" />)}
            {!revaluationRunsLoading && revaluationRuns.length === 0 && (
              <div className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
                {de ? 'Keine Laeufe.' : 'No runs.'}
              </div>
            )}
            {!revaluationRunsLoading && revaluationRuns.map((run) => (
              <div key={run._id} className="rounded-lg border border-border/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{run.runNumber}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{run.status}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{formatDate(run.revaluationDate)} · {formatMoney(run.netGainLoss, run.baseCurrency)}</div>
              </div>
            ))}
          </div>
        </section>
        </div>
      </section>

      <ExchangeRateEditor
        open={editorOpen}
        form={rateForm}
        pending={upsertExchangeRate.isPending}
        de={de}
        onChange={setRate}
        onClose={() => setEditorOpen(false)}
        onSubmit={submitRate}
      />
    </div>
  );
}
