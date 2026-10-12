import { FileUp, MapPin, PenLine, Puzzle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { Lead, LeadSource, LeadStatus, LeadType } from '../types/lead-types';
import type { TranslateFn } from './lead-ui-kit';

// ── Enumerations ─────────────────────────────────────────────────────────────

export const LEAD_STATUSES: readonly LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'converted',
];

/**
 * Statuses a person may pick by hand. `converted` is deliberately absent: it
 * is only reached through the Convert-to-Customer flow, which also creates the
 * customer and links it to the lead.
 */
export const LEAD_EDITABLE_STATUSES: readonly LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'unqualified',
];

export const LEAD_SOURCES: readonly LeadSource[] = ['google_places', 'manual', 'widget', 'import'];
export const LEAD_TYPES: readonly LeadType[] = ['business', 'private'];

/** Page sizes offered by the table footer; the API caps `limit` at 100. */
export const LEAD_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_LEAD_PAGE_SIZE = 25;

// ── Select sentinels (Radix Select forbids an empty-string item value) ───────

export const FILTER_ALL = 'ALL';
export const FILTER_ME = 'ME';
export const UNASSIGNED = '__unassigned__';

// ── Labels (English fallbacks; the dictionary supplies the translations) ─────

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  unqualified: 'Unqualified',
  converted: 'Converted',
};

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  google_places: 'Google Places',
  manual: 'Manual entry',
  widget: 'Website widget',
  import: 'Import',
};

export const LEAD_SOURCE_ICON: Record<LeadSource, LucideIcon> = {
  google_places: MapPin,
  manual: PenLine,
  widget: Puzzle,
  import: FileUp,
};

export const LEAD_TYPE_LABEL: Record<LeadType, string> = {
  business: 'Business',
  private: 'Private',
};

export const getLeadStatusLabel = (t: TranslateFn, status: LeadStatus): string =>
  t(`leads.status.${status}`, LEAD_STATUS_LABEL[status]);

export const getLeadSourceLabel = (t: TranslateFn, source: LeadSource): string =>
  t(`leads.source.${source}`, LEAD_SOURCE_LABEL[source]);

export const getLeadTypeLabel = (t: TranslateFn, type: LeadType): string =>
  t(`leads.type.${type}`, LEAD_TYPE_LABEL[type]);

// ── Sorting ──────────────────────────────────────────────────────────────────

/**
 * The API whitelists `sortBy` to createdAt | name | status. Table column ids
 * map onto those; the "Discovered" column sorts by creation time.
 */
export const COLUMN_TO_SORT_FIELD: Record<string, string> = {
  name: 'name',
  status: 'status',
  discoveredAt: 'createdAt',
};

export const SORT_FIELD_TO_COLUMN: Record<string, string> = {
  name: 'name',
  status: 'status',
  createdAt: 'discoveredAt',
};

// ── Small domain helpers ─────────────────────────────────────────────────────

/** The date a lead entered the pipeline: discovery time when known, else creation time. */
export const getLeadDiscoveredAt = (lead: Pick<Lead, 'sourceMetadata' | 'createdAt'>): string =>
  lead.sourceMetadata.discoveredAt ?? lead.createdAt;

/** The store filter shape, as both the list and the map read it. */
export type LeadFilterState = {
  status: string;
  source: string;
  type: string;
  country: string;
  city: string;
  area: string;
  businessType: string;
  assignedTo: string;
  search: string;
};

/** The server filter params a lead query accepts (shared by the list + map). */
export type LeadQueryFilterParams = {
  status?: LeadStatus;
  source?: LeadSource;
  type?: LeadType;
  countryId?: string;
  cityId?: string;
  areaId?: string;
  businessType?: string;
  assignedTo?: string;
  q?: string;
};

/**
 * Map the leads filter store onto the server query params, resolving the
 * sentinels (`ALL` → omit, `ME` → the current user). Shared by the list and the
 * map so they always request exactly the same filtered set. `searchTerm` is the
 * already-debounced, trimmed query the caller wants to send.
 */
export function buildLeadFilterParams(
  filters: LeadFilterState,
  currentUserId: string | null,
  searchTerm: string,
): LeadQueryFilterParams {
  const assignedTo =
    filters.assignedTo === FILTER_ALL
      ? undefined
      : filters.assignedTo === FILTER_ME
        ? (currentUserId ?? undefined)
        : filters.assignedTo;
  return {
    ...(filters.status !== FILTER_ALL ? { status: filters.status as LeadStatus } : {}),
    ...(filters.source !== FILTER_ALL ? { source: filters.source as LeadSource } : {}),
    ...(filters.type !== FILTER_ALL ? { type: filters.type as LeadType } : {}),
    ...(filters.country !== FILTER_ALL ? { countryId: filters.country } : {}),
    ...(filters.city !== FILTER_ALL ? { cityId: filters.city } : {}),
    ...(filters.area !== FILTER_ALL ? { areaId: filters.area } : {}),
    ...(filters.businessType !== FILTER_ALL ? { businessType: filters.businessType } : {}),
    ...(assignedTo ? { assignedTo } : {}),
    ...(searchTerm ? { q: searchTerm } : {}),
  };
}
