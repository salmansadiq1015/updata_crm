'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { getCustomerTypeLabel } from '@/modules/crm/constants/customer-constants';
import { useAddressBook } from '@/modules/crm/hooks/use-address-book';
import {
  ADDRESS_TYPE_OPTIONS,
  CANTON_OPTIONS,
  CUSTOMER_TYPE_OPTIONS,
  GEO_FILTER_OPTIONS,
  buildEntryRoutes,
  buildMapUrl,
  formatContactName,
  getAddressTypeMeta,
  getCustomerTypeMeta,
  getPrimaryEmail,
  getPrimaryPhone,
  getRelationChips,
} from '@/modules/crm/utils/address-book-utils';
import { EmptyState } from '@/shared/components/empty-state';
import { PageHeader } from '@/shared/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  Download,
  FileText,
  LayoutGrid,
  List,
  LocateFixed,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserRound,
} from 'lucide-react';

const EMPTY_SUMMARY = Object.freeze({
  total: 0,
  private: 0,
  business: 0,
  billing: 0,
  site: 0,
  withCoordinates: 0,
});

function exportCsv(entries, t) {
  const sep = ';';
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[";,\n]/.test(s) ? `"${s}"` : s;
  };
  const header = [
    t('crm.addressBook.colName', 'Name'),
    t('crm.addressBook.colCustomer', 'Kunde'),
    t('crm.addressBook.colCustomerNr', 'KundenNr'),
    t('crm.addressBook.colType', 'Typ'),
    t('crm.addressBook.colAddressType', 'Adresstyp'),
    t('crm.addressBook.colAddress', 'Adresse'),
    t('crm.addressBook.colContact', 'Kontakt'),
    t('crm.addressBook.colPhone', 'Telefon'),
    t('crm.addressBook.colEmail', 'E-Mail'),
    t('crm.addressBook.colGps', 'GPS'),
  ].map(esc).join(sep);
  const rows = entries.map((e) => [
    e.site?.name || e.customer?.name || '',
    e.customer?.name || '',
    e.customer?.customerNumber || '',
    getCustomerTypeLabel(e.customer?.type),
    e.addressType || '',
    e.address?.formatted || '',
    formatContactName(e.primaryContact),
    getPrimaryPhone(e),
    getPrimaryEmail(e),
    e.coordinates ? `${e.coordinates.latitude},${e.coordinates.longitude}` : '',
  ].map(esc).join(sep)).join('\n');

  const blob = new Blob([`\uFEFF${header}\n${rows}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `adressbuch-${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdf(entries, t) {
  const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const tableRows = entries.map((e) => `
    <tr>
      <td>${esc(e.site?.name || e.customer?.name)}</td>
      <td>${esc(e.customer?.name)}</td>
      <td>${esc(e.customer?.customerNumber)}</td>
      <td>${esc(e.addressType)}</td>
      <td>${esc(e.address?.formatted)}</td>
      <td>${esc(formatContactName(e.primaryContact))}</td>
      <td>${esc(getPrimaryPhone(e))}</td>
      <td>${esc(getPrimaryEmail(e))}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t('crm.addressBook.title', 'Adressbuch')}</title>
    <style>
      body{font-family:system-ui,sans-serif;font-size:11px;margin:20px;color:#1a1a1a}
      h1{font-size:18px;margin-bottom:4px}
      p.sub{color:#666;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #ddd;padding:5px 8px;text-align:left}
      th{background:#f5f5f5;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.3px}
      tr:nth-child(even){background:#fafafa}
      .footer{margin-top:16px;font-size:10px;color:#999}
    </style></head><body>
    <h1>${esc(t('crm.addressBook.title', 'Adressbuch'))}</h1>
    <p class="sub">${entries.length} ${esc(t('crm.addressBook.entries', 'Einträge'))} — ${new Date().toLocaleDateString('de-CH')}</p>
    <table>
      <thead><tr>
        <th>${esc(t('crm.addressBook.colName', 'Name'))}</th>
        <th>${esc(t('crm.addressBook.colCustomer', 'Kunde'))}</th>
        <th>${esc(t('crm.addressBook.colCustomerNr', 'Nr.'))}</th>
        <th>${esc(t('crm.addressBook.colAddressType', 'Typ'))}</th>
        <th>${esc(t('crm.addressBook.colAddress', 'Adresse'))}</th>
        <th>${esc(t('crm.addressBook.colContact', 'Kontakt'))}</th>
        <th>${esc(t('crm.addressBook.colPhone', 'Telefon'))}</th>
        <th>${esc(t('crm.addressBook.colEmail', 'E-Mail'))}</th>
      </tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
    <p class="footer">${esc(t('crm.addressBook.exportedAt', 'Exportiert am'))} ${new Date().toLocaleString('de-CH')}</p>
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export default function AddressBook() {
  const { t } = useLanguage();
  const [viewMode, setViewMode] = useState('card');
  const {
    entries,
    summary,
    serverPagination,
    isFetching,
    isError,
    error,
    refetch,
    filters,
    setFilter,
    resetFilters,
    hasActiveFilters,
    pagination,
    setPagination,
  } = useAddressBook();

  const normalizedSummary = summary || EMPTY_SUMMARY;
  const page = serverPagination?.page || pagination.pageIndex + 1;
  const pageCount = serverPagination?.pageCount || 1;
  const total = serverPagination?.total ?? normalizedSummary.total;
  const showInitialLoading = isFetching && entries.length === 0 && !isError;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('crm.addressBook.title', 'Adressbuch')}
        description={t(
          'crm.addressBook.description',
          'Zentrale CRM-Adressen aus Kunden, Kontakten und Objekten.',
        )}
        icon={BookOpen}
        count={total}
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCsv(entries, t)} disabled={entries.length === 0}>
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => exportPdf(entries, t)} disabled={entries.length === 0}>
            <FileText className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button asChild size="sm" className="gap-2">
            <Link href="/crm/contacts">
              <Plus className="h-3.5 w-3.5" />
              {t('crm.contacts.newContact', 'Neuer Kontakt')}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            {t('common.refresh', 'Aktualisieren')}
          </Button>
        </div>
      </PageHeader>

      <SummaryGrid summary={normalizedSummary} t={t} />

      <AddressBookFilters
        filters={filters}
        setFilter={setFilter}
        resetFilters={resetFilters}
        hasActiveFilters={hasActiveFilters}
        viewMode={viewMode}
        setViewMode={setViewMode}
        t={t}
      />

      {isError && entries.length === 0 ? (
        <EmptyState
          icon={RefreshCw}
          title={t('crm.addressBook.loadError', 'Adressbuch konnte nicht geladen werden')}
          description={error?.message || t('common.tryAgain', 'Bitte erneut versuchen.')}
          action={(
            <Button size="sm" onClick={() => refetch()}>
              {t('common.retry', 'Erneut versuchen')}
            </Button>
          )}
        />
      ) : showInitialLoading ? (
        <AddressBookSkeleton viewMode={viewMode} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title={t('crm.addressBook.emptyTitle', 'Keine Adressen gefunden')}
          description={
            hasActiveFilters
              ? t('crm.addressBook.emptySearch', 'Keine CRM-Adresse passt zu den aktuellen Filtern.')
              : t('crm.addressBook.emptyDesc', 'Sobald Kunden oder Objekte erfasst sind, erscheinen sie hier automatisch.')
          }
        />
      ) : (
        <>
          {viewMode === 'card' ? (
            <div className="grid gap-3 xl:grid-cols-2">
              {entries.map((entry) => (
                <AddressEntryCard key={entry.id} entry={entry} t={t} />
              ))}
            </div>
          ) : (
            <AddressListView entries={entries} t={t} />
          )}

          <PaginationBar
            page={page}
            pageCount={pageCount}
            isFetching={isFetching}
            hasPrev={serverPagination?.hasPrev}
            hasNext={serverPagination?.hasNext}
            setPagination={setPagination}
            t={t}
          />
        </>
      )}
    </div>
  );
}

function SummaryGrid({ summary, t }) {
  const stats = [
    {
      key: 'total',
      label: t('crm.addressBook.summaryTotal', 'Adressen'),
      value: summary.total,
      icon: BookOpen,
      className: 'bg-brand-500/10 text-brand-700 dark:text-brand-300 ring-brand-500/20',
    },
    {
      key: 'business',
      label: t('crm.addressBook.summaryBusiness', 'Firmen'),
      value: summary.business,
      icon: Building2,
      className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20',
    },
    {
      key: 'private',
      label: t('crm.addressBook.summaryPrivate', 'Privat'),
      value: summary.private,
      icon: UserRound,
      className: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 ring-sky-500/20',
    },
    {
      key: 'geo',
      label: t('crm.addressBook.summaryGeo', 'Mit GPS'),
      value: summary.withCoordinates,
      icon: LocateFixed,
      className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20',
    },
  ];

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.key}
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
              <p className="mt-1 text-2xl font-semibold text-foreground">{stat.value || 0}</p>
            </div>
            <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg ring-1', stat.className)}>
              <Icon className="h-4 w-4" />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AddressBookFilters({ filters, setFilter, resetFilters, hasActiveFilters, viewMode, setViewMode, t }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_150px_150px_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(event) => setFilter('search', event.target.value)}
            placeholder={t('crm.addressBook.searchPlaceholder', 'Name, Kontakt, PLZ, Ort oder Telefon suchen...')}
            className="h-9 rounded-lg pl-9"
          />
        </label>

        <FilterSelect
          value={filters.customerType}
          onChange={(value) => setFilter('customerType', value)}
          options={CUSTOMER_TYPE_OPTIONS}
          t={t}
        />

        <FilterSelect
          value={filters.addressType}
          onChange={(value) => setFilter('addressType', value)}
          options={ADDRESS_TYPE_OPTIONS}
          t={t}
        />

        <Select
          value={filters.canton || 'all'}
          onValueChange={(value) => setFilter('canton', value === 'all' ? '' : value)}
        >
          <SelectTrigger className="h-9 rounded-lg">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="all">{t('crm.addressBook.allCantons', 'Alle Kantone')}</SelectItem>
            {CANTON_OPTIONS.map((canton) => (
              <SelectItem key={canton} value={canton}>{canton}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterSelect
          value={filters.hasCoordinates}
          onChange={(value) => setFilter('hasCoordinates', value)}
          options={GEO_FILTER_OPTIONS}
          t={t}
        />

        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-2 rounded-lg"
          onClick={resetFilters}
          disabled={!hasActiveFilters}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          {t('common.reset', 'Reset')}
        </Button>

        <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-muted/50 p-0.5">
          <Button
            variant={viewMode === 'card' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={() => setViewMode('card')}
            aria-label={t('crm.addressBook.viewCards', 'Kartenansicht')}
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-7 w-7 rounded-md"
            onClick={() => setViewMode('list')}
            aria-label={t('crm.addressBook.viewList', 'Listenansicht')}
          >
            <List className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({ value, onChange, options, t }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 rounded-lg">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {t(option.labelKey, option.fallback)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddressEntryCard({ entry, t }) {
  const addressMeta = getAddressTypeMeta(entry, t);
  const customerMeta = getCustomerTypeMeta(entry.customer, t);
  const AddressIcon = addressMeta.icon;
  const CustomerIcon = customerMeta.icon;
  const phone = getPrimaryPhone(entry);
  const email = getPrimaryEmail(entry);
  const mapUrl = buildMapUrl(entry);
  const routes = buildEntryRoutes(entry);

  return (
    <Card className="overflow-hidden rounded-lg border-border bg-card p-0 shadow-none">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1', addressMeta.className)}>
              <AddressIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Link
                  href={routes.site || routes.customer}
                  className="truncate text-sm font-semibold text-foreground hover:text-foreground"
                >
                  {entry.site?.name || entry.customer?.name || '-'}
                </Link>
                <Badge className={cn('h-5 px-1.5 text-[10px] ring-1', addressMeta.className)}>
                  {addressMeta.label}
                </Badge>
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="truncate">{entry.customer?.name}</span>
                {entry.customer?.customerNumber && <span>{entry.customer.customerNumber}</span>}
                {entry.site?.siteNumber && <span>{entry.site.siteNumber}</span>}
              </div>
            </div>
          </div>

          <Badge className={cn('h-6 shrink-0 gap-1 px-2 text-[11px] ring-1', customerMeta.className)}>
            <CustomerIcon className="h-3 w-3" />
            {customerMeta.label}
          </Badge>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-lg border border-border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">{t('crm.addressBook.address', 'Adresse')}</p>
            <p className="mt-1 text-sm text-foreground">{entry.address?.formatted || '-'}</p>
            {entry.coordinates && (
              <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-300/80">
                GPS {Number(entry.coordinates.latitude).toFixed(5)}, {Number(entry.coordinates.longitude).toFixed(5)}
              </p>
            )}
            {entry.site?.accessInstructions && (
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{entry.site.accessInstructions}</p>
            )}
          </div>

          <ContactBlock entry={entry} phone={phone} email={email} t={t} />
        </div>

        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {getRelationChips(entry, t).map((chip) => (
              <RelationChip key={chip.key} chip={chip} />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {phone && (
              <Button asChild variant="outline" size="icon-sm" aria-label={t('crm.addressBook.call', 'Anrufen')}>
                <a href={`tel:${phone}`}>
                  <Phone className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {email && (
              <Button asChild variant="outline" size="icon-sm" aria-label={t('crm.addressBook.email', 'E-Mail senden')}>
                <a href={`mailto:${email}`}>
                  <Mail className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
            {mapUrl && (
              <Button asChild variant="outline" size="icon-sm" aria-label={t('crm.addressBook.map', 'Karte anzeigen')}>
                <a href={mapUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="h-3.5 w-3.5" />
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ContactBlock({ entry, phone, email, t }) {
  const primaryName = formatContactName(entry.primaryContact);
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{t('crm.addressBook.contact', 'Kontakt')}</p>
        {entry.contactCount > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {entry.contactCount} {t('crm.addressBook.contactsShort', 'Kontakte')}
          </span>
        )}
      </div>

      {primaryName ? (
        <div className="mt-1 min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{primaryName}</p>
          {entry.primaryContact?.functionTitle && (
            <p className="truncate text-xs text-muted-foreground">{entry.primaryContact.functionTitle}</p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t('crm.addressBook.noContact', 'Kein Ansprechpartner')}</p>
      )}

      <div className="mt-2 space-y-1 text-xs">
        {phone && (
          <a href={`tel:${phone}`} className="flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{phone}</span>
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} className="flex min-w-0 items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{email}</span>
          </a>
        )}
      </div>
    </div>
  );
}

function RelationChip({ chip }) {
  const Icon = chip.icon;
  const content = (
    <>
      <Icon className="h-3 w-3" />
      <span>{chip.label}</span>
      {chip.count !== null && <span className="font-semibold">{chip.count}</span>}
    </>
  );

  if (!chip.enabled || !chip.href) {
    return (
      <span className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] text-muted-foreground/70">
        {content}
      </span>
    );
  }

  return (
    <Link
      href={chip.href}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 text-[11px] text-foreground transition-colors hover:bg-muted/70 hover:text-foreground"
    >
      {content}
    </Link>
  );
}

function AddressListView({ entries, t }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colName', 'Name')}</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colCustomer', 'Kunde')}</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colAddressType', 'Typ')}</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colAddress', 'Adresse')}</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colContact', 'Kontakt')}</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colPhone', 'Telefon')}</th>
              <th className="px-3 py-2.5 text-left font-medium text-muted-foreground">{t('crm.addressBook.colEmail', 'E-Mail')}</th>
              <th className="w-[80px] px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => {
              const addressMeta = getAddressTypeMeta(entry, t);
              const phone = getPrimaryPhone(entry);
              const email = getPrimaryEmail(entry);
              const mapUrl = buildMapUrl(entry);
              const routes = buildEntryRoutes(entry);
              return (
                <tr key={entry.id} className="border-b last:border-b-0 transition-colors hover:bg-muted/30">
                  <td className="px-3 py-2.5 font-medium max-w-[200px] truncate">
                    <Link href={routes.site || routes.customer} className="hover:text-primary">
                      {entry.site?.name || entry.customer?.name || '-'}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[160px] truncate">
                    {entry.customer?.name || '-'}
                    {entry.customer?.customerNumber && (
                      <span className="ml-1.5 text-xs text-muted-foreground/60">{entry.customer.customerNumber}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge className={cn('h-5 px-1.5 text-[10px] ring-1', addressMeta.className)}>
                      {addressMeta.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[220px] truncate">
                    {entry.address?.formatted || '-'}
                  </td>
                  <td className="px-3 py-2.5 max-w-[150px] truncate">
                    {formatContactName(entry.primaryContact) || '-'}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {phone ? (
                      <a href={`tel:${phone}`} className="hover:text-foreground">{phone}</a>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground max-w-[180px] truncate">
                    {email ? (
                      <a href={`mailto:${email}`} className="hover:text-foreground">{email}</a>
                    ) : '-'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1">
                      {phone && (
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                          <a href={`tel:${phone}`}><Phone className="h-3 w-3" /></a>
                        </Button>
                      )}
                      {mapUrl && (
                        <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                          <a href={mapUrl} target="_blank" rel="noopener noreferrer"><MapPin className="h-3 w-3" /></a>
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaginationBar({ page, pageCount, isFetching, hasPrev, hasNext, setPagination, t }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        {t('crm.addressBook.pageStatus', 'Seite {page} von {pageCount}', { page, pageCount })}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!hasPrev || isFetching}
          onClick={() => setPagination((current) => ({ ...current, pageIndex: Math.max(0, current.pageIndex - 1) }))}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('common.previous', 'Zurück')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={!hasNext || isFetching}
          onClick={() => setPagination((current) => ({ ...current, pageIndex: current.pageIndex + 1 }))}
        >
          {t('common.next', 'Weiter')}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function AddressBookSkeleton({ viewMode }) {
  if (viewMode === 'list') {
    return (
      <div className="rounded-xl border overflow-hidden">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 border-b last:border-b-0 px-3 py-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="h-10 w-10 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
