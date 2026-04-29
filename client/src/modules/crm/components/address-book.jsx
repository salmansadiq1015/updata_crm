'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { contactService } from '@/modules/crm/services/contact-service';
import { queryKeys } from '@/lib/query/keys';
import { useDebounce } from '@/shared/hooks/use-debounce';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Phone, Mail, MapPin, BookOpen, User, Building2 } from 'lucide-react';

export default function AddressBook() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data: contacts = [], isLoading } = useQuery({
    queryKey: queryKeys.crm.contacts.all(),
    queryFn: () => contactService.listAll(500),
    staleTime: 60_000,
  });

  // Filter contacts by search term (name, email, phone, customer name)
  const filtered = useMemo(() => {
    if (!debouncedSearch) return contacts;
    const q = debouncedSearch.toLowerCase();
    return contacts.filter((c) => {
      const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
      const customerName = (c.customerId?.name || '').toLowerCase();
      const email = (c.email || '').toLowerCase();
      const phone = (c.phone || '').toLowerCase();
      const mobile = (c.mobile || '').toLowerCase();
      return (
        fullName.includes(q) ||
        customerName.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        mobile.includes(q)
      );
    });
  }, [contacts, debouncedSearch]);

  // Group contacts by customer name
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = c.customerId?.name || t('crm.addressBook.noCustomer', 'Ohne Kunde');
      if (!map.has(key)) {
        map.set(key, { customer: c.customerId, contacts: [] });
      }
      map.get(key).contacts.push(c);
    }
    // Sort groups alphabetically
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'de'));
  }, [filtered, t]);

  if (isLoading) return <AddressBookSkeleton />;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">
            {t('crm.addressBook.title', 'Adressbuch')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('crm.addressBook.subtitle', '{count} Kontakte', { count: contacts.length })}
          </p>
        </div>
      </div>

      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('crm.addressBook.searchPlaceholder', 'Name, E-Mail, Telefon oder Firma suchen...')}
          className="pl-9"
        />
      </div>

      {/* Contact list */}
      {filtered.length === 0 ? (
        <EmptyState
          hasSearch={!!debouncedSearch}
          t={t}
        />
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="space-y-6 pr-3">
            {grouped.map(([groupName, group]) => (
              <div key={groupName}>
                {/* Sticky group header */}
                <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm pb-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      {groupName}
                    </h2>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {group.contacts.length}
                    </Badge>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                </div>

                {/* Contact cards */}
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.contacts.map((contact) => (
                    <ContactCard
                      key={contact._id}
                      contact={contact}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

function ContactCard({ contact: c, t }) {
  const customer = c.customerId;
  const address = [customer?.street, customer?.postalCode, customer?.city]
    .filter(Boolean)
    .join(', ');
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  return (
    <Card className="group relative p-3.5 transition-all hover:shadow-theme-sm">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className={cn(
          'h-9 w-9 shrink-0 rounded-lg flex items-center justify-center ring-1',
          c.isPrimary
            ? 'bg-amber-500/10 ring-amber-500/20'
            : 'bg-sky-500/10 ring-sky-500/20',
        )}>
          <User className={cn('h-4 w-4', c.isPrimary ? 'text-amber-500' : 'text-sky-500')} />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate">
            {c.firstName} {c.lastName}
          </p>
          {c.functionTitle && (
            <p className="text-xs text-muted-foreground truncate">{c.functionTitle}</p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          {(c.phone || c.mobile) && (
            <a
              href={`tel:${c.phone || c.mobile}`}
              title={t('crm.addressBook.call', 'Anrufen')}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Phone className="h-3.5 w-3.5" />
            </a>
          )}
          {c.email && (
            <a
              href={`mailto:${c.email}`}
              title={t('crm.addressBook.email', 'E-Mail senden')}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Mail className="h-3.5 w-3.5" />
            </a>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              title={t('crm.addressBook.map', 'Karte anzeigen')}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <MapPin className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Contact details */}
      <div className="mt-2 space-y-0.5 text-xs">
        {c.email && (
          <div className="flex items-center gap-1.5 text-muted-foreground truncate">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{c.email}</span>
          </div>
        )}
        {c.phone && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{c.phone}</span>
          </div>
        )}
        {customer?.name && (
          <div className="flex items-center gap-1.5 text-muted-foreground truncate">
            <Building2 className="h-3 w-3 shrink-0" />
            <span className="truncate">{customer.name}</span>
          </div>
        )}
      </div>
    </Card>
  );
}

function EmptyState({ hasSearch, t }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <BookOpen className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold">
        {t('crm.addressBook.emptyTitle', 'Keine Kontakte gefunden')}
      </h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        {hasSearch
          ? t('crm.addressBook.emptySearch', 'Versuchen Sie einen anderen Suchbegriff.')
          : t('crm.addressBook.emptyDesc', 'Es wurden noch keine Kontakte erfasst.')}
      </p>
    </div>
  );
}

function AddressBookSkeleton() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-24 mt-1" />
      </div>
      <Skeleton className="h-10 w-full" />
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, gi) => (
          <div key={gi}>
            <Skeleton className="h-4 w-40 mb-3" />
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, ci) => (
                <div key={ci} className="rounded-xl border border-border bg-card p-3.5">
                  <div className="flex gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-4 w-28" />
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-36" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
