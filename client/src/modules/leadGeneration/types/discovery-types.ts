// Frontend-facing types for the Lead Generation / Business Discovery module.
// These mirror the API DTO contract in LEAD_GENERATION_DESIGN.md §4 (data model)
// and §11/§72 (response DTOs). All ids are normalized to `id` (string), dates to
// ISO strings, and geo coordinates to a `{ lat, lng }` point for map/UI use.

// ── Geo primitives ──────────────────────────────────────────────────────────

export type GeoPoint = { lat: number; lng: number };

export type GeoJsonPolygon = {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lng, lat], ...]]
};

export type AreaBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

// ── Enums / unions ──────────────────────────────────────────────────────────

export type DiscoverySessionStatus =
  | 'DRAFT'
  | 'QUEUED'
  | 'RUNNING'
  | 'FETCHING'
  | 'NORMALIZING'
  | 'DEDUPLICATING'
  | 'MATCHING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED';

/** matching.status → exposed as `crmStatus` in the result DTO. */
export type MatchingStatus = 'NEW' | 'EXISTING' | 'POSSIBLE_DUPLICATE';

/** import.status → exposed as `importStatus` in the result DTO. */
export type ImportStatus = 'NOT_IMPORTED' | 'QUEUED' | 'IMPORTED' | 'SKIPPED' | 'FAILED';

export type LocationMode = 'search' | 'draw' | 'upload';

export type AreaType = 'radius' | 'circle' | 'rectangle' | 'polygon';

export type MatchMethod = 'PLACE_ID' | 'PHONE' | 'WEBSITE' | 'NAME_ADDRESS' | 'GEO';

/** Import mode (POST /sessions/:id/import, preview). */
export type ImportMode = 'new' | 'skip' | 'update';

export type ImportSelectionKind = 'ALL_NEW' | 'SELECTED';

export type LeadImportJobStatus =
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL'
  | 'FAILED'
  | 'CANCELLED';

// ── Cursor pagination ───────────────────────────────────────────────────────

export type CursorPagination = {
  hasNext: boolean;
  nextCursor: string | null;
  limit: number;
};

export type CursorPage<T> = {
  data: T[];
  pagination: CursorPagination;
};

// ── Business type catalog ───────────────────────────────────────────────────

export type BusinessType = {
  id: string;
  name: string;
  /** Google Places structured `includedType`, when the catalog entry maps to one. */
  providerIncludedType: string | null;
  /** Fallback free-text query for types without a structured mapping. */
  providerTextQuery: string | null;
  icon: string | null;
  category: string | null;
  /** i18n key for localized label (resolved by the UI wave). */
  i18nKey: string | null;
};

// ── Discovery session ───────────────────────────────────────────────────────

export type DiscoveryLocation = {
  name: string | null;
  mode: LocationMode | null;
  center: GeoPoint | null;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  formattedAddress: string | null;
};

export type DiscoveryArea = {
  type: AreaType | null;
  radiusMeters: number | null;
  geometry: GeoJsonPolygon | null;
  bounds: AreaBounds | null;
  areaSqKm: number | null;
};

export type DiscoverySessionBusinessType = {
  id: string;
  name: string | null;
  providerIncludedType: string | null;
  providerTextQuery: string | null;
};

export type DiscoveryProgress = {
  stage: string | null;
  percent: number;
  searchesCompleted: number;
  searchesTotal: number;
  resultsDiscovered: number;
  resultsPersisted: number;
  errors: number;
};

export type DiscoveryCounts = {
  discovered: number;
  new: number;
  existing: number;
  possibleDuplicates: number;
  imported: number;
  skipped: number;
  failed: number;
};

export type DiscoveryUsage = {
  searchRequests: number;
  detailsRequests: number;
  geocodeRequests: number;
};

export type DiscoveryError = {
  code: string | null;
  message: string | null;
  retryable: boolean;
} | null;

export type DiscoverySession = {
  id: string;
  status: DiscoverySessionStatus;
  location: DiscoveryLocation;
  area: DiscoveryArea;
  businessTypes: DiscoverySessionBusinessType[];
  keyword: string | null;
  provider: { name: string; version: string | null };
  config: {
    maxResults: number | null;
    maxSearchRequests: number | null;
    maxCoverageCells: number | null;
    concurrency: number | null;
    detailsOnImport: boolean;
  };
  progress: DiscoveryProgress;
  counts: DiscoveryCounts;
  usage: DiscoveryUsage;
  cancelRequested: boolean;
  error: DiscoveryError;
  createdBy: string | null;
  startedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Discovery result ────────────────────────────────────────────────────────

export type DiscoveryAddress = {
  formatted: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  canton: string | null;
};

export type DiscoveryBusiness = {
  name: string;
  normalizedName: string | null;
  primaryType: string | null;
  type: string | null;
  types: string[];
  phone: string | null;
  internationalPhone: string | null;
  normalizedPhone: string | null;
  website: string | null;
  websiteDomain: string | null;
  email: string | null;
  address: DiscoveryAddress;
  location: GeoPoint | null;
  rating: number | null;
  reviewCount: number | null;
  priceLevel: number | null;
  businessStatus: string | null;
  mapsUrl: string | null;
};

export type MatchedBy = { method: MatchMethod; confidence: number };

export type DiscoveryResult = {
  id: string;
  discoverySessionId: string | null;
  placeId: string | null;
  business: DiscoveryBusiness;
  /** matching.status, flattened to the top level in the DTO. */
  crmStatus: MatchingStatus;
  matchedLeadId: string | null;
  matchedCustomerId: string | null;
  matchedBy: MatchedBy[];
  /** import.status, flattened to the top level in the DTO. */
  importStatus: ImportStatus;
  importedLeadId: string | null;
  importedAt: string | null;
  importError: { code: string | null; message: string | null } | null;
  discoveredAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Import ──────────────────────────────────────────────────────────────────

export type ImportSelection = {
  kind: ImportSelectionKind;
  resultIds?: string[];
};

export type ImportPreview = {
  /** server-computed counts for the chosen mode/selection */
  new: number;
  existing: number;
  possibleDuplicates: number;
  willImport: number;
};

export type ImportSummary = {
  imported: number;
  existing: number;
  skipped: number;
  failed: number;
  duplicates: number;
};

/** POST import returns EITHER a synchronous summary OR a 202 { jobId }. */
export type ImportResponse =
  | { kind: 'sync'; summary: ImportSummary; jobId: null }
  | { kind: 'async'; jobId: string; summary: null };

export type LeadImportJob = {
  id: string;
  discoverySessionId: string | null;
  mode: ImportMode | null;
  selection: ImportSelection | null;
  status: LeadImportJobStatus;
  counts: {
    total: number;
    processed: number;
    created: number;
    existing: number;
    duplicates: number;
    skipped: number;
    failed: number;
  };
  error: { code: string | null; message: string | null } | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ── Location proxy (geocode / autocomplete) ─────────────────────────────────

export type GeocodeResult = {
  name: string | null;
  formattedAddress: string | null;
  center: GeoPoint | null;
  bounds: AreaBounds | null;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  placeId: string | null;
};

export type AutocompletePrediction = {
  placeId: string;
  description: string;
  mainText: string | null;
  secondaryText: string | null;
};

// ── Request params / inputs ─────────────────────────────────────────────────

export type DiscoverySessionListParams = {
  cursor?: string | null;
  limit?: number;
  status?: DiscoverySessionStatus;
  q?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type DiscoveryResultFilters = {
  crmStatus?: MatchingStatus;
  importStatus?: ImportStatus;
  minRating?: number;
  hasPhone?: boolean;
  hasWebsite?: boolean;
  search?: string;
};

export type DiscoveryResultListParams = DiscoveryResultFilters & {
  cursor?: string | null;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
};

export type CreateDiscoveryInput = {
  location: {
    name?: string;
    mode?: LocationMode;
    center?: GeoPoint;
    countryCode?: string;
    formattedAddress?: string;
  };
  area: {
    type: AreaType;
    radiusMeters?: number;
    geometry?: GeoJsonPolygon;
    bounds?: AreaBounds;
  };
  /** Business type ids (the backend resolves them to provider types). */
  businessTypes: string[];
  keyword?: string;
  options?: {
    maxResults?: number;
    maxSearchRequests?: number;
    maxCoverageCells?: number;
    detailsOnImport?: boolean;
  };
};

export type GeocodeInput = { query: string; countryCode?: string };
export type AutocompleteInput = { query: string; countryCode?: string };

export type CreateDiscoveryResult = { sessionId: string };

// ── Realtime ────────────────────────────────────────────────────────────────

/**
 * Socket.IO event names the client listens for on room `discovery:session:<id>`.
 * Documented here so the backend `discovery.events.js` bridge emits matching names.
 */
export const DISCOVERY_EVENTS = {
  PROGRESS: 'discovery:progress',
  RESULT: 'discovery:result',
  COMPLETED: 'discovery:completed',
} as const;

export const DISCOVERY_SUBSCRIBE = 'discovery:subscribe';
export const DISCOVERY_UNSUBSCRIBE = 'discovery:unsubscribe';

export const discoveryRoom = (sessionId: string): string => `discovery:session:${sessionId}`;

export type DiscoveryProgressEvent = {
  type: 'discovery:progress';
  sessionId: string;
  status?: DiscoverySessionStatus;
  progress?: Partial<DiscoveryProgress>;
  counts?: Partial<DiscoveryCounts>;
  usage?: Partial<DiscoveryUsage>;
  updatedAt: string;
};

export type DiscoveryResultEvent = {
  type: 'discovery:result';
  sessionId: string;
  result?: unknown; // raw result DTO; normalized by the realtime hook
  results?: unknown[];
  counts?: Partial<DiscoveryCounts>;
  updatedAt: string;
};

export type DiscoveryCompletedEvent = {
  type: 'discovery:completed';
  sessionId: string;
  status: DiscoverySessionStatus;
  counts?: Partial<DiscoveryCounts>;
  progress?: Partial<DiscoveryProgress>;
  updatedAt: string;
};

export type DiscoveryRealtimeEvent =
  | DiscoveryProgressEvent
  | DiscoveryResultEvent
  | DiscoveryCompletedEvent;
