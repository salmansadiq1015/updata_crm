import { z } from 'zod';
import type {
  GeoPoint,
  Lead,
  LeadAddress,
  LeadDuplicate,
  LeadEnrichment,
  LeadEnrichmentStatus,
  LeadSocial,
  LeadSource,
  LeadStatus,
  LeadType,
  LeadUserRef,
} from '../types/lead-types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const readRecord = (value: unknown): UnknownRecord => (isRecord(value) ? value : {});

const readString = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const readStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') return value.length ? value : null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
};

const readNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

// Google Places (New) sends priceLevel as a string enum; the legacy API / imports
// may send a 0–4 number. Preserve whichever arrives (numbers verbatim, strings
// trimmed) instead of coercing — coercion dropped the string enum as NaN → null.
const readNumberOrStringOrNull = (value: unknown): number | string | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return null;
};

const readId = (value: unknown): string => {
  if (isRecord(value)) return readString(value._id ?? value.id);
  return readString(value);
};

const readIdOrNull = (value: unknown): string | null => {
  const id = readId(value);
  return id.length ? id : null;
};

// A user the lead points at. Unlike the other refs (flattened to an id above),
// the name is the whole point here: keep the populated user's name fields, fall
// back to the bare id when the response was not populated, and null when absent.
const readUserRef = (value: unknown): LeadUserRef | string | null => {
  if (!isRecord(value)) return readIdOrNull(value);
  const id = readId(value);
  if (!id) return null;
  return {
    id,
    firstName: readStringOrNull(value.firstName),
    lastName: readStringOrNull(value.lastName),
    email: readStringOrNull(value.email),
  };
};

const readIso = (value: unknown): string => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return new Date().toISOString();
};

const readIsoOrNull = (value: unknown): string | null => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return null;
};

const readStringArray = (value: unknown): string[] =>
  (Array.isArray(value) ? value : [])
    .map((item) => readString(item))
    .filter((item): item is string => item.length > 0);

const toGeoPoint = (value: unknown): GeoPoint | null => {
  if (!isRecord(value)) return null;
  if (typeof value.lat === 'number' && typeof value.lng === 'number') {
    return { lat: value.lat, lng: value.lng };
  }
  const coords = value.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [lng, lat] = coords;
    if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  }
  return null;
};

const LEAD_STATUSES: readonly LeadStatus[] = [
  'new',
  'contacted',
  'qualified',
  'unqualified',
  'converted',
];
const LEAD_SOURCES: readonly LeadSource[] = ['google_places', 'manual', 'widget', 'import'];

const readStatus = (value: unknown): LeadStatus => {
  const str = readString(value).toLowerCase();
  return (LEAD_STATUSES as readonly string[]).includes(str) ? (str as LeadStatus) : 'new';
};

const readType = (value: unknown): LeadType =>
  readString(value).toLowerCase() === 'private' ? 'private' : 'business';

const readSource = (value: unknown): LeadSource => {
  const str = readString(value).toLowerCase();
  return (LEAD_SOURCES as readonly string[]).includes(str) ? (str as LeadSource) : 'manual';
};

// ── Social + enrichment (website-scraped) ─────────────────────────────────────

const SOCIAL_PLATFORMS: readonly (keyof LeadSocial)[] = [
  'facebook',
  'instagram',
  'linkedin',
  'twitter',
  'youtube',
  'tiktok',
];

// Parse the social block defensively: every platform is a nullable URL string,
// and a missing/garbage block degrades to all-null rather than throwing.
const readSocial = (value: unknown): LeadSocial => {
  const record = readRecord(value);
  const social = {} as LeadSocial;
  for (const key of SOCIAL_PLATFORMS) social[key] = readStringOrNull(record[key]);
  return social;
};

const ENRICHMENT_STATUSES: readonly LeadEnrichmentStatus[] = [
  'none',
  'pending',
  'running',
  'done',
  'failed',
];

const readEnrichmentStatus = (value: unknown): LeadEnrichmentStatus => {
  const str = readString(value).toLowerCase();
  return (ENRICHMENT_STATUSES as readonly string[]).includes(str)
    ? (str as LeadEnrichmentStatus)
    : 'none';
};

// Parse the enrichment block defensively: unknown status → 'none', arrays default
// to [], dates are nullable. Always produced so the UI can show an honest state.
const readEnrichment = (value: unknown): LeadEnrichment => {
  const record = readRecord(value);
  return {
    status: readEnrichmentStatus(record.status),
    enrichedAt: readIsoOrNull(record.enrichedAt),
    source: readStringOrNull(record.source),
    foundEmails: readStringArray(record.foundEmails),
    foundPhones: readStringArray(record.foundPhones),
    error: readStringOrNull(record.error),
  };
};

const toAddress = (value: unknown): LeadAddress => {
  if (typeof value === 'string') {
    return {
      street: value || null,
      addressSupplement: null,
      postalCode: null,
      city: null,
      canton: null,
      country: 'CH',
    };
  }
  const record = readRecord(value);
  return {
    street: readStringOrNull(record.street),
    addressSupplement: readStringOrNull(record.addressSupplement),
    postalCode: readStringOrNull(record.postalCode),
    city: readStringOrNull(record.city),
    canton: readStringOrNull(record.canton),
    country: readString(record.country, 'CH'),
  };
};

export const leadSchema = z.unknown().transform((value): Lead => {
  const raw = readRecord(value);
  const id = readId(raw.id ?? raw._id);
  if (!id) throw new Error('Lead response is missing an id');
  const providerMeta = readRecord(raw.providerMeta);
  const sourceMetadata = readRecord(raw.sourceMetadata);
  return {
    id,
    leadNumber: readStringOrNull(raw.leadNumber),
    name: readString(raw.name),
    normalizedName: readStringOrNull(raw.normalizedName),
    type: readType(raw.type),
    status: readStatus(raw.status),
    address: toAddress(raw.address),
    phone: readStringOrNull(raw.phone),
    mobile: readStringOrNull(raw.mobile),
    normalizedPhone: readStringOrNull(raw.normalizedPhone),
    email: readStringOrNull(raw.email),
    website: readStringOrNull(raw.website),
    websiteDomain: readStringOrNull(raw.websiteDomain),
    location: toGeoPoint(raw.location),
    providerMeta: {
      rating: readNumberOrNull(providerMeta.rating),
      reviewCount: readNumberOrNull(providerMeta.reviewCount),
      priceLevel: readNumberOrStringOrNull(providerMeta.priceLevel),
    },
    source: readSource(raw.source),
    sourceMetadata: {
      googlePlaceId: readStringOrNull(sourceMetadata.googlePlaceId),
      discoverySessionId: readIdOrNull(sourceMetadata.discoverySessionId),
      discoveryResultId: readIdOrNull(sourceMetadata.discoveryResultId),
      businessType: readStringOrNull(sourceMetadata.businessType),
      keyword: readStringOrNull(sourceMetadata.keyword),
      discoveredAt: readIsoOrNull(sourceMetadata.discoveredAt),
    },
    assignedTo: readIdOrNull(raw.assignedTo),
    notes: readStringOrNull(raw.notes),
    tags: readStringArray(raw.tags),
    convertedCustomerId: readIdOrNull(raw.convertedCustomerId),
    convertedAt: readIsoOrNull(raw.convertedAt),
    createdBy: readUserRef(raw.createdBy),
    createdAt: readIso(raw.createdAt),
    updatedAt: readIso(raw.updatedAt),
    social: readSocial(raw.social),
    enrichment: readEnrichment(raw.enrichment),
  };
});

export const leadDuplicateSchema = z.unknown().transform((value): LeadDuplicate => {
  const raw = readRecord(value);
  const entityType =
    readString(raw.entityType ?? raw.type).toLowerCase() === 'customer' ? 'customer' : 'lead';
  return {
    id: readId(raw.id ?? raw._id),
    entityType,
    name: readStringOrNull(raw.name),
    phone: readStringOrNull(raw.phone),
    website: readStringOrNull(raw.website),
    placeId: readStringOrNull(raw.placeId ?? raw.googlePlaceId),
    matchedBy: readStringArray(raw.matchedBy),
    confidence: readNumberOrNull(raw.confidence),
  };
});

export const parseLeadDuplicates = (value: unknown): LeadDuplicate[] =>
  (Array.isArray(value) ? value : []).map((item) => leadDuplicateSchema.parse(item));
