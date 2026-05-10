'use client';

import { useState, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { PAYMENT_METHODS } from '../constants/qop-constants';

export function RecordPaymentDialog({ open, onClose, invoiceId, outstandingAmount = 0, currency = 'CHF' }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const { recordPayment } = useInvoiceMutations();

  const [form, setForm] = useState({
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'bank_transfer',
    reference: '',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setForm({
        amount: outstandingAmount > 0 ? String(outstandingAmount) : '',
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'bank_transfer',
        reference: '',
        notes: '',
      });
    }
  }, [open, outstandingAmount]);

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    await recordPayment.mutateAsync({
      id: invoiceId,
      data: {
        amount: Number(form.amount),
        paymentDate: form.paymentDate,
        paymentMethod: form.paymentMethod,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      },
    });
    onClose();
  };

  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2 }).format(n);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{de ? 'Zahlung erfassen' : 'Record Payment'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          {outstandingAmount > 0 && (
            <p className="text-sm text-muted-foreground">
              {de ? 'Offener Betrag:' : 'Outstanding:'}{' '}
              <span className="font-semibold text-foreground">{fmt(outstandingAmount)} {currency}</span>
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>{de ? 'Betrag *' : 'Amount *'}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                required
                className="flex-1"
              />
              <span className="text-sm text-muted-foreground w-10">{currency}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{de ? 'Datum *' : 'Payment Date *'}</Label>
            <Input
              type="date"
              value={form.paymentDate}
              onChange={(e) => set('paymentDate', e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{de ? 'Zahlungsart' : 'Payment Method'}</Label>
            <Select value={form.paymentMethod} onValueChange={(v) => set('paymentMethod', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>{de ? 'Referenz' : 'Reference'}</Label>
            <Input
              value={form.reference}
              onChange={(e) => set('reference', e.target.value)}
              placeholder={de ? 'z.B. ESR-Referenz...' : 'e.g. payment ref...'}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={recordPayment.isPending}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button type="submit" disabled={recordPayment.isPending || !form.amount}>
              {recordPayment.isPending
                ? (de ? 'Speichern...' : 'Saving...')
                : (de ? 'Zahlung erfassen' : 'Record Payment')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
