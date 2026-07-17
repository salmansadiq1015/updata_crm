'use client';

import Link from 'next/link';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
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

export default function AddressBook() {
  const { t } = useLanguage();
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
          {/* Address book is a read-only rollup; contacts are created on the Kontakte
              page (which has its own "+ Neuer Kontakt"). Client feedback #5. */}
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
        <AddressBookSkeleton />
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
          <div className="grid gap-3 xl:grid-cols-2">
            {entries.map((entry) => (
              <AddressEntryCard key={entry.id} entry={entry} t={t} />
            ))}
          </div>

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
      className: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20',
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

function AddressBookFilters({ filters, setFilter, resetFilters, hasActiveFilters, t }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="grid gap-2 lg:grid-cols-[minmax(220px,1fr)_180px_180px_150px_150px_auto]">
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
          {t('common.previous', 'Zurueck')}
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

function AddressBookSkeleton() {
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
