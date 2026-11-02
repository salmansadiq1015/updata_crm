import { z } from 'zod';
import { readLeadSla } from './lead-sla-schema';
import { parseLeadScore } from '../services/lead-quality-api';
import type {
  GeoPoint,
  Lead,
  LeadAddress,
  LeadDuplicate,
  LeadEnrichment,
  LeadEnrichmentStatus,
  LeadPhoto,
  LeadRatingDistribution,
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
const LEAD_SOURCES: readonly LeadSource[] = ['extension', 'google_places', 'manual', 'widget', 'import'];

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
      area: null,
      postalCode: null,
      city: null,
      canton: null,
      region: null,
      country: 'CH',
      formatted: value || null,
    };
  }
  const record = readRecord(value);
  return {
    street: readStringOrNull(record.street),
    addressSupplement: readStringOrNull(record.addressSupplement),
    area: readStringOrNull(record.area),
    postalCode: readStringOrNull(record.postalCode),
    city: readStringOrNull(record.city),
    canton: readStringOrNull(record.canton),
    region: readStringOrNull(record.region),
    country: readString(record.country, 'CH'),
    formatted: readStringOrNull(record.formatted),
  };
};

// Per-star histogram. Accepts the stored word-key shape ({ five: 892 }) or the
// numeric-key shape ({ "5": 892 }); returns null unless at least one real count
// is present, so the UI only shows bars for genuine provider data.
const readRatingDistribution = (value: unknown): LeadRatingDistribution | null => {
  if (!isRecord(value)) return null;
  const words = ['one', 'two', 'three', 'four', 'five'] as const;
  const numeric = ['1', '2', '3', '4', '5'] as const;
  const out = {} as LeadRatingDistribution;
  let any = false;
  words.forEach((word, index) => {
    const n = readNumberOrNull(value[word] ?? value[numeric[index]] ?? value[index + 1]);
    out[word] = n != null && n >= 0 ? Math.trunc(n) : 0;
    if (n != null && n >= 0) any = true;
  });
  return any ? out : null;
};

const readPhotos = (value: unknown): LeadPhoto[] =>
  (Array.isArray(value) ? value : [])
    .map((item): LeadPhoto | null => {
      if (typeof item === 'string') return item ? { url: item, source: null, attribution: null } : null;
      const record = readRecord(item);
      const url = readStringOrNull(record.url);
      return url ? { url, source: readStringOrNull(record.source), attribution: readStringOrNull(record.attribution) } : null;
    })
    .filter((item): item is LeadPhoto => item !== null);

// Opening hours arrive as a single string or an array of day lines; keep either.
const readOpeningHours = (value: unknown): string | string[] | null => {
  if (Array.isArray(value)) {
    const lines = readStringArray(value);
    return lines.length ? lines : null;
  }
  return readStringOrNull(value);
};

export const leadSchema = z.unknown().transform((value): Lead => {
  const raw = readRecord(value);
  const id = readId(raw.id ?? raw._id);
  if (!id) throw new Error('Lead response is missing an id');
  const providerMeta = readRecord(raw.providerMeta);
  const sourceMetadata = readRecord(raw.sourceMetadata);
  const discoveryLocation = readRecord(sourceMetadata.discoveryLocation);
  const discoveryArea = readRecord(sourceMetadata.discoveryArea);
  const discoveryBounds = readRecord(discoveryArea.bounds);
  const discoverySearch = readRecord(sourceMetadata.discoverySearchCoordinates);
  const discoverySearchBounds = readRecord(discoverySearch.bounds);
  const readBounds = (record: UnknownRecord) => (
    [record.north, record.south, record.east, record.west].every((item) => typeof item === 'number')
      ? {
          north: record.north as number,
          south: record.south as number,
          east: record.east as number,
          west: record.west as number,
        }
      : null
  );
  const geometry = readRecord(discoveryArea.geometry);
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
      ratingDistribution: readRatingDistribution(providerMeta.ratingDistribution),
      businessStatus: readStringOrNull(providerMeta.businessStatus),
      openingHours: readOpeningHours(providerMeta.openingHours),
      photos: readPhotos(providerMeta.photos),
      mapsUrl: readStringOrNull(providerMeta.mapsUrl),
    },
    source: readSource(raw.source),
    sourceMetadata: {
      googlePlaceId: readStringOrNull(sourceMetadata.googlePlaceId),
      discoverySessionId: readIdOrNull(sourceMetadata.discoverySessionId),
      discoveryResultId: readIdOrNull(sourceMetadata.discoveryResultId),
      businessType: readStringOrNull(sourceMetadata.businessType),
      keyword: readStringOrNull(sourceMetadata.keyword),
      discoveryLocation: Object.keys(discoveryLocation).length ? {
        name: readStringOrNull(discoveryLocation.name),
        placeId: readStringOrNull(discoveryLocation.placeId),
        city: readStringOrNull(discoveryLocation.city),
        region: readStringOrNull(discoveryLocation.region),
        country: readStringOrNull(discoveryLocation.country),
        countryCode: readStringOrNull(discoveryLocation.countryCode),
        formattedAddress: readStringOrNull(discoveryLocation.formattedAddress),
        center: toGeoPoint(discoveryLocation.center),
      } : null,
      discoveryArea: Object.keys(discoveryArea).length ? {
        type: readStringOrNull(discoveryArea.type),
        radiusMeters: readNumberOrNull(discoveryArea.radiusMeters),
        areaSqKm: readNumberOrNull(discoveryArea.areaSqKm),
        bounds: readBounds(discoveryBounds),
        geometry: geometry.type === 'Polygon' && Array.isArray(geometry.coordinates)
          ? { type: 'Polygon', coordinates: geometry.coordinates as number[][][] }
          : null,
      } : null,
      discoverySearchCoordinates: Object.keys(discoverySearch).length ? {
        cellId: readStringOrNull(discoverySearch.cellId),
        depth: readNumberOrNull(discoverySearch.depth),
        center: toGeoPoint(discoverySearch.center),
        radiusMeters: readNumberOrNull(discoverySearch.radiusMeters),
        bounds: readBounds(discoverySearchBounds),
      } : null,
      discoveryBusinessTypes: (Array.isArray(sourceMetadata.discoveryBusinessTypes)
        ? sourceMetadata.discoveryBusinessTypes
        : []).map((item) => {
        const businessType = readRecord(item);
        return {
          id: readString(businessType.id ?? item),
          name: readStringOrNull(businessType.name),
        };
      }).filter((item) => item.id.length > 0),
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
    sla: readLeadSla(raw),
    score: parseLeadScore(raw.score),
    mergedLeadIds: Array.isArray(raw.mergedLeadIds) ? raw.mergedLeadIds.map((item) => readId(item)).filter(Boolean) : [],
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
