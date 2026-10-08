'use client';

// Shared presentational helpers for discovery results: status badges (always
// icon + label, never colour-only), price-level / rating formatting, and the
// link/URL builders that only ever emit a href when the data truly supports it.
//
// Kept inside the leadGeneration module so the UI wave stays self-contained; the
// helpers mirror the (generic) ones the leads module uses.

import type { ReactNode } from 'react';
import {
  Building2,
  CheckCircle2,
  CopyCheck,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImportStatus, MatchingStatus } from '../types/discovery-types';

type Translate = (key: string, fallback?: string, vars?: Record<string, unknown>) => string;

// ── CRM status (matching.status) ─────────────────────────────────────────────

type StatusMeta = {
  icon: LucideIcon;
  labelKey: string;
  fallback: string;
  className: string;
};

const CRM_STATUS_META: Record<MatchingStatus, StatusMeta> = {
  NEW: {
    icon: Sparkles,
    labelKey: 'leadgen.badge.new',
    fallback: 'New',
    className: 'border-success/30 bg-success/10 text-success',
  },
  EXISTING: {
    icon: Building2,
    labelKey: 'leadgen.badge.existing',
    fallback: 'Already in CRM',
    className: 'border-border bg-muted/60 text-muted-foreground',
  },
  POSSIBLE_DUPLICATE: {
    icon: CopyCheck,
    labelKey: 'leadgen.badge.possibleDuplicate',
    fallback: 'Possible duplicate',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
};

export function getCrmStatusLabel(t: Translate, status: MatchingStatus): string {
  const meta = CRM_STATUS_META[status];
  return t(meta.labelKey, meta.fallback);
}

export function CrmStatusBadge({
  status,
  t,
  className,
  size = 'sm',
}: {
  status: MatchingStatus;
  t: Translate;
  className?: string;
  size?: 'sm' | 'md';
}) {
  const meta = CRM_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium',
        size === 'md' ? 'px-2.5 py-1 text-xs' : 'px-2 py-0.5 text-[11px]',
        meta.className,
        className,
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t(meta.labelKey, meta.fallback)}
    </span>
  );
}

export function ImportedBadge({ t, className }: { t: Translate; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary',
        className,
      )}
    >
      <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      {t('leadgen.badge.imported', 'Imported')}
    </span>
  );
}

export const isImported = (status: ImportStatus): boolean =>
  status === 'IMPORTED' || status === 'QUEUED';

// ── Price level ──────────────────────────────────────────────────────────────

const PRICE_LEVEL_KEYS: Record<number, { key: string; fallback: string }> = {
  0: { key: 'leadgen.priceLevel.free', fallback: 'Free' },
  1: { key: 'leadgen.priceLevel.inexpensive', fallback: 'Inexpensive' },
  2: { key: 'leadgen.priceLevel.moderate', fallback: 'Moderate' },
  3: { key: 'leadgen.priceLevel.expensive', fallback: 'Expensive' },
  4: { key: 'leadgen.priceLevel.veryExpensive', fallback: 'Very expensive' },
};

export function getPriceLevelLabel(t: Translate, level: number | null): string | null {
  if (level == null) return null;
  const meta = PRICE_LEVEL_KEYS[level];
  if (!meta) return null;
  return t(meta.key, meta.fallback);
}

/** A compact "$$$$" style glyph where filled glyphs reflect the price level. */
export function priceLevelGlyph(level: number | null): string | null {
  if (level == null || level < 0) return null;
  const filled = Math.min(4, Math.max(0, Math.round(level)));
  return '€'.repeat(Math.max(1, filled));
}

// ── Initials / avatar ────────────────────────────────────────────────────────

export function businessInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

// ── Links (only built from data the result actually has) ─────────────────────

/** `tel:` href, or null when the value has too few digits to be dialled. */
export function toTelHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const compact = phone.replace(/[^\d+]/g, '');
  const digits = compact.replace(/\D/g, '');
  if (digits.length < 3) return null;
  return `tel:${compact}`;
}

/** Only http(s) URLs are ever linked; any other scheme yields null. */
export function toSafeWebUrl(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function websiteLabel(website: string | null, domain: string | null): string {
  if (domain) return domain;
  const safe = toSafeWebUrl(website);
  if (!safe) return website ?? '';
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return website ?? '';
  }
}

/**
 * Google Maps link for a business: its own `mapsUrl` when the provider gave one,
 * otherwise a canonical search URL built from coordinates (+ placeId). Null when
 * there is nothing to point at — so a "Directions"/"Open in Maps" action is only
 * ever shown for a result that can actually be located.
 */
export function resultMapsUrl(
  mapsUrl: string | null,
  location: { lat: number; lng: number } | null,
  placeId: string | null,
): string | null {
  if (mapsUrl) return mapsUrl;
  if (!location || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  const params = new URLSearchParams({ api: '1', query: `${location.lat},${location.lng}` });
  // Only a genuine Google place id locates the business; an OSM/Nominatim id
  // ("osm:node/123") would make Maps open a wrong place, so fall back to the pin.
  if (placeId && /^[A-Za-z0-9_-]{15,}$/.test(placeId)) params.set('query_place_id', placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

// ── Small layout atoms reused by the drawer ──────────────────────────────────

export function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden="true" />
      <dt className="w-24 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}
