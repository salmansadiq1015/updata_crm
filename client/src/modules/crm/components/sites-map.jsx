'use client';

import { useState } from 'react';
import { useLanguage } from '@/lib/i18n/language-context';
import { SiteMapCard } from './site-map-card';
import { cn } from '@/lib/utils';
import { Building2, MapPin } from 'lucide-react';
import { SITE_TYPE_META } from '@/modules/crm/constants/crm-constants';

/**
 * Aggregate "map view" for a customer's sites.
 *
 * Why this layout (and not multi-marker Leaflet):
 *   - No map library is installed (no leaflet / react-leaflet in package.json)
 *     and CRM-004 forbids adding new dependencies.
 *   - We reuse SiteMapCard's dependency-free OpenStreetMap <iframe> embed.
 *
 * UX: a left-hand list of sites (name + address). Selecting one shows its
 * location in the embedded OSM map on the right. Defaults to the first site.
 * Sites with coords render a precise marker; address-only sites fall back to
 * OSM text search (handled inside SiteMapCard).
 */
export function SitesMap({ sites = [] }) {
  const { t } = useLanguage();

  // Only sites that can actually be placed on a map (coords or an address).
  const mappable = sites.filter((s) => {
    const hasCoords = Number.isFinite(s.latitude) && Number.isFinite(s.longitude);
    const hasAddress = !!(s.street || s.postalCode || s.city);
    return hasCoords || hasAddress;
  });

  const [selectedId, setSelectedId] = useState(mappable[0]?._id ?? null);

  if (mappable.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center">
        <MapPin className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          {t('crm.sites.mapNoLocations', 'Keine Objekte mit Standortangaben vorhanden.')}
        </p>
      </div>
    );
  }

  const selected = mappable.find((s) => s._id === selectedId) ?? mappable[0];

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,18rem)_1fr]">
      <div className="max-h-[28rem] space-y-1.5 overflow-y-auto pr-1">
        {mappable.map((s) => {
          const typeMeta = SITE_TYPE_META[s.siteType] || SITE_TYPE_META.residential;
          const addressLine = [s.street, [s.postalCode, s.city].filter(Boolean).join(' ')]
            .filter(Boolean)
            .join(', ');
          const isSelected = s._id === selected._id;
          const hasCoords = Number.isFinite(s.latitude) && Number.isFinite(s.longitude);

          return (
            <button
              key={s._id}
              type="button"
              onClick={() => setSelectedId(s._id)}
              aria-pressed={isSelected}
              className={cn(
                'flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-all',
                isSelected
                  ? 'border-primary/40 bg-primary/5 shadow-theme-sm'
                  : 'border-border bg-card hover:border-primary/30 hover:shadow-theme-sm',
              )}
            >
              <div
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-border',
                  typeMeta.bg,
                )}
              >
                <Building2 className={cn('h-4.5 w-4.5', typeMeta.color)} />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{s.name}</span>
                {addressLine ? (
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{addressLine}</span>
                  </span>
                ) : null}
                {!hasCoords && (
                  <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('crm.siteMapApprox', 'Approximate')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <SiteMapCard site={selected} />
    </div>
  );
}
