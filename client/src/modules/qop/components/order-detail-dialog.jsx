'use client';

import { useState } from 'react';
import { Download, RefreshCw, Plus } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useOrderDetail, useOrderHistory, useOrderInvoices, useBillingPlan } from '../hooks/use-qop-queries';
import { useOrderMutations } from '../hooks/use-qop-mutations';
import { OrderStatusBadge, InvoiceStatusBadge, InvoiceTypeBadge } from './status-badge';
import { AmountDisplay } from './amount-display';
import { DocumentHistoryTimeline } from './document-history-timeline';
import { orderService } from '../services/order-service';
import { InvoiceFormDialog } from './invoice-form-dialog';

// Valid order transitions
const ORDER_TRANSITIONS = {
  CONFIRMED:   ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED:   [],
  CANCELLED:   [],
};

function fmtDate(d, lang) {
  if (!d) return '—';
  return new Intl.DateTimeFormat(lang === 'de' ? 'de-CH' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(d));
}

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${mono ? 'font-mono' : ''}`}>{value ?? '—'}</span>
    </div>
  );
}

function OverviewTab({ order, de, language, onTransition, onDownloadPdf, pdfLoading }) {
  const allowed = ORDER_TRANSITIONS[order?.status] ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4">
        <InfoRow label={de ? 'Auftragsnummer' : 'Order Number'} value={order?.orderNumber} mono />
        <InfoRow label={de ? 'Status' : 'Status'} value={<OrderStatusBadge status={order?.status} />} />
        <InfoRow label={de ? 'Kunde' : 'Customer'} value={order?.customerName ?? order?.customer?.name} />
        <InfoRow label={de ? 'Erstellt' : 'Created'} value={fmtDate(order?.createdAt, language)} />
        <InfoRow label={de ? 'Quelle' : 'Source Quotation'} value={order?.sourceQuotationNumber ?? '—'} mono />
        <InfoRow
          label={de ? 'Gesamtbetrag' : 'Total'}
          value={<AmountDisplay amount={order?.grandTotalRounded ?? order?.grandTotal} currency={order?.currency} className="font-semibold" />}
        />
      </div>

      <div className="flex gap-2 flex-wrap">
        {allowed.map((s) => {
          const labels = {
            de: { IN_PROGRESS: 'In Bearbeitung', COMPLETED: 'Abschliessen', CANCELLED: 'Stornieren' },
            en: { IN_PROGRESS: 'Start', COMPLETED: 'Complete', CANCELLED: 'Cancel' },
          };
          const variant = s === 'CANCELLED' ? 'destructive' : s === 'COMPLETED' ? 'default' : 'outline';
          return (
            <Button key={s} size="sm" variant={variant} onClick={() => onTransition(s)}>
              {labels[de ? 'de' : 'en'][s] ?? s}
            </Button>
          );
        })}
        <Button size="sm" variant="outline" onClick={onDownloadPdf} disabled={pdfLoading} className="ml-auto">
          {pdfLoading
            ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            : <Download className="h-4 w-4 mr-2" />}
          {de ? 'PDF herunterladen' : 'Download PDF'}
        </Button>
      </div>
    </div>
  );
}

function LineItemsTab({ order, de }) {
  const items = order?.lineItems ?? [];
  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border overflow-hidden text-sm">
        <div className="grid grid-cols-[2rem_1fr_4rem_5rem_4rem_4rem_6rem] bg-muted/50 border-b text-xs font-medium text-muted-foreground">
          {['#', de ? 'Beschreibung' : 'Description', de ? 'Menge' : 'Qty', de ? 'Einheit' : 'Unit',
            de ? 'Preis' : 'Price', 'MwSt', de ? 'Total' : 'Total'].map((h, i) => (
            <div key={i} className={`px-3 py-2 ${i >= 4 ? 'text-right' : ''}`}>{h}</div>
          ))}
        </div>
        {items.map((li, i) => (
          <div key={i} className="grid grid-cols-[2rem_1fr_4rem_5rem_4rem_4rem_6rem] border-b last:border-0 hover:bg-muted/20">
            <div className="px-3 py-2.5 text-xs text-muted-foreground">{li.position ?? i + 1}</div>
            <div className="px-3 py-2.5">
              {li.articleNumber && <span className="text-xs text-muted-foreground mr-1.5">{li.articleNumber}</span>}
              {li.description}
            </div>
            <div className="px-3 py-2.5 text-right">{li.quantity}</div>
            <div className="px-3 py-2.5">{li.unit}</div>
            <div className="px-3 py-2.5 text-right">{fmt(li.unitPrice)}</div>
            <div className="px-3 py-2.5 text-right text-muted-foreground">{li.vatRate}%</div>
            <div className="px-3 py-2.5 text-right font-medium">{fmt(li.lineTotal)}</div>
          </div>
        ))}
      </div>
      <div className="self-end w-64 rounded-lg border border-border overflow-hidden text-sm">
        <div className="flex justify-between px-4 py-2">
          <span className="text-muted-foreground">{de ? 'Zwischensumme' : 'Subtotal'}</span>
          <span className="tabular-nums">{fmt(order?.subtotal)}</span>
        </div>
        {(order?.vatBreakdown ?? []).map((v) => (
          <div key={v.rate} className="flex justify-between px-4 py-1.5 text-xs text-muted-foreground border-t border-border">
            <span>MwSt {v.rate}%</span><span className="tabular-nums">{fmt(v.amount)}</span>
          </div>
        ))}
        <div className="flex justify-between px-4 py-2.5 bg-muted/30 font-semibold border-t border-border">
          <span>{de ? 'Gesamt' : 'Total'}</span>
          <span className="tabular-nums">{fmt(order?.grandTotalRounded ?? order?.grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}

function BillingPlanTab({ orderId, de }) {
  const { data: plan, isLoading } = useBillingPlan(orderId);
  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

  if (isLoading) return <Skeleton className="h-32 w-full" />;
  if (!plan) return <p className="text-sm text-muted-foreground py-6 text-center">{de ? 'Keine Daten.' : 'No data.'}</p>;

  const pct = plan.percentInvoiced || 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: de ? 'Projektwert' : 'Project Value', value: fmt(plan.projectTotal), color: 'text-foreground' },
          { label: de ? 'Bereits fakturiert' : 'Invoiced', value: fmt(plan.advancesInvoiced), color: 'text-amber-700' },
          { label: de ? 'Restbetrag' : 'Remaining', value: fmt(plan.remainingForFinal), color: 'text-emerald-700' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-lg border border-border p-3 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className={`text-lg font-bold tabular-nums ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{de ? 'Fortschritt' : 'Progress'}</span><span>{pct}%</span>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      {(plan.advances ?? []).length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden text-sm">
          <div className="grid grid-cols-[1fr_5rem_5rem_6rem_5rem] bg-muted/50 border-b text-xs font-medium text-muted-foreground px-3 py-2">
            <div>{de ? 'Akontorechnung' : 'Advance Invoice'}</div>
            <div>{de ? 'Datum' : 'Date'}</div>
            <div className="text-right">%</div>
            <div className="text-right">{de ? 'Betrag' : 'Amount'}</div>
            <div>{de ? 'Status' : 'Status'}</div>
          </div>
          {plan.advances.map((a) => (
            <div key={a._id} className="grid grid-cols-[1fr_5rem_5rem_6rem_5rem] border-b last:border-0 px-3 py-2.5">
              <div className="font-mono text-muted-foreground">{a.invoiceNumber}</div>
              <div className="text-muted-foreground">{a.invoiceDate?.slice(0, 10) ?? '—'}</div>
              <div className="text-right">{a.milestonePercent ?? '—'}%</div>
              <div className="text-right font-medium">{fmt(a.grandTotalRounded)}</div>
              <div><InvoiceStatusBadge status={a.status} /></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InvoicesTab({ orderId, de, language, onCreateInvoice }) {
  const { data: invoices = [], isLoading } = useOrderInvoices(orderId);
  const fmt = (n) => new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 justify-end flex-wrap">
        <Button size="sm" variant="outline" onClick={() => onCreateInvoice('STANDARD')}>
          <Plus className="h-4 w-4 mr-1.5" />{de ? 'Rechnung' : 'Invoice'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCreateInvoice('ADVANCE')}>
          <Plus className="h-4 w-4 mr-1.5" />{de ? 'Akontorechnung' : 'Advance'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => onCreateInvoice('FINAL')}>
          <Plus className="h-4 w-4 mr-1.5" />{de ? 'Schlussrechnung' : 'Final'}
        </Button>
      </div>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {!isLoading && invoices.length === 0 && (
        <p className="text-sm text-muted-foreground py-6 text-center">
          {de ? 'Keine Rechnungen.' : 'No invoices yet.'}
        </p>
      )}
      {!isLoading && invoices.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden text-sm">
          <div className="grid grid-cols-[8rem_6rem_7rem_7rem_1fr] bg-muted/50 border-b text-xs font-medium text-muted-foreground">
            {[de ? 'Nummer' : 'Number', de ? 'Typ' : 'Type', de ? 'Status' : 'Status', de ? 'Fällig' : 'Due', de ? 'Betrag' : 'Amount'].map((h, i) => (
              <div key={i} className={`px-3 py-2 ${i === 4 ? 'text-right' : ''}`}>{h}</div>
            ))}
          </div>
          {invoices.map((inv) => (
            <div key={inv._id ?? inv.id} className="grid grid-cols-[8rem_6rem_7rem_7rem_1fr] border-b last:border-0 hover:bg-muted/20">
              <div className="px-3 py-2.5 font-mono text-muted-foreground">{inv.invoiceNumber}</div>
              <div className="px-3 py-2.5"><InvoiceTypeBadge type={inv.invoiceType} /></div>
              <div className="px-3 py-2.5"><InvoiceStatusBadge status={inv.status} /></div>
              <div className="px-3 py-2.5 text-muted-foreground">{fmtDate(inv.dueDate, language)}</div>
              <div className="px-3 py-2.5 text-right font-medium">{fmt(inv.grandTotalRounded ?? inv.grandTotal)} {inv.currency}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function OrderDetailDialog({ open, onClose, orderId }) {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [tab, setTab] = useState('overview');
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [invoiceType, setInvoiceType] = useState(null);

  const { data: order, isLoading } = useOrderDetail(open ? orderId : null);
  const { data: history = [] } = useOrderHistory(open && tab === 'history' ? orderId : null);
  const { transitionOrderStatus } = useOrderMutations();

  const handleTransitionConfirm = () => {
    if (!transitionTarget) return;
    transitionOrderStatus.mutate({ id: orderId, targetStatus: transitionTarget });
    setTransitionTarget(null);
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await orderService.generateDocument(orderId);
      const url = res?.data?.downloadUrl ?? res?.data?.url ?? res?.url;
      if (url) window.open(url, '_blank');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              {isLoading
                ? (de ? 'Auftrag laden...' : 'Loading order...')
                : `${de ? 'Auftrag' : 'Order'} ${order?.orderNumber ?? ''}`}
            </DialogTitle>
          </DialogHeader>

          {isLoading ? (
            <div className="flex flex-col gap-3 mt-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="mt-2">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">{de ? 'Übersicht' : 'Overview'}</TabsTrigger>
                <TabsTrigger value="items">{de ? 'Positionen' : 'Items'}</TabsTrigger>
                <TabsTrigger value="billing">{de ? 'Fakturierung' : 'Billing'}</TabsTrigger>
                <TabsTrigger value="invoices">{de ? 'Rechnungen' : 'Invoices'}</TabsTrigger>
                <TabsTrigger value="history">{de ? 'Verlauf' : 'History'}</TabsTrigger>
              </TabsList>
              <TabsContent value="overview" className="mt-4">
                <OverviewTab order={order} de={de} language={language} onTransition={setTransitionTarget} onDownloadPdf={handleDownloadPdf} pdfLoading={pdfLoading} />
              </TabsContent>
              <TabsContent value="items" className="mt-4">
                <LineItemsTab order={order} de={de} />
              </TabsContent>
              <TabsContent value="billing" className="mt-4">
                <BillingPlanTab orderId={orderId} de={de} />
              </TabsContent>
              <TabsContent value="invoices" className="mt-4">
                <InvoicesTab orderId={orderId} de={de} language={language} onCreateInvoice={setInvoiceType} />
              </TabsContent>
              <TabsContent value="history" className="mt-4">
                <DocumentHistoryTimeline history={history} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Create invoice from order */}
      {invoiceType && (
        <InvoiceFormDialog
          open={!!invoiceType}
          onClose={() => setInvoiceType(null)}
          type={invoiceType}
          sourceOrderId={orderId}
          sourceOrder={order}
        />
      )}

      {/* Confirm status transition */}
      <Dialog open={!!transitionTarget} onOpenChange={() => setTransitionTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{de ? 'Status bestätigen' : 'Confirm Status Change'}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {de
              ? `Status zu "${transitionTarget}" ändern?`
              : `Change status to "${transitionTarget}"?`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTransitionTarget(null)}>
              {de ? 'Abbrechen' : 'Cancel'}
            </Button>
            <Button
              variant={transitionTarget === 'CANCELLED' ? 'destructive' : 'default'}
              onClick={handleTransitionConfirm}
            >
              {de ? 'Bestätigen' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
