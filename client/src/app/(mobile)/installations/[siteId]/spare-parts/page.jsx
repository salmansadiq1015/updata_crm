'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Link2, PackageSearch, ShoppingCart, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useLanguage } from '@/lib/i18n/language-context';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { EmptyState } from '@/modules/mobile/components/empty-state';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import {
  useInstallationSpareParts,
  useSparePartMutations,
  useSparePartSearch,
} from '@/modules/mobile/hooks/use-spare-parts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const URGENCY_OPTIONS = [
  { value: 'normal', de: 'Normal', en: 'Normal' },
  { value: 'high', de: 'Hoch', en: 'High' },
  { value: 'urgent', de: 'Dringend', en: 'Urgent' },
  { value: 'low', de: 'Niedrig', en: 'Low' },
];

export default function MobileSparePartsPage() {
  const searchParams = useSearchParams();
  const installationId = searchParams.get('installationId');
  const { locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const isOnline = useNetworkStatus();
  const [query, setQuery] = useState('');
  const [orderDrafts, setOrderDrafts] = useState({});

  const linkedParts = useInstallationSpareParts(installationId);
  const search = useSparePartSearch(query);
  const { linkPart, flagForOrdering } = useSparePartMutations(installationId);

  const linkedIds = useMemo(
    () => new Set((linkedParts.data || []).map((item) => item.spare_part_id)),
    [linkedParts.data],
  );

  const handleLink = async (partId) => {
    if (!installationId) return;
    try {
      await linkPart.mutateAsync({ sparePartId: partId, quantity: 1 });
      toast.success(lang === 'de' ? 'Ersatzteil verknuepft' : 'Spare part linked');
    } catch (error) {
      toast.error(error?.message || (lang === 'de' ? 'Verknuepfung fehlgeschlagen' : 'Link failed'));
    }
  };

  const handleFlag = async (partId) => {
    const draft = orderDrafts[partId] || {};
    try {
      await flagForOrdering.mutateAsync({
        sparePartId: partId,
        quantity: Number(draft.quantity || 1),
        urgency: draft.urgency || 'normal',
        notes: draft.notes || null,
      });
      toast.success(lang === 'de' ? 'Bestellung markiert' : 'Order request flagged');
    } catch (error) {
      toast.error(error?.message || (lang === 'de' ? 'Markierung fehlgeschlagen' : 'Flagging failed'));
    }
  };

  const updateDraft = (partId, patch) => {
    setOrderDrafts((current) => ({
      ...current,
      [partId]: { quantity: 1, urgency: 'normal', ...current[partId], ...patch },
    }));
  };

  if (!installationId) {
    return (
      <div className="flex min-h-full flex-col">
        <MobileHeader title={lang === 'de' ? 'Ersatzteile' : 'Spare parts'} showBack />
        <div className="px-4 py-8">
          <EmptyState
            variant="error"
            title={lang === 'de' ? 'Anlage fehlt' : 'Installation missing'}
            description={lang === 'de' ? 'Ersatzteile brauchen eine gueltige Anlage.' : 'Spare parts require a valid installation.'}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      <MobileHeader title={lang === 'de' ? 'Ersatzteile' : 'Spare parts'} showBack />

      {!isOnline && (
        <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0" />
          <span>
            {lang === 'de'
              ? 'Ersatzteil-Suche und Bestellmarkierung sind nur online verfuegbar.'
              : 'Spare-part search and ordering flags require internet.'}
          </span>
        </div>
      )}

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <PackageSearch className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{lang === 'de' ? 'Katalogsuche' : 'Catalog search'}</h2>
          </div>
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={!isOnline}
            placeholder={lang === 'de' ? 'Name, Nummer oder Hersteller' : 'Name, number, or manufacturer'}
            className="h-11"
          />
          {search.isLoading && <SkeletonRows count={2} />}
          {search.data?.map((part) => (
            <PartSearchRow
              key={part.id}
              part={part}
              lang={lang}
              linked={linkedIds.has(part.id)}
              pending={linkPart.isPending}
              onLink={() => handleLink(part.id)}
            />
          ))}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">{lang === 'de' ? 'Verknuepfte Ersatzteile' : 'Linked parts'}</h2>
          {linkedParts.isLoading && <SkeletonRows count={3} />}
          {linkedParts.isError && (
            <EmptyState
              variant="error"
              title={lang === 'de' ? 'Ersatzteile nicht geladen' : 'Spare parts not loaded'}
              description={lang === 'de' ? 'Bitte spaeter erneut versuchen.' : 'Please try again later.'}
            />
          )}
          {!linkedParts.isLoading && !linkedParts.isError && (linkedParts.data || []).length === 0 && (
            <EmptyState
              title={lang === 'de' ? 'Keine Ersatzteile' : 'No spare parts'}
              description={lang === 'de' ? 'Verknuepfen Sie benoetigte Teile aus dem Katalog.' : 'Link required parts from the catalog.'}
            />
          )}
          {(linkedParts.data || []).map((item) => (
            <LinkedPartCard
              key={item.id}
              item={item}
              lang={lang}
              draft={orderDrafts[item.spare_part_id] || { quantity: item.order_quantity || 1, urgency: item.order_urgency || 'normal' }}
              pending={flagForOrdering.isPending}
              onDraftChange={(patch) => updateDraft(item.spare_part_id, patch)}
              onFlag={() => handleFlag(item.spare_part_id)}
            />
          ))}
        </section>
      </div>
    </div>
  );
}

function PartSearchRow({ part, lang, linked, pending, onLink }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <PartSummary part={part} />
        <Button type="button" size="sm" disabled={linked || pending} onClick={onLink} className="h-9 shrink-0">
          <Link2 className="mr-1.5 h-3.5 w-3.5" />
          {linked ? (lang === 'de' ? 'Verknuepft' : 'Linked') : (lang === 'de' ? 'Link' : 'Link')}
        </Button>
      </div>
    </div>
  );
}

function LinkedPartCard({ item, lang, draft, pending, onDraftChange, onFlag }) {
  const part = item.spare_part;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <PartSummary part={part} />
        {item.needs_ordering && (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800">
            {lang === 'de' ? 'Bestellen' : 'Order'}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[88px_1fr] gap-2">
        <Input
          type="number"
          min="1"
          value={draft.quantity}
          onChange={(event) => onDraftChange({ quantity: event.target.value })}
          className="h-10"
        />
        <Select value={draft.urgency} onValueChange={(value) => onDraftChange({ urgency: value })}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {URGENCY_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {lang === 'de' ? option.de : option.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Button type="button" variant="outline" className="h-10 w-full" disabled={pending} onClick={onFlag}>
        <ShoppingCart className="mr-2 h-4 w-4" />
        {lang === 'de' ? 'Zum Bestellen markieren' : 'Flag for ordering'}
      </Button>
    </div>
  );
}

function PartSummary({ part }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold">{part.name}</p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {[part.part_number, part.manufacturer].filter(Boolean).join(' | ')}
      </p>
      {part.current_stock != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">Stock: {part.current_stock}</p>
      )}
    </div>
  );
}

function SkeletonRows({ count }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="h-16 rounded-xl bg-muted animate-pulse" />
      ))}
    </div>
  );
}
