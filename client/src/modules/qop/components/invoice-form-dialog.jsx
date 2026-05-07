'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { LineItemsEditor } from './line-items-editor';
import { CURRENCIES } from '../constants/qop-constants';

const PAYMENT_TERMS = [7, 10, 14, 20, 30, 45, 60];

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

const EMPTY_FORM = () => ({
  currency: 'CHF',
  paymentTermDays: 30,
  dueDate: addDays(30),
  lineItems: [],
  notes: '',
  milestonePercent: 30,
  milestoneAmount: '',
  milestoneAmountMode: 'percent',
  milestoneDescription: '',
});

// type: 'STANDARD' | 'ADVANCE' | 'FINAL'
export function InvoiceFormDialog({ open, onClose, type = 'STANDARD', sourceOrderId, sourceQuotationId, sourceOrder = null }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { createInvoice, createAdvanceInvoice, createFinalInvoice } = useInvoiceMutations();

  const isPending = createInvoice.isPending || createAdvanceInvoice.isPending || createFinalInvoice.isPending;

  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setForm({
        currency: sourceOrder?.currency || 'CHF',
        paymentTermDays: 30,
        dueDate: addDays(30),
        lineItems: type === 'STANDARD'
          ? (sourceOrder?.lineItems ?? []).map((li, i) => ({ ...li, _uid: i }))
          : [],
        notes: '',
        milestonePercent: 30,
        milestoneAmount: '',
        milestoneAmountMode: 'percent',
        milestoneDescription: '',
      });
    }
  }, [open, sourceOrder, type]);

  // Billing plan for FINAL invoices
  const { data: billingPlan } = useQuery({
    queryKey: ['qop', 'billing-plan', sourceOrderId],
    queryFn: () => apiClient.get(ENDPOINTS.QOP.ORDER_BILLING_PLAN(sourceOrderId)),
    enabled: type === 'FINAL' && !!sourceOrderId,
    select: (r) => r.data,
  });

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleTermChange = (days) => {
    set('paymentTermDays', days);
    set('dueDate', addDays(Number(days)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const base = {
      sourceOrderId: sourceOrderId || undefined,
      sourceQuotationId: sourceQuotationId || undefined,
      currency: form.currency,
      paymentTermDays: Number(form.paymentTermDays),
      dueDate: form.dueDate,
      notes: form.notes || undefined,
    };

    if (type === 'ADVANCE') {
      const advancePayload = {
        ...base,
        milestoneDescription: form.milestoneDescription || undefined,
      };
      if (form.milestoneAmountMode === 'fixed') {
        advancePayload.milestoneAmount = Number(form.milestoneAmount);
      } else {
        advancePayload.milestonePercent = Number(form.milestonePercent);
      }
      await createAdvanceInvoice.mutateAsync(advancePayload);
    } else if (type === 'FINAL') {
      await createFinalInvoice.mutateAsync({ ...base });
    } else {
      await createInvoice.mutateAsync({
        ...base,
        invoiceType: 'STANDARD',
        lineItems: form.lineItems.map(({ _uid, ...li }) => ({
          ...li,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          discountPercent: Number(li.discountPercent),
          vatRate: Number(li.vatRate),
        })),
      });
    }
    onClose();
  };

  const titles = {
    de: { STANDARD: 'Neue Rechnung', ADVANCE: 'Akontorechnung', FINAL: 'Schlussrechnung' },
    en: { STANDARD: 'New Invoice', ADVANCE: 'Advance Invoice', FINAL: 'Final Invoice' },
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {titles[de ? 'de' : 'en'][type]}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
          {/* Header fields */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Währung' : 'Currency'}</Label>
              <Select value={form.currency} onValueChange={(v) => set('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Zahlungsfrist' : 'Payment Terms'}</Label>
              <Select value={String(form.paymentTermDays)} onValueChange={handleTermChange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_TERMS.map((d) => (
                    <SelectItem key={d} value={String(d)}>
                      {d} {de ? 'Tage netto' : 'days net'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{de ? 'Fälligkeitsdatum' : 'Due Date'}</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
                required
              />
            </div>
          </div>

          {/* Advance invoice fields */}
          {type === 'ADVANCE' && (
            <div className="flex flex-col gap-4 p-4 rounded-lg bg-orange-50 border border-orange-200">
              <div className="flex gap-2">
                <Button
                  type="button" size="sm"
                  variant={form.milestoneAmountMode === 'percent' ? 'default' : 'outline'}
                  onClick={() => set('milestoneAmountMode', 'percent')}
                >
                  {de ? 'Prozent %' : 'Percentage %'}
                </Button>
                <Button
                  type="button" size="sm"
                  variant={form.milestoneAmountMode === 'fixed' ? 'default' : 'outline'}
                  onClick={() => set('milestoneAmountMode', 'fixed')}
                >
                  {de ? 'Fixbetrag CHF' : 'Fixed Amount CHF'}
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {form.milestoneAmountMode === 'percent' ? (
                  <div className="flex flex-col gap-1.5">
                    <Label>{de ? 'Anzahlung %' : 'Advance %'}</Label>
                    <Input
                      type="number" min="1" max="100" step="0.1"
                      value={form.milestonePercent}
                      onChange={(e) => set('milestonePercent', e.target.value)}
                      required
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    <Label>{de ? 'Betrag (CHF)' : 'Amount (CHF)'}</Label>
                    <Input
                      type="number" min="0.05" step="0.05"
                      value={form.milestoneAmount}
                      onChange={(e) => set('milestoneAmount', e.target.value)}
                      required
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label>{de ? 'Meilenstein-Beschreibung' : 'Milestone Description'}</Label>
                  <Input
                    value={form.milestoneDescription}
                    onChange={(e) => set('milestoneDescription', e.target.value)}
                    placeholder={de ? 'z.B. Anzahlung Auftragsbeginn' : 'e.g. Upfront payment'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Final invoice — advance deduction preview */}
          {type === 'FINAL' && billingPlan && (
            <div className="flex flex-col gap-3 p-4 rounded-lg bg-violet-50 border border-violet-200">
              <p className="text-sm font-medium text-violet-800">
                {de ? 'Vorschau: Abzüge Akontozahlungen' : 'Preview: Advance Deductions'}
              </p>
              <div className="rounded border border-violet-200 overflow-hidden text-sm bg-white">
                <div className="grid grid-cols-[1fr_5rem_5rem_6rem] bg-violet-50 border-b text-xs font-medium text-muted-foreground px-3 py-2">
                  <div>{de ? 'Akontorechnung' : 'Advance Invoice'}</div>
                  <div className="text-right">{de ? 'Datum' : 'Date'}</div>
                  <div className="text-right">%</div>
                  <div className="text-right">{de ? 'Betrag' : 'Amount'}</div>
                </div>
                {(billingPlan.advances ?? []).map((adv) => (
                  <div key={adv._id} className="grid grid-cols-[1fr_5rem_5rem_6rem] border-b last:border-0 px-3 py-2">
                    <div className="font-mono text-muted-foreground">{adv.invoiceNumber}</div>
                    <div className="text-right text-muted-foreground">{adv.invoiceDate?.slice(0, 10) ?? '—'}</div>
                    <div className="text-right">{adv.milestonePercent ?? '—'}%</div>
                    <div className="text-right font-medium text-red-600">− {fmt(adv.grandTotalRounded)}</div>
                  </div>
                ))}
                <div className="grid grid-cols-[1fr_6rem] border-t bg-violet-50 px-3 py-2.5 font-semibold">
                  <div>{de ? 'Restbetrag fällig' : 'Balance Due'}</div>
                  <div className="text-right">{fmt(billingPlan.remainingForFinal)} {sourceOrder?.currency ?? 'CHF'}</div>
                </div>
              </div>
            </div>
          )}

          {type === 'FINAL' && !billingPlan && (
            <div className="p-4 rounded-lg bg-violet-50 border border-violet-200 text-sm text-violet-700">
              {de
                ? 'Die Schlussrechnung zeigt den Gesamtbetrag abzüglich aller bisherigen Akontozahlungen.'
                : 'The final invoice shows the total project amount minus all previous advance payments.'}
            </div>
          )}

          {/* Line items for Standard invoices */}
          {type === 'STANDARD' && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <Label className="text-sm font-medium">{de ? 'Positionen' : 'Line Items'}</Label>
                <LineItemsEditor value={form.lineItems} onChange={(items) => set('lineItems', items)} />
              </div>
            </>
          )}

          <Separator />

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <Label>{de ? 'Bemerkungen' : 'Notes'}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder={de ? 'Optionale Anmerkungen auf der Rechnung...' : 'Optional notes on invoice...'}
              className="resize-none text-sm"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={isPending}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? (de ? 'Erstellen...' : 'Creating...')
                : (de ? 'Rechnung erstellen' : 'Create Invoice')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
