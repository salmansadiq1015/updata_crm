'use client';

import { useMemo, useState } from 'react';
import { Download, LineChart, TrendingDown, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useProfitLoss } from '@/modules/accounting/hooks/use-accounting-queries';
import { reportsService } from '@/modules/accounting/services/accounting-service';
import { downloadResponse, formatMoney } from '@/modules/accounting/utils/accounting-ui';

function currentYearRange() {
  const now = new Date();
  return {
    startDate: `${now.getFullYear()}-01-01`,
    endDate: now.toISOString().slice(0, 10),
  };
}

function SummaryTile({ label, value, icon: Icon, tone }) {
  const toneClass = tone === 'positive'
    ? 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30'
    : tone === 'negative'
      ? 'text-red-600 bg-red-100 dark:bg-red-900/30'
      : 'text-sky-600 bg-sky-100 dark:bg-sky-900/30';

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${toneClass}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className={`mt-3 text-2xl font-bold tabular-nums ${tone === 'negative' ? 'text-red-600' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function ReportRows({ title, rows, currency, de }) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="border-b border-border bg-muted/30 px-3 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">{de ? 'Konto' : 'Account'}</th>
            <th className="px-3 py-2 text-right">{de ? 'Soll' : 'Debit'}</th>
            <th className="px-3 py-2 text-right">{de ? 'Haben' : 'Credit'}</th>
            <th className="px-3 py-2 text-right">{de ? 'Betrag' : 'Amount'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.type}-${row.accountNumber}`} className="border-t border-border/50">
              <td className="px-3 py-2.5">
                <span className="font-mono text-xs text-muted-foreground mr-2">{row.accountNumber}</span>
                <span className="font-medium">{row.accountName}</span>
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.debit, currency)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(row.credit, currency)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatMoney(row.amount, currency)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {de ? 'Keine Buchungen im Zeitraum.' : 'No postings in this period.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountingReportsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const initialRange = useMemo(() => currentYearRange(), []);
  const [filters, setFilters] = useState(initialRange);
  const params = { ...filters, currency: 'CHF' };
  const { data: report, isLoading } = useProfitLoss(params);

  const handleExport = async () => {
    const response = await reportsService.exportProfitLoss(params);
    downloadResponse(response, `profit-loss-${filters.startDate}-${filters.endDate}.csv`);
  };

  return (
    <div className="flex flex-col gap-5 max-w-7xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Finanzberichte' : 'Financial Reports'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {de ? 'Erfolgsrechnung aus dem Journal.' : 'Profit and loss from posted journal entries.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            className="h-9 w-40"
            value={filters.startDate}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
          />
          <Input
            type="date"
            className="h-9 w-40"
            value={filters.endDate}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
          />
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-1.5" />
            CSV
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryTile label={de ? 'Ertrag' : 'Revenue'} value={formatMoney(report?.revenue, report?.currency)} icon={TrendingUp} tone="positive" />
          <SummaryTile label={de ? 'Aufwand' : 'Expenses'} value={formatMoney(report?.expenses, report?.currency)} icon={TrendingDown} tone="negative" />
          <SummaryTile
            label={de ? 'Gewinn / Verlust' : 'Profit / Loss'}
            value={formatMoney(report?.netProfit, report?.currency)}
            icon={LineChart}
            tone={(report?.netProfit || 0) < 0 ? 'negative' : 'neutral'}
          />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <ReportRows title={de ? 'Ertragskonten' : 'Revenue Accounts'} rows={report?.groups?.revenue || []} currency={report?.currency} de={de} />
        <ReportRows title={de ? 'Aufwandskonten' : 'Expense Accounts'} rows={report?.groups?.expenses || []} currency={report?.currency} de={de} />
      </div>
    </div>
  );
}
