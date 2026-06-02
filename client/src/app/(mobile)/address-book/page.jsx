'use client';

import Link from 'next/link';
import {
  AtSign,
  Building2,
  ChevronRight,
  MapPin,
  Phone,
  Search,
  ServerCog,
  UsersRound,
  WifiOff,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useCrmAddressBook } from '@/modules/mobile/hooks/use-crm-address-book';

export default function MobileAddressBookPage() {
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const {
    query,
    setQuery,
    results,
    summary,
    isLoading,
    isQueryTooShort,
  } = useCrmAddressBook();

  return (
    <div className="flex min-h-full flex-col bg-background">
      <MobileHeader
        title={lang === 'de' ? 'Adressbuch' : 'Address book'}
        right={
          <span className="rounded-lg bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
            {summary?.customers ?? 0}
          </span>
        }
      />

      <div className="border-b border-border bg-background px-4 py-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={lang === 'de' ? 'Kunde, Kontakt, Ort, Anlage...' : 'Customer, contact, site, installation...'}
            className="h-11 w-full rounded-xl border border-input bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            autoComplete="off"
          />
        </label>
        <SummaryStrip summary={summary} lang={lang} />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading ? (
          <AddressBookSkeleton />
        ) : results.length === 0 ? (
          <EmptyState
            variant="offline"
            title={lang === 'de' ? 'Keine Offline-Daten' : 'No offline data'}
            description={
              isQueryTooShort
                ? lang === 'de'
                  ? 'Mindestens zwei Zeichen eingeben oder die letzte synchronisierte Liste verwenden.'
                  : 'Enter at least two characters or use the last synced list.'
                : lang === 'de'
                  ? 'Synchronisieren, um Kunden, Kontakte, Standorte und Anlagen offline zu speichern.'
                  : 'Sync to store customers, contacts, sites, and installations offline.'
            }
          />
        ) : (
          <div className="space-y-3 pb-4">
            {results.map((customer) => (
              <CustomerCard key={customer.id} customer={customer} lang={lang} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryStrip({ summary, lang }) {
  if (!summary) return null;

  const items = [
    { icon: UsersRound, value: summary.contacts, label: lang === 'de' ? 'Kontakte' : 'Contacts' },
    { icon: Building2, value: summary.sites, label: lang === 'de' ? 'Standorte' : 'Sites' },
    { icon: ServerCog, value: summary.installations, label: lang === 'de' ? 'Anlagen' : 'Installations' },
  ];

  return (
    <div className="mt-3 grid grid-cols-3 gap-2">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="rounded-lg bg-muted/60 px-2 py-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[11px]">{item.label}</span>
            </div>
            <p className="mt-0.5 text-sm font-semibold">{item.value}</p>
          </div>
        );
      })}
    </div>
  );
}

function CustomerCard({ customer, lang }) {
  const primaryContact = customer.contacts?.[0];
  const firstSite = customer.sites?.[0];
  const phone = primaryContact?.mobile || primaryContact?.phone || customer.mobile || customer.phone;
  const email = primaryContact?.email || customer.email;

  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{customer.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[customer.customer_number, customer.city].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        {primaryContact && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <UsersRound className="h-3.5 w-3.5" />
            <span className="truncate">
              {[primaryContact.first_name, primaryContact.last_name].filter(Boolean).join(' ')}
              {primaryContact.function_title ? ` · ${primaryContact.function_title}` : ''}
            </span>
          </div>
        )}

        {firstSite && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            <span className="truncate">
              {[firstSite.name, firstSite.street, firstSite.city].filter(Boolean).join(' · ')}
            </span>
          </div>
        )}

        {customer.installations?.length > 0 && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <ServerCog className="h-3.5 w-3.5" />
            <span>
              {customer.installations.length}{' '}
              {lang === 'de' ? 'Anlagen offline verfügbar' : 'installations available offline'}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-muted text-xs font-medium text-foreground"
          >
            <Phone className="h-3.5 w-3.5" />
            {lang === 'de' ? 'Anrufen' : 'Call'}
          </a>
        )}
        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-muted text-xs font-medium text-foreground"
          >
            <AtSign className="h-3.5 w-3.5" />
            E-Mail
          </a>
        )}
        {firstSite && (
          <Link
            href={`/installations/${firstSite.id}`}
            className="inline-flex h-9 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            aria-label={lang === 'de' ? 'Anlagen öffnen' : 'Open installations'}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

function AddressBookSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((item) => (
        <div key={item} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-muted animate-pulse" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-muted-foreground">
            <WifiOff className="h-3.5 w-3.5" />
            <div className="h-3 w-28 rounded bg-muted animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}
