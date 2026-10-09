export type DiscoveryStatus =
  | 'idle'
  | 'starting'
  | 'discovering'
  | 'paused'
  | 'processing'
  | 'resuming'
  | 'retrying'
  | 'enriching'
  | 'completed'
  | 'stopped'
  | 'error'
  // Kept for persisted jobs created by earlier extension builds.
  | 'cancelled'
  | 'failed';

export type DiscoveryPhase =
  | 'SEARCH_INITIALIZED'
  | 'WAITING_FOR_RESULTS'
  | 'EXTRACTING'
  | 'PROCESSING'
  | 'CHECKING_FOR_MORE'
  | 'NEXT_RESULTS'
  | 'NO_MORE_RESULTS'
  | 'COMPLETED'
  | 'STOPPED'
  | 'FAILED';

export type CrmLeadStatus = 'not-imported' | 'importing' | 'imported' | 'existing' | 'failed';

export type EmailConfidence = 'high' | 'medium' | 'low' | null;

// Review count per star level, read from a business's Google Maps place page.
// Only populated when the histogram is actually present — never fabricated.
export interface RatingBreakdown {
  5: number;
  4: number;
  3: number;
  2: number;
  1: number;
}

export interface Lead {
  id: string;
  source: 'google-maps';
  sourceUrl: string;
  googleMapsUrl: string;
  placeIdentifier: string | null;
  businessName: string;
  category: string | null;
  categories: string[];
  phone: string | null;
  internationalPhone: string | null;
  website: string | null;
  emails: string[];
  address: string | null;
  street: string | null;
  area: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  distanceKm: number | null;
  geographicValidation?: 'inside' | 'outside' | 'unverified';
  rating: number | null;
  reviewCount: number | null;
  ratingBreakdown: RatingBreakdown | null;
  photos: string[];
  businessStatus: string | null;
  openingHours: string[];
  priceLevel: string | null;
  emailSource: string | null;
  emailConfidence: EmailConfidence;
  enrichmentStatus: 'not-requested' | 'pending' | 'complete' | 'failed';
  discoveredAt: string;
  updatedAt: string;
  searchId: string;
  // The raw selected search location this lead was discovered under (e.g.
  // "Lahore" / "Lahore, Pakistan"). Sent to the CRM as the last-resort fallback
  // for a city/country that could not be scraped from the business itself.
  searchLocation?: string | null;
  crmStatus?: CrmLeadStatus;
  crmLeadId?: string | null;
  crmLeadNumber?: string | null;
  crmError?: string | null;
  // "Clear" archives a lead into History (ACTIVE → HISTORY) instead of deleting
  // it, so cleared businesses remain downloadable / importable later.
  archived?: boolean;
  archivedAt?: string | null;
}

export interface RawBusinessRecord {
  businessName: string;
  category?: string | null;
  categories?: string[];
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  street?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  ratingBreakdown?: RatingBreakdown | null;
  photos?: string[];
  businessStatus?: string | null;
  openingHours?: string[];
  priceLevel?: string | null;
  googleMapsUrl: string;
  placeIdentifier?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface SearchRecord {
  id: string;
  businessType: string;
  location: string;
  radiusKm: number | null;
  query: string;
  startedAt: string;
  completedAt: string | null;
  status: DiscoveryStatus;
  discoveredCount: number;
  uniqueCount: number;
  duplicateCount?: number;
  exportedCount: number;
  tabId?: number;
  lastActivityAt?: string;
  currentPhase?: DiscoveryPhase;
  currentQuery?: string;
  currentPage?: number;
  currentResultIndex?: number;
  checkpointVersion?: number;
  queryIndex?: number;
  currentStateKey?: string;
  processedResultKeys?: string[];
  processedCount?: number;
  currentBatchSize?: number;
  retryCount?: number;
  stableRounds?: number;
  scrollTop?: number;
  scrollHeight?: number;
  firstVisibleResultKey?: string | null;
  lastVisibleResultKey?: string | null;
  lastSuccessfulResultKey?: string | null;
  lastSuccessfulUrl?: string | null;
  lastSuccessfulTimestamp?: string | null;
  updatedAt?: string;
  stopRequested?: boolean;
  error?: string | null;
  /** Immutable center resolved for this search; never reconstructed from a later tab location. */
  resolvedCenter?: { latitude: number; longitude: number } | null;
  rejectedOutOfAreaCount?: number;
  unverifiedLocationCount?: number;
  config?: DiscoveryConfig;
}

export interface DiscoveryConfig {
  businessType: string;
  location: string;
  radiusKm: number | null;
  maxResults: number;
  queryExpansion: boolean;
  enableEnrichment: boolean;
  maxPagesPerWebsite: number;
  safetyLimit?: number;
  // Sweep the selected area as an adaptive grid to improve coverage around
  // Google's per-query ceiling. Providers can still cap or omit listings.
  areaSweep?: boolean;
  // Open each business's place page for phone/website/opening hours. Off by
  // default so a large area sweep stays fast; card-level data is still captured.
  thoroughContacts?: boolean;
  // Hard cap on the number of grid tiles a single sweep will scan.
  maxAreaTiles?: number;
  // User-configurable pause (ms, 5s–5m) between throttle-sensitive Maps
  // navigations (each new area/tile + query variation). Read live each tile so
  // a change in Settings applies to a running sweep without restarting it.
  requestDelayMs?: number;
  /** Captured only when the user explicitly chooses the current Maps context. */
  selectedCenter?: { latitude: number; longitude: number } | null;
}

export interface DiscoveryProgress {
  searchId: string;
  status: DiscoveryStatus;
  query: string;
  discovered: number;
  duplicates: number;
  unique: number;
  withPhone: number;
  withWebsite: number;
  withEmail: number;
  iteration: number;
  maxIterations: number;
  message?: string;
  phase?: DiscoveryPhase;
  processed?: number;
  currentQuery?: string;
  currentBatch?: number;
  configuredMaximum?: number;
  error?: string | null;
  tilesScanned?: number;
  tilesPlanned?: number;
  rejectedOutOfArea?: number;
  unverifiedLocation?: number;
}

export interface MapsScrollState {
  changed: boolean;
  atEnd: boolean;
  endConfirmed: boolean;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  visibleResultCount: number;
  firstVisibleResultKey: string | null;
  lastVisibleResultKey: string | null;
}

export interface CrmAuthUser {
  id: string;
  _id?: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  role?: unknown;
  permissions?: string[];
}

export interface CrmAuthState {
  authenticated: boolean;
  apiBaseUrl: string | null;
  user: CrmAuthUser | null;
}

export interface CrmImportProgress {
  id: string;
  status: 'idle' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled';
  total: number;
  processed: number;
  created: number;
  existing: number;
  failed: number;
  failedLeadIds: string[];
  leadIds: string[];
  processedLeadIds?: string[];
  nextIndex?: number;
  // Cooperative cancel flag. Persisted so a worker that is recycled mid-import
  // and resumed via recovery also observes the cancellation and stops.
  cancelRequested?: boolean;
  error?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

export type ExtensionMessage =
  | { type: 'GET_MAPS_CONTEXT' }
  | { type: 'GET_AUTH_STATE' }
  | { type: 'LOGIN'; apiBaseUrl: string; email: string; password: string }
  | { type: 'LOGOUT' }
  | { type: 'START_DISCOVERY'; config: DiscoveryConfig }
  | { type: 'PAUSE_DISCOVERY' }
  | { type: 'RESUME_DISCOVERY' }
  | { type: 'STOP_DISCOVERY' }
  | { type: 'RETRY_DISCOVERY' }
  | { type: 'GET_PROGRESS' }
  | { type: 'MARK_EXPORTED'; searchId: string; count: number }
  | { type: 'ENRICH_LEAD'; leadId: string; maxPages: number }
  | { type: 'IMPORT_TO_CRM'; leadIds: string[] }
  | { type: 'RETRY_CRM_IMPORT'; leadIds?: string[] }
  | { type: 'CANCEL_CRM_IMPORT' }
  | { type: 'GET_CRM_IMPORT' }
  | { type: 'MAPS_STATE_CHANGED'; context: MapsContext }
  | { type: 'COLLECT_DETAILS' }
  | { type: 'COLLECT_LEAD_DETAILS'; leadId: string }
  | { type: 'CLEAR_ALL_DATA' };

export interface MapsContext {
  isMaps: boolean;
  url: string;
  query: string | null;
  hasResults: boolean;
  isListing: boolean;
  visibleResultCount: number;
  centerCoordinates?: { latitude: number; longitude: number } | null;
}

export interface ExportSummary {
  totalDiscovered: number;
  uniqueLeads: number;
  phoneAvailable: number;
  websiteAvailable: number;
  emailAvailable: number;
  averageRating: number | null;
}
