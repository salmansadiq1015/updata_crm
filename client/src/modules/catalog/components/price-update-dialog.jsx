'use client';

import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Info,
  Loader2,
  Percent,
  Tags,
  TriangleAlert,
  TrendingUp,
} from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePriceMutations } from '../hooks/use-price-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const EMPTY_PREVIEW = null;
const PRICE_BOUNDS = { minPercentage: -99, maxPercentage: 999 };

const priceFormatter = new Intl.NumberFormat('de-CH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function createSchema(t) {
  return z.object({
    mode: z.enum(['fixed', 'percentage', 'schedule']),
    value: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number().optional()),
    effectiveDate: z.string().optional(),
  }).superRefine((data, ctx) => {
    if (data.mode === 'fixed' && (data.value === undefined || data.value <= 0)) {
      ctx.addIssue({ code: 'custom', message: t('catalog.prices.errorPricePositive'), path: ['value'] });
    }
    if (data.mode === 'percentage' && (data.value === undefined || data.value < PRICE_BOUNDS.minPercentage || data.value > PRICE_BOUNDS.maxPercentage)) {
      ctx.addIssue({ code: 'custom', message: t('catalog.prices.errorPercentageRange'), path: ['value'] });
    }
    if (data.mode === 'schedule') {
      if (data.value === undefined || data.value === 0 || data.value < PRICE_BOUNDS.minPercentage || data.value > PRICE_BOUNDS.maxPercentage) {
        ctx.addIssue({ code: 'custom', message: t('catalog.prices.errorScheduledPercentage'), path: ['value'] });
      }
      if (!data.effectiveDate) {
        ctx.addIssue({ code: 'custom', message: t('catalog.prices.errorEffectiveDateRequired'), path: ['effectiveDate'] });
      } else {
        const date = new Date(`${data.effectiveDate}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (date <= today) {
          ctx.addIssue({ code: 'custom', message: t('catalog.prices.errorEffectiveDateFuture'), path: ['effectiveDate'] });
        }
      }
    }
  });
}

function getArticleId(article) {
  return article._id || article.id;
}

function asPrice(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatPrice(value) {
  return priceFormatter.format(asPrice(value));
}

function parseOptionalNumber(value) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getTomorrowISO() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function getPreviewRows(response) {
  return response?.data?.rows ?? response?.rows ?? [];
}

function getMutationMessage(error, fallback) {
  return error?.response?.data?.message || error?.message || fallback;
}

export function PriceUpdateDialog({ open, onClose, selectedArticles = [] }) {
  const { t } = useLanguage();
  const { previewPrices, updatePrices, schedulePrices } = usePriceMutations();
  const [preview, setPreview] = useState(EMPTY_PREVIEW);

  const schema = useMemo(() => createSchema(t), [t]);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'fixed', value: '', effectiveDate: '' },
  });

  const mode = useWatch({ control: form.control, name: 'mode' });
  const watchedValue = useWatch({ control: form.control, name: 'value' });
  const effectiveDate = useWatch({ control: form.control, name: 'effectiveDate' });

  const selectedSignature = useMemo(
    () => selectedArticles.map((article) => getArticleId(article)).join('|'),
    [selectedArticles],
  );

  const selectedStats = useMemo(() => {
    const total = selectedArticles.reduce((sum, article) => sum + asPrice(article.basePrice), 0);
    return {
      count: selectedArticles.length,
      total,
      average: selectedArticles.length > 0 ? total / selectedArticles.length : 0,
    };
  }, [selectedArticles]);

  const numericValue = parseOptionalNumber(watchedValue);
  const projectedAverage = numericValue === null
    ? null
    : mode === 'fixed'
      ? numericValue
      : selectedStats.average * (1 + numericValue / 100);
  const minEffectiveDate = useMemo(() => getTomorrowISO(), []);
  const currentPreviewSignature = `${mode}|${watchedValue ?? ''}|${effectiveDate ?? ''}|${selectedSignature}`;
  const previewIsCurrent = preview?.signature === currentPreviewSignature;
  const previewRows = previewIsCurrent && Array.isArray(preview.rows) ? preview.rows : [];
  const mutationError = previewPrices.error || updatePrices.error || schedulePrices.error;
  const isPending = previewPrices.isPending || updatePrices.isPending || schedulePrices.isPending;
  const canConfirm = previewIsCurrent && previewRows.length > 0 && !isPending;

  const modeOptions = useMemo(() => [
    {
      value: 'fixed',
      icon: Banknote,
      label: t('catalog.prices.fixedPrice'),
      description: t('catalog.prices.fixedModeDescription'),
    },
    {
      value: 'percentage',
      icon: Percent,
      label: t('catalog.prices.percentage'),
      description: t('catalog.prices.percentageModeDescription'),
    },
    {
      value: 'schedule',
      icon: CalendarClock,
      label: t('catalog.prices.schedule'),
      description: t('catalog.prices.scheduleModeDescription'),
    },
  ], [t]);

  const resetAndClose = () => {
    setPreview(EMPTY_PREVIEW);
    form.reset();
    onClose();
  };

  const buildPayload = (vals) => {
    const updates = selectedArticles.map((a) => {
      const oldPrice = Number(a.basePrice) || 0;
      const newPrice = vals.mode === 'percentage' || vals.mode === 'schedule'
        ? Math.round(oldPrice * (1 + Number(vals.value) / 100) * 100) / 100
        : Number(vals.value);
      return { articleId: a._id || a.id, newPrice };
    });
    return {
      type: 'bulk',
      updates,
      description: vals.mode === 'percentage' || vals.mode === 'schedule'
        ? `Selected articles ${vals.value}% adjustment`
        : 'Selected articles fixed price update',
    };
  };

  const onPreview = form.handleSubmit(async (vals) => {
    const payload = buildPayload(vals);
    const response = await previewPrices.mutateAsync(payload);
    setPreview({ signature: currentPreviewSignature, rows: getPreviewRows(response) });
  });

  const onConfirm = form.handleSubmit(async (vals) => {
    if (!canConfirm) return;
    const payload = buildPayload(vals);
    try {
      if (vals.mode === 'schedule') {
        await schedulePrices.mutateAsync({ ...payload, scheduledDate: vals.effectiveDate });
      } else {
        await updatePrices.mutateAsync(payload);
      }
      resetAndClose();
    } catch {
      // error accessible via mutation state
    }
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) resetAndClose(); }}>
      <DialogContent className="w-[calc(100%-1rem)] max-w-5xl overflow-hidden p-0">
        <Form {...form}>
          <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => event.preventDefault()}>
            <DialogHeader className="gap-5 border-b border-border/70 bg-card/95 px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 pr-10 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <DialogTitle>{t('catalog.prices.update')}</DialogTitle>
                    <DialogDescription className="mt-1 max-w-2xl">
                      {t('catalog.prices.updateSubtitle')}
                    </DialogDescription>
                  </div>
                </div>
                <Badge variant="outline" className="w-fit">
                  <Tags className="h-3 w-3" />
                  {t('catalog.prices.selectedCount', null, { count: selectedStats.count })}
                </Badge>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{t('catalog.prices.affectedArticles')}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{selectedStats.count}</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-muted/25 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{t('catalog.prices.currentAverage')}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatPrice(selectedStats.average)} CHF</p>
                </div>
                <div className="rounded-lg border border-border/70 bg-primary/5 px-3 py-2.5">
                  <p className="text-xs text-muted-foreground">{t('catalog.prices.projectedAverage')}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {projectedAverage === null ? '-' : `${formatPrice(projectedAverage)} CHF`}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <DialogBody className="space-y-5 px-5 py-5 sm:px-6">
              {mutationError && (
                <Alert variant="destructive">
                  <TriangleAlert className="h-4 w-4" />
                  <AlertTitle>{t('catalog.prices.operationFailed')}</AlertTitle>
                  <AlertDescription>
                    {getMutationMessage(mutationError, t('catalog.prices.operationFailedDescription'))}
                  </AlertDescription>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="mode"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-3">
                      <FormLabel>{t('catalog.prices.updateType')}</FormLabel>
                      <span className="text-xs text-muted-foreground">{t('catalog.prices.previewRequired')}</span>
                    </div>
                    <FormControl>
                      <RadioGroup value={field.value} onValueChange={field.onChange} className="grid gap-3 lg:grid-cols-3">
                        {modeOptions.map((option) => {
                          const Icon = option.icon;
                          const checked = field.value === option.value;
                          return (
                            <div key={option.value} className="relative">
                              <RadioGroupItem value={option.value} id={`mode-${option.value}`} className="sr-only" />
                              <Label
                                htmlFor={`mode-${option.value}`}
                                className={cn(
                                  'flex h-full cursor-pointer flex-col gap-3 rounded-xl border bg-muted/20 p-4 transition-all hover:border-primary/40 hover:bg-muted/35',
                                  checked && 'border-primary/60 bg-primary/10 shadow-sm ring-1 ring-primary/25',
                                )}
                              >
                                <span className="flex items-center justify-between gap-3">
                                  <span className={cn(
                                    'flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-background text-muted-foreground',
                                    checked && 'border-primary/30 bg-primary/15 text-primary',
                                  )}
                                  >
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  {checked && <CheckCircle2 className="h-4 w-4 text-primary" />}
                                </span>
                                <span>
                                  <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{option.description}</span>
                                </span>
                              </Label>
                            </div>
                          );
                        })}
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Info className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold">{t('catalog.prices.adjustmentDetails')}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="value"
                      render={({ field }) => (
                        <FormItem className={mode === 'schedule' ? undefined : 'sm:col-span-2'}>
                          <FormLabel>{mode === 'fixed' ? t('catalog.prices.newPriceChf') : t('catalog.prices.percentageValue')}</FormLabel>
                          <div className="relative">
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                step={mode === 'fixed' ? '0.01' : '0.1'}
                                className="h-11 pr-14 text-base tabular-nums"
                              />
                            </FormControl>
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground">
                              {mode === 'fixed' ? 'CHF' : '%'}
                            </span>
                          </div>
                          <FormDescription>
                            {mode === 'fixed'
                              ? t('catalog.prices.valueHelperFixed')
                              : mode === 'schedule'
                                ? t('catalog.prices.valueHelperSchedule')
                                : t('catalog.prices.valueHelperPercentage')}
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {mode === 'schedule' && (
                      <FormField
                        control={form.control}
                        name="effectiveDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t('catalog.prices.effectiveDate')}</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" min={minEffectiveDate} className="h-11" />
                            </FormControl>
                            <FormDescription>{t('catalog.prices.effectiveDateHelper')}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 bg-card/60 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold">{t('catalog.prices.impactSummary')}</p>
                    <Badge variant={previewRows.length > 0 ? 'success' : 'secondary'}>
                      {previewIsCurrent ? t('catalog.prices.previewReady') : t('catalog.prices.pendingPreview')}
                    </Badge>
                  </div>
                  <dl className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('catalog.prices.currentAverage')}</dt>
                      <dd className="font-medium tabular-nums">{formatPrice(selectedStats.average)} CHF</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('catalog.prices.projectedAverage')}</dt>
                      <dd className="font-medium tabular-nums">{projectedAverage === null ? '-' : `${formatPrice(projectedAverage)} CHF`}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-muted-foreground">{t('catalog.prices.mode')}</dt>
                      <dd className="font-medium">{modeOptions.find((option) => option.value === mode)?.label}</dd>
                    </div>
                  </dl>
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-card/50">
                <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{t('common.preview')}</p>
                    <p className="text-xs text-muted-foreground">{t('catalog.prices.previewDescription')}</p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={onPreview} disabled={isPending}>
                    {previewPrices.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                    {previewPrices.isPending ? t('catalog.prices.generatingPreview') : t('catalog.prices.previewChanges')}
                  </Button>
                </div>

                {!previewIsCurrent ? (
                  <div className="flex min-h-32 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium">{t('catalog.prices.noPreviewTitle')}</p>
                    <p className="max-w-md text-xs leading-5 text-muted-foreground">{t('catalog.prices.noPreviewDescription')}</p>
                  </div>
                ) : previewRows.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {t('catalog.prices.emptyPreview')}
                  </div>
                ) : (
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full min-w-[620px] text-xs">
                      <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                        <tr>
                          <th className="px-4 py-2.5 text-left font-medium">{t('catalog.article')}</th>
                          <th className="px-4 py-2.5 text-right font-medium">{t('catalog.prices.oldPrice')}</th>
                          <th className="px-4 py-2.5 text-right font-medium">{t('catalog.prices.newPrice')}</th>
                          <th className="px-4 py-2.5 text-right font-medium">{t('catalog.prices.delta')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row) => {
                          const delta = row.delta ?? asPrice(row.newPrice) - asPrice(row.oldPrice);
                          return (
                            <tr key={row.articleId || row._id} className="border-t border-border/70">
                              <td className="px-4 py-2.5 font-mono text-foreground">{row.articleNumber || row.articleId}</td>
                              <td className="px-4 py-2.5 text-right text-muted-foreground tabular-nums">{formatPrice(row.oldPrice)}</td>
                              <td className="px-4 py-2.5 text-right font-medium tabular-nums">{formatPrice(row.newPrice)}</td>
                              <td className="px-4 py-2.5 text-right">
                                <Badge variant={delta > 0 ? 'success' : delta < 0 ? 'destructive' : 'outline'} className="tabular-nums">
                                  {delta > 0 ? '+' : ''}{formatPrice(delta)}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </DialogBody>

            <DialogFooter className="items-center gap-3 sm:justify-between">
              <p className="text-xs text-muted-foreground sm:mr-auto">
                {canConfirm ? t('catalog.prices.previewReadyDescription') : t('catalog.prices.previewRequiredDescription')}
              </p>
              <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
                <Button type="button" variant="outline" onClick={resetAndClose} disabled={isPending}>
                  {t('common.cancel')}
                </Button>
                <Button type="button" variant="outline" onClick={onPreview} disabled={isPending}>
                  {previewPrices.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                  {previewPrices.isPending ? t('catalog.prices.generatingPreview') : t('catalog.prices.previewChanges')}
                </Button>
                <Button type="button" onClick={onConfirm} disabled={!canConfirm}>
                  {isPending && !previewPrices.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {isPending && !previewPrices.isPending
                    ? t('catalog.prices.applying')
                    : mode === 'schedule'
                      ? t('catalog.prices.scheduleUpdate')
                      : t('catalog.prices.applyNow')}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
