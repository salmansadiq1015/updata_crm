'use client';

import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Send, Download, XCircle, CheckCircle } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useInvoiceDetail, useInvoicePayments, useInvoiceHistory } from '../hooks/use-qop-queries';
import { useInvoiceMutations } from '../hooks/use-qop-mutations';
import { InvoiceStatusBadge, InvoiceTypeBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { DocumentHistoryTimeline } from './document-history-timeline';
import { RecordPaymentDialog } from './record-payment-dialog';
import { invoiceService } from '../services/invoice-service';

function fmt(n) {
  return new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function PaymentProgress({ invoice, de, payments }) {
  const total = invoice?.grandTotalRounded || invoice?.amountDue || 0;
  const paid = (payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{de ? 'Bezahlt' : 'Paid'}</span>
        <span className="font-medium">{fmt(paid)} / {fmt(total)} {invoice?.currency}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground text-right">{pct}% {de ? 'bezahlt' : 'paid'}</p>
    </div>
  );
}

function PaymentsTab({ invoiceId, invoice, de, language }) {
  const { data: payments = [], isLoading } = useInvoicePayments(invoiceId);
  const [payOpen, setPayOpen] = useState(false);
  const isPayable = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice?.status);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <PaymentProgress invoice={invoice} de={de} payments={payments} />

      {isPayable && (
        <Button size="sm" onClick={() => setPayOpen(true)} className="self-start">
          <CheckCircle className="h-4 w-4 mr-2" />
          {de ? 'Zahlung erfassen' : 'Record Payment'}
        </Button>
      )}

      {payments.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden text-sm">
          <div className="grid grid-cols-[6rem_7rem_6rem_1fr] bg-muted/50 border-b text-xs font-medium text-muted-foreground">
            {[de ? 'Datum' : 'Date', de ? 'Betrag' : 'Amount', de ? 'Methode' : 'Method', de ? 'Referenz' : 'Reference'].map((h, i) => (
              <div key={i} className="px-3 py-2">{h}</div>
            ))}
          </div>
          {payments.map((p, i) => (
            <div key={i} className="grid grid-cols-[6rem_7rem_6rem_1fr] border-b last:border-0">
              <div className="px-3 py-2.5 text-muted-foreground">{fmtDate(p.date, language)}</div>
              <div className="px-3 py-2.5 font-medium text-emerald-700">+{fmt(p.amount)}</div>
              <div className="px-3 py-2.5 text-muted-foreground capitalize">{p.method?.replace('_', ' ')}</div>
              <div className="px-3 py-2.5 text-muted-foreground font-mono text-xs">{p.reference || '—'}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground text-center py-4">
          {de ? 'Noch keine Zahlungen.' : 'No payments yet.'}
        </p>
      )}

      <RecordPaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        invoiceId={invoiceId}
        outstandingAmount={invoice?.amountDue}
        currency={invoice?.currency}
      />
    </div>
  );
}

export function InvoiceDetailDialog({ open, onClose, invoiceId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [tab, setTab] = useState('overview');

  const { data: invoice, isLoading } = useInvoiceDetail(open ? invoiceId : null);
  const { data: history = [] } = useInvoiceHistory(open && tab === 'history' ? invoiceId : null);
  const { sendInvoice, finalizeInvoice, transitionInvoiceStatus } = useInvoiceMutations();

  const isCancellable = ['SENT', 'OVERDUE', 'PARTIALLY_PAID'].includes(invoice?.status);

  const handleDownloadPdf = async () => {
    try {
      const res = await invoiceService.generateDocument(invoiceId);
      const url = res?.data?.url ?? res?.url;
      if (url) window.open(url, '_blank');
    } catch { /* silently fail */ }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isLoading ? '...' : `${de ? 'Rechnung' : 'Invoice'} ${invoice?.invoiceNumber ?? ''}`}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col gap-3 mt-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-4 mt-2">
            {/* Action bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <InvoiceStatusBadge status={invoice?.status} />
              <InvoiceTypeBadge type={invoice?.invoiceType} />
              <div className="flex-1" />
              <Button size="sm" variant="outline" onClick={handleDownloadPdf}>
                <Download className="h-4 w-4 mr-1.5" />PDF
              </Button>
              {invoice?.status === 'DRAFT' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => finalizeInvoice.mutate(invoiceId)}>
                    {de ? 'Abschliessen' : 'Finalize'}
                  </Button>
                  <Button size="sm" onClick={() => sendInvoice.mutate(invoiceId)}>
                    <Send className="h-4 w-4 mr-1.5" />{de ? 'Senden' : 'Send'}
                  </Button>
                </>
              )}
              {isCancellable && (
                <Button
                  size="sm" variant="destructive"
                  onClick={() => transitionInvoiceStatus.mutate({ id: invoiceId, targetStatus: 'CANCELLED' })}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />{de ? 'Stornieren' : 'Cancel'}
                </Button>
              )}
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">{de ? 'Übersicht' : 'Overview'}</TabsTrigger>
                <TabsTrigger value="payments">{de ? 'Zahlungen' : 'Payments'}</TabsTrigger>
                <TabsTrigger value="history">{de ? 'Verlauf' : 'History'}</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    [de ? 'Nummer' : 'Number', <span key="n" className="font-mono">{invoice?.invoiceNumber}</span>],
                    [de ? 'Typ' : 'Type', <InvoiceTypeBadge key="t" type={invoice?.invoiceType} />],
                    [de ? 'Kunde' : 'Customer', invoice?.customerName],
                    [de ? 'Fällig am' : 'Due Date', fmtDate(invoice?.dueDate, language)],
                    [de ? 'Betrag' : 'Amount', <AmountDisplay key="a" amount={invoice?.grandTotalRounded} currency={invoice?.currency} className="font-semibold" />],
                    [de ? 'Offener Betrag' : 'Amount Due', <AmountDisplay key="d" amount={invoice?.amountDue} currency={invoice?.currency} />],
                  ].map(([label, value], i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <span className="text-xs text-muted-foreground">{label}</span>
                      <span className="text-sm font-medium">{value}</span>
                    </div>
                  ))}
                </div>

                {/* Advance deductions for FINAL invoices */}
                {invoice?.invoiceType === 'FINAL' && (invoice?.advanceDeductions ?? []).length > 0 && (
                  <div className="mt-4 flex flex-col gap-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {de ? 'Abzüge Akontozahlungen' : 'Advance Deductions'}
                    </p>
                    {invoice.advanceDeductions.map((d, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="font-mono text-muted-foreground">{d.advanceInvoiceNumber}</span>
                        <span className="text-red-600 font-medium">− {fmt(d.totalAmount)} {invoice.currency}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-1">
                      <span>{de ? 'Restbetrag' : 'Net Balance'}</span>
                      <span>{fmt(invoice.netSubtotal)} {invoice.currency}</span>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <PaymentsTab invoiceId={invoiceId} invoice={invoice} de={de} language={language} />
              </TabsContent>

              <TabsContent value="history" className="mt-4">
                <DocumentHistoryTimeline history={history} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
