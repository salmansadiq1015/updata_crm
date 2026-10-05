import { z } from 'zod';
import type {
  AreaBounds,
  AutocompletePrediction,
  BusinessType,
  DiscoveryAddress,
  DiscoveryBusiness,
  DiscoveryResult,
  DiscoverySession,
  DiscoverySessionStatus,
  GeocodeResult,
  GeoJsonPolygon,
  GeoPoint,
  ImportPreview,
  ImportStatus,
  ImportSummary,
  LeadImportJob,
  LeadImportJobStatus,
  MatchedBy,
  MatchingStatus,
} from '../types/discovery-types';

// ── Low-level readers (mirror task-api.ts normalization helpers) ─────────────

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

const readNumber = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
};

const readNumberOrNull = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const readBoolean = (value: unknown, fallback = false): boolean =>
  typeof value === 'boolean' ? value : fallback;

const readId = (value: unknown): string => {
  if (isRecord(value)) return readString(value._id ?? value.id);
  return readString(value);
};

const readIdOrNull = (value: unknown): string | null => {
  const id = readId(value);
  return id.length ? id : null;
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

const readArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const readStringArray = (value: unknown): string[] =>
  readArray(value)
    .map((item) => readString(item))
    .filter((item): item is string => item.length > 0);

// ── Geo / address normalization ──────────────────────────────────────────────

/** Accepts `{ lat, lng }` or GeoJSON `{ type:'Point', coordinates:[lng,lat] }`. */
const toGeoPoint = (value: unknown): GeoPoint | null => {
  if (!isRecord(value)) return null;
  const lat = value.lat;
  const lng = value.lng;
  if (typeof lat === 'number' && typeof lng === 'number') return { lat, lng };
  const coords = value.coordinates;
  if (Array.isArray(coords) && coords.length >= 2) {
    const [cLng, cLat] = coords;
    if (typeof cLat === 'number' && typeof cLng === 'number') return { lat: cLat, lng: cLng };
  }
  return null;
};

const toPolygon = (value: unknown): GeoJsonPolygon | null => {
  if (!isRecord(value)) return null;
  const coordinates = value.coordinates;
  if (!Array.isArray(coordinates)) return null;
  return { type: 'Polygon', coordinates: coordinates as number[][][] };
};

const toBounds = (value: unknown): AreaBounds | null => {
  if (!isRecord(value)) return null;
  const { north, south, east, west } = value;
  if (
    typeof north === 'number' &&
    typeof south === 'number' &&
    typeof east === 'number' &&
    typeof west === 'number'
  ) {
    return { north, south, east, west };
  }
  return null;
};

/** Accepts a plain string or a structured address object. */
const toAddress = (value: unknown): DiscoveryAddress => {
  if (typeof value === 'string') {
    return {
      formatted: value || null,
      street: null,
      city: null,
      region: null,
      postalCode: null,
      country: null,
      canton: null,
    };
  }
  const record = readRecord(value);
  return {
    formatted: readStringOrNull(record.formatted ?? record.formattedAddress),
    street: readStringOrNull(record.street),
    city: readStringOrNull(record.city),
    region: readStringOrNull(record.region),
    postalCode: readStringOrNull(record.postalCode ?? record.postal_code),
    country: readStringOrNull(record.country),
    canton: readStringOrNull(record.canton),
  };
};

// ── Status coercion ──────────────────────────────────────────────────────────

const MATCHING_STATUSES: readonly MatchingStatus[] = ['NEW', 'EXISTING', 'POSSIBLE_DUPLICATE'];
const IMPORT_STATUSES: readonly ImportStatus[] = [
  'NOT_IMPORTED',
  'QUEUED',
  'IMPORTED',
  'SKIPPED',
  'FAILED',
];
const SESSION_STATUSES: readonly DiscoverySessionStatus[] = [
  'DRAFT',
  'QUEUED',
  'RUNNING',
  'FETCHING',
  'NORMALIZING',
  'DEDUPLICATING',
  'MATCHING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
];
const JOB_STATUSES: readonly LeadImportJobStatus[] = [
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
  'CANCELLED',
];

const readMatchingStatus = (value: unknown): MatchingStatus => {
  const str = readString(value).toUpperCase();
  return (MATCHING_STATUSES as readonly string[]).includes(str) ? (str as MatchingStatus) : 'NEW';
};

const readImportStatus = (value: unknown): ImportStatus => {
  const str = readString(value).toUpperCase();
  return (IMPORT_STATUSES as readonly string[]).includes(str)
    ? (str as ImportStatus)
    : 'NOT_IMPORTED';
};

const readSessionStatus = (value: unknown): DiscoverySessionStatus => {
  const str = readString(value).toUpperCase();
  return (SESSION_STATUSES as readonly string[]).includes(str)
    ? (str as DiscoverySessionStatus)
    : 'DRAFT';
};

const readJobStatus = (value: unknown): LeadImportJobStatus => {
  const str = readString(value).toUpperCase();
  return (JOB_STATUSES as readonly string[]).includes(str)
    ? (str as LeadImportJobStatus)
    : 'QUEUED';
};

const readMatchedBy = (value: unknown): MatchedBy[] =>
  readArray(value)
    .map((item): MatchedBy | null => {
      const record = readRecord(item);
      const method = readString(record.method).toUpperCase();
      const valid = ['PLACE_ID', 'PHONE', 'WEBSITE', 'NAME_ADDRESS', 'GEO'];
      if (!valid.includes(method)) return null;
      return { method: method as MatchedBy['method'], confidence: readNumber(record.confidence) };
    })
    .filter((item): item is MatchedBy => item !== null);

// ── Business type catalog ─────────────────────────────────────────────────────

export const businessTypeSchema = z.unknown().transform((value): BusinessType => {
  const raw = readRecord(value);
  return {
    id: readId(raw.id ?? raw._id ?? raw.key),
    name: readString(raw.name ?? raw.label, readString(raw.id)),
    providerIncludedType: readStringOrNull(raw.providerIncludedType ?? raw.includedType),
    providerTextQuery: readStringOrNull(raw.providerTextQuery ?? raw.textQuery),
    icon: readStringOrNull(raw.icon),
    category: readStringOrNull(raw.category),
    i18nKey: readStringOrNull(raw.i18nKey),
  };
});

// ── Discovery result ──────────────────────────────────────────────────────────

const toBusiness = (value: unknown): DiscoveryBusiness => {
  const raw = readRecord(value);
  const primaryType = readStringOrNull(raw.primaryType);
  return {
    name: readString(raw.name ?? readRecord(raw.displayName).text, ''),
    normalizedName: readStringOrNull(raw.normalizedName),
    primaryType,
    type: readStringOrNull(raw.type) ?? primaryType,
    types: readStringArray(raw.types),
    phone: readStringOrNull(raw.phone ?? raw.nationalPhone),
    internationalPhone: readStringOrNull(raw.internationalPhone),
    normalizedPhone: readStringOrNull(raw.normalizedPhone),
    website: readStringOrNull(raw.website),
    websiteDomain: readStringOrNull(raw.websiteDomain),
    email: readStringOrNull(raw.email),
    address: toAddress(raw.address),
    location: toGeoPoint(raw.location),
    rating: readNumberOrNull(raw.rating),
    reviewCount: readNumberOrNull(raw.reviewCount ?? raw.userRatingCount),
    priceLevel: readNumberOrNull(raw.priceLevel),
    businessStatus: readStringOrNull(raw.businessStatus),
    mapsUrl: readStringOrNull(raw.mapsUrl),
  };
};

export const discoveryResultSchema = z.unknown().transform((value): DiscoveryResult => {
  const raw = readRecord(value);
  const id = readId(raw.id ?? raw._id);
  if (!id) throw new Error('DiscoveryResult response is missing an id');
  const matching = readRecord(raw.matching);
  const importBlock = readRecord(raw.import);
  const provider = readRecord(raw.provider);
  const importError = isRecord(importBlock.error)
    ? {
        code: readStringOrNull(importBlock.error.code),
        message: readStringOrNull(importBlock.error.message),
      }
    : null;
  return {
    id,
    discoverySessionId: readIdOrNull(raw.discoverySessionId ?? raw.sessionId),
    placeId: readStringOrNull(raw.placeId ?? provider.placeId),
    business: toBusiness(raw.business),
    // Prefer the flattened DTO fields; fall back to the raw Mongo sub-docs.
    crmStatus: readMatchingStatus(raw.crmStatus ?? matching.status),
    matchedLeadId: readIdOrNull(raw.matchedLeadId ?? matching.matchedLeadId),
    matchedCustomerId: readIdOrNull(raw.matchedCustomerId ?? matching.matchedCustomerId),
    matchedBy: readMatchedBy(raw.matchedBy ?? matching.matchedBy),
    importStatus: readImportStatus(raw.importStatus ?? importBlock.status),
    importedLeadId: readIdOrNull(raw.importedLeadId ?? importBlock.leadId),
    importedAt: readIsoOrNull(raw.importedAt ?? importBlock.importedAt),
    importError,
    discoveredAt: readIsoOrNull(raw.discoveredAt),
    createdAt: readIso(raw.createdAt),
    updatedAt: readIso(raw.updatedAt),
  };
});

// ── Discovery session ─────────────────────────────────────────────────────────

export const discoverySessionSchema = z.unknown().transform((value): DiscoverySession => {
  const raw = readRecord(value);
  const id = readId(raw.id ?? raw._id);
  if (!id) throw new Error('DiscoverySession response is missing an id');
  const location = readRecord(raw.location);
  const area = readRecord(raw.area);
  const provider = readRecord(raw.provider);
  const config = readRecord(raw.config);
  const progress = readRecord(raw.progress);
  const counts = readRecord(raw.counts);
  const usage = readRecord(raw.usage);
  const coverage = readRecord(raw.coverage);
  const error = isRecord(raw.error)
    ? {
        code: readStringOrNull(raw.error.code),
        message: readStringOrNull(raw.error.message),
        retryable: readBoolean(raw.error.retryable),
      }
    : null;

  const modeStr = readString(location.mode);
  const mode =
    modeStr === 'search' || modeStr === 'draw' || modeStr === 'upload' ? modeStr : null;
  const areaTypeStr = readString(area.type);
  const areaType =
    areaTypeStr === 'radius' ||
    areaTypeStr === 'circle' ||
    areaTypeStr === 'rectangle' ||
    areaTypeStr === 'polygon'
      ? areaTypeStr
      : null;
  const coverageStateValue = readString(coverage.state);
  const coverageState = (
    coverageStateValue === 'RUNNING'
    || coverageStateValue === 'EXHAUSTED'
    || coverageStateValue === 'PARTIAL'
    || coverageStateValue === 'CANCELLED'
  ) ? coverageStateValue : 'PENDING';

  return {
    id,
    status: readSessionStatus(raw.status),
    location: {
      name: readStringOrNull(location.name),
      mode,
      center: toGeoPoint(location.center),
      placeId: readStringOrNull(location.placeId),
      countryCode: readStringOrNull(location.countryCode),
      country: readStringOrNull(location.country),
      region: readStringOrNull(location.region),
      city: readStringOrNull(location.city),
      formattedAddress: readStringOrNull(location.formattedAddress),
    },
    area: {
      type: areaType,
      radiusMeters: readNumberOrNull(area.radiusMeters),
      geometry: toPolygon(area.geometry),
      bounds: toBounds(area.bounds),
      areaSqKm: readNumberOrNull(area.areaSqKm),
    },
    businessTypes: readArray(raw.businessTypes).map((item) => {
      const bt = readRecord(item);
      return {
        id: readId(bt.id ?? bt._id),
        name: readStringOrNull(bt.name),
        providerIncludedType: readStringOrNull(bt.providerIncludedType),
        providerTextQuery: readStringOrNull(bt.providerTextQuery),
      };
    }),
    keyword: readStringOrNull(raw.keyword),
    provider: {
      name: readString(provider.name, 'google_places'),
      version: readStringOrNull(provider.version),
    },
    config: {
      maxResults: readNumberOrNull(config.maxResults),
      maxSearchRequests: readNumberOrNull(config.maxSearchRequests),
      maxCoverageCells: readNumberOrNull(config.maxCoverageCells),
      concurrency: readNumberOrNull(config.concurrency),
      detailsOnImport: readBoolean(config.detailsOnImport),
    },
    progress: {
      stage: readStringOrNull(progress.stage),
      percent: readNumber(progress.percent),
      searchesCompleted: readNumber(progress.searchesCompleted),
      searchesTotal: readNumber(progress.searchesTotal),
      resultsDiscovered: readNumber(progress.resultsDiscovered),
      resultsPersisted: readNumber(progress.resultsPersisted),
      rawResults: readNumber(progress.rawResults),
      duplicatesRemoved: readNumber(progress.duplicatesRemoved),
      errors: readNumber(progress.errors),
    },
    counts: {
      discovered: readNumber(counts.discovered),
      new: readNumber(counts.new),
      existing: readNumber(counts.existing),
      possibleDuplicates: readNumber(counts.possibleDuplicates),
      imported: readNumber(counts.imported),
      skipped: readNumber(counts.skipped),
      failed: readNumber(counts.failed),
    },
    usage: {
      searchRequests: readNumber(usage.searchRequests),
      detailsRequests: readNumber(usage.detailsRequests),
      geocodeRequests: readNumber(usage.geocodeRequests),
    },
    coverage: {
      strategy: readStringOrNull(coverage.strategy),
      state: coverageState,
      providerGuaranteesCompleteness: readBoolean(coverage.providerGuaranteesCompleteness),
      searchesCompleted: readNumber(coverage.searchesCompleted ?? progress.searchesCompleted),
      searchesTotal: readNumber(coverage.searchesTotal ?? progress.searchesTotal),
      saturatedRegions: readNumber(coverage.saturatedRegions),
      subdividedRegions: readNumber(coverage.subdividedRegions),
      unresolvedRegions: readNumber(coverage.unresolvedRegions),
      reasonCodes: readStringArray(coverage.reasonCodes),
    },
    cancelRequested: readBoolean(raw.cancelRequested),
    error,
    createdBy: readIdOrNull(raw.createdBy),
    startedAt: readIsoOrNull(raw.startedAt),
    completedAt: readIsoOrNull(raw.completedAt),
    expiresAt: readIsoOrNull(raw.expiresAt),
    createdAt: readIso(raw.createdAt),
    updatedAt: readIso(raw.updatedAt),
  };
});

// ── Import preview / summary / job ─────────────────────────────────────────────

export const importPreviewSchema = z.unknown().transform((value): ImportPreview => {
  const raw = readRecord(value);
  return {
    new: readNumber(raw.new ?? raw.willCreate),
    existing: readNumber(raw.existing),
    possibleDuplicates: readNumber(raw.possibleDuplicates ?? raw.possibleDup ?? raw.duplicates),
    willImport: readNumber(raw.willImport),
  };
});

export const importSummarySchema = z.unknown().transform((value): ImportSummary => {
  const raw = readRecord(value);
  return {
    imported: readNumber(raw.imported ?? raw.created),
    existing: readNumber(raw.existing),
    skipped: readNumber(raw.skipped),
    failed: readNumber(raw.failed),
    duplicates: readNumber(raw.duplicates ?? raw.possibleDuplicates),
  };
});

export const leadImportJobSchema = z.unknown().transform((value): LeadImportJob => {
  const raw = readRecord(value);
  const id = readId(raw.id ?? raw._id ?? raw.jobId);
  if (!id) throw new Error('LeadImportJob response is missing an id');
  const counts = readRecord(raw.counts);
  const selection = isRecord(raw.selection) ? raw.selection : null;
  const modeStr = readString(raw.mode);
  const mode = modeStr === 'new' || modeStr === 'skip' || modeStr === 'update' ? modeStr : null;
  const error = isRecord(raw.error)
    ? { code: readStringOrNull(raw.error.code), message: readStringOrNull(raw.error.message) }
    : null;
  return {
    id,
    discoverySessionId: readIdOrNull(raw.discoverySessionId),
    mode,
    selection: selection
      ? {
          kind: readString(selection.kind) === 'SELECTED' ? 'SELECTED' : 'ALL_NEW',
          resultIds: readStringArray(selection.resultIds),
        }
      : null,
    status: readJobStatus(raw.status),
    counts: {
      total: readNumber(counts.total),
      processed: readNumber(counts.processed),
      created: readNumber(counts.created),
      existing: readNumber(counts.existing),
      duplicates: readNumber(counts.duplicates),
      skipped: readNumber(counts.skipped),
      failed: readNumber(counts.failed),
    },
    error,
    startedAt: readIsoOrNull(raw.startedAt),
    completedAt: readIsoOrNull(raw.completedAt),
    createdAt: readIso(raw.createdAt),
    updatedAt: readIso(raw.updatedAt),
  };
});

// ── Location proxy ─────────────────────────────────────────────────────────────

export const geocodeResultSchema = z.unknown().transform((value): GeocodeResult => {
  const raw = readRecord(value);
  return {
    name: readStringOrNull(raw.name),
    formattedAddress: readStringOrNull(raw.formattedAddress ?? raw.formatted_address),
    center: toGeoPoint(raw.center ?? raw.location ?? raw.geometry),
    bounds: toBounds(raw.bounds),
    countryCode: readStringOrNull(raw.countryCode),
    country: readStringOrNull(raw.country),
    region: readStringOrNull(raw.region),
    city: readStringOrNull(raw.city),
    placeId: readStringOrNull(raw.placeId ?? raw.place_id),
  };
});

export const autocompletePredictionSchema = z
  .unknown()
  .transform((value): AutocompletePrediction => {
    const raw = readRecord(value);
    const structured = readRecord(raw.structuredFormat ?? raw.structured_formatting);
    return {
      placeId: readString(raw.placeId ?? raw.place_id),
      description: readString(raw.description ?? raw.text),
      mainText: readStringOrNull(
        readRecord(structured.mainText).text ?? structured.main_text ?? raw.mainText,
      ),
      secondaryText: readStringOrNull(
        readRecord(structured.secondaryText).text ?? structured.secondary_text ?? raw.secondaryText,
      ),
    };
  });

// Convenience array parsers
// The server returns a GROUPED catalog: `[{ group, i18nKey, types: [...] }]`.
// Flatten it to a flat `BusinessType[]`, tagging each type with its group as
// `category`. A flat array (no `types[]`) is tolerated too, so either backend
// shape parses to types that always carry a real `id` (no duplicate keys).
export const parseBusinessTypes = (value: unknown): BusinessType[] =>
  readArray(value).flatMap((item) => {
    const raw = readRecord(item);
    if (Array.isArray(raw.types)) {
      const category = readStringOrNull(raw.group ?? raw.category ?? raw.id);
      return raw.types.map((entry) => {
        const typeRaw = readRecord(entry);
        return businessTypeSchema.parse(
          category != null && typeRaw.category == null ? { ...typeRaw, category } : typeRaw,
        );
      });
    }
    return [businessTypeSchema.parse(item)];
  });

export const parseDiscoveryResults = (value: unknown): DiscoveryResult[] =>
  readArray(value).map((item) => discoveryResultSchema.parse(item));
