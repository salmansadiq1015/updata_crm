'use client';

import { useState } from 'react';
import { AlertTriangle, Send, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useLanguage } from '@/lib/i18n/language-context';
import { useArReceivables, useArSummary, useArOverdue } from '@/modules/accounting/hooks/use-accounting-queries';
import { useArMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { cursorPageLabel } from '@/modules/accounting/utils/accounting-ui';

const fmt = (n, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n ?? 0);

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('de-CH') : '—';

const AR_STATUS_CONFIG = {
  SENT:             { label: 'Offen',          labelEn: 'Open',           badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  OPEN:             { label: 'Offen',          labelEn: 'Open',           badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  PARTIALLY_PAID:   { label: 'Teilbezahlt',    labelEn: 'Partially Paid', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' },
  PAID:             { label: 'Bezahlt',        labelEn: 'Paid',           badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  OVERDUE:          { label: 'Überfällig',     labelEn: 'Overdue',        badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  WRITTEN_OFF:      { label: 'Abgeschrieben',  labelEn: 'Written Off',    badge: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400' },
};

function ARStatusBadge({ status, de }) {
  const cfg = AR_STATUS_CONFIG[status] || AR_STATUS_CONFIG.OPEN;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>{de ? cfg.label : cfg.labelEn}</span>;
}

function RecordPaymentDialog({ invoice, open, onClose, de }) {
  const { recordInvoicePayment } = useArMutations();
  const [form, setForm] = useState({ amount: '', reference: '' });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    await recordInvoicePayment.mutateAsync({
      invoice,
      amount: Number(form.amount),
      paymentReference: form.reference || invoice.invoiceNumber,
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{de ? 'Zahlung erfassen' : 'Record Payment'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
          <div className="text-sm text-muted-foreground">
            {invoice?.customerName} — {invoice?.invoiceNumber}
            {' | '}
            {de ? 'Offen' : 'Outstanding'}: <span className="font-semibold text-foreground">{fmt(invoice?.outstandingAmount, invoice?.currency)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Betrag CHF' : 'Amount CHF'}</Label>
              <Input type="number" step="0.05" min="0.05" className="h-8" value={form.amount} onChange={(e) => set('amount', e.target.value)} required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Zuordnung' : 'Allocation'}</Label>
              <Input className="h-8 font-mono" value={invoice?.invoiceNumber || ''} disabled />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Referenz' : 'Reference'}</Label>
            <Input className="h-8 font-mono" value={form.reference} onChange={(e) => set('reference', e.target.value)} placeholder="ESR / IBAN Ref..." />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={recordInvoicePayment.isPending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
            <Button type="submit" disabled={recordInvoicePayment.isPending || !form.amount}>
              {recordInvoicePayment.isPending ? '...' : (de ? 'Erfassen' : 'Record')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReceivablesTab({ de, t }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [payTarget, setPayTarget] = useState(null);
  const [cursorStack, setCursorStack] = useState([null]);
  const cursor = cursorStack[cursorStack.length - 1];

  const filters = {
    limit: 50,
    ...(status !== 'ALL' && { status }),
    ...(search && { q: search }),
    ...(cursor && { cursor }),
  };

  const { data: { items = [], pagination } = {}, isLoading } = useArReceivables(filters);
  const resetList = () => setCursorStack([null]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9"
            placeholder={de ? 'Kunde suchen...' : 'Search customer...'}
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetList(); }}
          />
        </div>
        <Select value={status} onValueChange={(value) => { setStatus(value); resetList(); }}>
          <SelectTrigger className="h-9 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{de ? 'Alle Status' : 'All Statuses'}</SelectItem>
            {Object.keys(AR_STATUS_CONFIG).map((s) => (
              <SelectItem key={s} value={s}>{de ? AR_STATUS_CONFIG[s].label : AR_STATUS_CONFIG[s].labelEn}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">{de ? 'Rechnungsnr.' : 'Invoice No.'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Kunde' : 'Customer'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Fällig' : 'Due'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Betrag' : 'Amount'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Offen' : 'Outstanding'}</th>
              <th className="px-3 py-2.5 text-center">Status</th>
              <th className="px-3 py-2.5 w-24" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : items.map((inv) => {
              const isOpen = ['SENT', 'OPEN', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status);
              const isOverdue = isOpen && new Date(inv.dueDate) < new Date();
              return (
                <tr key={inv._id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-3 py-3 font-medium">{inv.customerName}</td>
                  <td className={`px-3 py-3 ${isOverdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                    {fmtDate(inv.dueDate)}
                    {isOverdue && <AlertTriangle className="inline h-3.5 w-3.5 ml-1" />}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-medium">{fmt(inv.totalAmount, inv.currency)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {(inv.outstandingAmount ?? 0) > 0
                      ? <span className="text-orange-600 font-medium">{fmt(inv.outstandingAmount, inv.currency)}</span>
                      : <span className="text-muted-foreground">—</span>
                    }
                  </td>
                  <td className="px-3 py-3 text-center">
                    <ARStatusBadge status={isOverdue && ['OPEN', 'SENT'].includes(inv.status) ? 'OVERDUE' : inv.status} de={de} />
                  </td>
                  <td className="px-3 py-3 text-right">
                    {isOpen && (inv.outstandingAmount ?? 0) > 0 && (
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => setPayTarget(inv)}>
                        {de ? 'Zahlung' : 'Payment'}
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!isLoading && items.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                {de ? 'Keine Forderungen.' : 'No receivables found.'}
              </td></tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursorStack((current) => (current.length > 1 ? current.slice(0, -1) : current))}
            disabled={cursorStack.length <= 1}
          >
            {de ? 'Zurueck' : 'Previous'}
          </Button>
          <span className="text-xs text-muted-foreground">{cursorPageLabel(cursorStack.length - 1, t)}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => pagination?.nextCursor && setCursorStack((current) => [...current, pagination.nextCursor])}
            disabled={!pagination?.hasNext}
          >
            {de ? 'Weiter' : 'Next'}
          </Button>
        </div>
      </div>

      {payTarget && (
        <RecordPaymentDialog
          invoice={payTarget}
          open={!!payTarget}
          onClose={() => setPayTarget(null)}
          de={de}
        />
      )}
    </div>
  );
}

function DunningTab({ de }) {
  const { data: overdue = [], isLoading } = useArOverdue();
  const { generateDunning } = useArMutations();
  const [selected, setSelected] = useState(new Set());

  const toggle = (id) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleGenerate = () => {
    generateDunning.mutate({ invoiceIds: [...selected], level: 1, format: 'pdf' });
    setSelected(new Set());
  };

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 border border-orange-200">
          <AlertTriangle className="h-4 w-4 text-orange-600 shrink-0" />
          <span className="text-sm text-orange-800 flex-1">
            {selected.size} {de ? 'Rechnungen ausgewählt' : 'invoices selected'}
          </span>
          <Button size="sm" onClick={handleGenerate} disabled={generateDunning.isPending} className="bg-orange-600 hover:bg-orange-700 text-white">
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {de ? 'Mahnung generieren' : 'Generate Dunning'}
          </Button>
        </div>
      )}

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 w-8" />
              <th className="px-3 py-2.5 text-left">{de ? 'Rechnungsnr.' : 'Invoice No.'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Kunde' : 'Customer'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Überfällig seit' : 'Overdue Since'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Offen' : 'Outstanding'}</th>
              <th className="px-3 py-2.5 text-center">{de ? 'Mahnstufe' : 'Dunning Level'}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j} className="px-3 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : overdue.map((inv) => (
              <tr key={inv._id} className="border-b border-border/50 hover:bg-muted/30 cursor-pointer" onClick={() => toggle(String(inv._id))}>
                <td className="px-3 py-3">
                  <span className={`h-4 w-4 rounded border flex items-center justify-center ${selected.has(String(inv._id)) ? 'bg-primary border-primary' : 'border-border'}`}>
                    {selected.has(String(inv._id)) && <svg width="10" height="8" viewBox="0 0 10 8"><path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="px-3 py-3 font-medium">{inv.customerName}</td>
                <td className="px-3 py-3 text-red-600">{fmtDate(inv.dueDate)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-red-600 font-medium">{fmt(inv.outstandingAmount, inv.currency)}</td>
                <td className="px-3 py-3 text-center">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    (inv.dunningLevel ?? 0) === 0 ? 'bg-yellow-100 text-yellow-700' :
                    (inv.dunningLevel ?? 0) === 1 ? 'bg-orange-100 text-orange-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {de ? `Stufe ${inv.dunningLevel ?? 0}` : `Level ${inv.dunningLevel ?? 0}`}
                  </span>
                </td>
              </tr>
            ))}
            {!isLoading && overdue.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-emerald-600">
                {de ? 'Keine überfälligen Rechnungen. ' : 'No overdue invoices. '}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ReceivablesPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const { data: summary } = useArSummary();

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Forderungen' : 'Accounts Receivable'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {de ? 'Kundenrechnungen, Zahlungen und Mahnwesen' : 'Customer invoices, payments, and dunning'}
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: de ? 'Offen' : 'Open',             value: fmt(summary?.openAmount),    sub: `${summary?.openCount ?? 0} ${de ? 'Rechnungen' : 'invoices'}`,    color: 'text-sky-600' },
          { label: de ? 'Überfällig' : 'Overdue',      value: fmt(summary?.overdueAmount), sub: `${summary?.overdueCount ?? 0} ${de ? 'überfällig' : 'overdue'}`, color: 'text-red-600' },
          { label: de ? 'Diesen Monat' : 'Collected',  value: fmt(summary?.paidThisMonth), sub: de ? 'Eingegangen' : 'Collected',                                  color: 'text-emerald-600' },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums mt-1 ${c.color}`}>{c.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="receivables">
        <TabsList className="h-9">
          <TabsTrigger value="receivables" className="text-xs">{de ? 'Forderungen' : 'Receivables'}</TabsTrigger>
          <TabsTrigger value="dunning" className="text-xs">{de ? 'Mahnwesen' : 'Dunning'}</TabsTrigger>
        </TabsList>
        <TabsContent value="receivables" className="mt-4">
          <ReceivablesTab de={de} t={t} />
        </TabsContent>
        <TabsContent value="dunning" className="mt-4">
          <DunningTab de={de} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
