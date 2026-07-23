'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Archive,
  Banknote,
  BookOpen,
  FileText,
  Landmark,
  Receipt,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAccountingSearch, useAccounts } from '@/modules/accounting/hooks/use-accounting-queries';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';

const TYPE_OPTIONS = [
  { value: 'ALL', label: 'All records', labelDe: 'Alle Datensätze' },
  { value: 'AR_INVOICE', label: 'Receivables', labelDe: 'Forderungen' },
  { value: 'AP_INVOICE', label: 'Payables', labelDe: 'Verbindlichkeiten' },
  { value: 'JOURNAL_ENTRY', label: 'Journal', labelDe: 'Journal' },
  { value: 'BANK_TRANSACTION', label: 'Bank transactions', labelDe: 'Bankbewegungen' },
  { value: 'ACCOUNT', label: 'Accounts', labelDe: 'Konten' },
  { value: 'DOCUMENT', label: 'Documents', labelDe: 'Belege' },
];

const TYPE_META = {
  ACCOUNT: { label: 'Account', labelDe: 'Konto', icon: FileText, className: 'text-muted-foreground bg-slate-500/15' },
  JOURNAL_ENTRY: { label: 'Journal', labelDe: 'Journal', icon: BookOpen, className: 'text-violet-200 bg-violet-500/15' },
  AR_INVOICE: { label: 'Receivable', labelDe: 'Forderung', icon: Receipt, className: 'text-emerald-200 bg-emerald-500/15' },
  AP_INVOICE: { label: 'Payable', labelDe: 'Verbindlichkeit', icon: Landmark, className: 'text-amber-200 bg-amber-500/15' },
  BANK_TRANSACTION: { label: 'Bank', labelDe: 'Bank', icon: Banknote, className: 'text-sky-200 bg-sky-500/15' },
  DOCUMENT: { label: 'Document', labelDe: 'Beleg', icon: Archive, className: 'text-cyan-200 bg-cyan-500/15' },
};

function emptyFilters() {
  return {
    q: '',
    type: 'ALL',
    status: '',
    accountId: 'ALL',
    currency: 'ALL',
    startDate: '',
    endDate: '',
    minAmount: '',
    maxAmount: '',
  };
}

function buildParams(filters) {
  return Object.entries({
    q: filters.q.trim(),
    type: filters.type !== 'ALL' ? filters.type : undefined,
    status: filters.status.trim() || undefined,
    accountId: filters.accountId !== 'ALL' ? filters.accountId : undefined,
    currency: filters.currency !== 'ALL' ? filters.currency : undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
    minAmount: filters.minAmount || undefined,
    maxAmount: filters.maxAmount || undefined,
    limit: 50,
  }).reduce((acc, [key, value]) => {
    if (value !== undefined && value !== '') acc[key] = value;
    return acc;
  }, {});
}

function ResultIcon({ type }) {
  const meta = TYPE_META[type] || TYPE_META.DOCUMENT;
  const Icon = meta.icon;
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${meta.className}`}>
      <Icon className="size-5" />
    </span>
  );
}

function TypeBadge({ type, de }) {
  const meta = TYPE_META[type] || TYPE_META.DOCUMENT;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
      {de ? meta.labelDe : meta.label}
    </span>
  );
}

function SearchResultRow({ item, de }) {
  const hasAmount = item.amount !== null && item.amount !== undefined;

  return (
    <Link
      href={item.href || '/accounting'}
      className="grid gap-3 border-b border-border px-4 py-4 transition-colors last:border-b-0 hover:bg-card sm:grid-cols-[auto_1fr_auto]"
    >
      <ResultIcon type={item.type} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={item.type} de={de} />
          {item.status && <span className="text-xs font-medium text-muted-foreground">{item.status}</span>}
          {item.reference && <span className="font-mono text-xs text-muted-foreground">{item.reference}</span>}
        </div>
        <p className="mt-2 truncate text-sm font-semibold text-foreground">{item.title || item.reference || item.id}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.partyName && <span>{item.partyName}</span>}
          {item.date && <span>{formatDate(item.date)}</span>}
          {(item.highlights || []).slice(0, 3).map((highlight) => (
            <span key={highlight} className="truncate">{highlight}</span>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {hasAmount ? formatMoney(item.amount, item.currency || 'CHF') : '-'}
        </span>
        <span className="text-xs text-muted-foreground">{de ? 'Öffnen' : 'Open'}</span>
      </div>
    </Link>
  );
}

export default function AccountingSearchPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useState(emptyFilters);
  const [submitted, setSubmitted] = useState(null);
  const params = useMemo(() => submitted || {}, [submitted]);
  const { data: accounts = [] } = useAccounts({ limit: 500 });
  const { data: searchData, isLoading, isError, error } = useAccountingSearch(params, { enabled: Boolean(submitted) });
  const items = searchData?.items || [];
  const meta = searchData?.meta || {};

  const set = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    setSubmitted(buildParams(filters));
  };

  const handleClear = () => {
    const next = emptyFilters();
    setFilters(next);
    setSubmitted(null);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{de ? 'Finanzsuche' : 'Financial Search'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {de
              ? 'Rechnungen, Journale, Konten, Bankbewegungen und Belege zentral finden.'
              : 'Find invoices, journals, accounts, bank transactions, and documents from one place.'}
          </p>
        </div>
        {submitted && (
          <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {meta.returned ?? items.length} {de ? 'Treffer' : 'results'}
            {meta.durationMs != null ? ` / ${meta.durationMs}ms` : ''}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-4">
        <div className="grid gap-3 lg:grid-cols-[1.5fr_12rem_12rem_12rem]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-10 border-border bg-slate-950/40 pl-9 text-foreground placeholder:text-muted-foreground"
              value={filters.q}
              onChange={(event) => set('q', event.target.value)}
              placeholder={de ? 'Rechnung, Kunde, Lieferant, Betrag, Journal...' : 'Invoice, customer, vendor, amount, journal...'}
            />
          </div>
          <Select value={filters.type} onValueChange={(value) => set('type', value)}>
            <SelectTrigger className="h-10 border-border bg-slate-950/40 text-xs text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{de ? option.labelDe : option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.currency} onValueChange={(value) => set('currency', value)}>
            <SelectTrigger className="h-10 border-border bg-slate-950/40 text-xs text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Währungen' : 'All currencies'}</SelectItem>
              <SelectItem value="CHF">CHF</SelectItem>
              <SelectItem value="EUR">EUR</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" className="h-10">
            <Search className="mr-1.5 size-4" />
            {de ? 'Suchen' : 'Search'}
          </Button>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Input
            className="h-9 border-border bg-slate-950/30 text-foreground placeholder:text-muted-foreground"
            value={filters.status}
            onChange={(event) => set('status', event.target.value)}
            placeholder={de ? 'Status' : 'Status'}
          />
          <Select value={filters.accountId} onValueChange={(value) => set('accountId', value)}>
            <SelectTrigger className="h-9 border-border bg-slate-950/30 text-xs text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{de ? 'Alle Konten' : 'All accounts'}</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account._id} value={account._id}>
                  {account.accountNumber} {account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            className="h-9 border-border bg-slate-950/30 text-foreground"
            value={filters.startDate}
            onChange={(event) => set('startDate', event.target.value)}
          />
          <Input
            type="date"
            className="h-9 border-border bg-slate-950/30 text-foreground"
            value={filters.endDate}
            onChange={(event) => set('endDate', event.target.value)}
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            className="h-9 border-border bg-slate-950/30 text-foreground placeholder:text-muted-foreground"
            value={filters.minAmount}
            onChange={(event) => set('minAmount', event.target.value)}
            placeholder={de ? 'Min. Betrag' : 'Min amount'}
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            className="h-9 border-border bg-slate-950/30 text-foreground placeholder:text-muted-foreground"
            value={filters.maxAmount}
            onChange={(event) => set('maxAmount', event.target.value)}
            placeholder={de ? 'Max. Betrag' : 'Max amount'}
          />
        </div>

        <div className="mt-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <SlidersHorizontal className="size-4" />
            {de ? 'Filter wirken serverseitig auf alle Suchquellen.' : 'Filters are applied server-side across all sources.'}
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="text-muted-foreground hover:text-foreground">
            {de ? 'Zurücksetzen' : 'Clear'}
          </Button>
        </div>
      </form>

      <section className="overflow-hidden rounded-2xl border border-border bg-slate-950/30">
        {isLoading && (
          <div className="grid gap-0">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid gap-3 border-b border-border px-4 py-4 sm:grid-cols-[auto_1fr_auto]">
                <Skeleton className="size-10 rounded-xl bg-muted" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48 bg-muted" />
                  <Skeleton className="h-4 w-72 bg-muted" />
                </div>
                <Skeleton className="h-5 w-24 bg-muted" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && isError && (
          <div className="px-4 py-10 text-center text-sm text-rose-200">
            {error?.message || (de ? 'Suche konnte nicht geladen werden.' : 'Search could not be loaded.')}
          </div>
        )}

        {!isLoading && !isError && !submitted && (
          <div className="px-4 py-12 text-center">
            <Search className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">{de ? 'Suchbegriff oder Filter eingeben.' : 'Enter a search term or filter.'}</p>
          </div>
        )}

        {!isLoading && !isError && submitted && items.length === 0 && (
          <div className="px-4 py-12 text-center">
            <Search className="mx-auto size-10 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">{de ? 'Keine Treffer gefunden.' : 'No results found.'}</p>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div>
            {items.map((item) => (
              <SearchResultRow key={`${item.type}-${item.id}`} item={item} de={de} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
