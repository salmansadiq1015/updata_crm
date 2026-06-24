'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, FileText, Package } from 'lucide-react';
import { PageHeader } from '@/shared/components/page-header';
import { QuotationsTable } from '@/modules/qop/components/quotations-table';
import { OrdersTable } from '@/modules/qop/components/orders-table';
import { InvoicesTable } from '@/modules/qop/components/invoices-table';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useInvoiceAging, useQopPipeline } from '@/modules/qop/hooks/use-qop-queries';
import { QopAdvancedFilters } from '@/modules/qop/components/qop-advanced-filters';
import { Skeleton } from '@/components/ui/skeleton';

const TABS = ['quotations', 'orders', 'invoices'];
const TAB_TRANSLATIONS = {
  quotations: 'qop.tabs.quotations',
  orders: 'qop.tabs.orders',
  invoices: 'qop.tabs.invoices',
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
    Object.entries(filters).filter((entry) => {
      const [key, value] = entry;
      return key !== 'type' && value !== '' && value !== undefined && value !== null;
    }),
  );
  if (cleaned.status && !TAB_STATUSES[tabType]?.includes(cleaned.status)) {
    delete cleaned.status;
  }
  return cleaned;
}

function KpiCard({
  icon: Icon, iconColor, label, value, sub, loading,
}) {
  return (
    <div className="group flex min-w-0 items-start gap-3 overflow-hidden rounded-xl border border-border/70 bg-card/80 px-5 py-4 shadow-sm ring-1 ring-white/5 backdrop-blur transition duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg dark:bg-slate-950/50">
      <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-300 group-hover:scale-105', iconColor)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-xs text-muted-foreground">{label}</span>
        {loading
          ? <Skeleton className="h-6 w-16 rounded" />
          : <span className="text-xl font-bold leading-tight tabular-nums">{value}</span>}
        {sub && !loading && (
          <span className="truncate text-xs tabular-nums text-muted-foreground">{sub}</span>
        )}
      </div>
    </div>
  );
}

function StatsBar({ de }) {
  const { data: pipeline, isLoading: pLoading } = useQopPipeline();
  const { data: aging, isLoading: aLoading } = useInvoiceAging();

  const rawByStatus = pipeline?.byStatus ?? [];
  const byStatus = Array.isArray(rawByStatus)
    ? rawByStatus
    : Object.entries(rawByStatus || {}).map(([status, count]) => ({
      status,
      count,
      totalValue: pipeline?.totalValue?.[status] ?? 0,
    }));

  const openStatuses = ['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED'];
  const openQuotes = byStatus.filter((bucket) => openStatuses.includes(bucket.status));
  const openCount = openQuotes.reduce((sum, bucket) => sum + (bucket.count ?? 0), 0);
  const openValue = openQuotes.reduce((sum, bucket) => sum + (bucket.totalValue ?? 0), 0);

  const orderStatusCounts = pipeline?.orderStatusCounts ?? {};
  const activeCount = (orderStatusCounts.CONFIRMED ?? 0) + (orderStatusCounts.IN_PROGRESS ?? 0);

  const rawAging = aging?.overdue ?? aging ?? null;
  const overdueCount = rawAging?.count ?? 0;
  const overdueValue = rawAging?.totalValue ?? aging?.total ?? 0;

  const rawBuckets = Array.isArray(aging?.buckets) ? aging.buckets : [];
  const paidBucket = rawBuckets.find((bucket) => bucket.label === 'paid_this_month');
  const paidAmount = paidBucket?.totalValue ?? 0;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={FileText}
        iconColor="bg-blue-500/10 text-blue-600 ring-blue-500/20 dark:text-blue-200"
        label={de ? 'Offene Offerten' : 'Open Quotations'}
        value={openCount}
        sub={openValue > 0 ? fmt(openValue) : undefined}
        loading={pLoading}
      />
      <KpiCard
        icon={Package}
        iconColor="bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:text-amber-200"
        label={de ? 'Aktive Auftraege' : 'Active Orders'}
        value={activeCount}
        loading={pLoading}
      />
      <KpiCard
        icon={AlertTriangle}
        iconColor="bg-red-500/10 text-red-600 ring-red-500/20 dark:text-red-200"
        label={de ? 'Ueberfaellige Rechnungen' : 'Overdue Invoices'}
        value={overdueCount}
        sub={overdueValue > 0 ? fmt(overdueValue) : undefined}
        loading={aLoading}
      />
      <KpiCard
        icon={CheckCircle}
        iconColor="bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:text-emerald-200"
        label={de ? 'Bezahlt (Monat)' : 'Paid (Month)'}
        value={paidAmount > 0 ? fmt(paidAmount) : '-'}
        loading={aLoading}
      />
    </div>
  );
}

function StatusCountsWidget({ de }) {
  const { data: pipeline } = useQopPipeline();
  if (!pipeline) return null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm ring-1 ring-white/5 backdrop-blur dark:bg-slate-950/50">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {de ? 'Offerten nach Status' : 'Quotations by Status'}
      </h3>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            status: 'DRAFT',
            label: de ? 'Entwurf' : 'Draft',
            color: 'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-200',
          },
          {
            status: 'SENT',
            label: de ? 'Gesendet' : 'Sent',
            color: 'border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-200',
          },
          {
            status: 'ACCEPTED',
            label: de ? 'Angenommen' : 'Accepted',
            color: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200',
          },
          {
            status: 'EXPIRED',
            label: de ? 'Abgelaufen' : 'Expired',
            color: 'border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-200',
          },
        ].map(({ status, label, color }) => {
          const count = pipeline?.statusCounts?.[status]
            ?? pipeline?.byStatus?.find?.((entry) => entry.status === status)?.count
            ?? 0;
          return (
            <div key={status} className={cn('flex flex-col gap-1 rounded-lg border p-3 transition duration-300 hover:-translate-y-0.5 hover:shadow-sm', color)}>
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
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const [tab, setTab] = useState('quotations');
  const [advFilters, setAdvFilters] = useState({});
  const quotationFilters = cleanTableFilters(advFilters, 'quotations');
  const orderFilters = cleanTableFilters(advFilters, 'orders');
  const invoiceFilters = cleanTableFilters(advFilters, 'invoices');

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      <PageHeader
        title={t('qop.page.title', de ? 'Offerten, Auftraege & Rechnungen' : 'Quotations, Orders & Invoices')}
        description={t('qop.page.description', de
          ? 'Kundenangebote erstellen, Auftraege verwalten und Rechnungen stellen'
          : 'Create customer quotes, manage orders and issue invoices')}
      />

      <StatsBar de={de} />
      <StatusCountsWidget de={de} />
      <QopAdvancedFilters onFiltersChange={setAdvFilters} />

      <div className="flex gap-1 border-b border-border/70">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            type="button"
            onClick={() => setTab(tabKey)}
            className={cn(
              'relative -mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition duration-200',
              tab === tabKey
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:bg-muted/35 hover:text-foreground',
            )}
          >
            {t(TAB_TRANSLATIONS[tabKey], tabKey)}
          </button>
        ))}
      </div>

      <div>
        {tab === 'quotations' && <QuotationsTable advancedFilters={quotationFilters} />}
        {tab === 'orders' && <OrdersTable advancedFilters={orderFilters} />}
        {tab === 'invoices' && <InvoicesTable advancedFilters={invoiceFilters} />}
      </div>
    </div>
  );
}
