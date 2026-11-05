'use client';

import { CurrencyPicker } from '@/modules/accounting/components/currency-picker';
import { useAccountingCurrency } from '@/modules/accounting/state/accounting-currency';
import { useMemo, useState } from 'react';
import {
  BookOpen,
  Download,
  Landmark,
  LineChart,
  Scale,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  useAccounts,
  useAccountingEntities,
  useBalanceSheet,
  useCashFlowReport,
  useGeneralLedger,
  useProfitLoss,
  useTrialBalance,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { reportsService } from '@/modules/accounting/services/accounting-service';
import {
  cursorPageLabel,
  downloadResponse,
  formatDate,
  formatMoney,
} from '@/modules/accounting/utils/accounting-ui';

const REPORT_TABS = [
  { key: 'profit-loss', label: 'Erfolgsrechnung', labelEn: 'Profit & Loss', icon: LineChart },
  { key: 'balance-sheet', label: 'Bilanz', labelEn: 'Balance Sheet', icon: Landmark },
  { key: 'trial-balance', label: 'Saldenbilanz', labelEn: 'Trial Balance', icon: Scale },
  { key: 'cash-flow', label: 'Geldfluss', labelEn: 'Cash Flow', icon: WalletCards },
  { key: 'general-ledger', label: 'Hauptbuch', labelEn: 'General Ledger', icon: BookOpen },
];

const REFERENCE_TYPE_OPTIONS = [
  { value: 'AR_INVOICE', label: 'AR Rechnung', labelEn: 'AR Invoice' },
  { value: 'AR_PAYMENT', label: 'AR Zahlung', labelEn: 'AR Payment' },
  { value: 'AP_INVOICE', label: 'AP Rechnung', labelEn: 'AP Invoice' },
  { value: 'AP_PAYMENT', label: 'AP Zahlung', labelEn: 'AP Payment' },
  { value: 'BANK_FEE', label: 'Bankgebühr', labelEn: 'Bank Fee' },
  { value: 'MANUAL', label: 'Manuell', labelEn: 'Manual' },
  { value: 'REVERSAL', label: 'Storno', labelEn: 'Reversal' },
  { value: 'WRITE_OFF', label: 'Abschreibung', labelEn: 'Write-Off' },
  { value: 'INVOICE_FINALIZED', label: 'Rechnung finalisiert', labelEn: 'Invoice Finalized' },
  { value: 'INVOICE_PAYMENT', label: 'Rechnungszahlung', labelEn: 'Invoice Payment' },
  { value: 'AUTO_RECONCILIATION', label: 'Auto-Abgleich', labelEn: 'Auto Reconciliation' },
  { value: 'MANUAL_RECONCILIATION', label: 'Manueller Abgleich', labelEn: 'Manual Reconciliation' },
  { value: 'CATEGORIZATION', label: 'Kategorisierung', labelEn: 'Categorization' },
  { value: 'NETTING', label: 'Verrechnung', labelEn: 'Netting' },
];

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

function reportSummary(activeReport, report, de) {
  if (activeReport === 'balance-sheet') {
    return [
      { label: de ? 'Aktiven' : 'Assets', value: report?.totalAssets, icon: TrendingUp, tone: 'positive' },
      { label: de ? 'Passiven + EK' : 'Liabilities + Equity', value: report?.totalLiabilitiesAndEquity, icon: TrendingDown, tone: 'neutral' },
      { label: de ? 'Differenz' : 'Imbalance', value: report?.imbalance, icon: Scale, tone: Number(report?.imbalance || 0) === 0 ? 'positive' : 'negative' },
    ];
  }
  if (activeReport === 'trial-balance') {
    return [
      { label: de ? 'Soll' : 'Debit', value: report?.totalDebit, icon: TrendingUp, tone: 'neutral' },
      { label: de ? 'Haben' : 'Credit', value: report?.totalCredit, icon: TrendingDown, tone: 'neutral' },
      { label: de ? 'Differenz' : 'Imbalance', value: report?.imbalance, icon: Scale, tone: Number(report?.imbalance || 0) === 0 ? 'positive' : 'negative' },
    ];
  }
  if (activeReport === 'cash-flow') {
    return [
      { label: de ? 'Operativ' : 'Operating', value: report?.operating, icon: WalletCards, tone: 'neutral' },
      { label: de ? 'Investition' : 'Investing', value: report?.investing, icon: Landmark, tone: 'neutral' },
      { label: de ? 'Finanzierung' : 'Financing', value: report?.financing, icon: Scale, tone: 'neutral' },
      { label: de ? 'Netto Cashflow' : 'Net Cash Flow', value: report?.netCashFlow, icon: LineChart, tone: Number(report?.netCashFlow || 0) < 0 ? 'negative' : 'positive' },
    ];
  }
  return [
    { label: de ? 'Ertrag' : 'Revenue', value: report?.revenue, icon: TrendingUp, tone: 'positive' },
    { label: de ? 'Aufwand' : 'Expenses', value: report?.expenses, icon: TrendingDown, tone: 'negative' },
    { label: de ? 'Gewinn / Verlust' : 'Profit / Loss', value: report?.netProfit, icon: LineChart, tone: Number(report?.netProfit || 0) < 0 ? 'negative' : 'neutral' },
  ];
}

function reportRows(activeReport, report) {
  if (!report) return [];
  if (activeReport === 'balance-sheet') return report.rows || [];
  if (activeReport === 'trial-balance') return report.rows || [];
  if (activeReport === 'cash-flow') return report.rows || [];
  return report.rows || [];
}

function accountLabel(account) {
  if (!account || typeof account !== 'object') return '-';
  return [account.accountNumber, account.name].filter(Boolean).join(' ');
}

function entityLabel(entity) {
  if (!entity || typeof entity !== 'object') return '-';
  return [entity.entityCode, entity.name].filter(Boolean).join(' ');
}

function parentId(entity) {
  if (!entity?.parentId) return null;
  return typeof entity.parentId === 'object' ? entity.parentId._id : entity.parentId;
}

function ReportRows({ activeReport, rows, currency, de }) {
  const amountLabel = activeReport === 'cash-flow'
    ? (de ? 'Cashflow' : 'Cash Flow')
    : activeReport === 'trial-balance'
      ? (de ? 'Saldo' : 'Balance')
      : (de ? 'Betrag' : 'Amount');

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">{de ? 'Konto' : 'Account'}</th>
            <th className="px-3 py-2 text-left">{de ? 'Typ' : 'Type'}</th>
            <th className="px-3 py-2 text-right">{de ? 'Soll' : 'Debit'}</th>
            <th className="px-3 py-2 text-right">{de ? 'Haben' : 'Credit'}</th>
            <th className="px-3 py-2 text-right">{amountLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const debit = row.debitBalance ?? row.debit;
            const credit = row.creditBalance ?? row.credit;
            const amount = row.balance ?? row.amount;
            return (
              <tr key={`${row.accountId || row.type}-${row.accountNumber}`} className="border-t border-border/50">
                <td className="px-3 py-2.5">
                  <span className="font-mono text-xs text-muted-foreground mr-2">{row.accountNumber}</span>
                  <span className="font-medium">{row.accountName}</span>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{row.category || row.type}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(debit, currency)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatMoney(credit, currency)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatMoney(amount, currency)}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {de ? 'Keine Buchungen im Zeitraum.' : 'No postings in this period.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GeneralLedgerRows({
  rows,
  pagination,
  currency,
  cursorStack,
  onPrevious,
  onNext,
  de,
  t,
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left">{de ? 'Datum' : 'Date'}</th>
            <th className="px-3 py-2 text-left">{de ? 'Nr.' : 'No.'}</th>
            <th className="px-3 py-2 text-left">{de ? 'Beschreibung' : 'Description'}</th>
            <th className="px-3 py-2 text-left">{de ? 'Soll' : 'Debit'}</th>
            <th className="px-3 py-2 text-left">{de ? 'Haben' : 'Credit'}</th>
            <th className="px-3 py-2 text-left">{de ? 'Referenz' : 'Reference'}</th>
            <th className="px-3 py-2 text-right">{de ? 'Betrag' : 'Amount'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((entry) => (
            <tr key={entry._id} className="border-t border-border/50 hover:bg-muted/30 transition-colors">
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDate(entry.entryDate)}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{entry.entryNumber || '-'}</td>
              <td className="px-3 py-2.5 max-w-72 truncate" title={entry.description}>{entry.description || '-'}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{accountLabel(entry.debitAccountId)}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{accountLabel(entry.creditAccountId)}</td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">{entry.referenceType || '-'}</td>
              <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                {formatMoney(entry.amount, entry.currency || currency)}
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {de ? 'Keine Hauptbuch-Buchungen im Zeitraum.' : 'No general-ledger entries in this period.'}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center justify-between border-t border-border px-3 py-2">
        <Button size="sm" variant="outline" onClick={onPrevious} disabled={cursorStack.length <= 1}>
          {de ? 'Zurück' : 'Previous'}
        </Button>
        <span className="text-xs text-muted-foreground">{cursorPageLabel(cursorStack.length - 1, t)}</span>
        <Button size="sm" variant="outline" onClick={onNext} disabled={!pagination?.hasNext}>
          {de ? 'Weiter' : 'Next'}
        </Button>
      </div>
    </div>
  );
}

export default function AccountingReportsPage() {
  const { locale: language, t } = useLanguage();
  const de = language === 'de';
  const initialRange = useMemo(() => currentYearRange(), []);
  const [activeReport, setActiveReport] = useState('profit-loss');
  const [filters, setFilters] = useState(initialRange);
  const { currency, setCurrency } = useAccountingCurrency();
  const [scopeFilters, setScopeFilters] = useState({ companyId: 'ALL', branchId: 'ALL' });
  const [ledgerFilters, setLedgerFilters] = useState({ accountId: 'ALL', referenceType: 'ALL' });
  const [ledgerCursorStack, setLedgerCursorStack] = useState([null]);
  const ledgerCursor = ledgerCursorStack[ledgerCursorStack.length - 1];
  const hasDateRangeError = Boolean(filters.startDate && filters.endDate && filters.startDate > filters.endDate);
  const rangeReportEnabled = !hasDateRangeError;
  const { data: accountingEntities = [] } = useAccountingEntities({ status: 'ACTIVE' });
  const companies = useMemo(() => accountingEntities.filter((entity) => entity.type === 'COMPANY'), [accountingEntities]);
  const branches = useMemo(() => accountingEntities.filter((entity) => (
    entity.type === 'BRANCH'
      && (scopeFilters.companyId === 'ALL' || String(parentId(entity)) === String(scopeFilters.companyId))
  )), [accountingEntities, scopeFilters.companyId]);
  const scopeParams = {
    ...(scopeFilters.companyId !== 'ALL' && { companyId: scopeFilters.companyId }),
    ...(scopeFilters.branchId !== 'ALL' && { branchId: scopeFilters.branchId }),
  };
  const params = { ...filters, currency, ...scopeParams };
  const asOfParams = { endDate: filters.endDate, currency, ...scopeParams };
  const ledgerParams = {
    ...params,
    limit: 50,
    ...(ledgerFilters.accountId !== 'ALL' && { accountId: ledgerFilters.accountId }),
    ...(ledgerFilters.referenceType !== 'ALL' && { referenceType: ledgerFilters.referenceType }),
    ...(ledgerCursor && { cursor: ledgerCursor }),
  };

  const profitLoss = useProfitLoss(params, { enabled: activeReport === 'profit-loss' && rangeReportEnabled });
  const balanceSheet = useBalanceSheet(asOfParams, { enabled: activeReport === 'balance-sheet' });
  const trialBalance = useTrialBalance(asOfParams, { enabled: activeReport === 'trial-balance' });
  const cashFlow = useCashFlowReport(params, { enabled: activeReport === 'cash-flow' && rangeReportEnabled });
  const generalLedger = useGeneralLedger(ledgerParams, { enabled: activeReport === 'general-ledger' && rangeReportEnabled });
  const { data: accounts = [] } = useAccounts({ limit: 500 });

  const queryByReport = {
    'profit-loss': profitLoss,
    'balance-sheet': balanceSheet,
    'trial-balance': trialBalance,
    'cash-flow': cashFlow,
    'general-ledger': generalLedger,
  };
  const activeQuery = queryByReport[activeReport];
  const report = activeQuery?.data;
  const rows = activeReport === 'general-ledger' ? (report?.items || []) : reportRows(activeReport, report);
  const isRangeReport = activeReport === 'profit-loss' || activeReport === 'cash-flow' || activeReport === 'general-ledger';
  const canShowReportContent = !(hasDateRangeError && isRangeReport) && !activeQuery?.isError;

  const resetLedgerCursor = () => setLedgerCursorStack([null]);
  const updateDateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    resetLedgerCursor();
  };
  const updateLedgerFilter = (key, value) => {
    setLedgerFilters((current) => ({ ...current, [key]: value }));
    resetLedgerCursor();
  };
  const updateScopeFilter = (key, value) => {
    setScopeFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'companyId' ? { branchId: 'ALL' } : {}),
    }));
    resetLedgerCursor();
  };

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
            {de ? 'Journalbasierte Bilanz, Erfolgsrechnung und Liquiditätsauswertung.' : 'Journal-based balance sheet, P&L, trial balance, and cash-flow reports.'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Input
            type="date"
            className="h-9 w-40"
            value={filters.startDate}
            onChange={(event) => updateDateFilter('startDate', event.target.value)}
            disabled={activeReport === 'balance-sheet' || activeReport === 'trial-balance'}
          />
          <Input
            type="date"
            className="h-9 w-40"
            value={filters.endDate}
            onChange={(event) => updateDateFilter('endDate', event.target.value)}
          />
          <div className="w-36"><CurrencyPicker label="Report currency" value={currency} onValueChange={(value) => { setCurrency(value); resetLedgerCursor(); }} /></div>
          <Select value={scopeFilters.companyId} onValueChange={(value) => updateScopeFilter('companyId', value)}>
            <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder={de ? 'Firma' : 'Company'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Firmen' : 'All Companies'}</SelectItem>
              {companies.map((company) => (
                <SelectItem key={company._id} value={company._id}>{entityLabel(company)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={scopeFilters.branchId} onValueChange={(value) => updateScopeFilter('branchId', value)} disabled={branches.length === 0}>
            <SelectTrigger className="h-9 w-48 text-xs"><SelectValue placeholder={de ? 'Filiale' : 'Branch'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Filialen' : 'All Branches'}</SelectItem>
              {branches.map((branch) => (
                <SelectItem key={branch._id} value={branch._id}>{entityLabel(branch)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeReport === 'profit-loss' && (
            <Button variant="outline" size="sm" onClick={handleExport} disabled={hasDateRangeError}>
              <Download className="h-4 w-4 mr-1.5" />
              CSV
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {REPORT_TABS.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            size="sm"
            variant={activeReport === tab.key ? 'default' : 'outline'}
            onClick={() => {
              setActiveReport(tab.key);
              if (tab.key === 'general-ledger') resetLedgerCursor();
            }}
          >
            <tab.icon className="h-4 w-4 mr-1.5" />
            {de ? tab.label : tab.labelEn}
          </Button>
        ))}
      </div>

      {activeReport === 'general-ledger' && (
        <div className="flex flex-wrap gap-2">
          <Select value={ledgerFilters.accountId} onValueChange={(value) => updateLedgerFilter('accountId', value)}>
            <SelectTrigger className="h-9 w-72 text-xs"><SelectValue placeholder={de ? 'Konto' : 'Account'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Konten' : 'All Accounts'}</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account._id} value={account._id}>
                  {account.accountNumber} {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={ledgerFilters.referenceType} onValueChange={(value) => updateLedgerFilter('referenceType', value)}>
            <SelectTrigger className="h-9 w-56 text-xs"><SelectValue placeholder={de ? 'Referenztyp' : 'Reference Type'} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Referenzen' : 'All References'}</SelectItem>
              {REFERENCE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{de ? option.label : option.labelEn}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {hasDateRangeError && activeReport !== 'balance-sheet' && activeReport !== 'trial-balance' && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {de ? 'Startdatum muss vor dem Enddatum liegen.' : 'Start date must be before end date.'}
        </div>
      )}

      {activeQuery?.isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200">
          {activeQuery.error?.message || (de ? 'Bericht konnte nicht geladen werden.' : 'Could not load report.')}
        </div>
      )}

      {activeQuery?.isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)}
        </div>
      ) : activeReport !== 'general-ledger' && canShowReportContent ? (
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-4">
          {reportSummary(activeReport, report, de).map((tile) => (
            <SummaryTile
              key={tile.label}
              label={tile.label}
              value={formatMoney(tile.value, report?.currency)}
              icon={tile.icon}
              tone={tile.tone}
            />
          ))}
        </div>
      ) : null}

      {canShowReportContent && report?.warnings?.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          {report.warnings[0]}
        </div>
      )}

      {activeReport === 'general-ledger' ? (
        canShowReportContent && (
        <GeneralLedgerRows
          rows={rows}
          pagination={report?.pagination}
          currency={report?.meta?.currency || currency}
          cursorStack={ledgerCursorStack}
          onPrevious={() => setLedgerCursorStack((current) => (current.length > 1 ? current.slice(0, -1) : current))}
          onNext={() => report?.pagination?.nextCursor && setLedgerCursorStack((current) => [...current, report.pagination.nextCursor])}
          de={de}
          t={t}
        />
        )
      ) : (
        canShowReportContent && <ReportRows activeReport={activeReport} rows={rows} currency={report?.currency || currency} de={de} />
      )}
    </div>
  );
}
