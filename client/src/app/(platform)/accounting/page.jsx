'use client';

import Link from 'next/link';
import {
  Receipt, TrendingUp, TrendingDown, Clock, AlertTriangle,
  ChevronRight, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useApSummary, useApAging, useArSummary, useArAging, useBankAccounts } from '@/modules/accounting/hooks/use-accounting-queries';
import { Skeleton } from '@/components/ui/skeleton';

const fmt = (n, currency = 'CHF') =>
  new Intl.NumberFormat('de-CH', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n ?? 0);

function StatCard({ label, value, sub, icon: Icon, color, href, trend }) {
  const content = (
    <div className={`rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow ${href ? 'cursor-pointer' : ''}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {trend != null && (
        <div className={`flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {trend >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
          {Math.abs(trend).toFixed(1)}% vs. last month
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function AgingBuckets({ buckets, label, de }) {
  if (!buckets) return null;
  const rows = [
    { key: 'current',   label: de ? 'Aktuell' : 'Current',     color: 'bg-emerald-500' },
    { key: '1_30',      label: '1–30 Tage',                    color: 'bg-yellow-500'  },
    { key: '31_60',     label: '31–60 Tage',                   color: 'bg-orange-500'  },
    { key: '61_90',     label: '61–90 Tage',                   color: 'bg-red-400'     },
    { key: 'over_90',   label: '> 90 Tage',                    color: 'bg-red-700'     },
  ];
  const total = rows.reduce((s, r) => s + (buckets[r.key] ?? 0), 0) || 1;
  return (
    <div className="rounded-xl border border-border bg-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-muted-foreground">{fmt(total)}</span>
      </div>
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
        {rows.map((r) => (
          <div
            key={r.key}
            className={`${r.color} transition-all`}
            style={{ width: `${((buckets[r.key] ?? 0) / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${r.color}`} />
              <span className="text-muted-foreground">{r.label}</span>
            </div>
            <span className="font-medium tabular-nums">{fmt(buckets[r.key] ?? 0)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV_CARDS = [
  { href: '/accounting/receivables', label: 'Forderungen', labelEn: 'Receivables', icon: TrendingUp,   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { href: '/accounting/payables',    label: 'Verbindlichkeiten', labelEn: 'Payables', icon: TrendingDown, color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  { href: '/accounting/journal',     label: 'Journal',     labelEn: 'Journal',      icon: Receipt,      color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
  { href: '/accounting/bank',        label: 'Bank',        labelEn: 'Bank',         icon: Clock,        color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  { href: '/accounting/chart-of-accounts', label: 'Kontenplan', labelEn: 'Chart of Accounts', icon: AlertTriangle, color: 'bg-slate-100 text-slate-700 dark:bg-slate-900/30 dark:text-slate-400' },
];

export default function AccountingDashboard() {
  const { locale: language } = useLanguage();
  const de = language === 'de';

  const { data: arSummary, isLoading: arLoading } = useArSummary();
  const { data: apSummary, isLoading: apLoading } = useApSummary();
  const { data: arAging } = useArAging();
  const { data: apAging } = useApAging();
  const { data: bankAccounts = [] } = useBankAccounts();

  const totalBankBalance = bankAccounts.reduce((s, b) => s + (b.currentBalance ?? 0), 0);

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">{de ? 'Buchhaltung' : 'Accounting'}</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {de ? 'Übersicht Forderungen, Verbindlichkeiten und Liquidität.' : 'Overview of receivables, payables, and liquidity.'}
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {arLoading || apLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
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
              label={de ? 'Überfällige Forderungen' : 'Overdue'}
              value={fmt(arSummary?.overdueAmount)}
              sub={`${arSummary?.overdueCount ?? 0} ${de ? 'überfällig' : 'overdue'}`}
              icon={AlertTriangle}
              color="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              href="/accounting/receivables"
            />
            <StatCard
              label={de ? 'Offene Verbindlichkeiten' : 'Open Payables'}
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
              icon={Receipt}
              color="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
              href="/accounting/bank"
            />
          </>
        )}
      </div>

      {/* Aging charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <AgingBuckets
          buckets={arAging?.buckets}
          label={de ? 'Forderungen nach Fälligkeit' : 'AR Aging'}
          de={de}
        />
        <AgingBuckets
          buckets={apAging?.buckets}
          label={de ? 'Verbindlichkeiten nach Fälligkeit' : 'AP Aging'}
          de={de}
        />
      </div>

      {/* Navigation cards */}
      <div>
        <h2 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
          {de ? 'Module' : 'Modules'}
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {NAV_CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-xl border border-border bg-card p-4 flex flex-col items-start gap-3 hover:shadow-md hover:border-primary/30 transition-all group"
            >
              <span className={`h-9 w-9 rounded-lg flex items-center justify-center ${c.color}`}>
                <c.icon className="h-4.5 w-4.5" />
              </span>
              <div className="flex items-center gap-1 w-full">
                <span className="text-sm font-medium flex-1">{de ? c.label : c.labelEn}</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
