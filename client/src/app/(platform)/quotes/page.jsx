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
import { Skeleton } from '@/components/ui/skeleton';

const TABS = ['quotations', 'orders', 'invoices'];
const TAB_LABEL = {
  quotations: { de: 'Offerten', en: 'Quotations' },
  orders:     { de: 'Aufträge', en: 'Orders' },
  invoices:   { de: 'Rechnungen', en: 'Invoices' },
};

function fmt(amount, currency = 'CHF') {
  return new Intl.NumberFormat('de-CH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount ?? 0);
}

function KpiCard({ icon: Icon, iconColor, label, value, sub, loading }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-sm flex-1 min-w-0">
      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconColor)}>
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

  const rawByStatus = pipeline?.byStatus ?? pipeline ?? null;
  const byStatus    = Array.isArray(rawByStatus) ? rawByStatus : [];

  const openStatuses = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED'];
  const openQuotes = byStatus.filter((b) => openStatuses.includes(b.status));
  const openCount  = openQuotes.reduce((s, b) => s + (b.count ?? 0), 0);
  const openValue  = openQuotes.reduce((s, b) => s + (b.totalValue ?? 0), 0);

  const activeStatuses = ['CONFIRMED', 'IN_PROGRESS'];
  const activeOrders   = byStatus.filter((b) => activeStatuses.includes(b.status));
  const activeCount    = activeOrders.reduce((s, b) => s + (b.count ?? 0), 0);

  const rawAging     = aging?.overdue ?? aging ?? null;
  const overdueCount = rawAging?.count ?? 0;
  const overdueValue = rawAging?.totalValue ?? 0;

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

export default function QuotesPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [tab, setTab] = useState('quotations');

  return (
    <div className="flex flex-col gap-5 w-full min-w-0">
      <PageHeader
        title={de ? 'Offerten, Aufträge & Rechnungen' : 'Quotations, Orders & Invoices'}
        description={de
          ? 'Kundenangebote erstellen, Aufträge verwalten und Rechnungen stellen'
          : 'Create customer quotes, manage orders and issue invoices'}
      />

      <StatsBar de={de} />

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
        {tab === 'quotations' && <QuotationsTable />}
        {tab === 'orders'     && <OrdersTable />}
        {tab === 'invoices'   && <InvoicesTable />}
      </div>
    </div>
  );
}
