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
import { showError } from '@/lib/toast';
import { downloadFromUrl } from '@/lib/api/download';

function fmt(n) {
  return new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
}

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function PaymentProgress({ invoice, payments }) {
  const { t } = useLanguage();
  const total = invoice?.grandTotalRounded || invoice?.amountDue || 0;
  const paid = (payments ?? []).reduce((s, p) => s + (p.amount || 0), 0);
  const pct = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{t('qop.invoice.paid', 'Bezahlt')}</span>
        <span className="font-medium">{fmt(paid)} / {fmt(total)} {invoice?.currency}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-muted-foreground text-right">{pct}% {t('qop.invoice.paidPct', 'bezahlt')}</p>
    </div>
  );
}

function PaymentsTab({ invoiceId, invoice }) {
  const { locale: language, t } = useLanguage();
  const { data: payments = [], isLoading } = useInvoicePayments(invoiceId);
  const [payOpen, setPayOpen] = useState(false);
  const isPayable = ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(invoice?.status);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <PaymentProgress invoice={invoice} payments={payments} />

      {isPayable && (
        <Button size="sm" onClick={() => setPayOpen(true)} className="self-start">
          <CheckCircle className="h-4 w-4 mr-2" />
          {t('qop.invoice.recordPayment', 'Zahlung erfassen')}
        </Button>
      )}

      {payments.length > 0 ? (
        <div className="rounded-lg border border-border overflow-hidden text-sm">
          <div className="grid grid-cols-[6rem_7rem_6rem_1fr] bg-muted/50 border-b text-xs font-medium text-muted-foreground">
            {[
              t('qop.invoice.colDate', 'Datum'),
              t('qop.invoice.colAmount', 'Betrag'),
              t('qop.invoice.colMethod', 'Methode'),
              t('qop.invoice.colRef', 'Referenz'),
            ].map((h, i) => (
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
          {t('qop.invoice.noPayments', 'Noch keine Zahlungen.')}
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
  const { locale: language, t } = useLanguage();
  const [tab, setTab] = useState('overview');

  const { data: invoice, isLoading } = useInvoiceDetail(open ? invoiceId : null);
  const { data: history = [] } = useInvoiceHistory(open && tab === 'history' ? invoiceId : null);
  const { sendInvoice, finalizeInvoice, transitionInvoiceStatus } = useInvoiceMutations();

  const isCancellable = ['SENT', 'OVERDUE', 'PARTIALLY_PAID'].includes(invoice?.status);

  const handleDownloadPdf = async () => {
    try {
      const res = await invoiceService.generateDocument(invoiceId);
      const url = res?.data?.downloadUrl ?? res?.data?.url ?? res?.url;
      const fileName = res?.data?.fileName ?? res?.data?.filename ?? 'invoice.pdf';
      if (url) await downloadFromUrl(url, fileName);
      else showError(t('qop.invoices.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    } catch (err) {
      showError(err?.message || t('qop.invoices.pdfFailed', 'Das PDF konnte nicht erstellt werden.'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            {isLoading ? '...' : `${t('qop.invoice.title', 'Rechnung')} ${invoice?.invoiceNumber ?? ''}`}
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
                <Button size="sm" variant="outline" onClick={() => finalizeInvoice.mutate(invoiceId)}>
                  {t('qop.invoice.finalize', 'Abschliessen')}
                </Button>
              )}
              {['DRAFT', 'FINALIZED'].includes(invoice?.status) && (
                <Button size="sm" onClick={() => sendInvoice.mutate(invoiceId)}>
                  <Send className="h-4 w-4 mr-1.5" />{t('qop.invoice.send', 'Senden')}
                </Button>
              )}
              {isCancellable && (
                <Button
                  size="sm" variant="destructive"
                  onClick={() => transitionInvoiceStatus.mutate({ id: invoiceId, targetStatus: 'CANCELLED' })}
                >
                  <XCircle className="h-4 w-4 mr-1.5" />{t('qop.invoice.cancel', 'Stornieren')}
                </Button>
              )}
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">{t('qop.invoice.tabOverview', 'Übersicht')}</TabsTrigger>
                <TabsTrigger value="payments">{t('qop.invoice.tabPayments', 'Zahlungen')}</TabsTrigger>
                <TabsTrigger value="history">{t('common.activity', 'Aktivität')}</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    [t('qop.invoice.fieldNumber', 'Nummer'), <span key="n" className="font-mono">{invoice?.invoiceNumber}</span>],
                    [t('qop.invoice.fieldType', 'Typ'), <InvoiceTypeBadge key="t" type={invoice?.invoiceType} />],
                    [t('qop.invoice.fieldCustomer', 'Kunde'), invoice?.customerName],
                    [t('qop.invoice.fieldDueDate', 'Fällig am'), fmtDate(invoice?.dueDate, language)],
                    [t('qop.invoice.fieldAmount', 'Betrag'), <AmountDisplay key="a" amount={invoice?.grandTotalRounded} currency={invoice?.currency} className="font-semibold" />],
                    [t('qop.invoice.fieldAmountDue', 'Offener Betrag'), <AmountDisplay key="d" amount={invoice?.amountDue} currency={invoice?.currency} />],
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
                      {t('qop.invoice.advanceDeductions', 'Abzüge Akontozahlungen')}
                    </p>
                    {invoice.advanceDeductions.map((d, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="font-mono text-muted-foreground">{d.advanceInvoiceNumber}</span>
                        <span className="text-red-600 font-medium">− {fmt(d.totalAmount)} {invoice.currency}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-semibold border-t pt-2 mt-1">
                      <span>{t('qop.invoice.netBalance', 'Restbetrag')}</span>
                      <span>{fmt(invoice.netSubtotal)} {invoice.currency}</span>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="payments" className="mt-4">
                <PaymentsTab invoiceId={invoiceId} invoice={invoice} />
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
