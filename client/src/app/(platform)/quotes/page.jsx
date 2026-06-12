'use client';

import { useState } from 'react';
import { FileText, Package, AlertTriangle, CheckCircle } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { QuotationsTable } from '@/modules/qop/components/quotations-table';
import { OrdersTable } from '@/modules/qop/components/orders-table';
import { InvoicesTable } from '@/modules/qop/components/invoices-table';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useQopPipeline, useInvoiceAging } from '@/modules/qop/hooks/use-qop-queries';
import { QopAdvancedFilters } from '@/modules/qop/components/qop-advanced-filters';
import { Skeleton } from '@/components/ui/skeleton';

const TABS = ['quotations', 'orders', 'invoices'];
const TAB_LABEL = {
  quotations: { de: 'Offerten', en: 'Quotations' },
  orders:     { de: 'Aufträge', en: 'Orders' },
  invoices:   { de: 'Rechnungen', en: 'Invoices' },
};
const TAB_STATUSES = {
  quotations: ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'CONVERTED'],
  orders: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  invoices: ['DRAFT', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED', 'WRITTEN_OFF'],
};

function fmt(amount, currency = 'CHF') {
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount ?? 0);
}

function cleanTableFilters(filters = {}, tabType = 'quotations') {
  const cleaned = Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => key !== 'type' && value !== '' && value !== undefined && value !== null),
  );
  if (cleaned.status && !TAB_STATUSES[tabType]?.includes(cleaned.status)) {
    delete cleaned.status;
  }
  return cleaned;
}

function KpiCard({ icon: Icon, iconColor, label, value, sub, loading }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card px-5 py-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md flex-1 min-w-0">
      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md', iconColor)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-muted-foreground truncate">{label}</span>
        {loading
          ? <Skeleton className="h-6 w-16 rounded" />
          : <span className="text-xl font-bold tabular-nums leading-tight">{value}</span>}
        {sub && !loading && (
          <span className="text-xs text-muted-foreground tabular-nums truncate">{sub}</span>
        )}
      </div>
    </div>
  );
}

function StatsBar({ de }) {
  const { data: pipeline, isLoading: pLoading } = useQopPipeline();
  const { data: aging,    isLoading: aLoading } = useInvoiceAging();

  const rawByStatus = pipeline?.byStatus ?? [];
  const byStatus    = Array.isArray(rawByStatus)
    ? rawByStatus
    : Object.entries(rawByStatus || {}).map(([status, count]) => ({
      status,
      count,
      totalValue: pipeline?.totalValue?.[status] ?? 0,
    }));

  const openStatuses = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED'];
  const openQuotes = byStatus.filter((b) => openStatuses.includes(b.status));
  const openCount  = openQuotes.reduce((s, b) => s + (b.count ?? 0), 0);
  const openValue  = openQuotes.reduce((s, b) => s + (b.totalValue ?? 0), 0);

  const orderStatusCounts = pipeline?.orderStatusCounts ?? {};
  const activeCount = (orderStatusCounts.CONFIRMED ?? 0) + (orderStatusCounts.IN_PROGRESS ?? 0);

  const rawAging     = aging?.overdue ?? aging ?? null;
  const overdueCount = rawAging?.count ?? 0;
  const overdueValue = rawAging?.totalValue ?? aging?.total ?? 0;

  const rawBuckets = Array.isArray(aging?.buckets) ? aging.buckets : [];
  const paidBucket = rawBuckets.find((b) => b.label === 'paid_this_month');
  const paidAmount = paidBucket?.totalValue ?? 0;

  return (
    <div className="flex gap-3 flex-wrap">
      <KpiCard
        icon={FileText}
        iconColor="bg-blue-50 text-blue-600"
        label={de ? 'Offene Offerten' : 'Open Quotations'}
        value={openCount}
        sub={openValue > 0 ? fmt(openValue) : undefined}
        loading={pLoading}
      />
      <KpiCard
        icon={Package}
        iconColor="bg-amber-50 text-amber-600"
        label={de ? 'Aktive Aufträge' : 'Active Orders'}
        value={activeCount}
        loading={pLoading}
      />
      <KpiCard
        icon={AlertTriangle}
        iconColor="bg-red-50 text-red-600"
        label={de ? 'Überfällige Rechnungen' : 'Overdue Invoices'}
        value={overdueCount}
        sub={overdueValue > 0 ? fmt(overdueValue) : undefined}
        loading={aLoading}
      />
      <KpiCard
        icon={CheckCircle}
        iconColor="bg-emerald-50 text-emerald-600"
        label={de ? 'Bezahlt (Monat)' : 'Paid (Month)'}
        value={paidAmount > 0 ? fmt(paidAmount) : '—'}
        loading={aLoading}
      />
    </div>
  );
}

function StatusCountsWidget({ de }) {
  const { data: pipeline } = useQopPipeline();
  if (!pipeline) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm flex flex-col gap-3">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {de ? 'Offerten nach Status' : 'Quotations by Status'}
      </h3>
      <div className="grid grid-cols-4 gap-2">
        {[
          { status: 'DRAFT',    label: de ? 'Entwurf' : 'Draft',       color: 'bg-slate-100' },
          { status: 'SENT',     label: de ? 'Gesendet' : 'Sent',       color: 'bg-blue-100' },
          { status: 'ACCEPTED', label: de ? 'Angenommen' : 'Accepted', color: 'bg-emerald-100' },
          { status: 'EXPIRED',  label: de ? 'Abgelaufen' : 'Expired',  color: 'bg-amber-100' },
        ].map(({ status, label, color }) => {
          const count = pipeline?.statusCounts?.[status]
            ?? pipeline?.byStatus?.find?.((entry) => entry.status === status)?.count
            ?? 0;
          return (
            <div key={status} className={`rounded-md ${color} p-3 flex flex-col gap-1`}>
              <span className="text-2xl font-bold tabular-nums">{count}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function QuotesPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [tab, setTab] = useState('quotations');
  const [advFilters, setAdvFilters] = useState({});
  const quotationFilters = cleanTableFilters(advFilters, 'quotations');
  const orderFilters = cleanTableFilters(advFilters, 'orders');
  const invoiceFilters = cleanTableFilters(advFilters, 'invoices');

  return (
    <div className="flex flex-col gap-5 w-full min-w-0">
      <PageHeader
        title={de ? 'Offerten, Aufträge & Rechnungen' : 'Quotations, Orders & Invoices'}
        description={de
          ? 'Kundenangebote erstellen, Aufträge verwalten und Rechnungen stellen'
          : 'Create customer quotes, manage orders and issue invoices'}
      />

      <StatsBar de={de} />
      <StatusCountsWidget de={de} />
      <QopAdvancedFilters onFiltersChange={setAdvFilters} />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {de ? TAB_LABEL[t].de : TAB_LABEL[t].en}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'quotations' && <QuotationsTable advancedFilters={quotationFilters} />}
        {tab === 'orders'     && <OrdersTable advancedFilters={orderFilters} />}
        {tab === 'invoices'   && <InvoicesTable advancedFilters={invoiceFilters} />}
      </div>
    </div>
  );
}
