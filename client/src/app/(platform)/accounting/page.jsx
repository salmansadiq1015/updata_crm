'use client';

import Link from 'next/link';
import { useAccountingCurrency } from '@/modules/accounting/state/accounting-currency';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Banknote,
  Boxes,
  Building2,
  CalendarDays,
  Clock,
  FileText,
  Globe2,
  Landmark,
  LineChart,
  Package,
  Percent,
  Receipt,
  Repeat2,
  Scale,
  Search,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { BankingAnalytics } from '@/modules/accounting/components/banking-analytics';
import { useBankAccounts } from '@/modules/accounting/hooks/use-accounting-queries';
import { useAccountingDashboard } from '@/modules/accounting/hooks/use-accounting-queries';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AccountingAgingPanel,
  AccountingHero,
  AccountingHeroSignal,
  AccountingSectionTitle,
  AccountingStatCard,
  AccountingWorkspaceCard,
} from '@/modules/accounting/components/accounting-premium-ui';

const DASHBOARD_CURRENCY = 'CHF';

const formatAmount = (value, currency = DASHBOARD_CURRENCY) =>
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

const AGING_ROWS = [
  { key: 'current', label: 'Current', labelDe: 'Aktuell', color: 'bg-emerald-400' },
  { key: '1_30', label: '1-30 days', labelDe: '1-30 Tage', color: 'bg-amber-400' },
  { key: '31_60', label: '31-60 days', labelDe: '31-60 Tage', color: 'bg-orange-400' },
  { key: '61_90', label: '61-90 days', labelDe: '61-90 Tage', color: 'bg-rose-400' },
  { key: 'over_90', label: '> 90 days', labelDe: '> 90 Tage', color: 'bg-red-500' },
];

const WORKSPACES = [
  {
    href: '/accounting/search',
    label: 'Financial Search',
    labelDe: 'Finanzsuche',
    description: 'Search invoices, journals, accounts, bank transactions, and documents.',
    descriptionDe: 'Rechnungen, Journale, Konten, Bankbewegungen und Belege durchsuchen.',
    icon: Search,
    accent: 'sky',
  },
  {
    href: '/accounting/exchange-rates',
    label: 'Exchange Rates',
    labelDe: 'Wechselkurse',
    description: 'Historical FX rates, conversions, and revaluation foundation.',
    descriptionDe: 'Historische FX-Kurse, Umrechnung und Grundlage für Neubewertung.',
    icon: Globe2,
    accent: 'cyan',
  },
  {
    href: '/accounting/entities',
    label: 'Accounting Structure',
    labelDe: 'Accounting-Struktur',
    description: 'Company and branch master data for scoped ledgers and reporting.',
    descriptionDe: 'Firmen und Niederlassungen für gescopte Ledger und Berichte.',
    icon: Building2,
    accent: 'violet',
  },
  {
    href: '/accounting/tax',
    label: 'Tax Management',
    labelDe: 'Steuern',
    description: 'Tax codes, input/output tax, withholding, and VAT reporting.',
    descriptionDe: 'Steuercodes, Vorsteuer/Umsatzsteuer, Quellensteuer und Berichte.',
    icon: Percent,
    accent: 'amber',
  },
  {
    href: '/accounting/assets',
    label: 'Fixed Assets',
    labelDe: 'Anlagen',
    description: 'Asset register, depreciation postings, book value, and disposals.',
    descriptionDe: 'Anlagenregister, Abschreibungen, Buchwert und Abgänge.',
    icon: Package,
    accent: 'lime',
  },
  {
    href: '/accounting/budgets',
    label: 'Budgets',
    labelDe: 'Budgets',
    description: 'Budget planning, approvals, locked baselines, and budget-vs-actual variance.',
    descriptionDe: 'Budgetplanung, Freigaben, gesperrte Basiswerte und Soll-Ist-Abweichung.',
    icon: BarChart3,
    accent: 'sky',
  },
  {
    href: '/accounting/recurring',
    label: 'Recurring',
    labelDe: 'Wiederkehrend',
    description: 'Scheduled journals, supplier bills, sales invoices, and run history.',
    descriptionDe: 'Geplante Journale, Lieferantenrechnungen, Kundenrechnungen und Laufhistorie.',
    icon: Repeat2,
    accent: 'cyan',
  },
  {
    href: '/accounting/inventory',
    label: 'Inventory Accounting',
    labelDe: 'Lagerbewertung',
    description: 'Inventory valuation, costing methods, movement postings, and audit trail.',
    descriptionDe: 'Bestandsbewertung, Kostenmethoden, Bewegungsbuchungen und Audit Trail.',
    icon: Boxes,
    accent: 'emerald',
  },
  {
    href: '/accounting/receivables',
    label: 'Receivables',
    labelDe: 'Forderungen',
    description: 'Customer invoices, collections, payment status, and dunning.',
    descriptionDe: 'Kundenrechnungen, Zahlungseingang, Status und Mahnwesen.',
    icon: TrendingUp,
    accent: 'emerald',
  },
  {
    href: '/accounting/payables',
    label: 'Payables',
    labelDe: 'Verbindlichkeiten',
    description: 'Vendor bills, approvals, payment batches, and obligations.',
    descriptionDe: 'Lieferantenrechnungen, Freigaben, Zahlungslaufe und Verpflichtungen.',
    icon: TrendingDown,
    accent: 'amber',
  },
  {
    href: '/accounting/bank',
    label: 'Bank',
    labelDe: 'Bank',
    description: 'Bank accounts, statements, sync status, and imported transactions.',
    descriptionDe: 'Bankkonten, Kontoauszuge, Synchronisierung und Transaktionen.',
    icon: Landmark,
    accent: 'sky',
  },
  {
    href: '/accounting/cash',
    label: 'Cash Flow',
    labelDe: 'Liquidität',
    description: 'Cash position, 30-day forecast, balances, and liquidity alerts.',
    descriptionDe: 'Cash-Position, 30-Tage-Prognose, Salden und Liquiditätsrisiken.',
    icon: WalletCards,
    accent: 'cyan',
  },
  {
    href: '/accounting/reconciliation',
    label: 'Reconciliation',
    labelDe: 'Abstimmung',
    description: 'Auto-match suggestions, manual matching, and exception handling.',
    descriptionDe: 'Automatische Vorschlage, manuelle Zuordnung und Ausnahmen.',
    icon: Scale,
    accent: 'violet',
  },
  {
    href: '/accounting/open-items',
    label: 'Open Items',
    labelDe: 'Offene Posten',
    description: 'Combined AR/AP exposure with due dates and payment pressure.',
    descriptionDe: 'Gemeinsame AR/AP Sicht mit Fälligkeiten und Zahlungsdruck.',
    icon: Clock,
    accent: 'rose',
  },
  {
    href: '/accounting/reports',
    label: 'Reports',
    labelDe: 'Berichte',
    description: 'Balance sheet, P&L, trial balance, cash flow, and exports.',
    descriptionDe: 'Bilanz, Erfolgsrechnung, Saldenliste, Cashflow und Exporte.',
    icon: LineChart,
    accent: 'lime',
  },
  {
    href: '/accounting/fiscal-periods',
    label: 'Fiscal Periods',
    labelDe: 'Perioden',
    description: 'Open, close, and protect posting periods for finance control.',
    descriptionDe: 'Buchungsperioden öffnen, schliessen und kontrollieren.',
    icon: CalendarDays,
    accent: 'amber',
  },
  {
    href: '/accounting/documents',
    label: 'Documents',
    labelDe: 'Belege',
    description: 'OCR inbox, allocation rules, attachments, and accounting archive.',
    descriptionDe: 'OCR Eingang, Zuordnungsregeln, Anhange und Buchhaltungsarchiv.',
    icon: Archive,
    accent: 'cyan',
  },
  {
    href: '/accounting/journal',
    label: 'Journal',
    labelDe: 'Journal',
    description: 'Manual and automated journal entries with posting status.',
    descriptionDe: 'Manuelle und automatische Buchungen mit Buchungsstatus.',
    icon: Receipt,
    accent: 'violet',
  },
  {
    href: '/accounting/chart-of-accounts',
    label: 'Chart of Accounts',
    labelDe: 'Kontenplan',
    description: 'Account hierarchy, balances, mappings, and ledger structure.',
    descriptionDe: 'Kontenhierarchie, Salden, Zuordnungen und Ledger-Struktur.',
    icon: FileText,
    accent: 'slate',
  },
];

export default function AccountingDashboard() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { currency } = useAccountingCurrency();
  const formatSelectedAmount = value => formatAmount(value, currency);
  const [workspaceQuery, setWorkspaceQuery] = useState('');
  const yearRange = useMemo(() => currentYearRange(), []);

  const { data: snapshot, isLoading: loading } = useAccountingDashboard({
    ...yearRange,
    currency,
    forecastDays: 30,
  });

  const { data: connectedAccounts = [] } = useBankAccounts();
  const kpis = snapshot?.kpis || {};
  const arAging = snapshot?.aging?.receivables;
  const apAging = snapshot?.aging?.payables;
  const bankAccounts = (snapshot?.cash?.balances || []).filter(account => account.currency === currency);
  const projections = snapshot?.cash?.forecast?.projections || [];
  const projectedBalance = projections.length
    ? projections[projections.length - 1].netPosition
    : kpis.cashPosition;
  const upcomingOutflows = projections.reduce((sum, day) => sum + (day.outflows || 0), 0);
  const exposure = (kpis.openReceivables || 0) - (kpis.openPayables || 0);
  const profitMargin = Number(kpis.profitMargin || 0);

  const agingRows = AGING_ROWS.map((row) => ({
    ...row,
    label: de ? row.labelDe : row.label,
  }));

  const statCards = [
    {
      label: de ? 'Offene Forderungen' : 'Open Receivables',
      value: formatSelectedAmount(kpis.openReceivables),
      sub: `${arAging?.invoiceCount ?? 0} ${de ? 'Rechnungen' : 'invoices'}`,
      icon: TrendingUp,
      accent: 'emerald',
      href: '/accounting/receivables',
    },
    {
      label: de ? 'Überfällig' : 'Overdue',
      value: formatSelectedAmount(kpis.overdueReceivables),
      sub: de ? 'kritische Forderungen' : 'receivables at risk',
      icon: AlertTriangle,
      accent: 'rose',
      href: '/accounting/receivables',
      danger: (kpis.overdueReceivables || 0) > 0,
    },
    {
      label: de ? 'Verbindlichkeiten' : 'Payables',
      value: formatSelectedAmount(kpis.openPayables),
      sub: `${apAging?.invoiceCount ?? 0} ${de ? 'Rechnungen' : 'invoices'}`,
      icon: TrendingDown,
      accent: 'amber',
      href: '/accounting/payables',
    },
    {
      label: de ? 'Bankguthaben' : 'Bank Balance',
      value: formatSelectedAmount(kpis.bankBalance),
      sub: `${bankAccounts.length} ${de ? 'Konten' : 'accounts'}`,
      icon: Banknote,
      accent: 'sky',
      href: '/accounting/bank',
    },
    {
      label: de ? '30 Tage Cash' : '30-Day Cash',
      value: formatSelectedAmount(kpis.projectedCashPosition ?? projectedBalance),
      sub: `${de ? 'Fällige Zahlungen' : 'Due outflows'} ${formatSelectedAmount(upcomingOutflows)}`,
      icon: WalletCards,
      accent: 'cyan',
      href: '/accounting/cash',
      danger: (kpis.projectedCashPosition ?? projectedBalance ?? 0) < 0,
    },
    {
      label: de ? 'Gewinn YTD' : 'YTD Profit',
      value: formatSelectedAmount(kpis.netProfit, snapshot?.currency),
      sub: `${de ? 'Marge' : 'Margin'} ${profitMargin.toFixed(1)}%`,
      icon: LineChart,
      accent: 'lime',
      href: '/accounting/reports',
      danger: (kpis.netProfit || 0) < 0,
    },
  ];

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <AccountingHero
        eyebrow={de ? 'Finance Cockpit' : 'Finance Cockpit'}
        title={de ? 'Buchhaltung' : 'Accounting'}
        description={
          de
            ? 'Finanzlage, Liquidität und offene Verpflichtungen in einer hochwertigen Management-Sicht.'
            : 'Liquidity, obligations, and financial performance at a glance.'
        }
        chips={[
          de ? 'Live Snapshot' : 'Live snapshot',
          currency,
          de ? '30-Tage Prognose' : '30-day forecast',
        ]}
      >
        <AccountingHeroSignal
          label={de ? 'Netto Exposure' : 'Net Exposure'}
          value={formatSelectedAmount(exposure)}
          sub={de ? 'Forderungen minus Verbindlichkeiten' : 'Receivables minus payables'}
          icon={Scale}
          accent={exposure >= 0 ? 'emerald' : 'rose'}
        />
      </AccountingHero>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-44 rounded-2xl bg-muted" />
          ))
          : statCards.map((card) => (
            <AccountingStatCard key={card.label} {...card} />
          ))}
      </div>

      <BankingAnalytics accounts={connectedAccounts} de={de} compact />

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountingAgingPanel
          buckets={arAging?.buckets}
          label={de ? 'Forderungen nach Fälligkeit' : 'AR Aging'}
          rows={agingRows}
          totalLabel={de ? 'Offene Kundenpositionen' : 'Open customer exposure'}
          format={formatSelectedAmount}
        />
        <AccountingAgingPanel
          buckets={apAging?.buckets}
          label={de ? 'Verbindlichkeiten nach Fälligkeit' : 'AP Aging'}
          rows={agingRows}
          totalLabel={de ? 'Offene Lieferantenpositionen' : 'Open vendor obligations'}
          format={formatSelectedAmount}
        />
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><AccountingSectionTitle>{de ? 'Arbeitsbereiche' : 'Workspaces'}</AccountingSectionTitle><Input aria-label={de ? 'Arbeitsbereiche durchsuchen' : 'Search accounting workspaces'} className="h-9 max-w-xs text-xs" value={workspaceQuery} onChange={e => setWorkspaceQuery(e.target.value)} placeholder={de ? 'Arbeitsbereich suchen…' : 'Find a workspace…'} /></div>
        <div className="flex flex-wrap gap-2">{[['/accounting/bank', de ? 'Banking öffnen' : 'Open banking'], ['/accounting/reconciliation', de ? 'Transaktionen prüfen' : 'Review transactions'], ['/accounting/cash', de ? 'Liquidität planen' : 'Plan cash flow']].map(([href, label]) => <Button asChild variant="outline" size="sm" key={href}><Link href={href}>{label}</Link></Button>)}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {WORKSPACES.filter(workspace => `${workspace.label} ${workspace.labelDe} ${workspace.description} ${workspace.descriptionDe}`.toLocaleLowerCase().includes(workspaceQuery.trim().toLocaleLowerCase())).map((workspace) => (
            <AccountingWorkspaceCard
              key={workspace.href}
              href={workspace.href}
              label={de ? workspace.labelDe : workspace.label}
              description={de ? workspace.descriptionDe : workspace.description}
              metric={workspace.href === '/accounting/bank'
                ? `${bankAccounts.length} ${de ? 'aktive Konten' : 'active accounts'}`
                : workspace.href === '/accounting/reports'
                  ? (de ? 'Bilanz, P&L, Cashflow' : 'BS, P&L, cash flow')
                  : undefined}
              icon={workspace.icon}
              accent={workspace.accent}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
