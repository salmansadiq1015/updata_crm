'use client';

import { useState, useEffect, useMemo } from 'react';
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
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { useBillingPlan, useOrders } from '../hooks/use-qop-queries';
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
  paymentTermsDays: 30,
  dueDate: addDays(30),
  sourceOrderId: '',
  lineItems: [],
  notes: '',
  milestonePercent: 30,
  milestoneAmount: '',
  milestoneAmountMode: 'percent',
  milestoneDescription: '',
});

// type: 'STANDARD' | 'ADVANCE' | 'FINAL'
export function InvoiceFormDialog({
  open,
  onClose,
  type = 'STANDARD',
  sourceOrderId,
  sourceQuotationId,
  sourceOrder = null,
  sourceQuotation = null,
}) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const {
    createInvoiceFromOrder, createInvoiceFromQuotation,
    createAdvanceInvoice, createFinalInvoice,
  } = useInvoiceMutations();

  const isPending = createInvoiceFromOrder.isPending
    || createInvoiceFromQuotation.isPending
    || createAdvanceInvoice.isPending
    || createFinalInvoice.isPending;

  const [form, setForm] = useState(EMPTY_FORM);
  const { data: orderData, isLoading: ordersLoading } = useOrders({ limit: 50, sortBy: 'createdAt', sortOrder: 'desc' });
  const orders = useMemo(() => orderData?.items ?? [], [orderData?.items]);
  const selectedOrder = useMemo(
    () => sourceOrder || orders.find((order) => String(order._id ?? order.id) === String(form.sourceOrderId)),
    [form.sourceOrderId, orders, sourceOrder],
  );
  const effectiveSourceOrderId = sourceOrderId || form.sourceOrderId || '';
  const effectiveSourceOrder = sourceOrder || selectedOrder || null;

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        currency: sourceOrder?.currency || 'CHF',
        paymentTermsDays: 30,
        dueDate: addDays(30),
        sourceOrderId: sourceOrderId || '',
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
  }, [open, sourceOrder, sourceOrderId, type]);

  useEffect(() => {
    if (!open || type !== 'STANDARD' || !effectiveSourceOrder) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setForm((current) => ({
      ...current,
      currency: effectiveSourceOrder.currency || current.currency,
      lineItems: (effectiveSourceOrder.lineItems ?? []).map((li, i) => ({ ...li, _uid: i })),
    }));
  }, [effectiveSourceOrder, open, type]);

  // Billing plan for FINAL invoices
  const { data: billingPlan } = useBillingPlan(type === 'FINAL' ? effectiveSourceOrderId : null);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleTermChange = (days) => {
    set('paymentTermsDays', days);
    set('dueDate', addDays(Number(days)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const base = {
      sourceOrderId: effectiveSourceOrderId || undefined,
      sourceQuotationId: sourceQuotationId || undefined,
      currency: form.currency,
      paymentTermsDays: Number(form.paymentTermsDays),
      dueDate: form.dueDate,
      notes: form.notes || undefined,
    };

    if (type === 'ADVANCE') {
      if (!effectiveSourceOrderId) return;
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
      if (!effectiveSourceOrderId) return;
      await createFinalInvoice.mutateAsync({ ...base });
    } else if (effectiveSourceOrderId) {
      const lineSelections = form.lineItems
        .map((li) => ({
          sourceOrderLinePosition: Number(li.sourceOrderLinePosition ?? li.position),
          quantity: Number(li.quantity),
        }))
        .filter((li) => Number.isInteger(li.sourceOrderLinePosition) && li.sourceOrderLinePosition > 0 && li.quantity > 0);
      await createInvoiceFromOrder.mutateAsync({
        ...base,
        lineSelections: lineSelections.length ? lineSelections : undefined,
      });
    } else if (sourceQuotationId) {
      await createInvoiceFromQuotation.mutateAsync({
        sourceQuotationId,
        dueDate: form.dueDate,
        paymentTermsDays: Number(form.paymentTermsDays),
      });
    } else {
      return;
    }
    onClose();
  };

  const titles = {
    de: { STANDARD: 'Neue Rechnung', ADVANCE: 'Akontorechnung', FINAL: 'Schlussrechnung' },
    en: { STANDARD: 'New Invoice', ADVANCE: 'Advance Invoice', FINAL: 'Final Invoice' },
  };
  const canSubmit = type === 'STANDARD'
    ? Boolean(effectiveSourceOrderId || sourceQuotationId)
    : Boolean(effectiveSourceOrderId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {titles[de ? 'de' : 'en'][type]}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5 mt-2">
          {!sourceOrderId && !sourceQuotationId && (
            <div className="rounded-lg border border-border bg-muted/20 p-4">
              <div className="flex flex-col gap-1.5">
                <Label>{de ? 'Auftrag' : 'Order'}</Label>
                <Select value={form.sourceOrderId || undefined} onValueChange={(v) => set('sourceOrderId', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder={ordersLoading ? (de ? 'Laden...' : 'Loading...') : (de ? 'Auftrag wählen' : 'Select order')} />
                  </SelectTrigger>
                  <SelectContent>
                    {orders.map((order) => {
                      const id = String(order._id ?? order.id);
                      return (
                        <SelectItem key={id} value={id}>
                          {order.orderNumber} · {order.customerName ?? order.customerId?.name ?? '—'}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {sourceQuotationId && sourceQuotation && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
              <span className="font-medium text-emerald-900">{sourceQuotation.quotationNumber}</span>
              <span className="text-emerald-800"> · {sourceQuotation.customerName}</span>
            </div>
          )}

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
              <Select value={String(form.paymentTermsDays)} onValueChange={handleTermChange}>
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
          {type === 'STANDARD' && effectiveSourceOrderId && (
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
            <Button type="submit" disabled={isPending || !canSubmit}>
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
