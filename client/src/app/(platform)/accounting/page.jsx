'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  Archive,
  Banknote,
  ChevronRight,
  Clock,
  FileText,
  Landmark,
  LineChart,
  Receipt,
  Scale,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  useApAging,
  useApSummary,
  useArAging,
  useArSummary,
  useBankAccounts,
  useCashForecast,
  useProfitLoss,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { Skeleton } from '@/components/ui/skeleton';

const fmt = (value, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value ?? 0);

function currentYearRange() {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

function StatCard({ label, value, sub, icon: Icon, color, href, danger = false }) {
  const content = (
    <div className={`rounded-xl border border-border bg-card p-4 flex flex-col gap-3 transition-shadow ${href ? 'hover:shadow-md' : ''}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <p className={`text-2xl font-bold tabular-nums ${danger ? 'text-red-600' : ''}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );

  return href ? <Link href={href}>{content}</Link> : content;
}

function AgingBuckets({ buckets, label, de }) {
  if (!buckets) return null;
  const rows = [
    { key: 'current', label: de ? 'Aktuell' : 'Current', color: 'bg-emerald-500' },
    { key: '1_30', label: '1-30 Tage', color: 'bg-yellow-500' },
    { key: '31_60', label: '31-60 Tage', color: 'bg-orange-500' },
    { key: '61_90', label: '61-90 Tage', color: 'bg-red-400' },
    { key: 'over_90', label: '> 90 Tage', color: 'bg-red-700' },
  ];
  const total = rows.reduce((sum, row) => sum + (buckets[row.key] ?? 0), 0) || 1;

  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">{fmt(total)}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {rows.map((row) => (
          <div
            key={row.key}
            className={row.color}
            style={{ width: `${((buckets[row.key] ?? 0) / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${row.color}`} />
              <span className="text-muted-foreground">{row.label}</span>
            </div>
            <span className="font-medium tabular-nums">{fmt(buckets[row.key] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV_CARDS = [
  { href: '/accounting/receivables', label: 'Forderungen', labelEn: 'Receivables', icon: TrendingUp, color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { href: '/accounting/payables', label: 'Verbindlichkeiten', labelEn: 'Payables', icon: TrendingDown, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { href: '/accounting/bank', label: 'Bank', labelEn: 'Bank', icon: Landmark, color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  { href: '/accounting/cash', label: 'Liquiditaet', labelEn: 'Cash Flow', icon: WalletCards, color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  { href: '/accounting/reconciliation', label: 'Abstimmung', labelEn: 'Reconciliation', icon: Scale, color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { href: '/accounting/open-items', label: 'Offene Posten', labelEn: 'Open Items', icon: Clock, color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  { href: '/accounting/reports', label: 'Berichte', labelEn: 'Reports', icon: LineChart, color: 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400' },
  { href: '/accounting/documents', label: 'Belege', labelEn: 'Documents', icon: Archive, color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400' },
  { href: '/accounting/journal', label: 'Journal', labelEn: 'Journal', icon: Receipt, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' },
  { href: '/accounting/chart-of-accounts', label: 'Kontenplan', labelEn: 'Chart of Accounts', icon: FileText, color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400' },
];

export default function AccountingDashboard() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const yearRange = currentYearRange();

  const { data: arSummary, isLoading: arLoading } = useArSummary();
  const { data: apSummary, isLoading: apLoading } = useApSummary();
  const { data: arAging } = useArAging();
  const { data: apAging } = useApAging();
  const { data: bankAccounts = [], isLoading: bankLoading } = useBankAccounts();
  const { data: cashForecast, isLoading: cashLoading } = useCashForecast({ days: 30 });
  const { data: profitLoss, isLoading: reportLoading } = useProfitLoss({ ...yearRange, currency: 'CHF' });

  const totalBankBalance = bankAccounts.reduce((sum, account) => sum + (account.currentBalance ?? 0), 0);
  const projections = cashForecast?.projections || [];
  const projectedBalance = projections.length
    ? projections[projections.length - 1].netPosition
    : cashForecast?.currentBalance;
  const upcomingOutflows = projections.reduce((sum, day) => sum + (day.outflows || 0), 0);
  const loading = arLoading || apLoading || bankLoading || cashLoading || reportLoading;

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Buchhaltung' : 'Accounting'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {de ? 'Finanzlage, Liquiditaet und offene Verpflichtungen auf einen Blick.' : 'Financial position, liquidity, and open obligations at a glance.'}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {loading ? (
          Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-xl" />)
        ) : (
          <>
            <StatCard
              label={de ? 'Offene Forderungen' : 'Open Receivables'}
              value={fmt(arSummary?.openAmount)}
              sub={`${arSummary?.openCount ?? 0} ${de ? 'Rechnungen' : 'invoices'}`}
              icon={TrendingUp}
              color="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
              href="/accounting/receivables"
            />
            <StatCard
              label={de ? 'Ueberfaellig' : 'Overdue'}
              value={fmt(arSummary?.overdueAmount)}
              sub={`${arSummary?.overdueCount ?? 0} ${de ? 'offen' : 'open'}`}
              icon={AlertTriangle}
              color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              href="/accounting/receivables"
              danger={(arSummary?.overdueAmount || 0) > 0}
            />
            <StatCard
              label={de ? 'Verbindlichkeiten' : 'Payables'}
              value={fmt(apSummary?.openAmount)}
              sub={`${apSummary?.openCount ?? 0} ${de ? 'Rechnungen' : 'invoices'}`}
              icon={TrendingDown}
              color="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
              href="/accounting/payables"
            />
            <StatCard
              label={de ? 'Bankguthaben' : 'Bank Balance'}
              value={fmt(totalBankBalance)}
              sub={`${bankAccounts.length} ${de ? 'Konten' : 'accounts'}`}
              icon={Banknote}
              color="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              href="/accounting/bank"
            />
            <StatCard
              label={de ? '30 Tage Cash' : '30-Day Cash'}
              value={fmt(projectedBalance)}
              sub={`${de ? 'Faellige Zahlungen' : 'Due outflows'} ${fmt(upcomingOutflows)}`}
              icon={WalletCards}
              color="bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
              href="/accounting/cash"
              danger={(projectedBalance || 0) < 0}
            />
            <StatCard
              label={de ? 'Gewinn YTD' : 'YTD Profit'}
              value={fmt(profitLoss?.netProfit, profitLoss?.currency)}
              sub={`${de ? 'Marge' : 'Margin'} ${Number(profitLoss?.margin || 0).toFixed(1)}%`}
              icon={LineChart}
              color="bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400"
              href="/accounting/reports"
              danger={(profitLoss?.netProfit || 0) < 0}
            />
          </>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <AgingBuckets
          buckets={arAging?.buckets}
          label={de ? 'Forderungen nach Faelligkeit' : 'AR Aging'}
          de={de}
        />
        <AgingBuckets
          buckets={apAging?.buckets}
          label={de ? 'Verbindlichkeiten nach Faelligkeit' : 'AP Aging'}
          de={de}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          {de ? 'Arbeitsbereiche' : 'Workspaces'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {NAV_CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-xl border border-border bg-card p-4 flex flex-col items-start gap-3 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <span className={`h-9 w-9 rounded-lg flex items-center justify-center ${card.color}`}>
                <card.icon className="h-4.5 w-4.5" />
              </span>
              <div className="flex items-center gap-1 w-full">
                <span className="text-sm font-medium flex-1">{de ? card.label : card.labelEn}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
