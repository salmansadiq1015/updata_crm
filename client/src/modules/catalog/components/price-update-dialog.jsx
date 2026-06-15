'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod/v4';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { usePriceMutations } from '../hooks/use-price-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const schema = z.object({
  mode: z.enum(['fixed', 'percentage', 'schedule']),
  value: z.preprocess((v) => (v === '' ? undefined : Number(v)), z.number()),
  effectiveDate: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.mode === 'fixed' && (data.value === undefined || data.value <= 0)) {
    ctx.addIssue({ code: 'custom', message: 'Price must be greater than 0', path: ['value'] });
  }
  if (data.mode === 'percentage' && (data.value === undefined || data.value < -99 || data.value > 999)) {
    ctx.addIssue({ code: 'custom', message: 'Percentage must be between -99 and 999', path: ['value'] });
  }
  if (data.mode === 'schedule') {
    if (data.value === undefined || data.value === 0 || data.value < -99 || data.value > 999) {
      ctx.addIssue({ code: 'custom', message: 'Percentage must be between -99 and 999 and non-zero', path: ['value'] });
    }
    if (!data.effectiveDate) {
      ctx.addIssue({ code: 'custom', message: 'Effective date is required', path: ['effectiveDate'] });
    } else {
      const date = new Date(data.effectiveDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date <= today) {
        ctx.addIssue({ code: 'custom', message: 'Effective date must be in the future', path: ['effectiveDate'] });
      }
    }
  }
});

export function PriceUpdateDialog({ open, onClose, selectedArticles = [] }) {
  const { t } = useLanguage();
  const { previewPrices, updatePrices, schedulePrices } = usePriceMutations();
  const [preview, setPreview] = useState(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { mode: 'fixed', value: '', effectiveDate: '' },
  });

  const mode = useWatch({ control: form.control, name: 'mode' });

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
    setPreview(response?.data?.rows ?? response?.rows ?? []);
  });

  const onConfirm = form.handleSubmit(async (vals) => {
    const payload = buildPayload(vals);
    try {
      if (vals.mode === 'schedule') {
        await schedulePrices.mutateAsync({ ...payload, scheduledDate: vals.effectiveDate });
      } else {
        await updatePrices.mutateAsync(payload);
      }
      onClose();
    } catch {
      // error accessible via mutation state
    }
  });

  const isPending = previewPrices.isPending || updatePrices.isPending || schedulePrices.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isPending) { setPreview(null); form.reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('catalog.prices.update')}</DialogTitle>
          <DialogDescription>
            {selectedArticles.length} article{selectedArticles.length !== 1 ? 's' : ''} selected
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="space-y-4">
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('catalog.prices.updateType')}</FormLabel>
                  <FormControl>
                    <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="fixed" id="mode-fixed" />
                        <Label htmlFor="mode-fixed">{t('catalog.prices.fixedPrice')}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="percentage" id="mode-pct" />
                        <Label htmlFor="mode-pct">{t('catalog.prices.percentage')}</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <RadioGroupItem value="schedule" id="mode-sched" />
                        <Label htmlFor="mode-sched">{t('catalog.prices.schedule')}</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{mode === 'fixed' ? t('catalog.prices.newPriceChf') : t('catalog.prices.percentageValue')}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step={mode === 'fixed' ? '0.01' : '0.1'} />
                    </FormControl>
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
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            <Button type="button" variant="outline" size="sm" onClick={onPreview}>
              {t('catalog.prices.previewChanges')}
            </Button>
          </form>
        </Form>

        {preview && (
          <div className="space-y-2 mt-2">
            <p className="text-sm font-medium">{t('common.preview')}</p>
            <div className="max-h-48 overflow-y-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2">{t('catalog.article')}</th>
                    <th className="text-right px-3 py-2">{t('catalog.prices.oldPrice')}</th>
                    <th className="text-right px-3 py-2">{t('catalog.prices.newPrice')}</th>
                    <th className="text-right px-3 py-2">&Delta;</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row) => (
                    <tr key={row.articleId || row._id} className="border-t">
                      <td className="px-3 py-1.5 font-mono">{row.articleNumber}</td>
                      <td className="px-3 py-1.5 text-right text-muted-foreground">{row.oldPrice.toFixed(2)}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{row.newPrice.toFixed(2)}</td>
                      <td className={`px-3 py-1.5 text-right ${row.delta > 0 ? 'text-green-600' : row.delta < 0 ? 'text-destructive' : ''}`}>
                        {row.delta > 0 ? '+' : ''}{row.delta.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setPreview(null); form.reset(); onClose(); }}>{t('common.cancel')}</Button>
              <Button onClick={onConfirm} disabled={isPending}>
                {isPending ? 'Applying...' : 'Confirm Update'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
